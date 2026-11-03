import { createHash, randomBytes } from 'node:crypto'
import { type DocumentReference, FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { ACADEMY_ID, DEMO_ACADEMY_ID, isDemoAcademy } from '@shared/academy'
import { ACADEMY_NAME, isReservedEmail } from '@shared/brand'
import { type SignatureFactsInput, checkSigning, contractFileName, isContractToken, linkState, signUrl, signatureFacts, signatureStatement } from '@shared/contracts/signing'
import { contractFilePlace, contractFoldersToMake } from '@shared/contracts/filing'
import { CONTRACT_LINK_DAYS, type ContractLink, type ContractTemplate, SIGNED_COPY_DAYS, SIGNER_RELATIONS, type SignedContract, type SignerRelation } from '@shared/contracts/types'
import { type DriveActor, type DriveFile, contractsFolderId, contractsFolderStudent, driveObjectPath, studentFolderId } from '@shared/drive/types'
import { contractEmail } from '@shared/email/contract'
import { COL, ROOT, emailKey } from '@shared/paths'
import { dateKeyOf, formatDateKey } from '@shared/time'
import type { Branch, Member, Student, StudentPrivateProfile } from '@shared/types'
import { LIGHT, db } from './app'
import { buildSignedContract, checkContract } from './contractPdf'
import { gmailAppPassword, sendMail } from './email'
import { sendNotifications } from './notify'

/**
 * The enrollment contract (docs/DECISIONS.md §23, F4, and §31). A parent signs it signed in, in the app or on the
 * website, before using it (`signContractSignedIn`), for one child or several at once; or the office sends a family a
 * link from a student's page (`sendContractLink`, owners and admins), which they open at /sign/{token} on the website,
 * with no account (`getContractForSigning`), and sign (`signContract`). Either way the signed PDF is a Drive file in the
 * student's Contracts folder (in their folder), which only owners and admins see, the student's `signedContracts`
 * record says it's signed (the app stops asking), and the office is told in their inbox. The family gets their copy
 * through `getMySignedContract`. A link's document is named by its token's SHA-256, so the token never appears in an
 * address, a log or an audit entry; it works for CONTRACT_LINK_DAYS, for one signature.
 * The public functions check the token and limit how often one network address can ask, as `websiteMessage` does.
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

// ------------------------------------------------------------------ filing a signed copy

type Academy = Awaited<ReturnType<typeof academyOf>>

/** The academy's current blank contract and its bytes, or null when it has none (or its file is gone). */
async function currentTemplate(branchId: string): Promise<{ id: string; template: ContractTemplate; bytes: Buffer } | null> {
  const snap = await db.collection(`${ROOT.branches}/${branchId}/${COL.contractTemplates}`).where('current', '==', true).get()
  const doc = snap.docs[0]
  if (!doc) return null
  const template = doc.data() as ContractTemplate
  const [bytes] = await getStorage().bucket().file(template.path).download()
  return { id: doc.id, template, bytes }
}

/**
 * The signed copy (the contract, then the signature page: the academy, the student, the signer, the date and time in
 * the academy's time zone, their network address and browser or device, the link or the account, and the blank
 * contract's SHA-256), saved where the Drive keeps a file's bytes. It's filed in the Drive by `fileSignedCopy`, in a
 * transaction; if that fails, the caller deletes `object`.
 */
async function storeSignedCopy(input: {
  branchId: string
  academy: Academy
  studentName: string
  template: { name: string; bytes: Buffer }
  signing: { name: string; relation: SignerRelation; signature: string }
  ip: string
  userAgent: string
  how: SignatureFactsInput['how']
  signedAt: Date
}) {
  const { branchId, academy, studentName, signing, signedAt } = input
  const templateSha256 = sha256(input.template.bytes)
  let pdf: Uint8Array
  try {
    pdf = await buildSignedContract({
      template: input.template.bytes,
      signature: Buffer.from(signing.signature.slice(signing.signature.indexOf(',') + 1), 'base64'),
      subtitle: `Enrollment contract · ${academy.name}`,
      statement: signatureStatement({ signerName: signing.name, studentName, academyName: academy.name }),
      facts: signatureFacts({
        academyName: academy.name,
        studentName,
        signerName: signing.name,
        relation: signing.relation,
        signedAtMs: signedAt.getTime(),
        timezone: academy.timezone,
        ip: input.ip,
        userAgent: input.userAgent,
        how: input.how,
        templateName: input.template.name,
        templateSha256,
      }),
      footnote: `Signed electronically ${'link' in input.how || input.how.where === 'website' ? `through ${academy.name}’s website` : `in ${academy.name}’s app`}. The SHA-256 identifies the exact blank contract that was signed: the same file always gives the same value.`,
      signedAt,
    })
  } catch (e) {
    logger.error('The signed contract could not be built', { branchId, error: String(e) })
    throw new HttpsError('internal', 'The contract couldn’t be signed just now. Please try again, or contact the academy.')
  }
  const fileRef = db.collection(`${ROOT.branches}/${branchId}/${COL.driveFiles}`).doc()
  const fileName = contractFileName(studentName, dateKeyOf(signedAt, academy.timezone))
  const object = getStorage().bucket().file(driveObjectPath(branchId, fileRef.id))
  await object.save(Buffer.from(pdf), { resumable: false, contentType: 'application/pdf', metadata: { contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}` } })
  return { fileRef, fileName, size: pdf.length, object, templateSha256 }
}

const SYSTEM: DriveActor = { uid: 'contract-signing', email: '', name: 'Contract signing' }

/** The student's folder and Contracts folder, read in a transaction before `fileSignedCopy` writes. */
function readFolders(tx: Transaction, branchId: string, studentId: string) {
  const folders = db.collection(`${ROOT.branches}/${branchId}/${COL.driveFolders}`)
  return Promise.all([tx.get(folders.doc(studentFolderId(studentId))), tx.get(folders.doc(contractsFolderId(studentId)))]).then(([studentFolder, contracts]) => ({
    studentFolder: studentFolder.exists,
    contractsFolder: contracts.exists,
  }))
}

/**
 * In a transaction: the signed copy's Drive record in the student's Contracts folder (owners and admins only; it and
 * the student's folder are made with their first contract), and the student's `SignedContract`.
 */
function fileSignedCopy(
  tx: Transaction,
  input: {
    branchId: string
    student: { id: string; name: string }
    has: { studentFolder: boolean; contractsFolder: boolean }
    copy: { fileRef: DocumentReference; fileName: string; size: number }
    signed: Omit<SignedContract, 'studentId' | 'studentName' | 'signedAt' | 'fileId' | 'fileName' | 'markedBy' | 'note'>
    signerName: string
  },
) {
  const { branchId, student, copy } = input
  const folders = db.collection(`${ROOT.branches}/${branchId}/${COL.driveFolders}`)
  const made = contractFoldersToMake({ studentId: student.id, studentName: student.name, has: input.has, by: SYSTEM, at: FieldValue.serverTimestamp() })
  for (const f of made) tx.create(folders.doc(f.id), f.data)
  if (input.has.contractsFolder) tx.update(folders.doc(contractsFolderId(student.id)), { updatedAt: FieldValue.serverTimestamp(), updatedBy: SYSTEM })
  tx.create(copy.fileRef, {
    name: copy.fileName,
    size: copy.size,
    kind: 'pdf',
    mime: 'application/pdf',
    status: 'ready',
    ...contractFilePlace(student.id),
    evaluationId: null,
    originalName: null,
    uploadedAt: FieldValue.serverTimestamp(),
    uploadedBy: { uid: 'contract-signing', email: '', name: input.signerName },
  })
  const signed: SignedContract = {
    ...input.signed,
    studentId: student.id,
    studentName: student.name,
    signedAt: null,
    fileId: copy.fileRef.id,
    fileName: copy.fileName,
    markedBy: null,
    note: '',
  }
  tx.set(db.doc(`${ROOT.branches}/${branchId}/${COL.signedContracts}/${student.id}`), { ...signed, signedAt: FieldValue.serverTimestamp() })
}

/** The audit entry of a signature, as the system records it. */
function signedAudit(input: { signerName: string; relation: SignerRelation; student: { id: string; name: string }; entityType: string; entityId: string; dateKey: string; how: string }) {
  const { student } = input
  return {
    at: FieldValue.serverTimestamp(),
    actorUid: 'contract-signing',
    actorEmail: 'system',
    actorName: input.signerName,
    actorRole: 'system',
    action: 'contract.signed',
    category: 'contracts',
    entityType: input.entityType,
    entityId: input.entityId,
    summary: `${input.signerName} (${SIGNER_RELATIONS[input.relation].toLowerCase()}) signed ${student.name}’s enrollment contract ${input.how}; it’s in ${student.name}’s Contracts folder in the Drive`,
    context: '',
    dateKey: input.dateKey,
    studentId: student.id,
    studentName: student.name,
    coachId: null,
    coachName: null,
    changes: [],
    via: 'function',
  }
}

/** The owners and admins hear of a signature (it's saved already: a failure here is only logged). */
async function tellOffice(branchId: string, students: { id: string; name: string }[], body: string, dedupeKey: string) {
  try {
    const office = await db.collection(`${ROOT.branches}/${branchId}/${COL.members}`).where('role', 'in', ['owner', 'admin']).get()
    const title = students.length === 1 ? `${students[0].name}’s enrollment contract is signed` : `${students.map((s) => s.name).join(', ')}: enrollment contracts signed`
    await sendNotifications(
      branchId,
      office.docs
        .filter((d) => (d.data() as Member).status === 'active')
        .map((d) => ({ recipientKey: d.id, type: 'contract_signed' as const, title, body, link: `admin/students/${students[0].id}`, refs: {} })),
      dedupeKey,
    )
  } catch (e) {
    logger.error('Contract signed: telling the office failed', { branchId, error: String(e) })
  }
}

// ------------------------------------------------------------------ signing by link

/**
 * Signing (anyone with the link, once): the signer's typed name, parent or guardian, the signature they drew and
 * their agreement to sign electronically. The server builds the signed PDF, files it in the student's Contracts folder
 * in the Drive (owners and admins only), marks the link signed and the student's contract signed, with an audit
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
  const { name, relation } = checked.value

  const base = `${ROOT.branches}/${branchId}`
  const [academy, templateSnap] = await Promise.all([academyOf(branchId), db.doc(`${base}/${COL.contractTemplates}/${link.templateId}`).get()])
  const template = templateSnap.data() as ContractTemplate | undefined
  if (!template) throw new HttpsError('failed-precondition', 'The contract isn’t there any more. Please ask the academy for a new link.')
  const [templateBytes] = await getStorage().bucket().file(template.path).download()
  const signedAt = new Date()
  const student = { id: link.studentId, name: link.studentName }
  const copy = await storeSignedCopy({ branchId, academy, studentName: link.studentName, template: { name: template.name, bytes: templateBytes }, signing: checked.value, ip, userAgent, how: { link: link.token }, signedAt })
  const signer = { name, relation, ip, userAgent, templateSha256: copy.templateSha256 }
  try {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref)
      const has = await readFolders(tx, branchId, link.studentId)
      const now = fresh.data() as ContractLink | undefined
      if (!now || linkState(now, Date.now()) !== 'sent') throw new HttpsError('failed-precondition', 'This link can’t be signed any more.', { state: now ? linkState(now, Date.now()) : 'invalid' })
      fileSignedCopy(tx, {
        branchId,
        student,
        has,
        copy,
        signed: { via: 'link', signerName: name, relation, signerEmail: null, templateId: link.templateId, templateName: template.name, linkId: id },
        signerName: name,
      })
      tx.update(ref, { status: 'signed', signedAt: FieldValue.serverTimestamp(), signer, fileId: copy.fileRef.id, fileName: copy.fileName })
      tx.set(db.collection(`${base}/${COL.auditLog}`).doc(), signedAudit({ signerName: name, relation, student, entityType: 'contractLink', entityId: id, dateKey: dateKeyOf(signedAt, academy.timezone), how: 'with the link' }))
    })
  } catch (e) {
    await copy.object.delete({ ignoreNotFound: true }).catch(() => undefined)
    throw e
  }
  await tellOffice(branchId, [student], `Signed by ${name} (${SIGNER_RELATIONS[relation].toLowerCase()}) with the link. The signed copy is in ${link.studentName}’s Contracts folder in the Drive.`, `contract-${id}`)
  return { ok: true, fileName: copy.fileName, copyUntil: signedAt.getTime() + SIGNED_COPY_DAYS * DAY }
})

// ------------------------------------------------------------------ signing in the app

/** The signed-in caller, an active parent or student of the academy (`branchId`), with their member doc. */
async function familyCaller(branchId: unknown, auth: { uid: string; token: Record<string, unknown> } | undefined) {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  if (typeof branchId !== 'string' || !ACADEMIES.includes(branchId)) throw new HttpsError('invalid-argument', 'Missing academy.')
  const email = emailKey(auth.token.email)
  const m = (await db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`).get()).data() as Member | undefined
  if (!m || m.status !== 'active' || (m.role !== 'parent' && m.role !== 'student')) throw new HttpsError('permission-denied', 'Only a student’s family can do this.')
  return { uid: auth.uid, email, member: m }
}

const familyIds = (m: Member) => (m.role === 'parent' ? (m.studentIds ?? []) : m.studentId ? [m.studentId] : [])

/**
 * A parent signed in (the app or the website) signs the academy's current contract for one or more of their children
 * at once (docs/DECISIONS.md §31): one signature, and a signed copy for each child, filed as a link's is, with the
 * account that signed on its signature page. A child whose contract was signed meanwhile (by the other parent) is left
 * as it is. Students don't sign: their parent does.
 */
export const signContractSignedIn = onCall({ timeoutSeconds: 180, memory: '512MiB', ...LIGHT }, async (req) => {
  const input = (req.data ?? {}) as { branchId?: unknown; studentIds?: unknown; name?: unknown; relation?: unknown; signature?: unknown; agree?: unknown; where?: unknown; device?: unknown }
  const caller = await familyCaller(input.branchId, req.auth)
  const branchId = input.branchId as string
  if (caller.member.role !== 'parent') throw new HttpsError('permission-denied', 'A parent or guardian signs the contract.')
  const ids = Array.isArray(input.studentIds) ? [...new Set(input.studentIds.filter((x): x is string => typeof x === 'string'))] : []
  const mine = familyIds(caller.member)
  if (!ids.length || ids.length > 10 || ids.some((x) => !mine.includes(x))) throw new HttpsError('invalid-argument', 'Choose your child.')
  const checked = checkSigning(input)
  if (!checked.ok) throw new HttpsError('invalid-argument', 'Some fields need another look.', { errors: checked.errors })
  if (!(await withinLimits([{ key: limitKey('account', caller.uid), max: 20, window: HOUR }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then try again.')
  }
  const where = input.where === 'app' ? 'app' : 'website'
  const ip = addressOf(req.rawRequest)
  const device = typeof input.device === 'string' && input.device.trim() ? input.device.trim().slice(0, 200) : ''
  const userAgent = device || String(req.rawRequest.headers['user-agent'] ?? '').slice(0, 400)
  const { name, relation } = checked.value

  const base = `${ROOT.branches}/${branchId}`
  const [academy, current, studentSnaps] = await Promise.all([academyOf(branchId), currentTemplate(branchId), db.getAll(...ids.map((x) => db.doc(`${base}/${COL.students}/${x}`)))])
  if (!current) throw new HttpsError('failed-precondition', 'The academy has no contract to sign right now.')
  const signedAt = new Date()
  const signed: { id: string; name: string; fileName: string }[] = []
  const already: string[] = []
  for (const snap of studentSnaps) {
    const s = snap.data() as Student | undefined
    if (!s) continue
    const student = { id: snap.id, name: s.name }
    const signedRef = db.doc(`${base}/${COL.signedContracts}/${student.id}`)
    if ((await signedRef.get()).exists) {
      already.push(student.id)
      continue
    }
    const copy = await storeSignedCopy({ branchId, academy, studentName: student.name, template: { name: current.template.name, bytes: current.bytes }, signing: checked.value, ip, userAgent, how: { account: caller.email, where }, signedAt })
    try {
      const filed = await db.runTransaction(async (tx) => {
        const now = await tx.get(signedRef)
        const has = await readFolders(tx, branchId, student.id)
        if (now.exists) return false
        fileSignedCopy(tx, {
          branchId,
          student,
          has,
          copy,
          signed: { via: where === 'app' ? 'app' : 'web', signerName: name, relation, signerEmail: caller.email, templateId: current.id, templateName: current.template.name, linkId: null },
          signerName: name,
        })
        tx.set(
          db.collection(`${base}/${COL.auditLog}`).doc(),
          signedAudit({ signerName: name, relation, student, entityType: 'signedContract', entityId: student.id, dateKey: dateKeyOf(signedAt, academy.timezone), how: where === 'app' ? 'in the app' : 'on the website' }),
        )
        return true
      })
      if (filed) signed.push({ ...student, fileName: copy.fileName })
      else {
        already.push(student.id)
        await copy.object.delete({ ignoreNotFound: true }).catch(() => undefined)
      }
    } catch (e) {
      await copy.object.delete({ ignoreNotFound: true }).catch(() => undefined)
      throw e
    }
  }
  if (signed.length) {
    const copies = signed.length === 1 ? `The signed copy is in ${signed[0].name}’s Contracts folder` : 'The signed copies are in each student’s Contracts folder'
    await tellOffice(branchId, signed, `Signed by ${name} (${SIGNER_RELATIONS[relation].toLowerCase()}) ${where === 'app' ? 'in the app' : 'on the website'}, as ${caller.email}. ${copies} in the Drive.`, `contract-${signed.map((s) => s.id).join('-')}-${signedAt.getTime()}`)
  }
  return { signed: signed.map((s) => ({ studentId: s.id, fileName: s.fileName })), already }
})

/**
 * A family's own signed copy (a parent's child's, or the student's own), while it's in the Drive: the Contracts folder
 * is owners' and admins' only, so it comes through here. One signed on paper has none unless the office filed it.
 */
export const getMySignedContract = onCall({ timeoutSeconds: 60, memory: '512MiB', ...LIGHT }, async (req) => {
  const { branchId, studentId } = (req.data ?? {}) as { branchId?: unknown; studentId?: unknown }
  const caller = await familyCaller(branchId, req.auth)
  if (typeof studentId !== 'string' || !familyIds(caller.member).includes(studentId)) throw new HttpsError('not-found', 'There’s no signed contract here.')
  if (!(await withinLimits([{ key: limitKey('copy', caller.uid), max: 30, window: HOUR }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then try again.')
  }
  const base = `${ROOT.branches}/${branchId as string}`
  const signed = (await db.doc(`${base}/${COL.signedContracts}/${studentId}`).get()).data() as SignedContract | undefined
  const file = signed?.fileId ? (await db.doc(`${base}/${COL.driveFiles}/${signed.fileId}`).get()).data() : undefined
  if (!signed?.fileId || !file || file.trashed === true) throw new HttpsError('not-found', 'There’s no signed copy to download. Ask the academy for one.')
  const [bytes] = await getStorage().bucket().file(driveObjectPath(branchId as string, signed.fileId)).download()
  return { name: signed.fileName ?? 'Enrollment contract.pdf', data: bytes.toString('base64') }
})

/**
 * A contract the family signed before the app (the third meeting: "the manager uploads those himself"): a file the
 * office puts in a student's Contracts folder in the Drive counts as their signed contract once it's uploaded, so the
 * family isn't asked to sign it in the app. Only when the student has none recorded yet; the office can still "Ask to
 * sign again" on the student's page. The server's own signed copies record themselves as they're filed.
 */
export const onContractFiled = onDocumentWritten({ document: `${ROOT.branches}/{branchId}/${COL.driveFiles}/{fileId}`, ...LIGHT }, async (event) => {
  const before = event.data?.before.data() as DriveFile | undefined
  const after = event.data?.after.data() as DriveFile | undefined
  if (!after || after.status !== 'ready' || before?.status === 'ready' || after.trashed) return
  const studentId = contractsFolderStudent(after.folderId)
  if (!studentId || after.uploadedBy?.uid === 'contract-signing') return
  const { branchId, fileId } = event.params
  const base = `${ROOT.branches}/${branchId}`
  const signedRef = db.doc(`${base}/${COL.signedContracts}/${studentId}`)
  try {
    await db.runTransaction(async (tx) => {
      const [signed, studentSnap] = await Promise.all([tx.get(signedRef), tx.get(db.doc(`${base}/${COL.students}/${studentId}`))])
      const student = studentSnap.data() as Student | undefined
      if (signed.exists || !student) return
      const by: DriveActor = after.uploadedBy ?? { uid: 'system', email: '', name: 'The office' }
      const record: Omit<SignedContract, 'signedAt'> = {
        studentId,
        studentName: student.name,
        via: 'paper',
        signerName: '',
        relation: null,
        signerEmail: null,
        templateId: null,
        templateName: null,
        fileId,
        fileName: after.name,
        linkId: null,
        markedBy: by,
        note: `Filed in the Drive: ${after.name}`.slice(0, 500),
      }
      tx.create(signedRef, { ...record, signedAt: FieldValue.serverTimestamp() })
      tx.set(db.collection(`${base}/${COL.auditLog}`).doc(), {
        at: FieldValue.serverTimestamp(),
        actorUid: by.uid,
        actorEmail: by.email || 'system',
        actorName: by.name || 'The office',
        actorRole: 'system',
        action: 'contract.paper',
        category: 'contracts',
        entityType: 'signedContract',
        entityId: studentId,
        summary: `${student.name}’s enrollment contract counts as signed: “${after.name}” was filed in their Contracts folder`,
        context: '',
        dateKey: null,
        studentId,
        studentName: student.name,
        coachId: null,
        coachName: null,
        changes: [],
        via: 'function',
      })
    })
  } catch (e) {
    logger.error('A filed contract could not be recorded', { branchId, fileId, error: String(e) })
  }
})
