import type { BranchSettings } from '../settings/defaults'
import { type DateKey, addDays, formatDateKey, formatTimeRange } from '../time'
import type { Session, TimestampLike } from '../types'
import { MAKEUP_LOOKBACK_DAYS, makeupLabel, makeupsOwed, takesSeat } from './classes'

/**
 * Families cancel and ask for classes (the manager's second meeting, docs/DECISIONS.md §23): parents and students cancel
 * a class until it's confirmed (Settings → Schedule, 24 hours before by default), and ask for an open seat (a makeup, a
 * class moved, or an extra class); the office approves or rejects, and can still book anything itself. Families never
 * change the schedule directly: every write goes through the server (functions/src/requests.ts), which checks it with
 * the functions below.
 */

/** A makeup for a missed class, a class moved to another time, or an extra class (the sheets' "Practice"). */
export type ClassRequestKind = 'makeup' | 'reschedule' | 'extra'
export type ClassRequestStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn'

/** `branches/{b}/classRequests/{id}`: a family's request for a seat (written by the server only). */
export interface ClassRequest {
  kind: ClassRequestKind
  studentId: string
  studentName: string
  /** The class asked for, with its time copied for lists. */
  classId: string
  dateKey: DateKey
  startMin: number
  endMin: number
  startAt: TimestampLike
  /** A makeup: the missed seat it makes up. A move: the seat it replaces, canceled when approved. An extra class: null. */
  forSessionId: string | null
  forDateKey: DateKey | null
  /** The family's words, if any. */
  message: string
  status: ClassRequestStatus
  requestedBy: { email: string; name: string; role: 'parent' | 'student' }
  createdAt: TimestampLike | null
  updatedAt: TimestampLike | null
  decidedAt: TimestampLike | null
  decidedBy: { email: string; name: string } | null
  /** The office's words to the family when it says no, if any. */
  decisionNote: string
  /** The seat made when it was approved. */
  sessionId: string | null
}

/**
 * `branches/{b}/classSeats/{classId}`: a class's time and how many of its seats are taken, without names, so families
 * can see where seats are open (they never read the class itself: its note is for the coaches). Written by the server.
 */
export interface ClassSeats {
  dateKey: DateKey
  startMin: number
  endMin: number
  startAt: TimestampLike
  seats: number
  taken: number
  isDeleted: boolean
  updatedAt?: TimestampLike | null
}

export const REQUEST_KIND_LABELS: Record<ClassRequestKind, string> = {
  makeup: 'Makeup',
  reschedule: 'Move a class',
  extra: 'Extra class',
}

/** What families read about their request. */
export const REQUEST_STATUS_LABELS: Record<ClassRequestStatus, string> = {
  pending: 'Waiting for the academy',
  approved: 'Approved',
  rejected: 'Not approved',
  withdrawn: 'Withdrawn',
}

/** The seat's label once approved, in the sheets' words: "MU for 10/13" for a makeup or a move, "Practice" otherwise. */
export function seatLabelFor(kind: ClassRequestKind, forDateKey: DateKey | null): string {
  return kind !== 'extra' && forDateKey ? makeupLabel(forDateKey) : 'Practice'
}

const HOUR = 3_600_000

/** Hours before a class when it's confirmed, and families can no longer cancel it (Settings → Schedule). */
export function cancelHours(settings: Pick<BranchSettings, 'schedule'>): number {
  return settings.schedule.autoConfirm.hoursBefore
}

/** The moment families can no longer cancel a class: when it's confirmed. */
export function cancelDeadlineMs(startMs: number, settings: Pick<BranchSettings, 'schedule'>): number {
  return startMs - cancelHours(settings) * HOUR
}

/** "Classes can be canceled up to 24 hours before they start." */
export function cancelRuleText(settings: Pick<BranchSettings, 'schedule'>): string {
  const h = cancelHours(settings)
  const span = h % 24 === 0 && h >= 48 ? `${h / 24} days` : h === 1 ? '1 hour' : `${h} hours`
  return `Classes can be canceled up to ${span} before they start.`
}

export type FamilyCancel = { ok: true } | { ok: false; reason: 'gone' | 'not_upcoming' | 'too_late'; message: string }

/** Whether a family may cancel a seat now: an upcoming class, still coming, before the deadline. */
export function familyCancelCheck(
  s: Pick<Session, 'status' | 'isDeleted'> & { startMs: number },
  nowMs: number,
  settings: Pick<BranchSettings, 'schedule'>,
): FamilyCancel {
  if (s.isDeleted) return { ok: false, reason: 'gone', message: 'This class is no longer on the schedule.' }
  if (s.startMs <= nowMs || (s.status !== 'pending' && s.status !== 'confirmed')) {
    return { ok: false, reason: 'not_upcoming', message: 'Only upcoming classes can be canceled.' }
  }
  if (nowMs >= cancelDeadlineMs(s.startMs, settings)) return { ok: false, reason: 'too_late', message: cancelRuleText(settings) }
  return { ok: true }
}

