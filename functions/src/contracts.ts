import { createHash, randomBytes } from 'node:crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { ACADEMY_ID, DEMO_ACADEMY_ID, isDemoAcademy } from '@shared/academy'
import { ACADEMY_NAME, isReservedEmail } from '@shared/brand'
import { checkSigning, contractFileName, isContractToken, linkState, signUrl, signatureFacts, signatureStatement } from '@shared/contracts/signing'
import { contractFilePlace, contractFoldersToMake } from '@shared/contracts/filing'
import { CONTRACT_LINK_DAYS, type ContractLink, type ContractTemplate, SIGNED_COPY_DAYS, SIGNER_RELATIONS } from '@shared/contracts/types'
import { type DriveActor, contractsFolderId, driveObjectPath, studentFolderId } from '@shared/drive/types'
import { contractEmail } from '@shared/email/contract'
import { COL, ROOT, emailKey } from '@shared/paths'
import { dateKeyOf, formatDateKey } from '@shared/time'
import type { Branch, Member, Student, StudentPrivateProfile } from '@shared/types'
import { LIGHT, db } from './app'
import { buildSignedContract, checkContract } from './contractPdf'
import { gmailAppPassword, sendMail } from './email'
import { sendNotifications } from './notify'

/**
 * The enrollment contract (docs/DECISIONS.md §23, F4): the office sends a family a link from a student's page
 * (`sendContractLink`, owners and admins); the family opens it at /sign/{token} on the website, with no account
 * (`getContractForSigning`), and signs (`signContract`). The signed PDF is a Drive file in the student's Contracts folder
 * (in their folder), which only owners and admins see, and they're told in their inbox. A link's document is named by
 * its token's SHA-256, so the token never appears in an address, a log or an audit entry; it works for
 * CONTRACT_LINK_DAYS, for one signature.
 * The two public functions check the token and limit how often one network address can ask, as `websiteMessage` does.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')

/** Links are in the academy or in the demo academy (§22): a token finds its own. */
const ACADEMIES = [ACADEMY_ID, DEMO_ACADEMY_ID]

const linkRef = (branchId: string, id: string) => db.doc(`${ROOT.branches}/${branchId}/${COL.contractLinks}/${id}`)

async function findLink(token: unknown) {
  if (!isContractToken(token)) return null
  const id = sha256(token)
  for (const branchId of ACADEMIES) {
    const snap = await linkRef(branchId, id).get()
    const link = snap.data() as ContractLink | undefined
    if (link && link.token === token) return { branchId, id, ref: snap.ref, link }
  }
  return null
}

/** The academy as the signing page names it, with how to reach the office. */
async function academyOf(branchId: string) {
  const branch = (await db.doc(`${ROOT.branches}/${branchId}`).get()).data() as Branch | undefined
  return { name: branch?.name || ACADEMY_NAME, email: branch?.contact?.email || '', phone: branch?.contact?.phone || '', timezone: branch?.timezone || 'America/New_York' }
}

/** The caller's network address ("" when there's none to tell, as in the emulators). */
function addressOf(raw: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  const forwarded = raw.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return (first || raw.ip || '').slice(0, 100)
}

/** One more request counted against each limit (the website's limits' documents, server only); false when one is used up. */
async function withinLimits(checks: { key: string; max: number; window: number }[]): Promise<boolean> {
  const base = `${ROOT.branches}/${ACADEMY_ID}/${COL.websiteLimits}`
  const now = Date.now()
  const refs = checks.map((c) => ({ ...c, ref: db.doc(`${base}/${c.key}`) }))
  return db.runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.map((r) => tx.get(r.ref)))
    const recent = snaps.map((s, i) => ((s.data()?.times as number[] | undefined) ?? []).filter((t) => t > now - refs[i].window))
    if (recent.some((times, i) => times.length >= refs[i].max)) return false
    refs.forEach((r, i) => tx.set(r.ref, { times: [...recent[i], now], expiresAt: Timestamp.fromMillis(now + r.window) }))
    return true
  })
}

/** A network address or a link, never stored as is: its hash keys its count. */
const limitKey = (kind: string, value: string) => `sign-${kind}-${sha256(`${ACADEMY_ID}:${value}`).slice(0, 32)}`

const firstNameOf = (student: Student | undefined, fallback: string) => student?.firstName?.trim() || fallback.split(' ')[0] || fallback

const ms = (t: unknown) => (t as Timestamp | null | undefined)?.toMillis?.() ?? 0

