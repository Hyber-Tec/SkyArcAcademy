import { type WriteBatch, doc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { availabilityRecord, describeRanges } from '@shared/availabilityWrites'
import { COL, availabilityDocId } from '@shared/paths'
import { seatKind } from '@shared/schedule/classes'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import type { SessionStatus } from '@shared/settings/defaults'
import { type DateKey, formatDateKey, formatTimeRange, todayKey, weekdayOf } from '@shared/time'
import type { AcademyClass, Availability, AvailabilityRange, AuditChange, Session, StaffRole, Student, WithId } from '@shared/types'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { type ScheduleCtx, timeFields } from './api'

/**
 * Writing classes taught together (docs/DECISIONS.md §21): a class and its seats (sessions with its `classId`), and
 * who's in each day (the coaches' availability). Every write carries its audit entry in the same batch.
 */

type ClassTime = Pick<AcademyClass, 'dateKey' | 'startMin' | 'endMin'>

/** "Mon, Nov 2 · 4:30 PM – 6:00 PM": a class, as the audit log and messages name it. */
export function classContext(c: ClassTime): string {
  return `${formatDateKey(c.dateKey, 'weekdayMedium')} · ${formatTimeRange(c.startMin, c.endMin)}`
}

function auditClass(batch: WriteBatch, ctx: ScheduleCtx, c: ClassTime, input: { action: string; entityId: string; summary: string; changes?: AuditChange[] }) {
  addAudit(batch, ctx.branchId, ctx.actor, { category: 'schedule', entityType: 'class', context: classContext(c), dateKey: c.dateKey, ...input })
}

function auditSeat(
  batch: WriteBatch,
  ctx: ScheduleCtx,
  s: Pick<Session, 'studentId' | 'studentName' | 'dateKey' | 'startMin' | 'endMin'>,
  input: { action: string; entityId: string; summary: string; changes?: AuditChange[] },
) {
  addAudit(batch, ctx.branchId, ctx.actor, {
    category: 'schedule',
    entityType: 'session',
    context: classContext(s),
    dateKey: s.dateKey,
    studentId: s.studentId,
    studentName: s.studentName,
    ...input,
  })
}

const stamps = (ctx: ScheduleCtx) => ({ updatedAt: serverTimestamp(), updatedBy: ctx.actor.email })

// ------------------------------------------------------------------ classes

export interface ClassDraft {
  dateKey: DateKey
  startMin: number
  endMin: number
  seats: number
  note: string
}

export function newClassData(ctx: ScheduleCtx, d: ClassDraft, source: AcademyClass['source']) {
  return {
    ...timeFields(d.dateKey, d.startMin, d.endMin, ctx.timezone),
    seats: d.seats,
    note: d.note.trim(),
    source,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: serverTimestamp(),
    createdBy: ctx.actor.email,
    ...stamps(ctx),
  }
}

export async function createClass(ctx: ScheduleCtx, d: ClassDraft): Promise<string> {
  const ref = doc(branchCol(ctx.branchId, COL.classes))
  const batch = writeBatch(db)
  batch.set(ref, newClassData(ctx, d, 'manual'))
  auditClass(batch, ctx, d, { action: 'class.create', entityId: ref.id, summary: `Added a class: ${classContext(d)}`, changes: [{ field: 'seats', label: 'Seats', from: null, to: d.seats }] })
  await batch.commit()
  return ref.id
}

/**
 * Changes a class's time, seats or note. A new time moves its students with it: a seat for the whole class keeps the
 * whole class, a seat for part of it keeps its length inside the new time.
 */
export async function updateClass(ctx: ScheduleCtx, before: WithId<AcademyClass>, patch: Partial<Pick<ClassDraft, 'startMin' | 'endMin' | 'seats' | 'note'>>, seats: readonly WithId<Session>[]) {
  const next = { ...before, ...patch, note: (patch.note ?? before.note).trim() }
  const timeChanged = next.startMin !== before.startMin || next.endMin !== before.endMin
  const changes: AuditChange[] = []
  if (timeChanged) changes.push({ field: 'time', label: 'Time', from: formatTimeRange(before.startMin, before.endMin), to: formatTimeRange(next.startMin, next.endMin) })
  if (next.seats !== before.seats) changes.push({ field: 'seats', label: 'Seats', from: before.seats, to: next.seats })
  if (next.note !== (before.note ?? '')) changes.push({ field: 'note', label: 'Note', from: before.note || null, to: next.note || null })
  if (!changes.length) return
  const batch = writeBatch(db)
  batch.update(branchDocRef(ctx.branchId, COL.classes, before.id), {
    ...(timeChanged ? timeFields(before.dateKey, next.startMin, next.endMin, ctx.timezone) : {}),
    seats: next.seats,
    note: next.note,
    ...stamps(ctx),
  })
  if (timeChanged) {
    for (const s of seats) {
      if (s.isDeleted) continue
      const whole = s.startMin === before.startMin && s.endMin === before.endMin
      const length = Math.min(s.endMin - s.startMin, next.endMin - next.startMin)
      const start = whole ? next.startMin : Math.min(Math.max(next.startMin, s.startMin + next.startMin - before.startMin), next.endMin - length)
      const end = whole ? next.endMin : start + length
      batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), { ...timeFields(s.dateKey, start, end, ctx.timezone), ...stamps(ctx) })
    }
  }
  const what = changes.map((c) => c.label.toLowerCase()).join(' and ')
  auditClass(batch, ctx, before, { action: 'class.update', entityId: before.id, summary: `Changed the ${what} of the class ${classContext(before)}`, changes })
  await batch.commit()
}

