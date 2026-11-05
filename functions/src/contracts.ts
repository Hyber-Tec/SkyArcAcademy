import { createHash, randomBytes } from 'node:crypto'
import { type DocumentReference, FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { ACADEMY_ID, DEMO_ACADEMY_ID, isDemoAcademy } from '@shared/academy'
import { ACADEMY_NAME, isReservedEmail } from '@shared/brand'
import { type ContractDocument, parseContract } from '@shared/contracts/document'
import { type ContractSigning, type ContractValues, RELATION_LABELS, checkContractSigning, prefillValues, usDate } from '@shared/contracts/fill'
import { type SignatureFactsInput, contractFileName, isContractToken, linkState, signUrl, signatureFacts, signatureStatement } from '@shared/contracts/signing'
import { contractFilePlace, contractFoldersToMake } from '@shared/contracts/filing'
import {
  CONTRACT_DRAFT_ID,
  CONTRACT_LINK_DAYS,
  CONTRACT_TEXT_MAX,
  type ContractDraft,
  type ContractLink,
  type ContractPrefillResult,
  type ContractTemplate,
  SIGNED_COPY_DAYS,
  type SignedContract,
  type SignerRelation,
  templateLabel,
} from '@shared/contracts/types'
import { type DriveActor, contractsFolderId, driveObjectPath, studentFolderId } from '@shared/drive/types'
import { contractEmail } from '@shared/email/contract'
import { COL, ROOT, emailKey } from '@shared/paths'
import { dateKeyOf, formatDateKey } from '@shared/time'
import type { Branch, Member, Student, StudentPrivateProfile } from '@shared/types'
import { LIGHT, db } from './app'
import { buildContractPdf } from './contractPdf'
import { gmailAppPassword, sendMail } from './email'
import { sendNotifications } from './notify'

/**
 * The enrollment contract (docs/DECISIONS.md §23, F4, §31 and §33). The office writes it in Settings (the draft) and
 * publishes it (`publishContract`); `previewContract` makes the PDF a family's signing would, marked as a sample. A
 * parent signed in, in the app or on the website, fills it in and signs it before using it (`signContractSignedIn`),
 * one child at a time, starting from what the records know (`contractPrefill`); or the office sends a family a link
 * from a student's page (`sendContractLink`, owners and admins), which they open at /sign/{token} on the website, with
 * no account (`getContractForSigning`), and sign (`signContract`). Either way the server builds the PDF (the contract as
 * filled in, the signature, a page recording the signing), files it in the student's Contracts folder (in their
 * folder), which only owners and admins see, the student's `signedContracts` record says it's signed (the app stops
 * asking), and the office is told in their inbox. The family gets their copy through `getMySignedContract`. A link's
 * document is named by its token's SHA-256, so the token never appears in an address, a log or an audit entry; it
 * works for CONTRACT_LINK_DAYS, for one signature. The public functions check the token and limit how often one network
 * address can ask, as `websiteMessage` does.
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

async function requireAdmin(branchId: unknown, auth: { uid: string; token: Record<string, unknown> } | undefined, what = 'send the contract') {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  if (typeof branchId !== 'string' || !ACADEMIES.includes(branchId)) throw new HttpsError('invalid-argument', 'Missing academy.')
  const email = emailKey(auth.token.email)
  const m = (await db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`).get()).data() as Member | undefined
  if (!m || m.status !== 'active' || (m.role !== 'owner' && m.role !== 'admin')) throw new HttpsError('permission-denied', `Only the academy’s owners and admins can ${what}.`)
  return { uid: auth.uid, email, name: m.displayName || email, role: m.role }
}

/** An audit entry written by a function for an owner or admin (`caller`), about the contract. */
function adminAudit(caller: Awaited<ReturnType<typeof requireAdmin>>, entry: Record<string, unknown>) {
  return {
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
  }
}

const templatesOf = (branchId: string) => db.collection(`${ROOT.branches}/${branchId}/${COL.contractTemplates}`)

/** A published contract with its words read, or null when the academy has none (or it no longer reads). */
async function currentTemplate(branchId: string): Promise<{ id: string; template: ContractTemplate; doc: ContractDocument } | null> {
  const snap = await templatesOf(branchId).where('current', '==', true).get()
  const found = snap.docs.find((d) => d.id !== CONTRACT_DRAFT_ID)
  if (!found) return null
  const template = found.data() as ContractTemplate
  return { id: found.id, template, doc: parseContract(template.text ?? '').doc }
}

/** A field problem in the signer's words, or the whole signing checked against the contract. */
function checkedSigning(doc: ContractDocument, input: unknown): ContractSigning {
  const checked = checkContractSigning(doc, (input ?? {}) as Record<string, unknown>)
  if (!checked.ok) throw new HttpsError('invalid-argument', 'Some parts need another look.', { errors: checked.errors })
  return checked.value
}

/** The addresses on a student's record a link may be emailed to: the parents' and the student's own. */
function emailsOnFile(priv: StudentPrivateProfile | undefined): string[] {
  const all = [...(priv?.parents ?? []).map((p) => p.email), priv?.email].map((e) => emailKey(e ?? '')).filter((e) => e.includes('@'))
  return [...new Set(all)]
}

// ------------------------------------------------------------------ writing and publishing

/**
 * Owners and admins: the draft (Settings → Enrollment contract) becomes the contract families sign from now on, a new
 * version; the one before stays, for the contracts signed and the links sent with it. A draft with something to fix
 * isn't published (the editor lists it). Families who signed an earlier version aren't asked again.
 */
export const publishContract = onCall({ timeoutSeconds: 60, ...LIGHT }, async (req) => {
  const { branchId } = (req.data ?? {}) as { branchId?: string }
  const caller = await requireAdmin(branchId, req.auth, 'publish the contract')
  const b = branchId as string
  const draft = (await templatesOf(b).doc(CONTRACT_DRAFT_ID).get()).data() as ContractDraft | undefined
  const text = typeof draft?.text === 'string' ? draft.text : ''
  if (!text.trim()) throw new HttpsError('failed-precondition', 'Write the contract first, then save it.')
  if (text.length > CONTRACT_TEXT_MAX) throw new HttpsError('failed-precondition', 'The contract is too long.')
  const { doc, problems } = parseContract(text)
  if (problems.length) throw new HttpsError('failed-precondition', `Fix line ${problems[0].line} first: ${problems[0].message}`)
  const by: DriveActor = { uid: caller.uid, email: caller.email, name: caller.name }
  const ref = templatesOf(b).doc()
  const version = await db.runTransaction(async (tx) => {
    const all = await tx.get(templatesOf(b))
    const published = all.docs.filter((d) => d.id !== CONTRACT_DRAFT_ID)
    const next = Math.max(0, ...published.map((d) => (d.data() as ContractTemplate).version || 0)) + 1
    for (const d of published) if ((d.data() as ContractTemplate).current) tx.update(d.ref, { current: false, replacedAt: FieldValue.serverTimestamp(), replacedBy: by })
    const template: ContractTemplate = { title: doc.title, text, sha256: sha256(text), version: next, current: true, publishedAt: null, publishedBy: by }
    tx.create(ref, { ...template, publishedAt: FieldValue.serverTimestamp() })
    tx.set(
      db.collection(`${ROOT.branches}/${b}/${COL.auditLog}`).doc(),
      adminAudit(caller, {
        action: 'contract.publish',
        entityType: 'contractTemplate',
        entityId: ref.id,
        summary: `Published the enrollment contract, version ${next} (“${doc.title}”): families sign it before using the app`,
      }),
    )
    return next
  })
  return { id: ref.id, version }
})

/** The student a sample is made for, when none is named. */
const SAMPLE_NAME = 'Sample Student'

/**
 * Owners and admins: the PDF a family's signing makes (Settings' preview, the phone's "Try signing"), marked as a
 * sample on every page, from the draft, the published contract or `text` as typed, with what was filled in (anything
 * left out stays blank). Nothing is saved or filed.
 */
export const previewContract = onCall({ timeoutSeconds: 60, memory: '512MiB', ...LIGHT }, async (req) => {
  const input = (req.data ?? {}) as { branchId?: string; use?: unknown; text?: unknown; studentName?: unknown; values?: unknown; name?: unknown; relation?: unknown; signature?: unknown }
  const caller = await requireAdmin(input.branchId, req.auth, 'preview the contract')
  const b = input.branchId as string
  let text = ''
  if (typeof input.text === 'string') text = input.text
  else if (input.use === 'current') text = (await currentTemplate(b))?.template.text ?? ''
  else text = ((await templatesOf(b).doc(CONTRACT_DRAFT_ID).get()).data() as ContractDraft | undefined)?.text ?? ''
  if (!text.trim()) throw new HttpsError('failed-precondition', 'There’s no contract to show yet.')
  if (text.length > CONTRACT_TEXT_MAX) throw new HttpsError('invalid-argument', 'The contract is too long.')
  const { doc } = parseContract(text)
  const academy = await academyOf(b)
  const studentName = typeof input.studentName === 'string' && input.studentName.trim() ? input.studentName.trim().slice(0, 100) : SAMPLE_NAME
  // What was filled in, as signing would keep it; what wasn't stays blank.
  const checked = checkContractSigning(doc, { values: input.values, name: input.name ?? caller.name, relation: input.relation, signature: input.signature, agree: true })
  const values: ContractValues = checked.ok ? checked.value.values : { ...prefillValues(doc, { studentName }), ...((input.values ?? {}) as ContractValues) }
  const signature = typeof input.signature === 'string' && /^data:image\/png;base64,/.test(input.signature) ? Buffer.from(input.signature.slice(input.signature.indexOf(',') + 1), 'base64') : null
  const relation = input.relation === 'guardian' ? 'guardian' : 'parent'
  const now = new Date()
  let pdf: Uint8Array
  try {
    pdf = await buildContractPdf({
      doc,
      values,
      signature,
      signerName: checked.ok ? checked.value.name : typeof input.name === 'string' ? input.name : '',
      relation: RELATION_LABELS[relation].toLowerCase(),
      signedOn: usDate(dateKeyOf(now, academy.timezone)),
      record: null,
      sample: true,
      createdAt: now,
    })
  } catch (e) {
    logger.error('The contract preview could not be built', { branchId: b, error: String(e) })
    throw new HttpsError('internal', 'The sample couldn’t be made. Check the drawn signature, then try again.')
  }
  return { name: `${contractFileName(studentName, dateKeyOf(now, academy.timezone)).replace(/\.pdf$/, '')} (sample).pdf`, data: Buffer.from(pdf).toString('base64') }
})

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
  const audit = (entry: Record<string, unknown>) => adminAudit(caller, entry)

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
    const [studentSnap, current, open] = await Promise.all([
      db.doc(`${base}/${COL.students}/${forStudent}`).get(),
      currentTemplate(b),
      db.collection(`${base}/${COL.contractLinks}`).where('studentId', '==', forStudent).get(),
    ])
    const student = studentSnap.data() as Student | undefined
    if (!student) throw new HttpsError('not-found', 'That student isn’t in the academy.')
    if (!current) throw new HttpsError('failed-precondition', 'Publish the academy’s contract first, in Settings → Enrollment contract.')
    const token = randomBytes(32).toString('base64url')
    id = sha256(token)
    const now = Date.now()
    link = {
      studentId: forStudent,
      studentName: student.name,
      templateId: current.id,
      templateName: templateLabel(current.template),
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
 * contract it was sent with (its words and fields) and the student's name; one signed lately gives, with `copy`, the
 * signed copy to keep (for SIGNED_COPY_DAYS). Every answer names the academy and how to reach it.
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
  const template = (await templatesOf(branchId).doc(link.templateId).get()).data() as ContractTemplate | undefined
  if (!template?.text) throw new HttpsError('failed-precondition', 'The contract isn’t there any more. Please ask the academy for a new link.')
  return {
    state: 'ready',
    academy: contact,
    firstName,
    studentName: student?.name ?? link.studentName,
    expiresAt: ms(link.expiresAt),
    contract: { title: template.title, text: template.text, version: template.version },
  }
})

