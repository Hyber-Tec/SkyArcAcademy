import { FieldValue, type Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https'
import { db, LIGHT } from './app'
import { sendNotifications } from './notify'
import { familyClassesLink, familyOf, noticesFor, officeOf } from './recipients'
import { snapshotOf } from './sessionNotify'
import { COL, ROOT } from '@shared/paths'
import { MAKEUP_LOOKBACK_DAYS, takesSeat } from '@shared/schedule/classes'
import { decidedNotice, familyCanceledNotice, familyClassNotice, requestedNotice } from '@shared/schedule/familyNotices'
import { type ClassRequest, type ClassRequestKind, type ClassSeats, familyCancelCheck, requestCheck, seatLabelFor } from '@shared/schedule/requests'
import { resolveSettings } from '@shared/settings/resolve'
import { addDays, dayEndInstant, toInstant, todayKey, weekdayOf } from '@shared/time'
import type { AcademyClass, AuditEntry, Branch, Member, Session, Student } from '@shared/types'

/**
 * Families cancel and ask for classes; the office answers (docs/DECISIONS.md §23). Families never write the schedule:
 * these callables check each step on the server with the shared rules (shared/src/schedule/requests.ts), write it with
 * its audit entry, and tell whoever needs to know. The office also books anything itself on the schedule, as before.
 * `classSeats` keeps each class's seats taken, without names, for families to see where seats are open.
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
const viaOf = (v: unknown): Via => (v === 'app' ? 'app' : 'web')
const ms = (t: unknown) => (t as Timestamp | null | undefined)?.toMillis?.() ?? 0

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
  const [classSnap, taken, seatSnap, pendingSnap, studentSnap] = await Promise.all([
    db.doc(`${b}/${COL.classes}/${classId}`).get(),
    db.collection(`${b}/${COL.sessions}`).where('classId', '==', classId).get(),
    db.collection(`${b}/${COL.sessions}`).where('studentId', '==', studentId).where('dateKey', '>=', addDays(today, -MAKEUP_LOOKBACK_DAYS)).get(),
    db.collection(`${b}/${COL.classRequests}`).where('studentId', '==', studentId).where('status', '==', 'pending').get(),
    db.doc(`${b}/${COL.students}/${studentId}`).get(),
  ])
  const c = classSnap.data() as AcademyClass | undefined
  const target = c
    ? { id: classId, dateKey: c.dateKey, startMin: c.startMin, endMin: c.endMin, seats: c.seats, isDeleted: c.isDeleted, startMs: ms(c.startAt), taken: taken.docs.filter((d) => takesSeat(d.data() as Session)).length }
    : null
  const seats = seatSnap.docs.map((d) => {
    const s = d.data() as Session
    return { id: d.id, classId: s.classId, studentId: s.studentId, dateKey: s.dateKey, startMin: s.startMin, endMin: s.endMin, status: s.status, note: s.note, isDeleted: s.isDeleted, startMs: ms(s.startAt) }
  })
  const pending = pendingSnap.docs.map((d) => d.data() as ClassRequest)
  const check = requestCheck({ draft: { kind, classId, forSessionId }, target, seats, pending, nowMs: now, today, settings })
  if (!check.ok || !c) throw new HttpsError('failed-precondition', check.ok ? 'That class can’t be asked for anymore.' : check.message)

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
  }
  await ref.create(request)

  const office = await officeOf(branchId)
  await tell(branchId, noticesFor(office, requestedNotice(request), () => officeLink(c.dateKey, ref.id), { requestId: ref.id, dateKey: c.dateKey }), `request-${ref.id}`)
  return { requestId: ref.id }
})

/** The family takes back a request still waiting. */
export const withdrawClassRequest = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const branchId = idOf(req.data?.branchId, 'academy')
  const requestId = idOf(req.data?.requestId, 'request')
  const who = await callerOf(branchId, req.auth)
  const ref = db.doc(`${base(branchId)}/${COL.classRequests}/${requestId}`)
  await db.runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data() as ClassRequest | undefined
    if (!r || !familyOfStudent(who, r.studentId)) throw new HttpsError('not-found', 'Request not found.')
    if (r.status !== 'pending') throw new HttpsError('failed-precondition', 'The academy has already answered this request.')
    tx.update(ref, { status: 'withdrawn', updatedAt: FieldValue.serverTimestamp() })
  })
  return { ok: true }
})

// ------------------------------------------------------------------ decide