/** How far ahead families can ask for a seat (Settings → Schedule). */
export function requestHorizon(today: DateKey, settings: Pick<BranchSettings, 'schedule'>): DateKey {
  return addDays(today, settings.schedule.requests.daysAhead)
}

/** A class with seats left that families can ask for: upcoming, within the horizon, not in the Trash. */
export function isRequestable(c: Pick<ClassSeats, 'dateKey' | 'seats' | 'taken' | 'isDeleted'> & { startMs: number }, nowMs: number, horizon: DateKey): boolean {
  return !c.isDeleted && c.startMs > nowMs && c.dateKey <= horizon && c.taken < c.seats
}

type SeatLite = Pick<Session, 'classId' | 'studentId' | 'dateKey' | 'startMin' | 'endMin' | 'status' | 'note' | 'isDeleted'> & { id: string; startMs: number }
type ClassLite = Pick<ClassSeats, 'dateKey' | 'startMin' | 'endMin' | 'seats' | 'taken' | 'isDeleted'> & { id: string; startMs: number }
type PendingLite = Pick<ClassRequest, 'classId' | 'forSessionId'>

export interface RequestDraft {
  kind: ClassRequestKind
  classId: string
  forSessionId: string | null
}

/**
 * Whether a student may ask for a seat: the class is requestable and has room; the student isn't already in it or in
 * another class at that time; nothing is already asked for the same class or the same missed class; a makeup makes up
 * a class still owed (canceled or missed, in the last six weeks); a move replaces one of the student's upcoming classes.
 * `seats` are the student's own seats around those dates; `pending` their requests still waiting.
 */
export function requestCheck(opts: {
  draft: RequestDraft
  target: ClassLite | null
  seats: readonly SeatLite[]
  pending: readonly PendingLite[]
  nowMs: number
  today: DateKey
  settings: Pick<BranchSettings, 'schedule'>
}): { ok: true; forSession: SeatLite | null } | { ok: false; message: string } {
  const { draft, target, seats, pending, nowMs, today, settings } = opts
  if (!target || !isRequestable(target, nowMs, requestHorizon(today, settings))) {
    return { ok: false, message: target && target.taken >= target.seats && !target.isDeleted ? 'That class is full now. Choose another time.' : 'That class can’t be asked for anymore. Choose another time.' }
  }
  const live = seats.filter(takesSeat)
  if (live.some((s) => s.classId === target.id)) return { ok: false, message: 'Already in that class.' }
  if (live.some((s) => s.dateKey === target.dateKey && s.startMin < target.endMin && s.endMin > target.startMin && s.id !== draft.forSessionId)) {
    return { ok: false, message: 'Already in another class at that time.' }
  }
  if (pending.some((p) => p.classId === target.id)) return { ok: false, message: 'That class is already asked for.' }
  if (draft.kind === 'extra') return draft.forSessionId ? { ok: false, message: 'An extra class doesn’t replace a class.' } : { ok: true, forSession: null }

  const forSession = seats.find((s) => s.id === draft.forSessionId) ?? null
  if (!forSession) return { ok: false, message: 'Choose the class it’s for.' }
  if (pending.some((p) => p.forSessionId === forSession.id)) return { ok: false, message: 'Something is already asked for that class.' }
  if (draft.kind === 'makeup') {
    const owed = makeupsOwed(seats, addDays(today, -MAKEUP_LOOKBACK_DAYS))
    if (!owed.some((s) => s.id === forSession.id)) return { ok: false, message: 'That class has no makeup owed.' }
    return { ok: true, forSession }
  }
  // A move: one of the student's own upcoming classes, still coming, to another class.
  if (forSession.isDeleted || forSession.startMs <= nowMs || (forSession.status !== 'pending' && forSession.status !== 'confirmed')) {
    return { ok: false, message: 'Only an upcoming class can be moved.' }
  }
  if (forSession.classId === target.id) return { ok: false, message: 'Choose another time.' }
  return { ok: true, forSession }
}

/** "Makeup for Oct 13 · Tue, Nov 3, 4:30–6:00 PM", "Extra class · …": a request in one line. */
export function requestLine(r: Pick<ClassRequest, 'kind' | 'dateKey' | 'startMin' | 'endMin' | 'forDateKey'>): string {
  const when = `${formatDateKey(r.dateKey, 'weekdayMedium')}, ${formatTimeRange(r.startMin, r.endMin)}`
  const what =
    r.kind === 'makeup' && r.forDateKey
      ? `Makeup for ${formatDateKey(r.forDateKey, 'monthDay')}`
      : r.kind === 'reschedule' && r.forDateKey
        ? `Moved from ${formatDateKey(r.forDateKey, 'monthDay')}`
        : REQUEST_KIND_LABELS[r.kind]
  return `${what} · ${when}`
}