// ------------------------------------------------------------------ filing a signed copy

type Academy = Awaited<ReturnType<typeof academyOf>>

/**
 * The signed copy (the contract as filled in and signed, then the page recording the signing: the academy, the
 * student, the signer, the date and time in the academy's time zone, their network address and browser or device, the
 * link or the account, the contract's version and its text's SHA-256), saved where the Drive keeps a file's bytes. It's
 * filed in the Drive by `fileSignedCopy`, in a transaction; if that fails, the caller deletes `object`.
 */
async function storeSignedCopy(input: {
  branchId: string
  academy: Academy
  studentName: string
  template: { label: string; sha256: string; doc: ContractDocument }
  signing: ContractSigning
  ip: string
  userAgent: string
  how: SignatureFactsInput['how']
  signedAt: Date
}) {
  const { branchId, academy, studentName, signing, signedAt } = input
  let pdf: Uint8Array
  try {
    pdf = await buildContractPdf({
      doc: input.template.doc,
      values: signing.values,
      signature: Buffer.from(signing.signature.slice(signing.signature.indexOf(',') + 1), 'base64'),
      signerName: signing.name,
      relation: RELATION_LABELS[signing.relation].toLowerCase(),
      signedOn: usDate(dateKeyOf(signedAt, academy.timezone)),
      record: {
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
          templateName: input.template.label,
          templateSha256: input.template.sha256,
        }),
        footnote: `Signed electronically ${'link' in input.how || input.how.where === 'website' ? `through ${academy.name}’s website` : `in ${academy.name}’s app`}. The SHA-256 identifies the exact text of the contract that was signed: the same text always gives the same value.`,
      },
      sample: false,
      createdAt: signedAt,
    })
  } catch (e) {
    logger.error('The signed contract could not be built', { branchId, error: String(e) })
    throw new HttpsError('internal', 'The contract couldn’t be signed just now. Please try again, or contact the academy.')
  }
  const fileRef = db.collection(`${ROOT.branches}/${branchId}/${COL.driveFiles}`).doc()
  const fileName = contractFileName(studentName, dateKeyOf(signedAt, academy.timezone))
  const object = getStorage().bucket().file(driveObjectPath(branchId, fileRef.id))
  await object.save(Buffer.from(pdf), { resumable: false, contentType: 'application/pdf', metadata: { contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}` } })
  return { fileRef, fileName, size: pdf.length, object }
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
    summary: `${input.signerName} (${RELATION_LABELS[input.relation].toLowerCase()}) signed ${student.name}’s enrollment contract ${input.how}; it’s in ${student.name}’s Contracts folder in the Drive`,
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
 * Signing (anyone with the link, once): what they filled in, parent or guardian, the signature they drew and their
 * agreement to sign electronically, checked against the contract the link was sent with. The server builds the signed
 * PDF, files it in the student's Contracts folder in the Drive (owners and admins only), marks the link signed and the
 * student's contract signed, with an audit entry, and tells the owners and admins.
 */
export const signContract = onCall({ timeoutSeconds: 120, memory: '512MiB', ...LIGHT }, async (req) => {
  const input = (req.data ?? {}) as { token?: unknown }
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
  const base = `${ROOT.branches}/${branchId}`
  const [academy, templateSnap] = await Promise.all([academyOf(branchId), templatesOf(branchId).doc(link.templateId).get()])
  const template = templateSnap.data() as ContractTemplate | undefined
  if (!template?.text) throw new HttpsError('failed-precondition', 'The contract isn’t there any more. Please ask the academy for a new link.')
  const doc = parseContract(template.text).doc
  const signing = checkedSigning(doc, req.data)
  if (!(await withinLimits([{ key: limitKey('link', id), max: 10, window: HOUR }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then try again.')
  }
  const { name, relation } = signing
  const signedAt = new Date()
  const student = { id: link.studentId, name: link.studentName }
  const copy = await storeSignedCopy({ branchId, academy, studentName: link.studentName, template: { label: templateLabel(template), sha256: template.sha256, doc }, signing, ip, userAgent, how: { link: link.token }, signedAt })
  const signer = { name, relation, ip, userAgent, templateSha256: template.sha256 }
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
        signed: { via: 'link', signerName: name, relation, signerEmail: null, templateId: link.templateId, templateName: templateLabel(template), linkId: id, values: signing.values },
        signerName: name,
      })
      tx.update(ref, { status: 'signed', signedAt: FieldValue.serverTimestamp(), signer, fileId: copy.fileRef.id, fileName: copy.fileName })
      tx.set(db.collection(`${base}/${COL.auditLog}`).doc(), signedAudit({ signerName: name, relation, student, entityType: 'contractLink', entityId: id, dateKey: dateKeyOf(signedAt, academy.timezone), how: 'with the link' }))
    })
  } catch (e) {
    await copy.object.delete({ ignoreNotFound: true }).catch(() => undefined)
    throw e
  }
  await tellOffice(branchId, [student], `Signed by ${name} (${RELATION_LABELS[relation].toLowerCase()}) with the link. The signed copy is in ${link.studentName}’s Contracts folder in the Drive.`, `contract-${id}`)
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
 * What a parent's form starts with: each of their students' name and birth date, and their own name and phone as the
 * students' records list them (or their account's), with their email. Only their own family's.
 */
export const contractPrefill = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req): Promise<ContractPrefillResult> => {
  const { branchId } = (req.data ?? {}) as { branchId?: unknown }
  const caller = await familyCaller(branchId, req.auth)
  const base = `${ROOT.branches}/${branchId as string}`
  const ids = familyIds(caller.member).slice(0, 20)
  const snaps = await Promise.all(ids.map((id) => Promise.all([db.doc(`${base}/${COL.students}/${id}`).get(), db.doc(`${base}/${COL.students}/${id}/private/profile`).get()])))
  const students: ContractPrefillResult['students'] = []
  let signer = { name: caller.member.displayName || '', phone: '', email: caller.email }
  for (const [studentSnap, privSnap] of snaps) {
    const s = studentSnap.data() as Student | undefined
    if (!s) continue
    const priv = privSnap.data() as StudentPrivateProfile | undefined
    students.push({ id: studentSnap.id, name: s.name, dob: caller.member.role === 'parent' ? (priv?.dob ?? null) : null })
    const me = (priv?.parents ?? []).find((p) => emailKey(p.email ?? '') === caller.email)
    if (me) signer = { name: me.name?.trim() || signer.name, phone: me.phone?.trim() || signer.phone, email: caller.email }
  }
  return { students, signer }
})

/**
 * A parent signed in (the app or the website) fills in and signs the academy's current contract for one of their
 * children (docs/DECISIONS.md §33: one contract per child, each signed on its own), filed as a link's is, with the
 * account that signed on its record page. A child whose contract the other parent signed meanwhile is left as it is.
 * Students don't sign: their parent does.
 */
export const signContractSignedIn = onCall({ timeoutSeconds: 120, memory: '512MiB', ...LIGHT }, async (req) => {
  const input = (req.data ?? {}) as { branchId?: unknown; studentId?: unknown; where?: unknown; device?: unknown }
  const caller = await familyCaller(input.branchId, req.auth)
  const branchId = input.branchId as string
  if (caller.member.role !== 'parent') throw new HttpsError('permission-denied', 'A parent or guardian signs the contract.')
  const studentId = typeof input.studentId === 'string' ? input.studentId : ''
  if (!studentId || !familyIds(caller.member).includes(studentId)) throw new HttpsError('invalid-argument', 'Choose your child.')
  const base = `${ROOT.branches}/${branchId}`
  const [academy, current, studentSnap] = await Promise.all([academyOf(branchId), currentTemplate(branchId), db.doc(`${base}/${COL.students}/${studentId}`).get()])
  if (!current) throw new HttpsError('failed-precondition', 'The academy has no contract to sign right now.')
  const s = studentSnap.data() as Student | undefined
  if (!s) throw new HttpsError('not-found', 'That student isn’t in the academy.')
  const signing = checkedSigning(current.doc, req.data)
  if (!(await withinLimits([{ key: limitKey('account', caller.uid), max: 20, window: HOUR }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then try again.')
  }
  const where = input.where === 'app' ? 'app' : 'website'
  const ip = addressOf(req.rawRequest)
  const device = typeof input.device === 'string' && input.device.trim() ? input.device.trim().slice(0, 200) : ''
  const userAgent = device || String(req.rawRequest.headers['user-agent'] ?? '').slice(0, 400)
  const { name, relation } = signing
  const student = { id: studentSnap.id, name: s.name }
  const signedRef = db.doc(`${base}/${COL.signedContracts}/${student.id}`)
  if ((await signedRef.get()).exists) return { signed: false, fileName: null }
  const signedAt = new Date()
  const label = templateLabel(current.template)
  const copy = await storeSignedCopy({ branchId, academy, studentName: student.name, template: { label, sha256: current.template.sha256, doc: current.doc }, signing, ip, userAgent, how: { account: caller.email, where }, signedAt })
  let filed = false
  try {
    filed = await db.runTransaction(async (tx) => {
      const now = await tx.get(signedRef)
      const has = await readFolders(tx, branchId, student.id)
      if (now.exists) return false
      fileSignedCopy(tx, {
        branchId,
        student,
        has,
        copy,
        signed: { via: where === 'app' ? 'app' : 'web', signerName: name, relation, signerEmail: caller.email, templateId: current.id, templateName: label, linkId: null, values: signing.values },
        signerName: name,
      })
      tx.set(
        db.collection(`${base}/${COL.auditLog}`).doc(),
        signedAudit({ signerName: name, relation, student, entityType: 'signedContract', entityId: student.id, dateKey: dateKeyOf(signedAt, academy.timezone), how: where === 'app' ? 'in the app' : 'on the website' }),
      )
      return true
    })
  } catch (e) {
    await copy.object.delete({ ignoreNotFound: true }).catch(() => undefined)
    throw e
  }
  if (!filed) {
    await copy.object.delete({ ignoreNotFound: true }).catch(() => undefined)
    return { signed: false, fileName: null }
  }
  await tellOffice(branchId, [student], `Signed by ${name} (${RELATION_LABELS[relation].toLowerCase()}) ${where === 'app' ? 'in the app' : 'on the website'}, as ${caller.email}. The signed copy is in ${student.name}’s Contracts folder in the Drive.`, `contract-${student.id}-${signedAt.getTime()}`)
  return { signed: true, fileName: copy.fileName }
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
