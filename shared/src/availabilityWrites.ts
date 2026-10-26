import { dayStartInstant, effectiveRanges, normalizeRanges, rangesContain } from './availability'
import { isAhead, isCheckable } from './schedule/conflicts'
import type { DayHours } from './settings/defaults'
import { type DateKey, formatDateKey, formatTimeRange, weekdayOf } from './time'
import type { Availability, AvailabilityRange, Session, StaffRole, WithId } from './types'

/**
 * One day of a change to a coach's availability, as the website and the phone app save it: times, "not available",
 * or nothing (the day's record is removed, so it's unset again).
 */
export interface DayWrite {
  dateKey: DateKey
  /** The times; empty with `unavailable` false = nothing set. */
  ranges: AvailabilityRange[]
  /** Marked not available that day (its times are then empty). */
  unavailable?: boolean
}

/** A day's record as a change stores it, before the time stamps (each platform adds its own). */
export type AvailabilityFields = Pick<Availability, 'staffId' | 'staffName' | 'staffRole' | 'dateKey' | 'weekday' | 'ranges' | 'unavailable' | 'hidden' | 'updatedVia'> & {
  dayStartAt: Date
}

/**
 * What a day of a change stores; null when the day's record is removed. `staffName` and `staffRole` let the other coaches
 * see who's in with them, and who teaches.
 */
export function availabilityRecord(
  staffId: string,
  day: DayWrite,
  timeZone: string,
  via: Availability['updatedVia'],
  staffName?: string,
  staffRole?: StaffRole,
): AvailabilityFields | null {
  const ranges = day.unavailable ? [] : normalizeRanges(day.ranges)
  if (!day.unavailable && ranges.length === 0) return null
  return {
    staffId,
    ...(staffName ? { staffName } : {}),
    ...(staffRole ? { staffRole } : {}),
    dateKey: day.dateKey,
    weekday: weekdayOf(day.dateKey),
    ranges,
    unavailable: !!day.unavailable,
    hidden: false,
    dayStartAt: dayStartInstant(day.dateKey, timeZone),
    updatedVia: via,
  }
}

/** "4:00 PM - 9:00 PM, …", or "none". */
export function describeRanges(ranges: readonly AvailabilityRange[]): string {
  return ranges.length ? ranges.map((r) => formatTimeRange(r.startMin, r.endMin)).join(', ') : 'none'
}

/** The audit log's line for a change: one day ("Marked Hannah Moreno not available on Tue, Oct 20"), or a count. */
export function availabilitySummary(staffName: string, days: readonly DayWrite[]): string {
  if (days.length !== 1) return `Updated ${staffName}’s availability on ${days.length} days`
  const d = days[0]
  const on = formatDateKey(d.dateKey, 'weekdayMedium')
  if (d.unavailable) return `Marked ${staffName} not available on ${on}`
  const ranges = normalizeRanges(d.ranges)
  return ranges.length ? `Set ${staffName}’s availability on ${on}: ${describeRanges(ranges)}` : `Cleared ${staffName}’s availability on ${on}`
}

/**
 * The days of a change that lose time, so only their classes can end up outside the coach's availability:
 * `currentRanges` is what counts today on a date (its saved times inside its hours; none when it's marked not available).
 */
export function shrinkingDays(days: readonly DayWrite[], currentRanges: (dateKey: DateKey) => readonly AvailabilityRange[], hoursOf: (dateKey: DateKey) => DayHours): DateKey[] {
  return days
    .filter((d) => {
      const after = d.unavailable ? [] : effectiveRanges(normalizeRanges(d.ranges), hoursOf(d.dateKey))
      return currentRanges(d.dateKey).some((r) => !rangesContain(after, r.startMin, r.endMin))
    })
    .map((d) => d.dateKey)
}

/**
 * Booked classes (pending or confirmed, still ahead) that a change would leave outside the coach's availability,
 * though they were inside it before: the classes of the shrinking days, as each platform reads them.
 */
export function sessionsLeftUncovered(opts: {
  days: readonly DayWrite[]
  currentRanges: (dateKey: DateKey) => readonly AvailabilityRange[]
  hoursOf: (dateKey: DateKey) => DayHours
  sessions: readonly WithId<Session>[]
  today: DateKey
  nowMin: number
}): WithId<Session>[] {
  const after = new Map(opts.days.map((d) => [d.dateKey, d.unavailable ? [] : effectiveRanges(normalizeRanges(d.ranges), opts.hoursOf(d.dateKey))]))
  return opts.sessions
    .filter((s) => {
      if (!after.has(s.dateKey) || !isCheckable(s) || !isAhead(s, opts.today, opts.nowMin)) return false
      return rangesContain(opts.currentRanges(s.dateKey), s.startMin, s.endMin) && !rangesContain(after.get(s.dateKey) ?? [], s.startMin, s.endMin)
    })
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)
}

/** "Ava Patel (Fri, Oct 2, 4:00 PM - 5:30 PM), Theo Roberts (…) and 2 more" */
export function describeSessions(list: readonly Pick<Session, 'studentName' | 'dateKey' | 'startMin' | 'endMin'>[], max = 3): string {
  const shown = list.slice(0, max).map((s) => `${s.studentName} (${formatDateKey(s.dateKey, 'weekdayMedium')}, ${formatTimeRange(s.startMin, s.endMin)})`)
  const more = list.length - shown.length
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}` : (shown[0] ?? '')
}

/** What a coach is told before saving a change that leaves booked classes outside their availability. */
export function uncoveredWarning(uncovered: readonly Pick<Session, 'studentName' | 'dateKey' | 'startMin' | 'endMin'>[], mode: 'coach' | 'admin'): { title: string; description: string } {
  const n = uncovered.length
  const many = n > 1
  return {
    title: `${n} booked class${many ? 'es are' : ' is'} in this time`,
    description:
      mode === 'coach'
        ? `${describeSessions(uncovered)} ${many ? 'are' : 'is'} booked in the time you’re removing. If you save, ${many ? 'they stay' : 'it stays'} booked and ${many ? 'show' : 'shows'} as a conflict until the admin moves, reassigns or cancels ${many ? 'them' : 'it'}. If it’s urgent, tell the admin too.`
        : `${describeSessions(uncovered)} ${many ? 'are' : 'is'} booked in this time. If you save, ${many ? 'they' : 'it'} will show as ${many ? 'conflicts' : 'a conflict'} on the schedule until ${many ? 'they’re' : 'it’s'} moved, reassigned or canceled.`,
  }
}
