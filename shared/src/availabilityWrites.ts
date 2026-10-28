import { type SavedDay, dayStartInstant, effectiveRanges, normalizeRanges, rangesContain } from './availability'
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

// ------------------------------------------------------------ adding time inside the lock

/**
 * How long the Undo of a coach's add inside the lock is offered. The rules allow it for 15 seconds after the add was
 * saved, so a slow network still makes it.
 */
export const UNDO_SECONDS = 10

/**
 * Inside the lock a coach may add time but not remove it (docs/DECISIONS.md §23, C2; the security rules check the same):
 * the day ends with times, and every time it had is still inside one of them. A new range, a wider one, or times on a
 * day that had none or was marked not available are adds; removing or shortening time, or marking a day with times not
 * available, isn't.
 */
export function onlyAddsTime(before: SavedDay | null | undefined, after: Pick<DayWrite, 'ranges' | 'unavailable'>): boolean {
  if (after.unavailable) return false
  const next = normalizeRanges(after.ranges)
  if (!next.length) return false
  return (before?.unavailable ? [] : (before?.ranges ?? [])).every((r) => rangesContain(next, r.startMin, r.endMin))
}

/** A day's times after adding some inside the lock: the ones it had, as saved, and the new ones, merged. */
export function withAddedTime(saved: SavedDay | null | undefined, added: readonly AvailabilityRange[]): AvailabilityRange[] {
  return normalizeRanges([...(saved?.unavailable ? [] : (saved?.ranges ?? [])), ...added])
}

/** What an add inside the lock keeps of the day before it, exactly as saved, so its Undo puts back just that. */
export function undoOf(saved: SavedDay | null | undefined): { ranges: AvailabilityRange[]; unavailable: boolean } {
  return { ranges: (saved?.ranges ?? []).map((r) => ({ ...r })), unavailable: !!saved?.unavailable }
}

/** Whether undoing puts the day back with times or a mark (else its record is removed: it had none). */
export function undoKeepsRecord(undo: { ranges: readonly AvailabilityRange[]; unavailable: boolean }): boolean {
  return undo.unavailable || undo.ranges.length > 0
}

/** The audit log's line for an add inside the lock ("Added 6:00 PM – 8:00 PM to Hannah Moreno’s availability on Tue, Oct 20"). */
export function addedTimeSummary(staffName: string, dateKey: DateKey, added: readonly AvailabilityRange[]): string {
  return `Added ${describeRanges(normalizeRanges(added))} to ${staffName}’s availability on ${formatDateKey(dateKey, 'weekdayMedium')} (inside the lock)`
}

/** The audit log's line for the Undo of an add. */
export function undoneSummary(staffName: string, dateKey: DateKey): string {
  return `Undid the time added to ${staffName}’s availability on ${formatDateKey(dateKey, 'weekdayMedium')}`
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