/** The office approves a request (the seat is booked, and a moved class canceled) or declines it, with a note. */
export const decideClassRequest = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const branchId = idOf(req.data?.branchId, 'academy')
  const requestId = idOf(req.data?.requestId, 'request')
  const approve = req.data?.decision === 'approve'
  if (!approve && req.data?.decision !== 'reject') throw new HttpsError('invalid-argument', 'Approve or decline.')
  const note = text(req.data?.note, 500)
  const via = viaOf(req.data?.via)
  const who = await callerOf(branchId, req.auth)
  if (who.role !== 'owner' && who.role !== 'admin') throw new HttpsError('permission-denied', 'Only the academy’s admins answer requests.')
  const { tz } = await academyOf(branchId)
  const b = base(branchId)
  const ref = db.doc(`${b}/${COL.classRequests}/${requestId}`)

  const decided = await db.runTransaction(async (tx) => {
    const r = (await tx.get(ref)).data() as ClassRequest | undefined
    if (!r) throw new HttpsError('not-found', 'Request not found.')
    if (r.status !== 'pending') throw new HttpsError('failed-precondition', r.status === 'withdrawn' ? 'The family withdrew this request.' : 'This request has already been answered.')
    const stamp = { updatedAt: FieldValue.serverTimestamp(), decidedAt: FieldValue.serverTimestamp(), decidedBy: { email: who.email, name: who.name } }
    if (!approve) {
      tx.update(ref, { status: 'rejected', decisionNote: note, ...stamp })
      tx.create(
        db.collection(`${b}/${COL.auditLog}`).doc(),
        audit(who, via, { action: 'request.reject', entityType: 'classRequest', entityId: requestId, summary: `Declined ${r.studentName}’s request for a class`, dateKey: r.dateKey, studentId: r.studentId, studentName: r.studentName }),
      )
      return { ...r, decisionNote: note, sessionId: null as string | null }
    }

    const classRef = db.doc(`${b}/${COL.classes}/${r.classId}`)
    const [classSnap, inClass, forSnap, studentSnap] = await Promise.all([
      tx.get(classRef),
      tx.get(db.collection(`${b}/${COL.sessions}`).where('classId', '==', r.classId)),
      r.forSessionId ? tx.get(db.doc(`${b}/${COL.sessions}/${r.forSessionId}`)) : Promise.resolve(null),
      tx.get(db.doc(`${b}/${COL.students}/${r.studentId}`)),
    ])
    const c = classSnap.data() as AcademyClass | undefined
    if (!c || c.isDeleted || ms(c.startAt) <= Date.now()) throw new HttpsError('failed-precondition', 'That class is no longer ahead on the schedule. Decline the request, or book another time on the schedule.')
    const live = inClass.docs.map((d) => d.data() as Session).filter(takesSeat)
    if (live.some((s) => s.studentId === r.studentId)) throw new HttpsError('failed-precondition', `${r.studentName} is already in that class.`)
    if (live.length >= c.seats) throw new HttpsError('failed-precondition', 'That class is full now. Make room on the schedule first, or decline the request.')
    const moved = forSnap?.data() as Session | undefined
    if (r.kind === 'reschedule' && (!moved || moved.isDeleted || (moved.status !== 'pending' && moved.status !== 'confirmed'))) {
      throw new HttpsError('failed-precondition', 'The class to move is no longer on the schedule. Decline the request, or book it on the schedule.')
    }

    const student = studentSnap.data() as Student | undefined
    const seatRef = db.collection(`${b}/${COL.sessions}`).doc()
    const label = seatLabelFor(r.kind, r.forDateKey)
    tx.create(seatRef, {
      classId: r.classId,
      coachId: '',
      coachName: '',
      studentId: r.studentId,
      studentName: student?.name ?? r.studentName,
      studentGrade: student?.grade ?? '',
      note: label,
      status: 'confirmed',
      dateKey: c.dateKey,
      weekday: weekdayOf(c.dateKey),
      startMin: c.startMin,
      endMin: c.endMin,
      startAt: toInstant(c.dateKey, c.startMin, tz),
      endAt: toInstant(c.dateKey, c.endMin, tz),
      dayEndAt: dayEndInstant(c.dateKey, tz),
      visualOrder: inClass.size,
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
        summary: `Added ${r.studentName} to the class (${label}), as the family asked`,
        dateKey: c.dateKey,
        studentId: r.studentId,
        studentName: r.studentName,
        changes: [{ field: 'status', label: 'Status', from: null, to: 'Confirmed' }],
      }),
    )
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
          summary: `Canceled ${r.studentName}’s class: moved to ${label === 'Practice' ? 'another time' : 'its makeup'}, as the family asked`,
          dateKey: moved.dateKey,
          studentId: r.studentId,
          studentName: r.studentName,
          changes: [{ field: 'status', label: 'Status', from: moved.status === 'confirmed' ? 'Confirmed' : 'Pending', to: 'Canceled' }],
        }),
      )
    }
    tx.update(ref, { status: 'approved', sessionId: seatRef.id, decisionNote: note, ...stamp })
    return { ...r, decisionNote: note, sessionId: seatRef.id }
  })

  const family = await familyOf(branchId, decided.studentId)
  const notice = decidedNotice(decided, approve)
  await tell(
    branchId,
    noticesFor(family, notice, (p) => familyClassesLink(p, decided.dateKey), { requestId, sessionId: decided.sessionId, dateKey: decided.dateKey }),
    `decided-${requestId}`,
  )
  return { ok: true, sessionId: decided.sessionId }
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

/** Requests still waiting for a class that's past: there's nothing to answer, so they're closed as declined. */
export async function closeStaleRequests(branchId: string, nowMs: number) {
  const snap = await db.collection(`${base(branchId)}/${COL.classRequests}`).where('status', '==', 'pending').get()
  const stale = snap.docs.filter((d) => ms(d.data().startAt) <= nowMs)
  await Promise.all(stale.map((d) => d.ref.update({ status: 'rejected', decisionNote: 'The class has passed.', decidedAt: FieldValue.serverTimestamp(), decidedBy: null, updatedAt: FieldValue.serverTimestamp() })))
  return stale.length
}

