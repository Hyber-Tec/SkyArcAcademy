import { effectiveRanges, rangesContain } from '../availability'
import { STUDENT_STATUS_LABELS } from '../people'
import type { DayHours, SessionStatus } from '../settings/defaults'
import { type DateKey, formatMinutes } from '../time'
import type { AvailabilityRange, StaffStatus, StudentStatus } from '../types'
import { type ClassCoach, uncovered } from './classes'
import { fitsCapacity } from './lanes'

/**
 * Why a booked session may not happen as booked. Only sessions still ahead are
 * checked: pending or confirmed, not ended, no submitted log.
 *
 * - `center_closed`: the date is closed (weekly hours or that date's hours).
 * - `outside_hours`: it runs outside that date's opening hours.
 * - `no_coach`: no coach is in for all or part of its class.
 * - `over_capacity`: its class has more students than seats.
 * - `coach_inactive`, `coach_unavailable`: the one coach a session had before classes were taught together is
 *   inactive, or their availability doesn't cover it (`sessionConflicts`, for sessions that still have one).
 * - `student_double_booked`: the student has another session at the same time.
 * - `student_inactive`: the student is paused or no longer coming.
 */
export type ConflictKind =
  | 'center_closed'
  | 'outside_hours'
  | 'no_coach'
  | 'coach_inactive'
  | 'coach_unavailable'
  | 'over_capacity'
  | 'student_double_booked'
  | 'student_inactive'

export interface Conflict {
  kind: ConflictKind
  /** Plain sentence for admins, e.g. "Priya Raman is only available 2:00 PM to 5:00 PM." */
  message: string
}

export interface ConflictSession {
  id: string
  coachId: string
  coachName: string
  studentId: string
  studentName: string
  dateKey: DateKey
  startMin: number
  endMin: number
  status: SessionStatus
  isDeleted?: boolean | null
}

/** What the coach's records say about them. `removed`: no staff record any more. */
export type CoachState = 'active' | 'on_hold' | 'left' | 'paused' | 'removed'

export interface ConflictContext {
  /** That date's opening hours. */
  hours: DayHours
  /** The coach's saved availability that day; null when nothing is saved. */
  availability: { ranges: readonly AvailabilityRange[]; unavailable: boolean } | null
  coachState: CoachState
  /** The student's status; null when unknown. */
  studentStatus: StudentStatus | null
  /** The coach's live sessions that day (may include this one). */
  coachSessions: readonly ConflictSession[]
  /** The student's live sessions that day (may include this one). */
  studentSessions: readonly ConflictSession[]
  /** Students per coach at once (branch rule). */
  maxPerCoach: number
}

const CHECKED: ReadonlySet<SessionStatus> = new Set<SessionStatus>(['pending', 'confirmed'])
const STUDENT_AWAY: ReadonlySet<StudentStatus> = new Set<StudentStatus>(['paused', 'finished', 'no_answer', 'not_interested'])

/** Pending or confirmed and not deleted: the kind of session that can be in conflict. */
export function isCheckable(s: Pick<ConflictSession, 'status' | 'isDeleted'>): boolean {
  return !s.isDeleted && CHECKED.has(s.status)
}

/** Still ahead: later today or on a later date. */
export function isAhead(s: Pick<ConflictSession, 'dateKey' | 'endMin'>, today: DateKey, nowMin: number): boolean {
  return s.dateKey > today || (s.dateKey === today && s.endMin > nowMin)
}

