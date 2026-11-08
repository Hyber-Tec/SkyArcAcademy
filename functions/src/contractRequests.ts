import { randomBytes } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { ACADEMY_ID } from '@shared/academy'
import { isLinkable, onFile } from '@shared/access/onFile'
import { checkContractRequest, childName } from '@shared/contracts/request'
import { CONTRACT_REQUEST_LINK_DOC, type ContractLink, type ContractRequest, type ContractRequestResult, type ContractRequestState } from '@shared/contracts/types'
import type { DriveActor } from '@shared/drive/types'
import { COL, ROOT } from '@shared/paths'
import { dateKeyOf } from '@shared/time'
import type { Branch } from '@shared/types'
import { LIGHT, db } from './app'
import { DAY, HOUR, addressOf, adminAudit, limitKey, requireAdmin, sha256, withinLimits } from './contracts'
import { sendNotifications } from './notify'
import { officeOf } from './recipients'
import { studentsOnFile } from './signup'

/**
 * A family asks for their children's enrollment contract from the academy's sign (Goo, 2026-11-08, docs/DECISIONS.md
 * §39): its QR code opens `/contract`, where they type each child's name and birth date and their own name, email and
 * phone (`requestContract`, no account, limited per network address as the signing link is). The office hears of it at
 * once, checks it against the academy's records (the student it matches, or a new one) and sends the contract from it
 * as it always does (`sendContract` with the request: the program it suggests and the discounts, which only it checks).
 * Their page, still open, waits on each request (`contractRequestStatus`, by a token only it has) and opens the
 * contract to sign, filled in from what they typed; it's emailed to them too. The office can also close a request
 * that isn't a family's (`closeContractRequest`).
 */

const requests = (base: string) => db.collection(`${base}/${COL.contractRequests}`)

/** Anyone, from the academy's sign: one request per child; their page keeps each one's token. */
export const requestContract = onCall({ timeoutSeconds: 60, ...LIGHT }, async (req): Promise<ContractRequestResult> => {
  const data = (req.data ?? {}) as Record<string, unknown>
  // A box people never see: a script filling in every box fills it too.
  if (typeof data.website === 'string' && data.website.trim()) throw new HttpsError('invalid-argument', 'Please try again.')
  const base = `${ROOT.branches}/${ACADEMY_ID}`
  const branch = (await db.doc(base).get()).data() as Branch | undefined
  if (!branch || branch.status !== 'active') throw new HttpsError('failed-precondition', 'The academy isn’t taking requests here just now. Please ask at the front desk.')
  const checked = checkContractRequest(data, dateKeyOf(new Date(), branch.timezone || 'America/New_York'))
  if (!checked.ok) throw new HttpsError('invalid-argument', 'Some parts need another look.', { errors: checked.errors })
  const ip = addressOf(req.rawRequest)
  const day = new Date().toISOString().slice(0, 10)
  if (!(await withinLimits([{ key: limitKey('request', ip), max: 8, window: HOUR }, { key: `sign-requests-${day}`, max: 300, window: DAY }]))) {
    throw new HttpsError('resource-exhausted', 'Too many requests just now. Please ask at the front desk.')
  }
  const r = checked.value

  // The academy's records: a student whose parent has this email and this first name, or a student of this name.
  const students = await studentsOnFile(base)
  const theirs = new Set(onFile(r.email, students)?.studentIds ?? [])
  const made: (ContractRequestResult['requests'][number] & { name: string })[] = []
  const batch = db.batch()
  for (const child of r.children) {
    const full = childName(child).toLowerCase()
    const first = child.firstName.toLowerCase()
    const match =
      students.find((s) => theirs.has(s.id) && (s.student.firstName ?? '').trim().toLowerCase() === first) ??
      students.find((s) => theirs.has(s.id) && s.name.trim().toLowerCase() === full) ??
      students.find((s) => isLinkable(s.status) && s.name.trim().toLowerCase() === full) ??
      null
    const token = randomBytes(32).toString('base64url')
    const ref = requests(base).doc()
    const request: ContractRequest = {
      studentFirstName: child.firstName,
      studentLastName: child.lastName,
      studentDob: child.dob,
      parentName: r.parentName,
      email: r.email,
      phone: r.phone,
      lang: r.lang,
      status: 'waiting',
      createdAt: null,
      matchedStudentId: match?.id ?? null,
      matchedStudentName: match?.name ?? null,
      tokenHash: sha256(token),
      studentId: null,
      linkId: null,
      sentAt: null,
      sentBy: null,
      closedAt: null,
      closedBy: null,
    }
    batch.create(ref, { ...request, createdAt: FieldValue.serverTimestamp() })
    made.push({ id: ref.id, token, firstName: child.firstName, name: childName(child) })
  }
  await batch.commit()

  // The office hears of it at once, in the app and on their phones (a failure here is only logged: it's asked).
  try {
    const office = await officeOf(ACADEMY_ID)
    await sendNotifications(
      ACADEMY_ID,
      office.flatMap((p) =>
        made.map((m) => ({
          recipientKey: p.key,
          type: 'contract_requested' as const,
          title: `Contract request: ${m.name}`,
          body: `${r.parentName} asked for ${m.firstName}’s enrollment contract from the academy’s sign. Choose the program and any discounts and send it: it opens on their phone.`,
          link: `admin/settings/contract?request=${m.id}`,
          refs: {},
        })),
      ),
      `contract-request-${made[0].id}`,
    )
  } catch (e) {
    logger.error('Contract request: telling the office failed', { error: String(e) })
  }
  return { requests: made.map(({ id, token, firstName }) => ({ id, token, firstName })) }
})