async function requireAdmin(branchId: unknown, auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  if (typeof branchId !== 'string' || !ACADEMIES.includes(branchId)) throw new HttpsError('invalid-argument', 'Missing academy.')
  const email = emailKey(auth.token.email)
  const m = (await db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`).get()).data() as Member | undefined
  if (!m || m.status !== 'active' || (m.role !== 'owner' && m.role !== 'admin')) throw new HttpsError('permission-denied', 'Only the academy’s owners and admins can send the contract.')
  return { uid: auth.uid, email, name: m.displayName || email, role: m.role }
}

/** The addresses on a student's record a link may be emailed to: the parents' and the student's own. */
function emailsOnFile(priv: StudentPrivateProfile | undefined): string[] {
  const all = [...(priv?.parents ?? []).map((p) => p.email), priv?.email].map((e) => emailKey(e ?? '')).filter((e) => e.includes('@'))
  return [...new Set(all)]
}

// ------------------------------------------------------------------ sending

/**
 * Owners and admins: a signing link for a student (`studentId`), which cancels one still waiting for that student,
 * made with the academy's current contract; or the same link emailed again (`linkId`). With `email` (one on the
 * student's record) it's emailed too, except from the demo academy, which never emails. Returns the address to copy.
 */
export const sendContractLink = onCall({ secrets: [gmailAppPassword], timeoutSeconds: 60, memory: '512MiB', ...LIGHT }, async (req) => {
  const { branchId, studentId, linkId, email } = (req.data ?? {}) as { branchId?: string; studentId?: string; linkId?: string; email?: string | null }
  const caller = await requireAdmin(branchId, req.auth)
  const b = branchId as string
  const base = `${ROOT.branches}/${b}`
  const by: DriveActor = { uid: caller.uid, email: caller.email, name: caller.name }
  const audit = (entry: Record<string, unknown>) => ({
    at: FieldValue.serverTimestamp(),
    actorUid: caller.uid,
    actorEmail: caller.email,
    actorName: caller.name,
    actorRole: caller.role,
    category: 'contracts',
    context: '',
    dateKey: null,
    coachId: null,
    coachName: null,
    changes: [],
    via: 'function',
    ...entry,
  })

  if ((linkId !== undefined && (typeof linkId !== 'string' || !/^[0-9a-f]{64}$/.test(linkId))) || (email != null && typeof email !== 'string')) {
    throw new HttpsError('invalid-argument', 'That isn’t a link or an email address.')
  }
  let id: string
  let link: ContractLink
  const existing = linkId ? await linkRef(b, linkId).get() : null
  if (existing && (!existing.exists || linkState(existing.data() as ContractLink, Date.now()) !== 'sent')) {
    throw new HttpsError('failed-precondition', 'This link can’t be sent any more. Send a new one.')
  }
  const forStudent = existing ? (existing.data() as ContractLink).studentId : studentId
  if (typeof forStudent !== 'string' || !forStudent) throw new HttpsError('invalid-argument', 'Missing student.')
  // The address first: a link is only made when it can go where it was asked to.
  const to = email ? emailKey(email) : null
  if (to) {
    const priv = (await db.doc(`${base}/${COL.students}/${forStudent}/private/profile`).get()).data() as StudentPrivateProfile | undefined
    if (!emailsOnFile(priv).includes(to)) throw new HttpsError('invalid-argument', 'Choose an email on the student’s record.')
  }
  if (existing) {
    link = existing.data() as ContractLink
    id = existing.id
  } else {
    const [studentSnap, templates, open] = await Promise.all([
      db.doc(`${base}/${COL.students}/${forStudent}`).get(),
      db.collection(`${base}/${COL.contractTemplates}`).where('current', '==', true).get(),
      db.collection(`${base}/${COL.contractLinks}`).where('studentId', '==', forStudent).get(),
    ])
    const student = studentSnap.data() as Student | undefined
    if (!student) throw new HttpsError('not-found', 'That student isn’t in the academy.')
    const template = templates.docs[0]
    if (!template) throw new HttpsError('failed-precondition', 'Upload the academy’s contract first, in Settings → Enrollment contract.')
    const t = template.data() as ContractTemplate
    // A link made now must be one the family can sign: the contract has to open.
    try {
      const [bytes] = await getStorage().bucket().file(t.path).download()
      await checkContract(bytes)
    } catch (e) {
      logger.warn('The contract could not be read', { branchId: b, templateId: template.id, error: String(e) })
      throw new HttpsError('failed-precondition', 'The contract’s PDF can’t be read. Save it as an ordinary PDF (without a password) and upload it again in Settings.')
    }
    const token = randomBytes(32).toString('base64url')
    id = sha256(token)
    const now = Date.now()
    link = {
      studentId: forStudent,
      studentName: student.name,
      templateId: template.id,
      templateName: t.name,
      token,
      status: 'sent',
      createdAt: null,
      createdBy: by,
      expiresAt: Timestamp.fromMillis(now + CONTRACT_LINK_DAYS * DAY) as unknown as ContractLink['expiresAt'],
      emailedTo: [],
      emailedAt: null,
      signedAt: null,
      signer: null,
      fileId: null,
      fileName: null,
      canceledAt: null,
      canceledBy: null,
    }
    // One link waits per student: a new one replaces it.
    const waiting = open.docs.filter((d) => (d.data() as ContractLink).status === 'sent')
    const batch = db.batch()
    for (const d of waiting) batch.update(d.ref, { status: 'canceled', canceledAt: FieldValue.serverTimestamp(), canceledBy: by })
    batch.set(linkRef(b, id), { ...link, createdAt: FieldValue.serverTimestamp() })
    batch.set(
      db.collection(`${base}/${COL.auditLog}`).doc(),
      audit({
        action: 'contract.link',
        entityType: 'contractLink',
        entityId: id,
        studentId: forStudent,
        studentName: student.name,
        summary: `Made a link to sign ${student.name}’s enrollment contract${waiting.length ? ' (the link sent before no longer works)' : ''}`,
      }),
    )
    await batch.commit()
  }

  const url = signUrl(link.token)
  let emailed: 'sent' | 'not_configured' | 'failed' | 'demo' | 'test_address' | null = null
  if (to) {
    // The demo academy emails nobody, and test and example addresses never get email.
    if (isDemoAcademy(b)) emailed = 'demo'
    else if (isReservedEmail(to)) emailed = 'test_address'
    else {
      const [academy, student] = await Promise.all([academyOf(b), db.doc(`${base}/${COL.students}/${link.studentId}`).get()])
      const mail = contractEmail({
        to,
        academyName: academy.name,
        studentFirstName: firstNameOf(student.data() as Student | undefined, link.studentName),
        url,
        expiresOn: formatDateKey(dateKeyOf(ms(link.expiresAt) || Date.now(), academy.timezone), 'long'),
      })
      const result = await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text, fromName: academy.name, replyTo: academy.email || caller.email })
      emailed = result.status
    }
    if (emailed === 'sent') {
      const batch = db.batch()
      batch.update(linkRef(b, id), { emailedTo: FieldValue.arrayUnion(to), emailedAt: FieldValue.serverTimestamp() })
      batch.set(db.collection(`${base}/${COL.auditLog}`).doc(), audit({ action: 'contract.email', entityType: 'contractLink', entityId: id, studentId: link.studentId, studentName: link.studentName, summary: `Emailed the link to sign ${link.studentName}’s enrollment contract to ${to}` }))
      await batch.commit()
    }
  }
  return { linkId: id, url, expiresAt: ms(link.expiresAt) || null, emailed }
})

// ------------------------------------------------------------------ signing

/**
 * The signing page's first call (anyone with the link): what it shows. A link waiting for its signature gives the
 * contract's PDF (its bytes, read only through the link); one signed lately gives, with `copy`, the signed copy to keep
 * (for SIGNED_COPY_DAYS). Every answer names the academy and how to reach it.
 */
export const getContractForSigning = onCall({ timeoutSeconds: 60, memory: '512MiB', ...LIGHT }, async (req) => {
  const { token, copy } = (req.data ?? {}) as { token?: unknown; copy?: unknown }
  const ip = addressOf(req.rawRequest)
  const day = new Date().toISOString().slice(0, 10)
  if (!(await withinLimits([{ key: limitKey('view', ip), max: 120, window: HOUR }, { key: `sign-views-${day}`, max: 5000, window: DAY }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then open the link again.')
  }
  const found = await findLink(token)
  const academy = await academyOf(found?.branchId ?? ACADEMY_ID)
  // The page says its dates in the academy's time zone.
  const contact = { name: academy.name, email: academy.email, phone: academy.phone, timezone: academy.timezone }
  if (!found) return { state: 'invalid', academy: contact }
  const { branchId, link } = found
  const student = (await db.doc(`${ROOT.branches}/${branchId}/${COL.students}/${link.studentId}`).get()).data() as Student | undefined
  const firstName = firstNameOf(student, link.studentName)
  const now = Date.now()
  const state = linkState(link, now)
  if (state === 'canceled') return { state, academy: contact, firstName }
  if (state === 'expired') return { state, academy: contact, firstName, expiresAt: ms(link.expiresAt) }
  if (state === 'signed') {
    const copyUntil = ms(link.signedAt) + SIGNED_COPY_DAYS * DAY
    const out: Record<string, unknown> = { state, academy: contact, firstName, signedAt: ms(link.signedAt), signerName: link.signer?.name ?? '', copyUntil }
    // The copy, while it's in the Drive (an admin may have put it in the Trash).
    const file = copy === true && now < copyUntil && link.fileId ? (await db.doc(`${ROOT.branches}/${branchId}/${COL.driveFiles}/${link.fileId}`).get()).data() : undefined
    if (file && file.trashed !== true && link.fileId) {
      const [bytes] = await getStorage().bucket().file(driveObjectPath(branchId, link.fileId)).download()
      out.copy = { name: link.fileName, data: bytes.toString('base64') }
    }
    return out
  }
  const template = (await db.doc(`${ROOT.branches}/${branchId}/${COL.contractTemplates}/${link.templateId}`).get()).data() as ContractTemplate | undefined
  if (!template) throw new HttpsError('failed-precondition', 'The contract isn’t there any more. Please ask the academy for a new link.')
  const [bytes] = await getStorage().bucket().file(template.path).download()
  return { state: 'ready', academy: contact, firstName, expiresAt: ms(link.expiresAt), contract: { name: template.name, pages: template.pages, data: bytes.toString('base64') } }
})

/**
 * Signing (anyone with the link, once): the signer's typed name, parent or guardian, the signature they drew and
 * their agreement to sign electronically. The server builds the signed PDF (the contract, then the signature page:
 * the academy, the student, the signer, the date and time in the academy's time zone, their network address and
 * browser, the link and the blank contract's SHA-256), files it in the student's Contracts folder in the Drive (owners
 * and admins only; it and the student's folder are made with the first contract), marks the link signed with an audit
 * entry, and tells the owners and admins.
 */
export const signContract = onCall({ timeoutSeconds: 120, memory: '512MiB', ...LIGHT }, async (req) => {
  const input = (req.data ?? {}) as { token?: unknown; name?: unknown; relation?: unknown; signature?: unknown; agree?: unknown }
  const ip = addressOf(req.rawRequest)
  const userAgent = String(req.rawRequest.headers['user-agent'] ?? '').slice(0, 400)
  if (!(await withinLimits([{ key: limitKey('sign', ip), max: 20, window: HOUR }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then try again.')
  }
  const found = await findLink(input.token)
  if (!found) throw new HttpsError('not-found', 'This link isn’t valid.', { state: 'invalid' })
  const { branchId, id, ref, link } = found
  const state = linkState(link, Date.now())
  if (state !== 'sent') throw new HttpsError('failed-precondition', 'This link can’t be signed any more.', { state })
  const checked = checkSigning(input)
  if (!checked.ok) throw new HttpsError('invalid-argument', 'Some fields need another look.', { errors: checked.errors })
  if (!(await withinLimits([{ key: limitKey('link', id), max: 10, window: HOUR }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then try again.')
  }
  const { name, relation, signature } = checked.value

  const base = `${ROOT.branches}/${branchId}`
  const bucket = getStorage().bucket()
  const [academy, templateSnap] = await Promise.all([academyOf(branchId), db.doc(`${base}/${COL.contractTemplates}/${link.templateId}`).get()])
  const template = templateSnap.data() as ContractTemplate | undefined
  if (!template) throw new HttpsError('failed-precondition', 'The contract isn’t there any more. Please ask the academy for a new link.')
  const [templateBytes] = await bucket.file(template.path).download()
  const templateSha256 = sha256(templateBytes)
  const signedAt = new Date()
  let pdf: Uint8Array
  try {
    pdf = await buildSignedContract({
      template: templateBytes,
      signature: Buffer.from(signature.slice(signature.indexOf(',') + 1), 'base64'),
      subtitle: `Enrollment contract · ${academy.name}`,
      statement: signatureStatement({ signerName: name, studentName: link.studentName, academyName: academy.name }),
      facts: signatureFacts({
        academyName: academy.name,
        studentName: link.studentName,
        signerName: name,
        relation,
        signedAtMs: signedAt.getTime(),
        timezone: academy.timezone,
        ip,
        userAgent,
        token: link.token,
        templateName: template.name,
        templateSha256,
      }),
      footnote: `Signed electronically through ${academy.name}’s website. The SHA-256 identifies the exact blank contract that was signed: the same file always gives the same value.`,
      signedAt,
    })
  } catch (e) {
    logger.error('The signed contract could not be built', { branchId, linkId: id, error: String(e) })
    throw new HttpsError('internal', 'The contract couldn’t be signed just now. Please try again, or contact the academy.')
  }

  const fileRef = db.collection(`${base}/${COL.driveFiles}`).doc()
  const fileName = contractFileName(link.studentName, dateKeyOf(signedAt, academy.timezone))
  const object = bucket.file(driveObjectPath(branchId, fileRef.id))
  await object.save(Buffer.from(pdf), { resumable: false, contentType: 'application/pdf', metadata: { contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}` } })

  const signer = { name, relation, ip, userAgent, templateSha256 }
  const system: DriveActor = { uid: 'contract-signing', email: '', name: 'Contract signing' }
  const folders = db.collection(`${base}/${COL.driveFolders}`)
  const studentFolderRef = folders.doc(studentFolderId(link.studentId))
  const contractsRef = folders.doc(contractsFolderId(link.studentId))
  try {
    await db.runTransaction(async (tx) => {
      const [fresh, studentFolder, contracts] = await Promise.all([tx.get(ref), tx.get(studentFolderRef), tx.get(contractsRef)])
      const now = fresh.data() as ContractLink | undefined
      if (!now || linkState(now, Date.now()) !== 'sent') throw new HttpsError('failed-precondition', 'This link can’t be signed any more.', { state: now ? linkState(now, Date.now()) : 'invalid' })
      // The student's Contracts folder (owners' and admins' only), in their folder, both made with the first contract.
      const made = contractFoldersToMake({
        studentId: link.studentId,
        studentName: link.studentName,
        has: { studentFolder: studentFolder.exists, contractsFolder: contracts.exists },
        by: system,
        at: FieldValue.serverTimestamp(),
      })
      for (const f of made) tx.create(folders.doc(f.id), f.data)
      if (contracts.exists) tx.update(contractsRef, { updatedAt: FieldValue.serverTimestamp(), updatedBy: system })
      tx.create(fileRef, {
        name: fileName,
        size: pdf.length,
        kind: 'pdf',
        mime: 'application/pdf',
        status: 'ready',
        ...contractFilePlace(link.studentId),
        evaluationId: null,
        originalName: null,
        uploadedAt: FieldValue.serverTimestamp(),
        uploadedBy: { uid: 'contract-signing', email: '', name },
      })
      tx.update(ref, { status: 'signed', signedAt: FieldValue.serverTimestamp(), signer, fileId: fileRef.id, fileName })
      tx.set(db.collection(`${base}/${COL.auditLog}`).doc(), {
        at: FieldValue.serverTimestamp(),
        actorUid: 'contract-signing',
        actorEmail: 'system',
        actorName: name,
        actorRole: 'system',
        action: 'contract.signed',
        category: 'contracts',
        entityType: 'contractLink',
        entityId: id,
        summary: `${name} (${SIGNER_RELATIONS[relation].toLowerCase()}) signed ${link.studentName}’s enrollment contract; it’s in ${link.studentName}’s Contracts folder in the Drive`,
        context: '',
        dateKey: dateKeyOf(signedAt, academy.timezone),
        studentId: link.studentId,
        studentName: link.studentName,
        coachId: null,
        coachName: null,
        changes: [],
        via: 'function',
      })
    })
  } catch (e) {
    await object.delete({ ignoreNotFound: true }).catch(() => undefined)
    throw e
  }

  try {
    const office = await db.collection(`${base}/${COL.members}`).where('role', 'in', ['owner', 'admin']).get()
    await sendNotifications(
      branchId,
      office.docs
        .filter((d) => (d.data() as Member).status === 'active')
        .map((d) => ({
          recipientKey: d.id,
          type: 'contract_signed' as const,
          title: `${link.studentName}’s enrollment contract is signed`,
          body: `Signed by ${name} (${SIGNER_RELATIONS[relation].toLowerCase()}). The signed copy is in ${link.studentName}’s Contracts folder in the Drive.`,
          link: `admin/students/${link.studentId}`,
          refs: {},
        })),
      `contract-${id}`,
    )
  } catch (e) {
    logger.error('Contract signed: telling the office failed', { branchId, linkId: id, error: String(e) })
  }
  return { ok: true, fileName, copyUntil: signedAt.getTime() + SIGNED_COPY_DAYS * DAY }
})
