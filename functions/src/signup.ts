import { FieldValue, type Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { ACADEMY_ID, isDemoAcademy } from '@shared/academy'
import { LINKED_BY_RECORDS, type LinkResult, type StudentOnFile, onFile } from '@shared/access/onFile'
import { newMemberData } from '@shared/branchFactory'
import { firstNames } from '@shared/contracts/gate'
import { COL, DOC, ROOT, USER_COL, emailKey } from '@shared/paths'
import { ROLE_LABELS } from '@shared/roles'
import type { SignupRequest, Student, StudentPrivateProfile } from '@shared/types'
import { db, LIGHT } from './app'
import { sendNotifications } from './notify'
import { noticesFor, officeOf } from './recipients'

/**
 * Signing up (docs/DECISIONS.md §31, the third meeting's CT1). Anyone may make an account, on the phone or the website;
 * once its email is confirmed, the app asks the server to link it (`linkMyAccount`): an email the academy wrote on a
 * student's record (a parent's, or the student's own: shared/src/access/onFile.ts) becomes that person's access, with
 * an audit entry and a notice to the office, which can remove it. Anyone else asks the academy (the website's
 * `signupRequests`), and the office is told of each request (`onSignupRequestWritten`) and approves it on the Account
 * page. Only the server links: the rules keep refusing anyone who'd add a child to their own access.
 */

/** How often one account may ask in an hour (each try reads every student's record; the page asks each time it opens). */
const TRIES_PER_HOUR = 60

async function allowedTry(uid: string): Promise<boolean> {
  const ref = db.doc(`${ROOT.users}/${uid}/${USER_COL.private}/linkTries`)
  const now = Date.now()
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const recent = ((snap.get('at') as Timestamp[] | undefined) ?? []).map((t) => t.toMillis()).filter((t) => now - t < 3_600_000)
    if (recent.length >= TRIES_PER_HOUR) return false
    tx.set(ref, { at: [...recent, now].map((t) => new Date(t)), updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    return true
  })
}

/** Every student with the emails on their record (their private profile). */
async function studentsOnFile(base: string): Promise<(StudentOnFile & { student: Student })[]> {
  const students = await db.collection(`${base}/${COL.students}`).get()
  if (students.empty) return []
  const profiles = await db.getAll(...students.docs.map((d) => db.doc(`${base}/${COL.students}/${d.id}/private/${DOC.privateProfile}`)))
  return students.docs.map((d, i) => {
    const student = d.data() as Student
    return { id: d.id, name: student.name, status: student.status, profile: (profiles[i].data() as StudentPrivateProfile | undefined) ?? null, student }
  })
}

/** "Ava Monroe", "Ava and Leo Monroe", "Ava Monroe and Kai Park": the students' names, a shared family name once. */
function namesOf(names: readonly string[]): string {
  if (names.length < 2) return names[0] ?? ''
  const last = names.map((n) => n.trim().split(/\s+/).slice(1).join(' '))
  if (last.every((l) => l && l === last[0])) return `${firstNames(names)} ${last[0]}`
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

/**
 * The signed-in caller, not yet a member of the academy, linked by the email on file when a student's record has it.
 * `member`: they're one already (the app opens). `not_found`: no record has the email, or the office removed access it
 * was given this way before; they ask the academy. Never links an unconfirmed email, nor to the demo academy.
 */
export const linkMyAccount = onCall({ timeoutSeconds: 60, ...LIGHT }, async (req): Promise<LinkResult> => {
  const auth = req.auth
  if (!auth || typeof auth.token.email !== 'string') throw new HttpsError('unauthenticated', 'Sign in first.')
  if (auth.token.email_verified !== true) throw new HttpsError('failed-precondition', 'Confirm your email first.')
  const email = emailKey(auth.token.email)
  const base = `${ROOT.branches}/${ACADEMY_ID}`
  const memberRef = db.doc(`${base}/${COL.members}/${email}`)
  const linkRef = db.doc(`${base}/${COL.accessLinks}/${email}`)
  const [member, branch, earlier] = await Promise.all([memberRef.get(), db.doc(base).get(), linkRef.get()])
  if (member.exists) return { state: 'member' }
  if (branch.data()?.status !== 'active' || earlier.exists) return { state: 'not_found' }
  if (!(await allowedTry(auth.uid))) throw new HttpsError('resource-exhausted', 'Too many tries just now. Wait a minute, then try again.')

  const students = await studentsOnFile(base)
  const found = onFile(email, students)
  if (!found) return { state: 'not_found' }
  const linked = found.studentIds.map((id) => students.find((s) => s.id === id)!).map((s) => ({ id: s.id, name: s.name }))
  const displayName = found.name || (typeof auth.token.name === 'string' ? auth.token.name.trim() : '')
  const requestRef = db.doc(`${base}/${COL.signupRequests}/${email}`)
  const who = found.role === 'parent' ? `${namesOf(linked.map((s) => s.name))}’s parent` : linked[0].name

  const made = await db.runTransaction(async (tx) => {
    const [now, request] = await Promise.all([tx.get(memberRef), tx.get(requestRef)])
    if (now.exists) return false
    tx.create(memberRef, {
      ...newMemberData({
        email,
        displayName,
        role: found.role,
        createdBy: LINKED_BY_RECORDS,
        studentId: found.role === 'student' ? found.studentIds[0] : null,
        studentIds: found.role === 'parent' ? found.studentIds : [],
      }),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.create(linkRef, { email, uid: auth.uid, role: found.role, studentIds: found.studentIds, at: FieldValue.serverTimestamp() })
    // A request they sent before the office wrote their email on the record is answered by this.
    if ((request.data() as SignupRequest | undefined)?.status === 'pending') {
      tx.update(requestRef, { status: 'approved', decidedAt: FieldValue.serverTimestamp(), decidedBy: LINKED_BY_RECORDS, decisionNote: null, updatedAt: FieldValue.serverTimestamp() })
    }
    tx.set(db.collection(`${base}/${COL.auditLog}`).doc(), {
      at: FieldValue.serverTimestamp(),
      actorUid: auth.uid,
      actorEmail: email,
      actorName: displayName || email,
      actorRole: found.role,
      action: 'member.create',
      category: 'access',
      entityType: 'member',
      entityId: email,
      summary: `${displayName || email} signed up and was given access as ${ROLE_LABELS[found.role]}${found.role === 'parent' ? `, for ${namesOf(linked.map((s) => s.name))}` : ''}, by the email on ${linked.length > 1 ? 'their records' : 'the record'}`,
      context: '',
      dateKey: null,
      studentId: linked[0].id,
      studentName: linked[0].name,
      coachId: null,
      coachName: null,
      changes: [],
      via: 'function',
    })
    return true
  })
  if (!made) return { state: 'member' }
  logger.info('Linked by the email on file', { role: found.role, students: found.studentIds.length })

  try {
    const office = await officeOf(ACADEMY_ID)
    await sendNotifications(
      ACADEMY_ID,
      noticesFor(
        office,
        {
          type: 'family_linked',
          title: `${who} signed up`,
          body: `${email} has access as ${ROLE_LABELS[found.role].toLowerCase()}${found.role === 'parent' ? ` of ${namesOf(linked.map((s) => s.name))}` : ''}, by the email on ${linked.length > 1 ? 'their records' : 'the record'}. If that isn’t right, remove the access on the Account page.`,
        },
        () => 'admin/account',
        {},
      ),
      `linked-${email}`,
    )
  } catch (e) {
    logger.error('Linked: telling the office failed', { error: String(e) })
  }
  return { state: 'linked', role: found.role, students: linked }
})

/**
 * Someone asks to join (the website's /join, or the app's "Ask the academy"): the owners and admins hear of each new
 * request, and of one sent again, unless they turned the switch off. The demo academy tells nobody.
 */
export const onSignupRequestWritten = onDocumentWritten({ document: `${ROOT.branches}/{branchId}/${COL.signupRequests}/{email}`, ...LIGHT }, async (event) => {
  const before = event.data?.before.data() as SignupRequest | undefined
  const after = event.data?.after.data() as SignupRequest | undefined
  const { branchId, email } = event.params
  if (!after || after.status !== 'pending' || before?.status === 'pending' || isDemoAcademy(branchId)) return
  const name = `${after.firstName} ${after.lastName}`.trim() || email
  const role = ROLE_LABELS[after.requestedRole]?.toLowerCase() ?? 'member'
  const children = after.requestedRole === 'parent' && after.studentNames.trim() ? ` For: ${after.studentNames.trim().replace(/\s+/g, ' ').slice(0, 200)}.` : ''
  try {
    const office = await officeOf(branchId)
    await sendNotifications(
      branchId,
      noticesFor(
        office,
        { type: 'signup_request', title: `${name} asks to join as ${/^[aeiou]/.test(role) ? 'an' : 'a'} ${role}`, body: `${email}.${children} Approve or decline it on the Account page.` },
        () => 'admin/account?tab=requests',
        {},
      ),
      `signup-${email}-${(after.updatedAt as Timestamp | null | undefined)?.toMillis?.() ?? Date.now()}`,
    )
  } catch (e) {
    logger.error('Sign-up request: telling the office failed', { branchId, error: String(e) })
  }
})