function rangesText(ranges: readonly AvailabilityRange[]): string {
  const parts = ranges.map((r) => `${formatMinutes(r.startMin)} to ${formatMinutes(r.endMin)}`)
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

export function staffCoachState(staffStatus: StaffStatus | null | undefined, memberActive: boolean | null): CoachState {
  if (staffStatus === undefined || staffStatus === null) return 'removed'
  if (staffStatus === 'finished') return 'left'
  if (staffStatus === 'on_hold') return 'on_hold'
  if (memberActive === false) return 'paused'
  return 'active'
}

/** A seat in a class, as the checks read it. */
export interface ConflictSeat {
  id: string
  studentId: string
  studentName: string
  dateKey: DateKey
  startMin: number
  endMin: number
  status: SessionStatus
  isDeleted?: boolean | null
}

export interface SeatContext {
  /** That date's opening hours. */
  hours: DayHours
  /** The seat's class: its time and seats, the coaches in at its time, and its seats in use (may include this one). */
  class: { startMin: number; endMin: number; seats: number }
  coaches: readonly ClassCoach[]
  classSeats: readonly Pick<ConflictSeat, 'id' | 'status' | 'isDeleted'>[]
  /** The student's status; null when unknown. */
  studentStatus: StudentStatus | null
  /** The student's live seats that day (may include this one). */
  studentSeats: readonly ConflictSeat[]
}

/**
 * Every reason a seat may not happen as booked (empty: none), most fundamental first: the academy closed or the class
 * outside opening hours, no coach in for the class, more students than seats, the student in another class at the
 * same time or not attending.
 */
export function seatConflicts(s: ConflictSeat, ctx: SeatContext): Conflict[] {
  if (!isCheckable(s)) return []
  const out: Conflict[] = []
  const { hours } = ctx
  const c = ctx.class
  if (!hours.isOpen) out.push({ kind: 'center_closed', message: 'The academy is closed that day.' })
  else if (c.startMin < hours.openMin || c.endMin > hours.closeMin) {
    out.push({ kind: 'outside_hours', message: `The class runs outside opening hours (${formatMinutes(hours.openMin)} to ${formatMinutes(hours.closeMin)}).` })
  }
  if (hours.isOpen) {
    const gaps = uncovered(c, ctx.coaches.flatMap((k) => k.ranges))
    if (gaps.length && gaps[0].startMin === c.startMin && gaps[0].endMin === c.endMin) {
      out.push({ kind: 'no_coach', message: 'No coach is in for this class.' })
    } else if (gaps.length) {
      out.push({ kind: 'no_coach', message: `No coach is in ${gaps.map((g) => `${formatMinutes(g.startMin)} to ${formatMinutes(g.endMin)}`).join(' or ')}.` })
    }
  }
  const taken = ctx.classSeats.filter(inSeat).length
  if (taken > c.seats) out.push({ kind: 'over_capacity', message: `The class has ${taken} students for ${c.seats} seats.` })
  const clash = ctx.studentSeats.find(
    (o) => o.id !== s.id && isCheckable(o) && o.studentId === s.studentId && o.dateKey === s.dateKey && o.startMin < s.endMin && s.startMin < o.endMin,
  )
  if (clash) out.push({ kind: 'student_double_booked', message: `${s.studentName || 'The student'} is also in the class at ${formatMinutes(clash.startMin)}.` })
  if (ctx.studentStatus && STUDENT_AWAY.has(ctx.studentStatus)) {
    out.push({ kind: 'student_inactive', message: `${s.studentName || 'The student'} is marked ${STUDENT_STATUS_LABELS[ctx.studentStatus]}.` })
  }
  return out
}

/** A seat that takes its place in the class: any status but canceled (here and no-show still sat in it). */
function inSeat(s: Pick<ConflictSeat, 'status' | 'isDeleted'>): boolean {
  return !s.isDeleted && s.status !== 'canceled'
}

/**
 * Every reason a session with its own coach (from before classes were taught together) may not happen as booked
 * (empty: none). Order: most fundamental first.
 */
export function sessionConflicts(s: ConflictSession, ctx: ConflictContext): Conflict[] {
  if (!isCheckable(s)) return []
  const out: Conflict[] = []
  const { hours } = ctx
  const coach = s.coachName || 'The coach'

  if (!hours.isOpen) out.push({ kind: 'center_closed', message: 'The academy is closed that day.' })
  else if (s.startMin < hours.openMin || s.endMin > hours.closeMin) {
    out.push({ kind: 'outside_hours', message: `It runs outside opening hours (${formatMinutes(hours.openMin)} to ${formatMinutes(hours.closeMin)}).` })
  }

  if (ctx.coachState !== 'active') {
    const why: Record<Exclude<CoachState, 'active'>, string> = {
      on_hold: `${coach} is on hold.`,
      left: `${coach} no longer works here.`,
      paused: `${coach}’s access is paused.`,
      removed: 'The coach was removed.',
    }
    out.push({ kind: 'coach_inactive', message: why[ctx.coachState] })
  } else if (hours.isOpen) {
    const a = ctx.availability
    const ranges = a && !a.unavailable ? effectiveRanges(a.ranges, hours) : []
    // Marked not available (an answer) reads differently from no availability given at all.
    if (a?.unavailable) out.push({ kind: 'coach_unavailable', message: `${coach} is marked not available that day.` })
    else if (ranges.length === 0) out.push({ kind: 'coach_unavailable', message: `${coach} hasn’t given availability that day.` })
    else if (!rangesContain(ranges, s.startMin, s.endMin)) {
      out.push({ kind: 'coach_unavailable', message: `${coach} is only available ${rangesText(ranges)}.` })
    }
  }

  const coachLive = ctx.coachSessions.filter((o) => o.id !== s.id && isCheckable(o) && o.coachId === s.coachId && o.dateKey === s.dateKey)
  if (!fitsCapacity(coachLive, s.startMin, s.endMin, Math.max(1, ctx.maxPerCoach))) {
    const max = Math.max(1, ctx.maxPerCoach)
    out.push({ kind: 'over_capacity', message: `${coach} has more than ${max} student${max === 1 ? '' : 's'} at once.` })
  }

  const clash = ctx.studentSessions.find(
    (o) => o.id !== s.id && isCheckable(o) && o.studentId === s.studentId && o.dateKey === s.dateKey && o.startMin < s.endMin && s.startMin < o.endMin,
  )
  if (clash) {
    out.push({
      kind: 'student_double_booked',
      message: `${s.studentName || 'The student'} also has a class with ${clash.coachName || 'another coach'} at ${formatMinutes(clash.startMin)}.`,
    })
  }

  if (ctx.studentStatus && STUDENT_AWAY.has(ctx.studentStatus)) {
    out.push({ kind: 'student_inactive', message: `${s.studentName || 'The student'} is marked ${STUDENT_STATUS_LABELS[ctx.studentStatus]}.` })
  }
  return out
}

/** Short label for a conflict on cards and lists. */
export const CONFLICT_LABELS: Record<ConflictKind, string> = {
  center_closed: 'Academy closed',
  outside_hours: 'Outside hours',
  no_coach: 'No coach in',
  coach_inactive: 'Coach inactive',
  coach_unavailable: 'Coach unavailable',
  over_capacity: 'Too many students',
  student_double_booked: 'Student double-booked',
  student_inactive: 'Student inactive',
}