/** Takes a class off the schedule, with its students: both go to the Trash, from where they come back together. */
export async function removeClass(ctx: ScheduleCtx, c: WithId<AcademyClass>, seats: readonly WithId<Session>[]) {
  const batch = writeBatch(db)
  const gone = { isDeleted: true, deletedAt: serverTimestamp(), deletedBy: ctx.actor.name, ...stamps(ctx) }
  batch.update(branchDocRef(ctx.branchId, COL.classes, c.id), gone)
  const live = seats.filter((s) => !s.isDeleted)
  for (const s of live) batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), gone)
  auditClass(batch, ctx, c, {
    action: 'class.delete',
    entityId: c.id,
    summary: `Removed the class ${classContext(c)}${live.length ? ` and its ${live.length} ${live.length === 1 ? 'student' : 'students'}` : ''}`,
  })
  await batch.commit()
}

/** Brings a class back from the Trash with the students removed with it (those removed earlier stay in the Trash). */
export async function restoreClass(ctx: ScheduleCtx, c: WithId<AcademyClass>, seats: readonly WithId<Session>[]) {
  const batch = writeBatch(db)
  const back = { isDeleted: false, deletedAt: null, deletedBy: null, ...stamps(ctx) }
  batch.update(branchDocRef(ctx.branchId, COL.classes, c.id), back)
  const at = millis(c.deletedAt)
  const withIt = seats.filter((s) => s.isDeleted && Math.abs(millis(s.deletedAt) - at) < 2000)
  for (const s of withIt) batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), back)
  auditClass(batch, ctx, c, { action: 'class.restore', entityId: c.id, summary: `Restored the class ${classContext(c)} from Trash` })
  await batch.commit()
}

/** Deletes classes for good (emptying the Trash), with every seat in them. */
export async function purgeClasses(ctx: ScheduleCtx, classes: readonly WithId<AcademyClass>[], seats: readonly WithId<Session>[]) {
  const ops: ((b: WriteBatch) => void)[] = []
  const ids = new Set(classes.map((c) => c.id))
  for (const c of classes) ops.push((b) => b.delete(branchDocRef(ctx.branchId, COL.classes, c.id)))
  for (const s of seats) if (ids.has(s.classId)) ops.push((b) => b.delete(branchDocRef(ctx.branchId, COL.sessions, s.id)))
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + 400)) op(batch)
    if (i === 0) {
      addAudit(batch, ctx.branchId, ctx.actor, {
        action: 'class.purge',
        category: 'schedule',
        entityType: 'class',
        entityId: classes.length === 1 ? classes[0].id : 'many',
        summary: classes.length === 1 ? `Permanently deleted the class ${classContext(classes[0])}` : `Permanently deleted ${classes.length} classes`,
      })
    }
    await batch.commit()
  }
}

