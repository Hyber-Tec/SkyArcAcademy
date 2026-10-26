import { dayStartInstant, effectiveRanges, normalizeRanges, rangesContain } from './availability'
import { type ClassCoach, type DayRecord, coachesIn, takesSeat, uncovered } from './schedule/classes'
import { isAhead } from './schedule/conflicts'
import type { DayHours } from './settings/defaults'
import { type DateKey, formatDateKey, formatTimeRange, weekdayOf } from './time'
import type { AcademyClass, Availability, AvailabilityRange, Session, StaffRole, WithId } from './types'

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
 * The days of a change that lose time, so only their classes can be left with no coach in: `currentRanges` is what
 * counts today on a date (its saved times inside its hours; none when it's marked not available).
 */
export function shrinkingDays(days: readonly DayWrite[], currentRanges: (dateKey: DateKey) => readonly AvailabilityRange[], hoursOf: (dateKey: DateKey) => DayHours): DateKey[] {
  return days
    .filter((d) => {
      const after = d.unavailable ? [] : effectiveRanges(normalizeRanges(d.ranges), hoursOf(d.dateKey))
      return currentRanges(d.dateKey).some((r) => !rangesContain(after, r.startMin, r.endMin))
    })
    .map((d) => d.dateKey)
}

/** A class that a change to someone's hours would leave without a coach in, for all or part of it. */
export interface UncoveredClass {
  dateKey: DateKey
  startMin: number
  endMin: number
  /** Students in it (canceled ones left out). */
  students: number
}

/** Minutes of a class nobody covers. */
const gapMinutes = (c: Pick<AcademyClass, 'startMin' | 'endMin'>, coaches: readonly ClassCoach[]) =>
  uncovered(c, coaches.flatMap((k) => k.ranges)).reduce((m, g) => m + g.endMin - g.startMin, 0)

/**
 * Classes still ahead, with students, that a change to someone's hours would leave with no coach in for all or part of
 * them, though they were covered before: classes are taught by every coach in, so only the other coaches' hours that
 * day count, and someone who doesn't teach (the manager) changes nothing. Each platform reads the classes, their
 * students and everyone's records on the change's shrinking days (`shrinkingDays`) and passes them here.
 */
export function classesLeftUncovered(opts: {
  staffId: string
  staffRole?: StaffRole
  days: readonly DayWrite[]
  classes: readonly WithId<AcademyClass>[]
  seats: readonly Pick<Session, 'classId' | 'status' | 'isDeleted'>[]
  /** Everyone's availability on those days. */
  records: readonly DayRecord[]
  hoursOf: (dateKey: DateKey) => DayHours
  /** Who teaches, when the caller knows it (admins); otherwise each day's records say. */
  isCoach?: (staffId: string) => boolean
  today: DateKey
  nowMin: number
}): UncoveredClass[] {
  const { staffId, hoursOf, isCoach } = opts
  if (opts.staffRole && opts.staffRole !== 'coach') return []
  const change = new Map(opts.days.map((d) => [d.dateKey, d]))
  const students = new Map<string, number>()
  for (const s of opts.seats) if (s.classId && takesSeat(s)) students.set(s.classId, (students.get(s.classId) ?? 0) + 1)
  const out: UncoveredClass[] = []
  for (const c of opts.classes) {
    const n = students.get(c.id) ?? 0
    const day = change.get(c.dateKey)
    if (c.isDeleted || !n || !day || !isAhead(c, opts.today, opts.nowMin)) continue
    const others = opts.records.filter((a) => a.dateKey === c.dateKey && a.staffId !== staffId)
    const mine = opts.records.filter((a) => a.dateKey === c.dateKey && a.staffId === staffId)
    const after = { staffId, dateKey: c.dateKey, ranges: day.unavailable ? [] : normalizeRanges(day.ranges), unavailable: !!day.unavailable }
    const hours = hoursOf(c.dateKey)
    if (gapMinutes(c, coachesIn(c, [...others, after], hours, isCoach)) > gapMinutes(c, coachesIn(c, [...others, ...mine], hours, isCoach))) {
      out.push({ dateKey: c.dateKey, startMin: c.startMin, endMin: c.endMin, students: n })
    }
  }
  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)
}

/** "Tue, Oct 27, 4:30 PM – 6:00 PM (5 students), … and 2 more" */
function describeClasses(list: readonly UncoveredClass[], max = 3): string {
  const shown = list.slice(0, max).map((c) => `${formatDateKey(c.dateKey, 'weekdayMedium')}, ${formatTimeRange(c.startMin, c.endMin)} (${c.students} student${c.students === 1 ? '' : 's'})`)
  const more = list.length - shown.length
  return more > 0 ? `${shown.join('; ')} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join('; ')} and ${shown.at(-1)}` : (shown[0] ?? '')
}

/** What someone is told before saving a change that leaves classes with no coach in. */
export function noCoachWarning(list: readonly UncoveredClass[], mode: 'coach' | 'admin'): { title: string; description: string } {
  const n = list.length
  const many = n > 1
  return {
    title: `${n} class${many ? 'es' : ''} would have no coach in`,
    description:
      mode === 'coach'
        ? `No other coach is in for all or part of ${describeClasses(list)}. If you save, ${many ? 'they stay' : 'it stays'} on the schedule without a coach until another coach is in. If it’s urgent, tell the admin too.`
        : `No other coach is in for all or part of ${describeClasses(list)}. If you save, ${many ? 'they show' : 'it shows'} on Home without a coach until another coach is in.`,
  }
}
