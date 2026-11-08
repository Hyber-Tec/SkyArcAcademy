import { createHash, randomBytes } from 'node:crypto'
import { type DocumentReference, FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { ACADEMY_ID, DEMO_ACADEMY_ID, isDemoAcademy } from '@shared/academy'
import { ACADEMY_NAME, isReservedEmail } from '@shared/brand'
import { type ContractDocument, academyChecks, dollarsText, parseContract, pricedChoice, withPrices } from '@shared/contracts/document'
import {
  type ContractSigning,
  type ContractValues,
  RELATION_LABELS,
  checkContractSigning,
  checkPreset,
  emailsIn,
  prefillValues,
  presetValues,
  relationLabel,
  shownValue,
  tuitionOf,
  usDate,
  withLockedEmail,
  withPreset,
} from '@shared/contracts/fill'
import { type SignatureFactsInput, contractFileName, isContractToken, signUrl, signatureFacts, signatureStatement } from '@shared/contracts/signing'
import { contractFilePlace, contractFoldersToMake } from '@shared/contracts/filing'
import { contractIn } from '@shared/contracts/translation'
import {
  ACADEMY_SIGNER_ID,
  type AcademySigner,
  type ShownSigner,
  CONTRACT_PRICE_MAX,
  CONTRACT_REQUEST_LINK_DOC,
  CONTRACT_TOKEN_DOC,
  type ContractLink,
  type ContractLinkSignedResult,
  type ContractLinkToken,
  type ContractPrefillResult,
  type ContractRequest,
  type ContractSendRequest,
  type ContractSendResult,
  type ContractSignedResult,
  type ContractTemplate,
  SIGNED_COPY_DAYS,
  type SignedContract,
  type SignerRelation,
  templateLabel,
} from '@shared/contracts/types'
import { type DriveActor, contractsFolderId, driveObjectPath, studentFolderId } from '@shared/drive/types'
import { contractEmail, signedCopyEmail } from '@shared/email/contract'
import { COL, ROOT, emailKey } from '@shared/paths'
import type { Lang } from '@shared/i18n'
import { dateKeyOf } from '@shared/time'
import type { Branch, Member, Student, StudentPrivateProfile } from '@shared/types'
import { LIGHT, db } from './app'
import logoPng from '../../web/public/brand/skyarc-logo-email.png'
import { buildContractPdf } from './contractPdf'
import { gmailAppPassword, sendMail } from './email'
import { sendNotifications } from './notify'
import { familyOf } from './recipients'

/**
 * The enrollment contract (docs/DECISIONS.md §23, F4, §31, §33 and §34). Its text is the academy's, put in the
 * database by scripts/contract.ts; the office changes only its prices (`setContractPrices`, a new version), and
 * `previewContract` makes the PDF a family's signing would, marked as a sample. The office sends a student's contract
 * (`sendContract`, owners and admins, on the website or the phone): the program it suggests and the discounts, which
 * only it checks; the parents hear of it in the app, and by email when the office asks (`emailContract` emails it
 * again). A parent then signs it, signed in to the app or the website (`signContractSignedIn`, starting from what the
 * records know: `contractPrefill`), or with its link, at /sign/{token} on the website with no account (the QR code at
 * the front desk, or the email): `getContractForSigning` shows it, `signContract` signs it. Either way the server
 * builds the PDF (the contract as filled in, the family's signature and the academy's, a page recording the signing),
 * files it in the student's Contracts folder (in their folder), which only owners and admins see, the student's
 * `signedContracts` record says it's signed, the signer gets their copy by email (§35), and the office is told in
 * their inbox. The family downloads their copy through `getMySignedContract` too. A contract's document is named by its link's token's SHA-256, and the token is kept apart
 * (owners and admins read it, for the QR code), so it never appears in an address, a log or an audit entry; it signs
 * once, until the office withdraws it. The public functions check the token and limit how often one network address
 * can ask, as `websiteMessage` does.
 */

export const HOUR = 3_600_000
export const DAY = 24 * HOUR

export const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')

/** Contracts are in the academy or in the demo academy (§22): a token finds its own. */
const ACADEMIES = [ACADEMY_ID, DEMO_ACADEMY_ID]

const linkRef = (branchId: string, id: string) => db.doc(`${ROOT.branches}/${branchId}/${COL.contractLinks}/${id}`)
const tokenRef = (branchId: string, id: string) => linkRef(branchId, id).collection('private').doc(CONTRACT_TOKEN_DOC)

async function findLink(token: unknown) {
  if (!isContractToken(token)) return null
  const id = sha256(token)
  for (const branchId of ACADEMIES) {
    const snap = await linkRef(branchId, id).get()
    if (snap.exists) return { branchId, id, ref: snap.ref, link: snap.data() as ContractLink }
  }
  return null
}

/** The academy as the signing page names it, with how to reach the office. */
async function academyOf(branchId: string) {
  const branch = (await db.doc(`${ROOT.branches}/${branchId}`).get()).data() as Branch | undefined
  return { name: branch?.name || ACADEMY_NAME, email: branch?.contact?.email || '', phone: branch?.contact?.phone || '', timezone: branch?.timezone || 'America/New_York' }
}

/**
 * The academy's signature on file (Settings → Enrollment contract): who signs and the image, or none for their name
 * typed (§35); null when nobody is set yet.
 */
async function academySignerOf(branchId: string): Promise<ShownSigner | null> {
  const s = (await db.doc(`${ROOT.branches}/${branchId}/${COL.contractSigner}/${ACADEMY_SIGNER_ID}`).get()).data() as AcademySigner | undefined
  if (!s?.name) return null
  return { name: s.name, title: s.title ?? '', image: typeof s.image === 'string' && /^data:image\/png;base64,/.test(s.image) ? s.image : null }
}

const pngBytes = (dataUrl: string) => Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64')

/** The academy's signature as the PDF takes it: the image's bytes, or none for the name typed. */
const signerForPdf = (s: ShownSigner | null) => (s ? { name: s.name, title: s.title, image: s.image ? pngBytes(s.image) : null } : null)

/** The logo over the PDF's first page: the bundle has its bytes (functions/package.json); a test run, only its name. */
const LOGO = logoPng instanceof Uint8Array ? logoPng : null

/** The caller's network address ("" when there's none to tell, as in the emulators). */
export function addressOf(raw: { headers: Record<string, string | string[] | undefined>; ip?: string }): string {
  const forwarded = raw.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return (first || raw.ip || '').slice(0, 100)
}

/** One more request counted against each limit (the website's limits' documents, server only); false when one is used up. */
export async function withinLimits(checks: { key: string; max: number; window: number }[]): Promise<boolean> {
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
export const limitKey = (kind: string, value: string) => `sign-${kind}-${sha256(`${ACADEMY_ID}:${value}`).slice(0, 32)}`

const firstNameOf = (student: Student | undefined, fallback: string) => student?.firstName?.trim() || fallback.split(' ')[0] || fallback

const ms = (t: unknown) => (t as Timestamp | null | undefined)?.toMillis?.() ?? 0

export async function requireAdmin(branchId: unknown, auth: { uid: string; token: Record<string, unknown> } | undefined, what = 'send the contract') {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  if (typeof branchId !== 'string' || !ACADEMIES.includes(branchId)) throw new HttpsError('invalid-argument', 'Missing academy.')
  const email = emailKey(auth.token.email)
  const m = (await db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`).get()).data() as Member | undefined
  if (!m || m.status !== 'active' || (m.role !== 'owner' && m.role !== 'admin')) throw new HttpsError('permission-denied', `Only the academy’s owners and admins can ${what}.`)
  return { uid: auth.uid, email, name: m.displayName || email, role: m.role }
}

/** An audit entry written by a function for an owner or admin (`caller`), about the contract. */
export function adminAudit(caller: Awaited<ReturnType<typeof requireAdmin>>, entry: Record<string, unknown>) {
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

/** The academy's contract as families sign it now, its words read, or null when it has none yet. */
async function currentTemplate(branchId: string): Promise<{ id: string; template: ContractTemplate; doc: ContractDocument } | null> {
  const snap = await templatesOf(branchId).where('current', '==', true).limit(1).get()
  const found = snap.docs[0]
  if (!found) return null
  const template = found.data() as ContractTemplate
  return { id: found.id, template, doc: parseContract(template.text ?? '').doc }
}

/** The version a contract was sent with, its words read. */
async function templateOf(branchId: string, templateId: string) {
  const template = (await templatesOf(branchId).doc(templateId).get()).data() as ContractTemplate | undefined
  if (!template?.text) throw new HttpsError('failed-precondition', 'The contract isn’t there any more. Please ask the academy to send it again.')
  return { template, doc: parseContract(template.text).doc }
}

/** A field problem in the signer's words, or the whole signing checked against the contract. */
function checkedSigning(doc: ContractDocument, input: unknown, lang: Lang = 'en'): ContractSigning {
  const checked = checkContractSigning(doc, (input ?? {}) as Record<string, unknown>, lang)
  if (!checked.ok) throw new HttpsError('invalid-argument', 'Some parts need another look.', { errors: checked.errors })
  return checked.value
}

/** Where a student's contract is emailed: the parents on their record, or (with none) the student's own address. */
function emailsFor(priv: StudentPrivateProfile | undefined): string[] {
  const parents = (priv?.parents ?? []).map((p) => emailKey(p.email ?? '')).filter((e) => e.includes('@'))
  const all = parents.length ? parents : [emailKey(priv?.email ?? '')].filter((e) => e.includes('@'))
  return [...new Set(all)]
}

/** "INTERMEDIATE · SKILL DEVELOPMENT suggested, with Bring Your Own Gun": what the office set, in words. */
function presetWords(doc: ContractDocument, preset: ContractValues): string {
  const choice = pricedChoice(doc)
  const suggested = choice ? shownValue(doc, choice.id, preset) : ''
  const discounts = academyChecks(doc)
    .map((b) => shownValue(doc, b.id, preset))
    .filter(Boolean)
  return [suggested ? `${suggested} suggested` : 'no program suggested', discounts.length ? `with ${discounts.join('; ')}` : 'no discount'].join(', ')
}

// ------------------------------------------------------------------ the prices

/**
 * Owners and admins: new prices for the contract's programs (dollars by option ID), the only part of the contract the
 * office changes (the owner, 2026-11-05). They make a new version, which every contract sent from then on uses; one
 * already sent keeps its prices (sending it again gives it the new ones), and so does one signed.
 */
export const setContractPrices = onCall({ timeoutSeconds: 60, ...LIGHT }, async (req) => {
  const { branchId, prices } = (req.data ?? {}) as { branchId?: string; prices?: unknown }
  const caller = await requireAdmin(branchId, req.auth, 'change the prices')
  const b = branchId as string
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new HttpsError('invalid-argument', 'Missing prices.')
  const by: DriveActor = { uid: caller.uid, email: caller.email, name: caller.name }
  return db.runTransaction(async (tx) => {
    const all = await tx.get(templatesOf(b))
    const currentSnap = all.docs.find((d) => (d.data() as ContractTemplate).current)
    if (!currentSnap) throw new HttpsError('failed-precondition', 'The academy’s contract isn’t set up yet.')
    const current = currentSnap.data() as ContractTemplate
    const choice = pricedChoice(parseContract(current.text).doc)
    if (!choice) throw new HttpsError('failed-precondition', 'The contract has no prices to change.')
    const next: Record<string, number> = {}
    for (const [id, value] of Object.entries(prices as Record<string, unknown>)) {
      const o = choice.options.find((x) => x.id === id)
      if (!o || o.amount === null) throw new HttpsError('invalid-argument', 'That isn’t one of the contract’s programs.')
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > CONTRACT_PRICE_MAX || Math.round(value * 100) !== value * 100) {
        throw new HttpsError('invalid-argument', `Type ${o.title}’s price in dollars, like 495 or 495.50.`)
      }
      if (value !== o.amount) next[id] = value
    }
    const changes = choice.options.filter((o) => next[o.id] !== undefined)
    if (!changes.length) return { version: current.version, changed: 0 }
    const text = withPrices(current.text, next)
    const version = Math.max(0, ...all.docs.map((d) => (d.data() as ContractTemplate).version || 0)) + 1
    const ref = templatesOf(b).doc()
    tx.update(currentSnap.ref, { current: false, replacedAt: FieldValue.serverTimestamp(), replacedBy: by })
    // The academy's Korean translation stays with the new prices: its dollars are the English's (translation.ts).
    const template: ContractTemplate = { title: current.title, text, sha256: sha256(text), version, current: true, publishedAt: null, publishedBy: by, ...(current.ko ? { ko: current.ko } : {}) }
    tx.create(ref, { ...template, publishedAt: FieldValue.serverTimestamp() })
    tx.set(
      db.collection(`${ROOT.branches}/${b}/${COL.auditLog}`).doc(),
      adminAudit(caller, {
        action: 'contract.prices',
        entityType: 'contractTemplate',
        entityId: ref.id,
        summary: `Changed the enrollment contract’s prices (version ${version}): ${changes.map((o) => `${o.title} ${dollarsText(o.amount ?? 0)} → ${dollarsText(next[o.id])}`).join('; ')}`,
      }),
    )
    return { version, changed: changes.length }
  })
})

/** The student a sample is made for, when none is named. */
const SAMPLE_NAME = 'Sample Student'

/**
 * Owners and admins: the PDF a family's signing makes (Settings, the phone's More → Enrollment contract), from the
 * current contract, marked as a sample on every page, with what the office would set (`preset`) and what was filled in
 * (anything left out stays blank), signed for the academy as contracts are. Nothing is saved or filed.
 */
export const previewContract = onCall({ timeoutSeconds: 60, memory: '512MiB', ...LIGHT }, async (req) => {
  const input = (req.data ?? {}) as { branchId?: string; studentName?: unknown; preset?: unknown; values?: unknown; name?: unknown; relation?: unknown; signature?: unknown }
  const caller = await requireAdmin(input.branchId, req.auth, 'preview the contract')
  const b = input.branchId as string
  const current = await currentTemplate(b)
  if (!current) throw new HttpsError('failed-precondition', 'There’s no contract to show yet.')
  const { doc } = current
  const [academy, signer] = await Promise.all([academyOf(b), academySignerOf(b)])
  const studentName = typeof input.studentName === 'string' && input.studentName.trim() ? input.studentName.trim().slice(0, 100) : SAMPLE_NAME
  const preset = checkPreset(doc, input.preset ?? {})
  const office = preset.ok ? preset.value : {}
  // What was filled in, as signing would keep it; what wasn't stays blank.
  const checked = checkContractSigning(doc, { values: input.values, name: input.name ?? caller.name, relation: input.relation, signature: input.signature, agree: true })
  const filled: ContractValues = checked.ok ? checked.value.values : { ...prefillValues(doc, { studentName }), ...presetValues(doc, office), ...((input.values ?? {}) as ContractValues) }
  const signature = typeof input.signature === 'string' && /^data:image\/png;base64,/.test(input.signature) ? pngBytes(input.signature) : null
  const relation = input.relation === 'guardian' ? 'guardian' : 'parent'
  const now = new Date()
  let pdf: Uint8Array
  try {
    pdf = await buildContractPdf({
      doc,
      values: withPreset(doc, filled, office),
      signature,
      signerName: checked.ok ? checked.value.name : typeof input.name === 'string' ? input.name : '',
      relation: RELATION_LABELS[relation].toLowerCase(),
      signedOn: usDate(dateKeyOf(now, academy.timezone)),
      academySigner: signerForPdf(signer),
      record: null,
      sample: true,
      createdAt: now,
      logo: LOGO,
    })
  } catch (e) {
    logger.error('The contract preview could not be built', { branchId: b, error: String(e) })
    throw new HttpsError('internal', 'The sample couldn’t be made. Check the drawn signature, then try again.')
  }
  return { name: `${contractFileName(studentName, dateKeyOf(now, academy.timezone)).replace(/\.pdf$/, '')} (sample).pdf`, data: Buffer.from(pdf).toString('base64') }
})

// ------------------------------------------------------------------ sending

type Emailed = ContractSendResult['emailed']

/**
 * A contract waiting for its signature, emailed to the family (the parents on the student's record), except from the
 * demo academy, which never emails, and to test addresses, which never get email. Recorded on the contract.
 */
async function emailFamily(input: {
  branchId: string
  id: string
  link: ContractLink
  token: string
  caller: Awaited<ReturnType<typeof requireAdmin>>
  /** The parents on the student's record (the office's switch); true unless said. */
  record?: boolean
  /** Who else: the family who asked from the academy's sign (§39). */
  extra?: string[]
}): Promise<{ emailed: Emailed; emailedTo: string[] }> {
  const { branchId: b, id, link, token, caller } = input
  const base = `${ROOT.branches}/${b}`
  const [academy, student, priv] = await Promise.all([academyOf(b), db.doc(`${base}/${COL.students}/${link.studentId}`).get(), db.doc(`${base}/${COL.students}/${link.studentId}/private/profile`).get()])
  const onRecord = input.record === false ? [] : emailsFor(priv.data() as StudentPrivateProfile | undefined)
  const to = [...new Set([...onRecord, ...(input.extra ?? []).map(emailKey).filter((e) => e.includes('@'))])]
  if (!to.length) return { emailed: 'no_address', emailedTo: [] }
  if (isDemoAcademy(b)) return { emailed: 'demo', emailedTo: [] }
  const real = to.filter((e) => !isReservedEmail(e))
  if (!real.length) return { emailed: 'test_address', emailedTo: [] }
  const sent: string[] = []
  let problem: Emailed = 'failed'
  for (const address of real) {
    const mail = contractEmail({ to: address, academyName: academy.name, studentFirstName: firstNameOf(student.data() as Student | undefined, link.studentName), url: signUrl(token) })
    const result = await sendMail({ to: address, subject: mail.subject, html: mail.html, text: mail.text, fromName: academy.name, replyTo: academy.email || caller.email })
    if (result.status === 'sent') sent.push(address)
    else problem = result.status
  }
  if (sent.length) {
    const batch = db.batch()
    batch.update(linkRef(b, id), { emailedTo: FieldValue.arrayUnion(...sent), emailedAt: FieldValue.serverTimestamp() })
    batch.set(
      db.collection(`${base}/${COL.auditLog}`).doc(),
      adminAudit(caller, { action: 'contract.email', entityType: 'contractLink', entityId: id, studentId: link.studentId, studentName: link.studentName, summary: `Emailed ${link.studentName}’s enrollment contract to ${sent.join(', ')}` }),
    )
    await batch.commit()
  }
  return { emailed: sent.length ? 'sent' : problem, emailedTo: sent }
}

/**
 * Owners and admins: a student's contract sent to their family (it withdraws one still waiting for them), with what
 * the office sets (`preset`: the program it suggests, and the discounts) and the academy's current contract. The
 * parents in the app are told there (and on their phones); with `email`, the parents on the student's record get its
 * link too. Returns the link, for the QR code a parent at the front desk scans.
 */
export const sendContract = onCall({ secrets: [gmailAppPassword], timeoutSeconds: 60, memory: '512MiB', ...LIGHT }, async (req): Promise<ContractSendResult> => {
  const { branchId, studentId, preset, email, requestId } = (req.data ?? {}) as Partial<ContractSendRequest>
  const caller = await requireAdmin(branchId, req.auth)
  const b = branchId as string
  if (typeof studentId !== 'string' || !studentId) throw new HttpsError('invalid-argument', 'Missing student.')
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(requestId))) throw new HttpsError('invalid-argument', 'That isn’t a family’s request.')
  const base = `${ROOT.branches}/${b}`
  const by: DriveActor = { uid: caller.uid, email: caller.email, name: caller.name }
  const requestRef = requestId ? db.doc(`${base}/${COL.contractRequests}/${requestId}`) : null
  const [studentSnap, current, academy, requestSnap, privSnap] = await Promise.all([
    db.doc(`${base}/${COL.students}/${studentId}`).get(),
    currentTemplate(b),
    academyOf(b),
    requestRef ? requestRef.get() : Promise.resolve(null),
    db.doc(`${base}/${COL.students}/${studentId}/private/profile`).get(),
  ])
  const student = studentSnap.data() as Student | undefined
  if (!student) throw new HttpsError('not-found', 'That student isn’t in the academy.')
  if (!current) throw new HttpsError('failed-precondition', 'The academy’s contract isn’t set up yet.')
  const checked = checkPreset(current.doc, preset ?? {})
  if (!checked.ok) throw new HttpsError('invalid-argument', checked.error)
  // Sent for a family's request from the academy's sign (§39): what they typed fills in the contract.
  const request = requestSnap?.data() as ContractRequest | undefined
  if (requestRef && (!request || request.status === 'closed')) throw new HttpsError('failed-precondition', 'That request isn’t waiting any more.')
  const dob = request?.studentDob ?? (privSnap.data() as StudentPrivateProfile | undefined)?.dob ?? null

  const token = randomBytes(32).toString('base64url')
  const id = sha256(token)
  const link: ContractLink = {
    studentId,
    studentName: student.name,
    templateId: current.id,
    templateName: templateLabel(current.template),
    preset: checked.value,
    status: 'sent',
    createdAt: null,
    createdBy: by,
    emailedTo: [],
    emailedAt: null,
    signedAt: null,
    signer: null,
    fileId: null,
    fileName: null,
    canceledAt: null,
    canceledBy: null,
    ...(request && requestRef
      ? {
          requestId: requestRef.id,
          prefill: { studentName: student.name, dob, signerName: request.parentName, phone: request.phone, email: request.email },
          lockedEmail: request.email,
        }
      : {}),
  }
  // One contract waits per student: a new one withdraws it.
  const waiting = await db.runTransaction(async (tx) => {
    const open = (await tx.get(db.collection(`${base}/${COL.contractLinks}`).where('studentId', '==', studentId))).docs.filter((d) => (d.data() as ContractLink).status === 'sent')
    if (requestRef && ((await tx.get(requestRef)).data() as ContractRequest | undefined)?.status === 'closed') throw new HttpsError('failed-precondition', 'That request isn’t waiting any more.')
    for (const d of open) tx.update(d.ref, { status: 'canceled', canceledAt: FieldValue.serverTimestamp(), canceledBy: by })
    tx.create(linkRef(b, id), { ...link, createdAt: FieldValue.serverTimestamp() })
    tx.create(tokenRef(b, id), { token } satisfies ContractLinkToken)
    if (requestRef) {
      // The family's page, waiting on it, opens the contract.
      tx.update(requestRef, { status: 'sent', studentId, linkId: id, sentAt: FieldValue.serverTimestamp(), sentBy: by })
      tx.set(requestRef.collection('private').doc(CONTRACT_REQUEST_LINK_DOC), { token })
    }
    tx.set(
      db.collection(`${base}/${COL.auditLog}`).doc(),
      adminAudit(caller, {
        action: 'contract.send',
        entityType: 'contractLink',
        entityId: id,
        studentId,
        studentName: student.name,
        summary: `Sent ${student.name}’s enrollment contract (${presetWords(current.doc, checked.value)})${request ? `, for ${request.parentName}’s request from the academy’s sign` : ''}${open.length ? '; the one sent before is withdrawn' : ''}`,
      }),
    )
    return open.length
  })
  if (waiting) logger.info('Contract sent again: the one waiting is withdrawn', { branchId: b, studentId })

  // The parents in the app hear of it there and on their phones (a failure here is only logged: it's sent).
  let told: string[] = []
  try {
    const parents = (await familyOf(b, studentId)).filter((p) => p.role === 'parent')
    told = parents.map((p) => p.name || p.key)
    const first = firstNameOf(student, student.name)
    await sendNotifications(
      b,
      parents.map((p) => ({
        recipientKey: p.key,
        type: 'contract_sent' as const,
        title: `Please sign ${first}’s enrollment contract`,
        body: `${academy.name} sent ${first}’s contract. Open the app to read it and sign it.`,
        ko: { title: `${first} 학생 등록 계약서에 서명해 주세요`, body: `${academy.name}에서 ${first} 학생 계약서를 보냈어요. 앱에서 읽고 서명해 주세요.` },
        link: 'parent',
        refs: {},
      })),
      `contract-sent-${id}`,
    )
  } catch (e) {
    logger.error('Contract sent: telling the family failed', { branchId: b, error: String(e) })
  }
  // The family who asked from the sign gets it by email too, whatever the switch (§39).
  const extra = request ? [request.email] : []
  const mail = email === true || extra.length ? await emailFamily({ branchId: b, id, link, token, caller, record: email === true, extra }) : { emailed: 'off' as const, emailedTo: [] }
  return { linkId: id, url: signUrl(token), told, ...mail }
})

/** Owners and admins: a contract still waiting for its signature, emailed to the family again. */
export const emailContract = onCall({ secrets: [gmailAppPassword], timeoutSeconds: 60, memory: '512MiB', ...LIGHT }, async (req) => {
  const { branchId, linkId } = (req.data ?? {}) as { branchId?: string; linkId?: unknown }
  const caller = await requireAdmin(branchId, req.auth)
  const b = branchId as string
  if (typeof linkId !== 'string' || !/^[0-9a-f]{64}$/.test(linkId)) throw new HttpsError('invalid-argument', 'That isn’t a contract the office sent.')
  const [snap, secret] = await Promise.all([linkRef(b, linkId).get(), tokenRef(b, linkId).get()])
  const link = snap.data() as ContractLink | undefined
  const token = (secret.data() as ContractLinkToken | undefined)?.token
  if (!link || link.status !== 'sent' || !token) throw new HttpsError('failed-precondition', 'This contract isn’t waiting for a signature any more.')
  return emailFamily({ branchId: b, id: linkId, link, token, caller, extra: link.lockedEmail ? [link.lockedEmail] : [] })
})

// ------------------------------------------------------------------ signing

/**
 * The signing page's first call (anyone with the link): what it shows. A contract waiting for its signature gives its
 * words and fields (the version it was sent with), what the office set, the academy's signature and the student's
 * name; one signed lately gives, with `copy`, the signed copy to keep (for SIGNED_COPY_DAYS). Every answer names the
 * academy and how to reach it.
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
  if (link.status === 'canceled') return { state: 'canceled', academy: contact, firstName }
  if (link.status === 'signed') {
    const now = Date.now()
    const copyUntil = ms(link.signedAt) + SIGNED_COPY_DAYS * DAY
    const out: Record<string, unknown> = { state: 'signed', academy: contact, firstName, signedAt: ms(link.signedAt), signerName: link.signer?.name ?? '', copyUntil }
    // The copy, while it's in the Drive (an admin may have put it in the Trash).
    const file = copy === true && now < copyUntil && link.fileId ? (await db.doc(`${ROOT.branches}/${branchId}/${COL.driveFiles}/${link.fileId}`).get()).data() : undefined
    if (file && file.trashed !== true && link.fileId) {
      const [bytes] = await getStorage().bucket().file(driveObjectPath(branchId, link.fileId)).download()
      out.copy = { name: link.fileName, data: bytes.toString('base64') }
    }
    return out
  }
  const [{ template }, signer] = await Promise.all([templateOf(branchId, link.templateId), academySignerOf(branchId)])
  return {
    state: 'ready',
    academy: contact,
    firstName,
    studentName: student?.name ?? link.studentName,
    contract: { title: template.title, text: template.text, version: template.version, ko: template.ko?.text ?? null },
    preset: link.preset ?? {},
    academySigner: signer,
    emailsCopy: !isDemoAcademy(branchId),
    // Sent for a family's request from the academy's sign (§39): what they typed there, their email kept as typed.
    prefill: link.prefill ?? null,
    lockedEmail: link.lockedEmail ?? null,
  }
})

// ------------------------------------------------------------------ filing a signed copy

type Academy = Awaited<ReturnType<typeof academyOf>>
type Signer = Awaited<ReturnType<typeof academySignerOf>>

/**
 * The signed copy (the contract as filled in and signed, then the page recording the signing: the academy, the
 * student, the signer, the date and time in the academy's time zone, their network address and browser or device, the
 * link or the account, who sent it, the contract's version and its text's SHA-256, the academy's signature), saved
 * where the Drive keeps a file's bytes. It's filed in the Drive by `fileSignedCopy`, in a transaction; if that fails,
 * the caller deletes `object`.
 */
async function storeSignedCopy(input: {
  branchId: string
  academy: Academy
  signer: Signer
  studentName: string
  template: { label: string; sha256: string; doc: ContractDocument }
  signing: ContractSigning
  ip: string
  userAgent: string
  how: SignatureFactsInput['how']
  sentBy: SignatureFactsInput['sentBy']
  signedAt: Date
  /** The Korean the signer read, when they read it in Korean: drawn after the English, recorded on the last page. */
  translation: { doc: ContractDocument; sha256: string } | null
}) {
  const { branchId, academy, signer, studentName, signing, signedAt } = input
  let pdf: Uint8Array
  try {
    pdf = await buildContractPdf({
      doc: input.template.doc,
      values: signing.values,
      signature: pngBytes(signing.signature),
      signerName: signing.name,
      relation: RELATION_LABELS[signing.relation].toLowerCase(),
      signedOn: usDate(dateKeyOf(signedAt, academy.timezone)),
      academySigner: signerForPdf(signer),
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
          sentBy: input.sentBy,
          academySigner: signer ? { name: signer.name, title: signer.title, typed: !signer.image } : null,
          translation: input.translation ? { sha256: input.translation.sha256 } : null,
        }),
        footnote: `Signed electronically ${'link' in input.how || input.how.where === 'website' ? `through ${academy.name}’s website` : `in ${academy.name}’s app`}. The SHA-256 identifies the exact text of the contract that was signed: the same text always gives the same value.`,
      },
      sample: false,
      createdAt: signedAt,
      logo: LOGO,
      translation: input.translation ? { doc: input.translation.doc, relation: relationLabel(signing.relation, 'ko') } : null,
    })
  } catch (e) {
    logger.error('The signed contract could not be built', { branchId, error: String(e) })
    throw new HttpsError('internal', 'The contract couldn’t be signed just now. Please try again, or contact the academy.')
  }
  const fileRef = db.collection(`${ROOT.branches}/${branchId}/${COL.driveFiles}`).doc()
  const fileName = contractFileName(studentName, dateKeyOf(signedAt, academy.timezone))
  const object = getStorage().bucket().file(driveObjectPath(branchId, fileRef.id))
  await object.save(Buffer.from(pdf), { resumable: false, contentType: 'application/pdf', metadata: { contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}` } })
  return { fileRef, fileName, size: pdf.length, object, pdf }
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

/** "ADVANCED, $565 / Month (the office suggested INTERMEDIATE)": what the family chose, for the office's notice. */
function choiceWords(doc: ContractDocument, values: ContractValues, preset: ContractValues): string {
  const choice = pricedChoice(doc)
  if (!choice) return ''
  const chosen = shownValue(doc, choice.id, values)
  const suggested = typeof preset[choice.id] === 'string' && preset[choice.id] !== values[choice.id] ? shownValue(doc, choice.id, preset) : ''
  const tuition = tuitionOf(doc, values)
  return `${chosen}${tuition ? `, ${tuition.shown}` : ''}${suggested ? ` (the office suggested ${suggested})` : ''}. `
}

/** The owners and admins hear of a signature (it's saved already: a failure here is only logged). */
async function tellOffice(branchId: string, student: { id: string; name: string }, body: string, dedupeKey: string) {
  try {
    const office = await db.collection(`${ROOT.branches}/${branchId}/${COL.members}`).where('role', 'in', ['owner', 'admin']).get()
    await sendNotifications(
      branchId,
      office.docs
        .filter((d) => (d.data() as Member).status === 'active')
        .map((d) => ({ recipientKey: d.id, type: 'contract_signed' as const, title: `${student.name}’s enrollment contract is signed`, body, link: `admin/students/${student.id}`, refs: {} })),
      dedupeKey,
    )
  } catch (e) {
    logger.error('Contract signed: telling the office failed', { branchId, error: String(e) })
  }
}

/**
 * The signer's copy, emailed as they sign (§35, the owner: "let's follow the law"): the PDF, to the address they typed
 * in the contract and the account they signed in with, so everyone who signs keeps the contract as signed (the E-SIGN
 * Act, 15 U.S.C. §7001(e), and Georgia's Uniform Electronic Transactions Act: a copy they can keep and print). The
 * demo academy never emails, and test addresses get none. Recorded on the contract; a failure is only logged: it's
 * signed, and the copy is in the app and the Drive.
 */
async function emailSignedCopy(input: {
  branchId: string
  id: string
  link: ContractLink
  academy: Academy
  doc: ContractDocument
  signing: ContractSigning
  signerEmail: string | null
  copy: { fileName: string; pdf: Uint8Array }
}): Promise<string[]> {
  const { branchId: b, link, academy, copy } = input
  const to = [...new Set([...emailsIn(input.doc, input.signing.values), ...(input.signerEmail ? [input.signerEmail] : [])].map(emailKey))].filter((e) => e.includes('@') && !isReservedEmail(e))
  if (!to.length || isDemoAcademy(b)) return []
  const sent: string[] = []
  for (const address of to) {
    const mail = signedCopyEmail({
      to: address,
      academyName: academy.name,
      studentFirstName: firstNameOf(undefined, link.studentName),
      signerName: input.signing.name,
      fileName: copy.fileName,
      academyEmail: academy.email,
      academyPhone: academy.phone,
    })
    const result = await sendMail({
      to: address,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      fromName: academy.name,
      replyTo: academy.email || null,
      attachments: [{ filename: copy.fileName, content: Buffer.from(copy.pdf), contentType: 'application/pdf' }],
    })
    if (result.status === 'sent') sent.push(address)
    else logger.warn('The signed copy could not be emailed', { branchId: b, status: result.status })
  }
  if (sent.length) {
    await linkRef(b, input.id)
      .update({ copyEmailedTo: sent, copyEmailedAt: FieldValue.serverTimestamp() })
      .catch((e) => logger.error('The signed copy was emailed: recording it failed', { branchId: b, error: String(e) }))
  }
  return sent
}

/** Why a contract can't be signed any more, in the family's words. */
function notWaiting(status: ContractLink['status'] | 'invalid') {
  if (status === 'signed') return new HttpsError('failed-precondition', 'This contract is signed already.', { state: 'signed' })
  if (status === 'canceled') return new HttpsError('failed-precondition', 'The academy withdrew this contract. They’ll send you a new one if it’s needed.', { state: 'canceled' })
  return new HttpsError('not-found', 'This contract isn’t there any more.', { state: 'invalid' })
}

/**
 * Signing a contract the office sent (in the app, on the website or with its link), once: what the family filled in,
 * with the office's discounts as it set them, built into the PDF with both signatures, filed in the student's Contracts
 * folder in the Drive (owners and admins only), the contract marked signed and the student's contract signed, with an
 * audit entry, the signer's copy emailed to them, and the owners and admins told. False when the other parent signed it
 * meanwhile (nothing more is filed).
 */
async function signSent(input: {
  branchId: string
  id: string
  link: ContractLink
  request: unknown
  ip: string
  userAgent: string
  how: SignatureFactsInput['how']
  via: SignedContract['via']
  signerEmail: string | null
  /** "with the link", "in the app", "on the website": for the audit entry and the office's notice. */
  where: string
}): Promise<ContractSignedResult> {
  const { branchId, id, link } = input
  const base = `${ROOT.branches}/${branchId}`
  const [academy, signer, { template, doc }] = await Promise.all([academyOf(branchId), academySignerOf(branchId), templateOf(branchId, link.templateId)])
  // The language the signer read it in: the form's messages, and the Korean they read in the PDF (docs/DECISIONS.md §36).
  const lang: Lang = (input.request as { lang?: unknown } | null)?.lang === 'ko' ? 'ko' : 'en'
  const filled = checkedSigning(doc, input.request, lang)
  const read = lang === 'ko' && template.ko?.text ? contractIn('ko', template.text, template.ko.text) : null
  const translation = read?.translated && template.ko ? { doc: read.doc, sha256: template.ko.sha256 } : null
  const signing: ContractSigning = { ...filled, values: withLockedEmail(doc, withPreset(doc, filled.values, link.preset ?? {}), link.lockedEmail) }
  const { name, relation } = signing
  const signedAt = new Date()
  const student = { id: link.studentId, name: link.studentName }
  const label = templateLabel(template)
  const copy = await storeSignedCopy({
    branchId,
    academy,
    signer,
    studentName: link.studentName,
    template: { label, sha256: template.sha256, doc },
    signing,
    ip: input.ip,
    userAgent: input.userAgent,
    how: input.how,
    sentBy: { name: link.createdBy?.name || 'The office', atMs: ms(link.createdAt) || signedAt.getTime() },
    signedAt,
    translation,
  })
  let filed = false
  try {
    filed = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(linkRef(branchId, id))).data() as ContractLink | undefined
      const has = await readFolders(tx, branchId, link.studentId)
      if (fresh?.status === 'signed') return false
      if (!fresh || fresh.status !== 'sent') throw notWaiting(fresh?.status ?? 'invalid')
      fileSignedCopy(tx, {
        branchId,
        student,
        has,
        copy,
        signed: { via: input.via, signerName: name, relation, signerEmail: input.signerEmail, templateId: link.templateId, templateName: label, linkId: id, values: signing.values },
        signerName: name,
      })
      tx.update(linkRef(branchId, id), {
        status: 'signed',
        signedAt: FieldValue.serverTimestamp(),
        signer: { name, relation, ip: input.ip, userAgent: input.userAgent, templateSha256: template.sha256 },
        fileId: copy.fileRef.id,
        fileName: copy.fileName,
      })
      tx.set(db.collection(`${base}/${COL.auditLog}`).doc(), signedAudit({ signerName: name, relation, student, entityType: 'contractLink', entityId: id, dateKey: dateKeyOf(signedAt, academy.timezone), how: input.where }))
      return true
    })
  } catch (e) {
    await copy.object.delete({ ignoreNotFound: true }).catch(() => undefined)
    throw e
  }
  if (!filed) {
    await copy.object.delete({ ignoreNotFound: true }).catch(() => undefined)
    return { signed: false, fileName: null, emailedTo: [] }
  }
  const emailedTo = await emailSignedCopy({ branchId, id, link, academy, doc, signing, signerEmail: input.signerEmail, copy })
  await tellOffice(
    branchId,
    student,
    `${choiceWords(doc, signing.values, link.preset ?? {})}Signed by ${name} (${RELATION_LABELS[relation].toLowerCase()}) ${input.where}${input.signerEmail ? `, as ${input.signerEmail}` : ''}. The signed copy is in ${link.studentName}’s Contracts folder in the Drive${emailedTo.length ? `, and ${name.split(' ')[0]} got theirs by email (${emailedTo.join(', ')})` : ''}.`,
    `contract-${id}`,
  )
  return { signed: true, fileName: copy.fileName, emailedTo }
}