const millis = (t: unknown) => (t && typeof t === 'object' && 'toMillis' in t ? (t as { toMillis: () => number }).toMillis() : 0)

// -------------------------------------------------------------------- seats

export interface SeatDraft {
  student: Pick<WithId<Student>, 'id' | 'name' | 'grade'>
  /** The sheets' label: "MU for 11/2", "Practice", "Trial 1", or '' for a regular seat. */
  label: string
  /** Part of the class only (a half-hour trial); the whole class by default. */
  startMin?: number
  endMin?: number
  status?: SessionStatus
}

export function newSeatData(ctx: ScheduleCtx, c: WithId<AcademyClass>, d: SeatDraft, source: Session['source'], order: number) {
  const startMin = d.startMin ?? c.startMin
  const endMin = d.endMin ?? c.endMin
  return {
    classId: c.id,
    coachId: '',
    coachName: '',
    studentId: d.student.id,
    studentName: d.student.name,
    studentGrade: d.student.grade ?? '',
    note: d.label.trim(),
    status: d.status ?? 'confirmed',
    ...timeFields(c.dateKey, startMin, endMin, ctx.timezone),
    visualOrder: order,
    confirmedAt: null,
    confirmedBy: null,
    source,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: serverTimestamp(),
    createdBy: ctx.actor.email,
    ...stamps(ctx),
  }
}

/** Puts a student in a class. `order` places them after the class's other students. */
export async function addSeat(ctx: ScheduleCtx, c: WithId<AcademyClass>, d: SeatDraft, order: number, source: Session['source'] = 'manual'): Promise<string> {
  const ref = doc(branchCol(ctx.branchId, COL.sessions))
  const batch = writeBatch(db)
  const data = newSeatData(ctx, c, d, source, order)
  batch.set(ref, data)
  const label = d.label.trim()
  auditSeat(batch, ctx, data, {
    action: 'session.create',
    entityId: ref.id,
    summary: `Added ${d.student.name} to the class${label ? ` (${label})` : ''}`,
    changes: [{ field: 'status', label: 'Status', from: null, to: SESSION_STATUS_LABELS[data.status] }],
  })
  await batch.commit()
  return ref.id
}

const STATUS_VERB: Partial<Record<SessionStatus, string>> = { present: 'here', no_show: 'a no-show', canceled: 'canceled' }

/** Marks a student here, a no-show or canceled (absent), or back to coming. */
export async function setSeatStatus(ctx: ScheduleCtx, s: WithId<Session>, status: SessionStatus) {
  if (s.status === status) return
  const batch = writeBatch(db)
  batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), {
    status,
    ...(status === 'confirmed' ? { confirmedAt: serverTimestamp(), confirmedBy: ctx.actor.email } : {}),
    ...stamps(ctx),
  })
  auditSeat(batch, ctx, s, {
    action: 'session.status',
    entityId: s.id,
    summary: STATUS_VERB[status] ? `Marked ${s.studentName} ${STATUS_VERB[status]}` : `Changed ${s.studentName}’s status`,
    changes: [{ field: 'status', label: 'Status', from: SESSION_STATUS_LABELS[s.status], to: SESSION_STATUS_LABELS[status] }],
  })
  await batch.commit()
}

/** Changes a seat's label ("MU for 11/2", "Practice", …). */
export async function setSeatLabel(ctx: ScheduleCtx, s: WithId<Session>, label: string) {
  const next = label.trim()
  if (next === (s.note ?? '').trim()) return
  const batch = writeBatch(db)
  batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), { note: next, ...stamps(ctx) })
  auditSeat(batch, ctx, s, { action: 'session.note', entityId: s.id, summary: `Changed ${s.studentName}’s label`, changes: [{ field: 'note', label: 'Label', from: s.note || null, to: next || null }] })
  await batch.commit()
}

