import { FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { db, LIGHT } from './app'
import { sendNotifications } from './notify'
import { familyClassesLink, familyOf, noticesFor, officeOf } from './recipients'
import { snapshotOf } from './sessionNotify'
import { COL, ROOT } from '@shared/paths'
import { MAKEUP_LOOKBACK_DAYS, takesSeat } from '@shared/schedule/classes'
import { acceptedNotice, askedAgainNotice, decidedNotice, familyCanceledNotice, familyClassNotice, offeredNotice, requestedNotice } from '@shared/schedule/familyNotices'
import {
  type ClassOffer,
  type ClassRequest,
  type ClassRequestKind,
  type ClassSeats,
  type RequestActor,
  type RequestClass,
  type RequestSeat,
  acceptCheck,
  anotherCheck,
  closedMessage,
  familyCancelCheck,
  isOpenRequest,
  isStaleRequest,
  offerCheck,
  requestCheck,
  requestStep,
  seatLabelFor,
  withStep,
} from '@shared/schedule/requests'
import { resolveSettings } from '@shared/settings/resolve'
import { addDays, dayEndInstant, toInstant, todayKey, weekdayOf } from '@shared/time'
import type { AcademyClass, AuditEntry, Branch, Member, Session, Student } from '@shared/types'

/**
 * Families cancel and ask for classes; the office answers (docs/DECISIONS.md §23): it approves, declines, or suggests
 * another class, which the family accepts or answers by asking for another, back and forth until it's booked. Families
 * never write the schedule: these callables check each step on the server with the shared rules
 * (shared/src/schedule/requests.ts), write it with its audit entry, and tell whoever needs to know. A seat is booked
 * in a transaction that counts the class's seats again, so two families after its last seat can't both get it. The
 * office also books anything itself on the schedule, as before. `classSeats` keeps each class's seats taken, without
 * names, for families to see where seats are open.
 */

interface Caller {
  uid: string
  email: string
  name: string
  role: Member['role']
  member: Member
}

type Via = AuditEntry['via']

async function callerOf(branchId: string, auth: CallableRequest['auth']): Promise<Caller> {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  const email = auth.token.email.toLowerCase()
  const [m, b] = await Promise.all([db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`).get(), db.doc(`${ROOT.branches}/${branchId}`).get()])
  const member = m.data() as Member | undefined
  if (!member || member.status !== 'active' || b.data()?.status !== 'active') throw new HttpsError('permission-denied', 'You don’t have access to this academy.')
  return { uid: auth.uid, email, name: member.displayName || (typeof auth.token.name === 'string' ? auth.token.name : '') || email, role: member.role, member }
}

function familyOfStudent(c: Caller, studentId: string): c is Caller & { role: 'parent' | 'student' } {
  return (c.role === 'parent' && (c.member.studentIds ?? []).includes(studentId)) || (c.role === 'student' && c.member.studentId === studentId)
}

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
function idOf(v: unknown, what: string): string {
  const s = text(v, 128)
  if (!s || s.includes('/')) throw new HttpsError('invalid-argument', `Missing ${what}.`)
  return s
}
/** An ID that may be left out (null), but not malformed. */
function optionalId(v: unknown, what: string): string | null {
  return v === undefined || v === null || v === '' ? null : idOf(v, what)
}
const viaOf = (v: unknown): Via => (v === 'app' ? 'app' : 'web')
const ms = (t: unknown) => (t as Timestamp | null | undefined)?.toMillis?.() ?? 0
const actorOf = (c: Caller): RequestActor => ({ email: c.email, name: c.name, role: c.role })
const refuse = (message: string) => new HttpsError('failed-precondition', message)

async function academyOf(branchId: string) {
  const snap = await db.doc(`${ROOT.branches}/${branchId}`).get()
  const branch = snap.data() as Branch | undefined
  if (!branch) throw new HttpsError('not-found', 'Academy not found.')
  const tz = branch.timezone || 'America/New_York'
  return { branch, settings: resolveSettings(branch.settings), tz, today: todayKey(tz) }
}

function audit(actor: Caller, via: Via, e: Pick<AuditEntry, 'action' | 'entityType' | 'entityId' | 'summary'> & Partial<AuditEntry>) {
  return {
    at: FieldValue.serverTimestamp(),
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorName: actor.name,
    actorRole: actor.role,
    category: 'schedule',
    context: '',
    dateKey: null,
    studentId: null,
    studentName: null,
    coachId: null,
    coachName: null,
    changes: [],
    via,
    ...e,
  }
}

const base = (branchId: string) => `${ROOT.branches}/${branchId}`
const officeLink = (dateKey: string, requestId?: string) => `admin/schedule?date=${dateKey}${requestId ? `&request=${requestId}` : ''}`

/** Sends notices without failing the step they follow: it's already saved. */
async function tell(branchId: string, items: Parameters<typeof sendNotifications>[1], dedupeKey: string) {
  try {
    await sendNotifications(branchId, items, dedupeKey)
  } catch (e) {
    logger.error('Could not send notices', { branchId, dedupeKey, error: String(e) })
  }
}

// ------------------------------------------------------------------ cancel

/** A parent or the student cancels an upcoming class, until it's confirmed. */
export const cancelClass = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const branchId = idOf(req.data?.branchId, 'academy')
  const sessionId = idOf(req.data?.sessionId, 'class')
  const via = viaOf(req.data?.via)
  const who = await callerOf(branchId, req.auth)
  const { settings } = await academyOf(branchId)
  const ref = db.doc(`${base(branchId)}/${COL.sessions}/${sessionId}`)

  const before = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const s = snap.data() as Session | undefined
    if (!s || !familyOfStudent(who, s.studentId)) throw new HttpsError('not-found', 'This class isn’t on your schedule.')
    const check = familyCancelCheck({ status: s.status, isDeleted: s.isDeleted, startMs: ms(s.startAt) }, Date.now(), settings)
    if (!check.ok) throw new HttpsError('failed-precondition', check.message)
    tx.update(ref, {
      status: 'canceled',
      canceled: { at: FieldValue.serverTimestamp(), by: who.email, via: 'family' },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: who.email,
    })
    tx.create(
      db.collection(`${base(branchId)}/${COL.auditLog}`).doc(),
      audit(who, via, {
        action: 'session.status',
        entityType: 'session',
        entityId: sessionId,
        summary: `${who.name} canceled ${s.studentName}’s class from the family’s side`,
        dateKey: s.dateKey,
        studentId: s.studentId,
        studentName: s.studentName,
        changes: [{ field: 'status', label: 'Status', from: s.status === 'confirmed' ? 'Confirmed' : 'Pending', to: 'Canceled' }],
      }),
    )
    return s
  })

  // The office hears who canceled; the rest of the family hears it's canceled. Coaches in at its time hear of it from
  // the schedule's own notices (sessionNotify.ts) once it's within their window.
  const [office, family] = await Promise.all([officeOf(branchId), familyOf(branchId, before.studentId)])
  const by = { name: who.name, role: who.role as 'parent' | 'student' }
  const after = { ...snapshotOf(before), status: 'canceled' }
  const forFamily = familyClassNotice({ ...snapshotOf(before), note: before.note }, { ...after, note: before.note }, Date.now())
  await tell(
    branchId,
    [
      ...noticesFor(office, familyCanceledNotice(before, by), () => officeLink(before.dateKey), { sessionId, dateKey: before.dateKey }),
      ...(forFamily ? noticesFor(family, forFamily, (p) => familyClassesLink(p, before.dateKey), { sessionId, dateKey: before.dateKey }, who.email) : []),
    ],
    `famcancel-${sessionId}-${Date.now()}`,
  )
  return { ok: true }
})

// ----------------------------------------------------------------- reading

type Snap = FirebaseFirestore.QueryDocumentSnapshot

/** A student's seats from six weeks back on: the makeups they're owed and the classes ahead. */
const studentSeatsQuery = (b: string, studentId: string, today: string) =>
  db.collection(`${b}/${COL.sessions}`).where('studentId', '==', studentId).where('dateKey', '>=', addDays(today, -MAKEUP_LOOKBACK_DAYS))
/** A student's requests; the open ones are picked in code (a student has few, and this needs no index of its own). */
const studentRequestsQuery = (b: string, studentId: string) => db.collection(`${b}/${COL.classRequests}`).where('studentId', '==', studentId)

function seatLite(d: Snap): RequestSeat {
  const s = d.data() as Session
  return { id: d.id, classId: s.classId, studentId: s.studentId, dateKey: s.dateKey, startMin: s.startMin, endMin: s.endMin, status: s.status, note: s.note, isDeleted: s.isDeleted, startMs: ms(s.startAt) }
}

/** The student's other requests still open (waiting on the office or on them). */
const openOthers = (docs: Snap[], exceptId: string | null) => docs.filter((d) => d.id !== exceptId).map((d) => d.data() as ClassRequest).filter(isOpenRequest)

/** A class as the checks read it, its seats taken counted from its seats as they are now. */
function classLite(id: string, c: AcademyClass | undefined, inClass: FirebaseFirestore.QuerySnapshot): RequestClass | null {
  if (!c) return null
  return { id, dateKey: c.dateKey, startMin: c.startMin, endMin: c.endMin, seats: c.seats, isDeleted: c.isDeleted, startMs: ms(c.startAt), taken: inClass.docs.filter((d) => takesSeat(d.data() as Session)).length }
}

/**
 * Reads, in a transaction, what checking a request for `classId` needs: the class and its seats now, the student's
 * seats, and their other open requests.
 */
async function readForCheck(tx: Transaction, b: string, r: ClassRequest, requestId: string, classId: string, today: string) {
  const [classSnap, inClass, seatSnap, reqSnap] = await Promise.all([
    tx.get(db.doc(`${b}/${COL.classes}/${classId}`)),
    tx.get(db.collection(`${b}/${COL.sessions}`).where('classId', '==', classId)),
    tx.get(studentSeatsQuery(b, r.studentId, today)),
    tx.get(studentRequestsQuery(b, r.studentId)),
  ])
  const c = classSnap.data() as AcademyClass | undefined
  return { c, inClass, target: classLite(classId, c, inClass), seats: seatSnap.docs.map(seatLite), sessions: seatSnap.docs, pending: openOthers(reqSnap.docs, requestId) }
}

// ----------------------------------------------------------------- booking

interface SeatPlan {
  /** The request, with the class it books. */
  r: ClassRequest
  c: AcademyClass
  /** The class's seats, read in the same transaction. */
  inClass: FirebaseFirestore.QuerySnapshot
  /** The class a move replaces, read in the same transaction. */
  moved: Session | undefined
  student: Student | undefined
}

/**
 * Books a request's seat in the transaction that checked it: the seat, labeled in the sheets' words ("MU for 10/26",
 * "Practice"); the class a move replaces, canceled; each with its audit entry; and the class's seats taken. The
 * transaction has read the class's seats and its `classSeats` (which it writes here), so two bookings of a class's last
 * seat can't both go through: the second one is checked again, and finds the class full.
 */
function bookSeat(tx: Transaction, b: string, who: Caller, via: Via, tz: string, p: SeatPlan, why: string): { seatId: string; label: string } {
  const { r, c } = p
  const seatRef = db.collection(`${b}/${COL.sessions}`).doc()
  const label = seatLabelFor(r.kind, r.forDateKey)
  tx.create(seatRef, {
    classId: r.classId,
    coachId: '',
    coachName: '',
    studentId: r.studentId,
    studentName: p.student?.name ?? r.studentName,
    studentGrade: p.student?.grade ?? '',
    note: label,
    status: 'confirmed',
    dateKey: c.dateKey,
    weekday: weekdayOf(c.dateKey),
    startMin: c.startMin,
    endMin: c.endMin,
    startAt: toInstant(c.dateKey, c.startMin, tz),
    endAt: toInstant(c.dateKey, c.endMin, tz),
    dayEndAt: dayEndInstant(c.dateKey, tz),
    visualOrder: p.inClass.size,
    confirmedAt: null,
    confirmedBy: null,
    source: 'request',
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: who.email,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: who.email,
  })
  const log = db.collection(`${b}/${COL.auditLog}`)
  tx.create(
    log.doc(),
    audit(who, via, {
      action: 'session.create',
      entityType: 'session',
      entityId: seatRef.id,
      summary: `Added ${r.studentName} to the class (${label}), ${why}`,
      dateKey: c.dateKey,
      studentId: r.studentId,
      studentName: r.studentName,
      changes: [{ field: 'status', label: 'Status', from: null, to: 'Confirmed' }],
    }),
  )
  const moved = p.moved
  if (r.kind === 'reschedule' && moved && r.forSessionId) {
    tx.update(db.doc(`${b}/${COL.sessions}/${r.forSessionId}`), {
      status: 'canceled',
      canceled: { at: FieldValue.serverTimestamp(), by: who.email, via: 'request' },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: who.email,
    })
    tx.create(
      log.doc(),
      audit(who, via, {
        action: 'session.status',
        entityType: 'session',
        entityId: r.forSessionId,
        summary: `Canceled ${r.studentName}’s class: moved to ${label === 'Practice' ? 'another time' : 'its makeup'}, ${why}`,
        dateKey: moved.dateKey,
        studentId: r.studentId,
        studentName: r.studentName,
        changes: [{ field: 'status', label: 'Status', from: moved.status === 'confirmed' ? 'Confirmed' : 'Pending', to: 'Canceled' }],
      }),
    )
  }
  const taken = p.inClass.docs.filter((d) => takesSeat(d.data() as Session)).length + 1
  const seats: ClassSeats = { dateKey: c.dateKey, startMin: c.startMin, endMin: c.endMin, startAt: c.startAt, seats: c.seats, taken, isDeleted: false, updatedAt: FieldValue.serverTimestamp() as unknown as Timestamp }
  tx.set(db.doc(`${b}/${COL.classSeats}/${r.classId}`), seats)
  return { seatId: seatRef.id, label }
}

// ----------------------------------------------------------------- request

const KINDS: readonly ClassRequestKind[] = ['makeup', 'reschedule', 'extra']

/** A parent or the student asks for an open seat: a makeup, a class moved there, or an extra class. */
export const requestClass = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const branchId = idOf(req.data?.branchId, 'academy')
  const studentId = idOf(req.data?.studentId, 'student')
  const classId = idOf(req.data?.classId, 'class')
  const kind = req.data?.kind as ClassRequestKind
  if (!KINDS.includes(kind)) throw new HttpsError('invalid-argument', 'Choose what to ask for.')
  const forSessionId = kind === 'extra' ? null : idOf(req.data?.forSessionId, 'the class it’s for')
  const message = text(req.data?.message, 500)
  const who = await callerOf(branchId, req.auth)
  if (!familyOfStudent(who, studentId)) throw new HttpsError('permission-denied', 'You can ask only for your own family’s classes.')
  const { settings, today } = await academyOf(branchId)
  const now = Date.now()

  const b = base(branchId)
  const [classSnap, taken, seatSnap, requestSnap, studentSnap] = await Promise.all([
    db.doc(`${b}/${COL.classes}/${classId}`).get(),
    db.collection(`${b}/${COL.sessions}`).where('classId', '==', classId).get(),
    studentSeatsQuery(b, studentId, today).get(),
    studentRequestsQuery(b, studentId).get(),
    db.doc(`${b}/${COL.students}/${studentId}`).get(),
  ])
  const c = classSnap.data() as AcademyClass | undefined
  const check = requestCheck({
    draft: { kind, classId, forSessionId },
    target: classLite(classId, c, taken),
    seats: seatSnap.docs.map(seatLite),
    pending: openOthers(requestSnap.docs, null),
    nowMs: now,
    today,
    settings,
  })
  if (!check.ok || !c) throw refuse(check.ok ? 'That class can’t be asked for anymore.' : check.message)

  const student = studentSnap.data() as Student | undefined
  const ref = db.collection(`${b}/${COL.classRequests}`).doc()
  const request: ClassRequest = {
    kind,
    studentId,
    studentName: student?.name || 'A student',
    classId,
    dateKey: c.dateKey,
    startMin: c.startMin,
    endMin: c.endMin,
    startAt: c.startAt,
    forSessionId,
    forDateKey: check.forSession?.dateKey ?? null,
    message,
    status: 'pending',
    requestedBy: { email: who.email, name: who.name, role: who.role as 'parent' | 'student' },
    createdAt: FieldValue.serverTimestamp() as unknown as Timestamp,
    updatedAt: FieldValue.serverTimestamp() as unknown as Timestamp,
    decidedAt: null,
    decidedBy: null,
    decisionNote: '',
    sessionId: null,
    offer: null,
    history: [requestStep('asked', Timestamp.now(), actorOf(who), { classId, dateKey: c.dateKey, startMin: c.startMin, endMin: c.endMin }, message)],
  }
  await ref.create(request)

  const office = await officeOf(branchId)
  await tell(branchId, noticesFor(office, requestedNotice(request), () => officeLink(c.dateKey, ref.id), { requestId: ref.id, dateKey: c.dateKey }), `request-${ref.id}`)
  return { requestId: ref.id }
})

/** The family takes back a request still open: waiting for the office, or for their answer to a time suggested. */
export const withdrawClassRequest = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const branchId = idOf(req.data?.branchId, 'academy')
  const requestId = idOf(req.data?.requestId, 'request')
  const who = await callerOf(branchId, req.auth)
  const ref = db.doc(`${base(branchId)}/${COL.classRequests}/${requestId}`)
  await db.runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data() as ClassRequest | undefined
    if (!r || !familyOfStudent(who, r.studentId)) throw new HttpsError('not-found', 'Request not found.')
    if (!isOpenRequest(r)) throw refuse(closedMessage(r.status, 'family'))
    tx.update(ref, { status: 'withdrawn', offer: null, history: withStep(r.history, requestStep('withdrawn', Timestamp.now(), actorOf(who))), updatedAt: FieldValue.serverTimestamp() })
  })
  return { ok: true }
})

// ------------------------------------------------------------------ decide

/**
 * The office answers a request still open (waiting on it, or on the family's answer to a time it suggested):
 * - `approve`: the class asked for is booked (a moved class canceled). `classId`, if given, is the class the office saw:
 *   if the family has asked for another since, nothing is booked and the office is asked to look again.
 * - `reject`: declined, with `note` for the family.
 * - `offer`: `classId` is suggested instead, with `note` ("Tuesday is full; Thursday has two seats."): a class the family
 *   could ask for themselves. The request waits on the family, who accept it or ask for another (answerClassOffer).
 * The family is told each time.
 */
export const decideClassRequest = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const branchId = idOf(req.data?.branchId, 'academy')
  const requestId = idOf(req.data?.requestId, 'request')
  const decision = req.data?.decision
  if (decision !== 'approve' && decision !== 'reject' && decision !== 'offer') throw new HttpsError('invalid-argument', 'Approve, decline or suggest another class.')
  const classId = decision === 'offer' ? idOf(req.data?.classId, 'the class to suggest') : decision === 'approve' ? optionalId(req.data?.classId, 'class') : null
  const note = text(req.data?.note, 500)
  const via = viaOf(req.data?.via)
  const who = await callerOf(branchId, req.auth)
  if (who.role !== 'owner' && who.role !== 'admin') throw new HttpsError('permission-denied', 'Only the academy’s admins answer requests.')
  const academy = await academyOf(branchId)
  const ctx = { branchId, b: base(branchId), requestId, ref: db.doc(`${base(branchId)}/${COL.classRequests}/${requestId}`), who, via, note, ...academy }
  if (decision === 'offer') return offerClass(ctx, classId as string)
  return decide(ctx, decision === 'approve', classId)
})

type DecideCtx = {
  branchId: string
  b: string
  requestId: string
  ref: FirebaseFirestore.DocumentReference
  who: Caller
  via: Via
  note: string
  settings: ReturnType<typeof resolveSettings>
  tz: string
  today: string
}

/** Approves (books the class asked for) or declines a request, and tells the family. */
async function decide(x: DecideCtx, approve: boolean, seen: string | null) {
  const { b, ref, who, via, note } = x
  const decided = await db.runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data() as ClassRequest | undefined
    if (!r) throw new HttpsError('not-found', 'Request not found.')
    if (!isOpenRequest(r)) throw refuse(closedMessage(r.status, 'office'))
    const at = Timestamp.now()
    const stamp = { offer: null, updatedAt: FieldValue.serverTimestamp(), decidedAt: FieldValue.serverTimestamp(), decidedBy: { email: who.email, name: who.name } }
    if (!approve) {
      tx.update(ref, { status: 'rejected', decisionNote: note, history: withStep(r.history, requestStep('rejected', at, actorOf(who), null, note)), ...stamp })
      tx.create(
        db.collection(`${b}/${COL.auditLog}`).doc(),
        audit(who, via, { action: 'request.reject', entityType: 'classRequest', entityId: x.requestId, summary: `Declined ${r.studentName}’s request for a class`, dateKey: r.dateKey, studentId: r.studentId, studentName: r.studentName }),
      )
      return { ...r, decisionNote: note, sessionId: null as string | null }
    }
    if (seen && seen !== r.classId) throw refuse('The family has asked for another class since. Check the request, then answer again.')

    const [classSnap, inClass, forSnap, studentSnap] = await Promise.all([
      tx.get(db.doc(`${b}/${COL.classes}/${r.classId}`)),
      tx.get(db.collection(`${b}/${COL.sessions}`).where('classId', '==', r.classId)),
      r.forSessionId ? tx.get(db.doc(`${b}/${COL.sessions}/${r.forSessionId}`)) : Promise.resolve(null),
      tx.get(db.doc(`${b}/${COL.students}/${r.studentId}`)),
      // Read, so that two bookings of the class's last seat can't both commit (bookSeat writes it).
      tx.get(db.doc(`${b}/${COL.classSeats}/${r.classId}`)),
    ])
    const c = classSnap.data() as AcademyClass | undefined
    if (!c || c.isDeleted || ms(c.startAt) <= Date.now()) throw refuse('That class is no longer ahead on the schedule. Suggest another class, decline the request, or book another time on the schedule.')
    const live = inClass.docs.map((d) => d.data() as Session).filter(takesSeat)
    if (live.some((s) => s.studentId === r.studentId)) throw refuse(`${r.studentName} is already in that class.`)
    if (live.length >= c.seats) throw refuse('That class is full now. Suggest another class, make room on the schedule first, or decline the request.')
    const moved = forSnap?.data() as Session | undefined
    if (r.kind === 'reschedule' && (!moved || moved.isDeleted || (moved.status !== 'pending' && moved.status !== 'confirmed'))) {
      throw refuse('The class to move is no longer on the schedule. Decline the request, or book it on the schedule.')
    }
    const { seatId } = bookSeat(tx, b, who, via, x.tz, { r, c, inClass, moved, student: studentSnap.data() as Student | undefined }, 'as the family asked')
    tx.update(ref, { status: 'approved', sessionId: seatId, decisionNote: note, history: withStep(r.history, requestStep('approved', at, actorOf(who), r, note)), ...stamp })
    return { ...r, decisionNote: note, sessionId: seatId }
  })

  const family = await familyOf(x.branchId, decided.studentId)
  await tell(
    x.branchId,
    noticesFor(family, decidedNotice(decided, approve), (p) => familyClassesLink(p, decided.dateKey), { requestId: x.requestId, sessionId: decided.sessionId, dateKey: decided.dateKey }),
    `decided-${x.requestId}`,
  )
  return { ok: true, sessionId: decided.sessionId }
}

/** Suggests another class to the family, and tells them. */
async function offerClass(x: DecideCtx, classId: string) {
  const { b, ref, who, via, note } = x
  const done = await db.runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data() as ClassRequest | undefined
    if (!r) throw new HttpsError('not-found', 'Request not found.')
    if (!isOpenRequest(r)) throw refuse(closedMessage(r.status, 'office'))
    const data = await readForCheck(tx, b, r, x.requestId, classId, x.today)
    const check = offerCheck(r, { target: data.target, seats: data.seats, pending: data.pending, nowMs: Date.now(), today: x.today, settings: x.settings })
    if (!check.ok || !data.c) throw refuse(check.ok ? 'That class can’t be suggested.' : check.message)
    const at = Timestamp.now()
    const c = data.c
    const offer: ClassOffer = { classId, dateKey: c.dateKey, startMin: c.startMin, endMin: c.endMin, startAt: c.startAt, note, by: { email: who.email, name: who.name }, at }
    tx.update(ref, { status: 'offered', offer, history: withStep(r.history, requestStep('offered', at, actorOf(who), offer, note)), updatedAt: FieldValue.serverTimestamp() })
    tx.create(
      db.collection(`${b}/${COL.auditLog}`).doc(),
      audit(who, via, {
        action: 'request.offer',
        entityType: 'classRequest',
        entityId: x.requestId,
        summary: `Suggested another class to ${r.studentName}’s family`,
        dateKey: c.dateKey,
        studentId: r.studentId,
        studentName: r.studentName,
      }),
    )
    return { r, offer }
  })

  const family = await familyOf(x.branchId, done.r.studentId)
  await tell(
    x.branchId,
    noticesFor(family, offeredNotice(done.r, done.offer), (p) => familyClassesLink(p, done.offer.dateKey), { requestId: x.requestId, dateKey: done.offer.dateKey }),
    `offered-${x.requestId}-${ms(done.offer.at)}`,
  )
  return { ok: true, sessionId: null }
}

// ------------------------------------------------------------------ answer

/**
 * The family answers a class the office suggested (a linked parent or the student):
 * - `accept`: the class suggested is booked as approving books it (its seat labeled as the request's, a moved class
 *   canceled), if it still has a seat open; else nothing changes and they're told why. `classId`, if given, is the class
 *   they saw suggested: if the office has changed its suggestion since, nothing is booked.
 * - `another`: they ask for `classId` instead, with an optional `message`: the request waits on the office again.
 * The office is told either way.
 */
export const answerClassOffer = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const branchId = idOf(req.data?.branchId, 'academy')
  const requestId = idOf(req.data?.requestId, 'request')
  const answer = req.data?.answer
  if (answer !== 'accept' && answer !== 'another') throw new HttpsError('invalid-argument', 'Accept the time suggested, or ask for another.')
  const classId = answer === 'another' ? idOf(req.data?.classId, 'class') : optionalId(req.data?.classId, 'class')
  const message = text(req.data?.message, 500)
  const via = viaOf(req.data?.via)
  const who = await callerOf(branchId, req.auth)
  const { settings, tz, today } = await academyOf(branchId)
  const b = base(branchId)
  const ref = db.doc(`${b}/${COL.classRequests}/${requestId}`)

  const done = await db.runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data() as ClassRequest | undefined
    if (!r || !familyOfStudent(who, r.studentId)) throw new HttpsError('not-found', 'Request not found.')
    if (r.status !== 'offered' || !r.offer) throw refuse(closedMessage(r.status, 'family'))
    const target = answer === 'accept' ? r.offer.classId : (classId as string)
    const [data, , studentSnap] = await Promise.all([
      readForCheck(tx, b, r, requestId, target, today),
      // Read, so that two bookings of the class's last seat can't both commit (bookSeat writes it).
      answer === 'accept' ? tx.get(db.doc(`${b}/${COL.classSeats}/${target}`)) : Promise.resolve(null),
      answer === 'accept' ? tx.get(db.doc(`${b}/${COL.students}/${r.studentId}`)) : Promise.resolve(null),
    ])
    const facts = { target: data.target, seats: data.seats, pending: data.pending, nowMs: Date.now(), today, settings }
    const check = answer === 'accept' ? acceptCheck(r, classId, facts) : anotherCheck(r, facts)
    if (!check.ok || !data.c) throw refuse(check.ok ? 'That class can’t be booked anymore. Ask for another time.' : check.message)
    const c = data.c
    const at = Timestamp.now()
    const now = { classId: target, dateKey: c.dateKey, startMin: c.startMin, endMin: c.endMin, startAt: c.startAt }

    if (answer === 'another') {
      tx.update(ref, { ...now, status: 'pending', offer: null, message, history: withStep(r.history, requestStep('asked_again', at, actorOf(who), now, message)), updatedAt: FieldValue.serverTimestamp() })
      return { r: { ...r, ...now, message }, at, seatId: null as string | null, label: '' }
    }
    const booked: ClassRequest = { ...r, ...now }
    const moved = r.forSessionId ? (data.sessions.find((d) => d.id === r.forSessionId)?.data() as Session | undefined) : undefined
    const { seatId, label } = bookSeat(tx, b, who, via, tz, { r: booked, c, inClass: data.inClass, moved, student: studentSnap?.data() as Student | undefined }, 'accepting the time the academy suggested')
    tx.update(ref, {
      ...now,
      status: 'approved',
      sessionId: seatId,
      offer: null,
      history: withStep(r.history, requestStep('accepted', at, actorOf(who), now, message)),
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: { email: who.email, name: who.name },
      updatedAt: FieldValue.serverTimestamp(),
    })
    return { r: { ...booked, sessionId: seatId }, at, seatId: seatId as string | null, label }
  })

  // The office hears the answer; the rest of the family, that it's booked.
  const r = done.r
  const by = { name: who.name, role: who.role as 'parent' | 'student' }
  const office = await officeOf(branchId)
  const forOffice = answer === 'accept' ? acceptedNotice(r, by, r, done.label) : askedAgainNotice(r, by, r, message)
  const items = noticesFor(office, forOffice, () => officeLink(r.dateKey, requestId), { requestId, sessionId: done.seatId, dateKey: r.dateKey })
  if (answer === 'accept') {
    const family = await familyOf(branchId, r.studentId)
    items.push(...noticesFor(family, decidedNotice(r, true), (p) => familyClassesLink(p, r.dateKey), { requestId, sessionId: done.seatId, dateKey: r.dateKey }, who.email))
  }
  await tell(branchId, items, `${answer === 'accept' ? 'accepted' : 'askedagain'}-${requestId}-${ms(done.at)}`)
  return { ok: true, sessionId: done.seatId }
})

// -------------------------------------------------------------- seats taken

/** Writes a class's `classSeats`: its time and seats, and how many are taken now. */
async function syncSeats(branchId: string, classId: string) {
  const b = base(branchId)
  const [classSnap, seats] = await Promise.all([db.doc(`${b}/${COL.classes}/${classId}`).get(), db.collection(`${b}/${COL.sessions}`).where('classId', '==', classId).get()])
  const ref = db.doc(`${b}/${COL.classSeats}/${classId}`)
  const c = classSnap.data() as AcademyClass | undefined
  if (!c) {
    await ref.delete().catch(() => undefined)
    return
  }
  const doc: ClassSeats = {
    dateKey: c.dateKey,
    startMin: c.startMin,
    endMin: c.endMin,
    startAt: c.startAt,
    seats: c.seats,
    taken: seats.docs.filter((d) => takesSeat(d.data() as Session)).length,
    isDeleted: c.isDeleted === true,
    updatedAt: FieldValue.serverTimestamp() as unknown as Timestamp,
  }
  await ref.set(doc)
}

/** A class added, changed or removed. */
export const onClassWritten = onDocumentWritten({ document: `${ROOT.branches}/{branchId}/${COL.classes}/{classId}`, ...LIGHT }, async (event) => {
  await syncSeats(event.params.branchId, event.params.classId)
})

/** A seat taken, freed or moved: the classes it left and joined. */
export const onSeatWritten = onDocumentWritten({ document: `${ROOT.branches}/{branchId}/${COL.sessions}/{sessionId}`, ...LIGHT }, async (event) => {
  const before = event.data?.before.data() as Session | undefined
  const after = event.data?.after.data() as Session | undefined
  const counted = (s: Session | undefined) => (s && s.classId ? (takesSeat(s) ? `${s.classId}+` : `${s.classId}-`) : '')
  if (counted(before) === counted(after)) return
  const classes = new Set([before?.classId, after?.classId].filter((id): id is string => !!id))
  await Promise.all([...classes].map((id) => syncSeats(event.params.branchId, id)))
})

/**
 * Every class of the coming month with its seats taken, rewritten daily: the first run fills them in for classes made
 * before `classSeats` existed, and later runs catch anything a trigger missed.
 */
export async function syncUpcomingSeats(branchId: string, today: string) {
  const b = base(branchId)
  const to = addDays(today, 31)
  const [classes, seats] = await Promise.all([
    db.collection(`${b}/${COL.classes}`).where('dateKey', '>=', today).where('dateKey', '<=', to).get(),
    db.collection(`${b}/${COL.sessions}`).where('dateKey', '>=', today).where('dateKey', '<=', to).get(),
  ])
  const taken = new Map<string, number>()
  for (const d of seats.docs) {
    const s = d.data() as Session
    if (s.classId && takesSeat(s)) taken.set(s.classId, (taken.get(s.classId) ?? 0) + 1)
  }
  const writer = db.bulkWriter()
  for (const d of classes.docs) {
    const c = d.data() as AcademyClass
    const doc: ClassSeats = {
      dateKey: c.dateKey,
      startMin: c.startMin,
      endMin: c.endMin,
      startAt: c.startAt,
      seats: c.seats,
      taken: taken.get(d.id) ?? 0,
      isDeleted: c.isDeleted === true,
      updatedAt: FieldValue.serverTimestamp() as unknown as Timestamp,
    }
    void writer.set(db.doc(`${b}/${COL.classSeats}/${d.id}`), doc)
  }
  await writer.close()
}

/** Who closes a request whose class passed: the server. */
const SERVER: RequestActor = { email: 'system', name: '', role: 'system' }

/**
 * Requests still open whose class has started (the class suggested, while the family's answer is awaited): nothing is
 * left to answer, so they're closed as declined.
 */
export async function closeStaleRequests(branchId: string, nowMs: number) {
  const snap = await db.collection(`${base(branchId)}/${COL.classRequests}`).where('status', 'in', ['pending', 'offered']).get()
  const stale = snap.docs.filter((d) => isStaleRequest(d.data() as ClassRequest, nowMs))
  const at = Timestamp.fromMillis(nowMs)
  await Promise.all(
    stale.map((d) => {
      const r = d.data() as ClassRequest
      return d.ref.update({
        status: 'rejected',
        decisionNote: r.status === 'offered' ? 'The class suggested has passed.' : 'The class has passed.',
        offer: null,
        history: withStep(r.history, requestStep('rejected', at, SERVER)),
        decidedAt: FieldValue.serverTimestamp(),
        decidedBy: null,
        updatedAt: FieldValue.serverTimestamp(),
      })
    }),
  )
  return stale.length
}