/** Signing with the contract's link (anyone who has it, once: the QR code at the front desk, or the email). */
export const signContract = onCall({ secrets: [gmailAppPassword], timeoutSeconds: 120, memory: '512MiB', ...LIGHT }, async (req): Promise<ContractLinkSignedResult> => {
  const input = (req.data ?? {}) as { token?: unknown }
  const ip = addressOf(req.rawRequest)
  const userAgent = String(req.rawRequest.headers['user-agent'] ?? '').slice(0, 400)
  if (!(await withinLimits([{ key: limitKey('sign', ip), max: 20, window: HOUR }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then try again.')
  }
  const found = await findLink(input.token)
  if (!found) throw notWaiting('invalid')
  const { branchId, id, link } = found
  if (link.status !== 'sent') throw notWaiting(link.status)
  if (!(await withinLimits([{ key: limitKey('link', id), max: 10, window: HOUR }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then try again.')
  }
  const r = await signSent({ branchId, id, link, request: req.data, ip, userAgent, how: { link: input.token as string }, via: 'link', signerEmail: null, where: 'with the link' })
  if (!r.signed) throw notWaiting('signed')
  const signedAt = Date.now()
  return { ok: true, fileName: r.fileName, copyUntil: signedAt + SIGNED_COPY_DAYS * DAY, emailedTo: r.emailedTo }
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
 * The phone app's way to a contract (Goo, 2026-11-05: "writing the contract can be all done by website, just like the QR
 * code"): a parent signed in to the app gets the link of the contract the office sent for one of their children, still
 * waiting, and the app opens its page on the website, where they read it in their language and sign it. Only their own
 * family's, only a parent's; the link signs once, as the QR code's does.
 */
export const contractLinkForFamily = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req): Promise<{ path: string; linkId: string }> => {
  const { branchId, studentId } = (req.data ?? {}) as { branchId?: unknown; studentId?: unknown }
  const caller = await familyCaller(branchId, req.auth)
  if (caller.member.role !== 'parent') throw new HttpsError('permission-denied', 'A parent or guardian signs the contract.')
  if (typeof studentId !== 'string' || !familyIds(caller.member).includes(studentId)) throw new HttpsError('invalid-argument', 'Choose your child.')
  if (!(await withinLimits([{ key: limitKey('open', caller.uid), max: 60, window: HOUR }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then try again.')
  }
  const b = branchId as string
  const sent = (await db.collection(`${ROOT.branches}/${b}/${COL.contractLinks}`).where('studentId', '==', studentId).get()).docs
    .filter((d) => (d.data() as ContractLink).status === 'sent')
    .sort((x, y) => ms((y.data() as ContractLink).createdAt) - ms((x.data() as ContractLink).createdAt))
  const waiting = sent[0]
  const token = waiting ? ((await tokenRef(b, waiting.id).get()).data() as ContractLinkToken | undefined)?.token : undefined
  if (!waiting || !token) throw notWaiting('invalid')
  return { path: `/sign/${token}`, linkId: waiting.id }
})

/**
 * A parent signed in (the app or the website) signs the contract the office sent for one of their children
 * (`linkId`; docs/DECISIONS.md §33: one contract per child, each signed on its own), filed as a link's is, with the
 * account that signed on its record page. One the other parent signed meanwhile is left as it is. Students don't
 * sign: their parent does.
 */
export const signContractSignedIn = onCall({ secrets: [gmailAppPassword], timeoutSeconds: 120, memory: '512MiB', ...LIGHT }, async (req): Promise<ContractSignedResult> => {
  const input = (req.data ?? {}) as { branchId?: unknown; studentId?: unknown; linkId?: unknown; where?: unknown; device?: unknown }
  const caller = await familyCaller(input.branchId, req.auth)
  const branchId = input.branchId as string
  if (caller.member.role !== 'parent') throw new HttpsError('permission-denied', 'A parent or guardian signs the contract.')
  const studentId = typeof input.studentId === 'string' ? input.studentId : ''
  if (!studentId || !familyIds(caller.member).includes(studentId)) throw new HttpsError('invalid-argument', 'Choose your child.')
  const id = typeof input.linkId === 'string' && /^[0-9a-f]{64}$/.test(input.linkId) ? input.linkId : ''
  const link = id ? ((await linkRef(branchId, id).get()).data() as ContractLink | undefined) : undefined
  if (!link || link.studentId !== studentId) throw notWaiting('invalid')
  if (link.status === 'signed') return { signed: false, fileName: null, emailedTo: [] }
  if (link.status !== 'sent') throw notWaiting(link.status)
  if (!(await withinLimits([{ key: limitKey('account', caller.uid), max: 20, window: HOUR }]))) {
    throw new HttpsError('resource-exhausted', 'Too many tries just now. Please wait a few minutes, then try again.')
  }
  const where = input.where === 'app' ? 'app' : 'website'
  const device = typeof input.device === 'string' && input.device.trim() ? input.device.trim().slice(0, 200) : ''
  return signSent({
    branchId,
    id,
    link,
    request: req.data,
    ip: addressOf(req.rawRequest),
    userAgent: device || String(req.rawRequest.headers['user-agent'] ?? '').slice(0, 400),
    how: { account: caller.email, where },
    via: where === 'app' ? 'app' : 'web',
    signerEmail: caller.email,
    where: where === 'app' ? 'in the app' : 'on the website',
  })
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