/** Moves a student to another class: they take its time (the whole class) and go after its students. */
export async function moveSeat(ctx: ScheduleCtx, s: WithId<Session>, to: WithId<AcademyClass>, order: number) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), { classId: to.id, ...timeFields(to.dateKey, to.startMin, to.endMin, ctx.timezone), visualOrder: order, ...stamps(ctx) })
  const changes: AuditChange[] = []
  if (to.dateKey !== s.dateKey) changes.push({ field: 'date', label: 'Date', from: formatDateKey(s.dateKey, 'weekdayMedium'), to: formatDateKey(to.dateKey, 'weekdayMedium') })
  if (to.startMin !== s.startMin || to.endMin !== s.endMin) changes.push({ field: 'time', label: 'Time', from: formatTimeRange(s.startMin, s.endMin), to: formatTimeRange(to.startMin, to.endMin) })
  auditSeat(batch, ctx, s, { action: 'session.move', entityId: s.id, summary: `Moved ${s.studentName} to ${classContext(to)}`, changes })
  await batch.commit()
}

/** Takes a student out of a class (to the Trash). */
export async function removeSeat(ctx: ScheduleCtx, s: WithId<Session>) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), { isDeleted: true, deletedAt: serverTimestamp(), deletedBy: ctx.actor.name, ...stamps(ctx) })
  auditSeat(batch, ctx, s, { action: 'session.delete', entityId: s.id, summary: `Took ${s.studentName} out of the class` })
  await batch.commit()
}

// --------------------------------------------------------------- who's in

export interface WhosInRow {
  staffId: string
  staffName: string
  staffRole: StaffRole
  /** Their hours that day; null: not in. */
  ranges: AvailabilityRange[] | null
}

/**
 * Saves who's in on a day: each person's hours (their availability, as the office sets it). Someone switched off is
 * marked not available that day, an answer, so they aren't asked for it again.
 */
export async function saveWhosIn(ctx: ScheduleCtx, dateKey: DateKey, rows: readonly WhosInRow[], before: ReadonlyMap<string, Availability>) {
  const batch = writeBatch(db)
  const lines: string[] = []
  for (const r of rows) {
    const had = before.get(r.staffId)
    const wasIn = had && !had.unavailable && (had.ranges ?? []).length > 0
    if (r.ranges === null && !wasIn) continue
    if (r.ranges && wasIn && describeRanges(had.ranges) === describeRanges(r.ranges)) continue
    const rec = availabilityRecord(r.staffId, { dateKey, ranges: r.ranges ?? [], unavailable: r.ranges === null }, ctx.timezone, 'admin', r.staffName, r.staffRole)
    if (!rec) continue
    batch.set(branchDocRef(ctx.branchId, COL.availability, availabilityDocId(r.staffId, dateKey)), { ...rec, ...stamps(ctx) })
    lines.push(r.ranges ? `${r.staffName} ${describeRanges(r.ranges)}` : `${r.staffName} not in`)
  }
  if (!lines.length) return 0
  addAudit(batch, ctx.branchId, ctx.actor, {
    action: 'availability.whos_in',
    category: 'availability',
    entityType: 'availability',
    entityId: dateKey,
    dateKey,
    summary: `Set who’s in on ${formatDateKey(dateKey, 'weekdayMedium')}: ${lines.join('; ')}`,
  })
  await batch.commit()
  return lines.length
}

// --------------------------------------------------------------- duplicate

/**
 * Copies classes into another week, on the same weekdays: each class with its regular students (make-ups, practice and
 * trials are one-offs and stay behind; someone absent that week comes back), as the paste status. Closed and past days
 * are skipped; when the academy's setting says so, the target days' classes go to the Trash first.
 */
