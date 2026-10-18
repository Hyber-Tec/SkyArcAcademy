import { effectiveRanges, rangesContain } from '../availability'
import { STUDENT_STATUS_LABELS } from '../people'
import type { DayHours, SessionStatus } from '../settings/defaults'
import { type DateKey, formatMinutes } from '../time'
import type { AvailabilityRange, StaffStatus, StudentStatus } from '../types'
import { fitsCapacity } from './lanes'

/**
 * Why a booked session may not happen as booked. Only sessions still ahead are
 * checked: pending or confirmed, not ended, no submitted log.
 *
 * - `center_closed`: the date is closed (weekly hours or that date's hours).
 * - `outside_hours`: it runs outside that date's opening hours.
 * - `coach_inactive`: the coach is on hold, has left, or their access is paused or removed.
 * - `coach_unavailable`: the coach's availability doesn't cover it (none that day, or only part).
 * - `over_capacity`: the coach has more students at once than the branch allows.
 * - `student_double_booked`: the student has another session at the same time.
 * - `student_inactive`: the student is paused or no longer coming.
 */
export type ConflictKind =
  | 'center_closed'
  | 'outside_hours'
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

/** Every reason this session may not happen as booked (empty: none). Order: most fundamental first. */
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

/** What the coach reads on a session in conflict: it isn't certain, and the admin decides. */
export function coachConflictText(conflicts: readonly Conflict[]): string | null {
  if (conflicts.length === 0) return null
  const kinds = new Set(conflicts.map((c) => c.kind))
  const why = kinds.has('center_closed')
    ? 'The academy is closed that day.'
    : kinds.has('outside_hours')
      ? 'It’s outside the academy’s opening hours.'
      : kinds.has('coach_unavailable')
        ? 'You’re not available at this time.'
        : kinds.has('over_capacity')
          ? 'You have more students at once than allowed.'
          : kinds.has('student_double_booked')
            ? 'The student has another class at this time.'
            : kinds.has('student_inactive')
              ? 'The student isn’t attending right now.'
              : 'Something changed since it was booked.'
  return `${why} Waiting for the admin to move, reassign or cancel it.`
}

/** Short label for a conflict on cards and lists. */
export const CONFLICT_LABELS: Record<ConflictKind, string> = {
  center_closed: 'Academy closed',
  outside_hours: 'Outside hours',
  coach_inactive: 'Coach inactive',
  coach_unavailable: 'Coach unavailable',
  over_capacity: 'Too many students',
  student_double_booked: 'Student double-booked',
  student_inactive: 'Student inactive',
}