/** The family's page, waiting: each request's state by its token, and the contract's page once the office sends it. */
export const contractRequestStatus = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req): Promise<{ requests: ContractRequestState[] }> => {
  const tokens = Array.isArray(req.data?.tokens) ? (req.data.tokens as unknown[]).slice(0, 8) : []
  const base = `${ROOT.branches}/${ACADEMY_ID}`
  const states = await Promise.all(
    tokens.map(async (token): Promise<ContractRequestState> => {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return { state: 'unknown' }
      const found = (await requests(base).where('tokenHash', '==', sha256(token)).limit(1).get()).docs[0]
      if (!found) return { state: 'unknown' }
      const r = found.data() as ContractRequest
      const firstName = r.studentFirstName
      if (r.status === 'closed') return { state: 'closed', firstName }
      if (r.status !== 'sent' || !r.linkId) return { state: 'waiting', firstName }
      const [link, secret] = await Promise.all([db.doc(`${base}/${COL.contractLinks}/${r.linkId}`).get(), found.ref.collection('private').doc(CONTRACT_REQUEST_LINK_DOC).get()])
      const status = (link.data() as ContractLink | undefined)?.status
      if (status === 'signed') return { state: 'signed', firstName }
      const linkToken = (secret.data() as { token?: string } | undefined)?.token
      // Withdrawn, the office may send it again from the request: it waits.
      return status === 'sent' && linkToken ? { state: 'ready', firstName, path: `/sign/${linkToken}` } : { state: 'waiting', firstName }
    }),
  )
  return { requests: states }
})

/** Owners and admins: a request closed without a contract (not a family, or one asked twice). */
export const closeContractRequest = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const { branchId, requestId } = (req.data ?? {}) as { branchId?: string; requestId?: unknown }
  const caller = await requireAdmin(branchId, req.auth, 'close a request')
  if (typeof requestId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(requestId)) throw new HttpsError('invalid-argument', 'That isn’t a family’s request.')
  const base = `${ROOT.branches}/${branchId as string}`
  const ref = requests(base).doc(requestId)
  const by: DriveActor = { uid: caller.uid, email: caller.email, name: caller.name }
  await db.runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data() as ContractRequest | undefined
    if (!r) throw new HttpsError('not-found', 'That request isn’t there any more.')
    if (r.status === 'closed') return
    tx.update(ref, { status: 'closed', closedAt: FieldValue.serverTimestamp(), closedBy: by })
    tx.set(
      db.collection(`${base}/${COL.auditLog}`).doc(),
      adminAudit(caller, { action: 'contract.request_close', entityType: 'contractRequest', entityId: requestId, summary: `Closed ${r.parentName}’s request for ${childName({ firstName: r.studentFirstName, lastName: r.studentLastName })}’s contract` }),
    )
  })
  return { ok: true }
})