export async function duplicateClasses(
  ctx: ScheduleCtx,
  opts: {
    sources: readonly { c: WithId<AcademyClass>; seats: readonly WithId<Session>[] }[]
    /** The target week's days to fill, with whether each is open. */
    targetDays: readonly { dateKey: DateKey; open: boolean }[]
    existingTarget: readonly { c: WithId<AcademyClass>; seats: readonly WithId<Session>[] }[]
    liveGrade: (studentId: string) => string | undefined
    label: string
  },
): Promise<{ classes: number; students: number }> {
  const today = todayKey(ctx.timezone)
  const days = opts.targetDays.filter((d) => d.open && d.dateKey >= today)
  const plan = opts.sources.flatMap((src) => {
    const day = days.find((d) => weekdayOf(d.dateKey) === weekdayOf(src.c.dateKey))
    return day ? [{ src, dateKey: day.dateKey }] : []
  })
  if (!plan.length) return { classes: 0, students: 0 }
  const clear = ctx.settings.schedule.duplicate.overwriteTargetDays ? opts.existingTarget.filter((t) => days.some((d) => d.dateKey === t.c.dateKey)) : []
  const ops: ((b: WriteBatch) => void)[] = []
  const gone = () => ({ isDeleted: true, deletedAt: serverTimestamp(), deletedBy: ctx.actor.name, ...stamps(ctx) })
  for (const t of clear) {
    ops.push((b) => b.update(branchDocRef(ctx.branchId, COL.classes, t.c.id), gone()))
    for (const s of t.seats) if (!s.isDeleted) ops.push((b) => b.update(branchDocRef(ctx.branchId, COL.sessions, s.id), gone()))
  }
  let students = 0
  for (const { src, dateKey } of plan) {
    const ref = doc(branchCol(ctx.branchId, COL.classes))
    const copy = { ...src.c, id: ref.id, dateKey }
    ops.push((b) => b.set(ref, newClassData(ctx, { dateKey, startMin: src.c.startMin, endMin: src.c.endMin, seats: src.c.seats, note: '' }, 'duplicate_week')))
    const regular = src.seats.filter((s) => !s.isDeleted && seatKind(s.note) === 'regular')
    regular.forEach((s, i) => {
      students++
      const seat = newSeatData(
        ctx,
        copy,
        { student: { id: s.studentId, name: s.studentName, grade: opts.liveGrade(s.studentId) ?? s.studentGrade }, label: s.note ?? '', startMin: s.startMin, endMin: s.endMin, status: ctx.settings.schedule.pasteStatus },
        'duplicate_week',
        i,
      )
      ops.push((b) => b.set(doc(branchCol(ctx.branchId, COL.sessions)), seat))
    })
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db)
    for (const op of ops.slice(i, i + 400)) op(batch)
    if (i === 0) {
      addAudit(batch, ctx.branchId, ctx.actor, {
        action: 'schedule.duplicate_week',
        category: 'schedule',
        entityType: 'class',
        entityId: 'many',
        summary: `Duplicated ${plan.length} classes with ${students} students (${opts.label})${clear.length ? `, replacing ${clear.length}` : ''}`,
      })
    }
    await batch.commit()
  }
  return { classes: plan.length, students }
}

/** Brings a student back from the Trash into their class, when the class is still on and has a seat for them. */
export async function restoreSeat(ctx: ScheduleCtx, s: WithId<Session>, c: WithId<AcademyClass> | null, seats: readonly WithId<Session>[]) {
  if (!c || c.isDeleted) throw new Error('Its class was removed: restore the class instead.')
  const taken = seats.filter((x) => x.id !== s.id && !x.isDeleted && x.status !== 'canceled').length
  if (s.status !== 'canceled' && taken >= c.seats) throw new Error(`The class is full (${c.seats} seats). Free a seat first.`)
  const batch = writeBatch(db)
  batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), { isDeleted: false, deletedAt: null, deletedBy: null, ...stamps(ctx) })
  auditSeat(batch, ctx, s, { action: 'session.restore', entityId: s.id, summary: `Restored ${s.studentName} to the class from Trash` })
  await batch.commit()
}
