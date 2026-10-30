import { effectiveRanges } from '../availability'
import type { DayHours } from '../settings/defaults'
import { type DateKey, parseDateKey } from '../time'
import type { AcademyClass, Availability, AvailabilityRange, Session, WithId } from '../types'

/**
 * Classes taught together (docs/DECISIONS.md §21): a class is one time on one day with its seats, every coach in at that
 * time teaches it, and each student in it is a session, a seat, whose note is its label in the sheets' own words.
 */

/** What a seat's label makes it: "MU for 10/13" a make-up, "Practice", "Trial 1", "Evaluation"; anything else regular. */
export type SeatKind = 'regular' | 'makeup' | 'practice' | 'trial' | 'evaluation'

export function seatKind(note: string | null | undefined): SeatKind {
  const n = (note ?? '').trim()
  if (/^(mu|make-?up)\b/i.test(n)) return 'makeup'
  if (/^practice\b/i.test(n)) return 'practice'
  if (/^trial\b/i.test(n)) return 'trial'
  if (/^eval(uation)?\b/i.test(n)) return 'evaluation'
  return 'regular'
}

/** "MU for 11/2": the label of a make-up for the class missed on that date, as the sheets write it. */
export function makeupLabel(missed: DateKey): string {
  const { month, day } = parseDateKey(missed)
  return `MU for ${month}/${day}`
}

/** A seat in use: not deleted, not canceled (a canceled student frees their seat). */
export function takesSeat(s: Pick<Session, 'status' | 'isDeleted'>): boolean {
  return !s.isDeleted && s.status !== 'canceled'
}

/** Seats still free in a class (never below zero). */
export function openSeats(c: Pick<AcademyClass, 'seats'>, seats: readonly Pick<Session, 'status' | 'isDeleted'>[]): number {
  return Math.max(0, c.seats - seats.filter(takesSeat).length)
}

type ClassTime = Pick<AcademyClass, 'dateKey' | 'startMin' | 'endMin'>
/** Someone's hours on a day (their availability record), as who's in reads it. */
export type DayRecord = Pick<Availability, 'staffId' | 'dateKey' | 'ranges' | 'unavailable'> & Partial<Pick<Availability, 'staffName' | 'staffRole'>>

/** A coach teaching a class: their hours that day that overlap it. */
export interface ClassCoach {
  staffId: string
  /** From their availability record; empty on records saved before it kept the name. */
  name: string
  /** Their hours that day (inside opening hours) that overlap the class. */
  ranges: AvailabilityRange[]
  /** In for only part of the class ("until 6", "from 5"). */
  partial: boolean
}

/**
 * Who teaches a class: everyone whose hours that day overlap it, except people who are in but don't teach (the manager,
 * the owner): their record says so, or `isCoach` does. Sorted by when they're in, then by name.
 */
export function coachesIn(c: ClassTime, day: readonly DayRecord[], hours: DayHours, isCoach: (staffId: string) => boolean = () => true): ClassCoach[] {
  const out: ClassCoach[] = []
  for (const a of day) {
    if (a.dateKey !== c.dateKey || a.unavailable || (a.staffRole && a.staffRole !== 'coach') || !isCoach(a.staffId)) continue
    const ranges = effectiveRanges(a.ranges ?? [], hours).filter((r) => r.startMin < c.endMin && r.endMin > c.startMin)
    if (!ranges.length) continue
    out.push({ staffId: a.staffId, name: a.staffName ?? '', ranges, partial: uncovered(c, ranges).length > 0 })
  }
  return out.sort((a, b) => a.ranges[0].startMin - b.ranges[0].startMin || a.name.localeCompare(b.name))
}

/**
 * Everyone in at a class's time, whether they teach it or not (the manager and the owner too): whose hours that day
 * overlap it, read as `coachesIn` reads them. The website's timeline draws the class across their rows.
 */
export function peopleIn(c: ClassTime, day: readonly DayRecord[], hours: DayHours): string[] {
  const ids = new Set<string>()
  for (const a of day) {
    if (a.dateKey !== c.dateKey || a.unavailable) continue
    if (effectiveRanges(a.ranges ?? [], hours).some((r) => r.startMin < c.endMin && r.endMin > c.startMin)) ids.add(a.staffId)
  }
  return [...ids]
}

/** A class as the schedule shows it: its seats (canceled ones too, in the order booked), and who teaches it. */
export interface ClassView {
  c: WithId<AcademyClass>
  seats: WithId<Session>[]
  /** Seats in use (a canceled student frees theirs). */
  taken: number
  coaches: ClassCoach[]
}

const stamp = (t: unknown) => (t && typeof t === 'object' && 'toMillis' in t ? (t as { toMillis: () => number }).toMillis() : 0)

/**
 * Classes as the website's schedule and Home and the phone app read them: each with its students (in the order booked)
 * and the coaches in at its time, by date, earliest first. `isCoach` says who teaches (the manager can be in without
 * teaching). Classes and students in the Trash are left out, and so are students from before classes were taught
 * together (no class).
 */
export function classViews(
  classes: readonly WithId<AcademyClass>[],
  seats: readonly WithId<Session>[],
  availability: readonly DayRecord[],
  hoursOf: (dateKey: DateKey) => DayHours,
  isCoach?: (staffId: string) => boolean,
): Map<DateKey, ClassView[]> {
  const seatsOf = new Map<string, WithId<Session>[]>()
  for (const s of seats) {
    if (s.isDeleted || !s.classId) continue
    const list = seatsOf.get(s.classId)
    if (list) list.push(s)
    else seatsOf.set(s.classId, [s])
  }
  const dayOf = new Map<DateKey, DayRecord[]>()
  for (const a of availability) {
    const list = dayOf.get(a.dateKey)
    if (list) list.push(a)
    else dayOf.set(a.dateKey, [a])
  }
  const out = new Map<DateKey, ClassView[]>()
  for (const c of classes) {
    if (c.isDeleted) continue
    const list = (seatsOf.get(c.id) ?? []).sort((a, b) => (a.visualOrder ?? 0) - (b.visualOrder ?? 0) || stamp(a.createdAt) - stamp(b.createdAt))
    const view: ClassView = { c, seats: list, taken: list.filter(takesSeat).length, coaches: coachesIn(c, dayOf.get(c.dateKey) ?? [], hoursOf(c.dateKey), isCoach) }
    const day = out.get(c.dateKey)
    if (day) day.push(view)
    else out.set(c.dateKey, [view])
  }
  for (const list of out.values()) list.sort((a, b) => a.c.startMin - b.c.startMin || a.c.endMin - b.c.endMin)
  return out
}

/**
 * A class's cells as the sheet keeps them: every seat in its place, a canceled one too (it frees its seat, so it shows
 * faded where the student was), then the open seats. When canceled seats would overflow the class (it's been
 * refilled), the latest ones leave the grid for a line below.
 */
export function cellsOf<S extends Pick<Session, 'status'>>(seats: readonly S[], capacity: number): { cells: S[]; open: number; overflow: S[] } {
  const live = seats.filter((s) => s.status !== 'canceled').length
  const off = seats.filter((s) => s.status === 'canceled')
  const extra = Math.max(0, live + off.length - capacity)
  const overflow = extra ? off.slice(off.length - extra) : []
  const cells = seats.filter((s) => !overflow.includes(s))
  return { cells, open: Math.max(0, capacity - cells.length), overflow }
}

/** The parts of a class nobody covers, given everyone's hours. */
export function uncovered(c: Pick<AcademyClass, 'startMin' | 'endMin'>, ranges: readonly AvailabilityRange[]): AvailabilityRange[] {
  const gaps: AvailabilityRange[] = []
  let at = c.startMin
  for (const r of [...ranges].sort((a, b) => a.startMin - b.startMin)) {
    if (r.endMin <= at) continue
    if (r.startMin >= c.endMin) break
    if (r.startMin > at) gaps.push({ startMin: at, endMin: r.startMin })
    at = Math.max(at, r.endMin)
    if (at >= c.endMin) break
  }
  if (at < c.endMin) gaps.push({ startMin: at, endMin: c.endMin })
  return gaps
}

/** How far back makeups still owed are looked for: six weeks (the office's "Add a student", and families' requests). */
export const MAKEUP_LOOKBACK_DAYS = 42

/**
 * A missed class that earns a makeup: a class canceled or missed (a no-show still gets one, the manager's rule of
 * 2026-10-27). A makeup doesn't earn another: missing it loses the credit. Nor do a trial or extra practice.
 */
export function earnsMakeup(s: Pick<Session, 'status' | 'note' | 'isDeleted'>): boolean {
  if (s.isDeleted || (s.status !== 'canceled' && s.status !== 'no_show')) return false
  const kind = seatKind(s.note)
  return kind !== 'makeup' && kind !== 'trial' && kind !== 'practice'
}

/**
 * Make-ups still owed: missed classes (from `since` on, see `earnsMakeup`) with no make-up booked for them yet, i.e. no
 * seat of the same student labelled "MU for" the missed date that's still on (a make-up marked a no-show counts as
 * used). Oldest first.
 */
export function makeupsOwed<S extends Pick<Session, 'studentId' | 'dateKey' | 'status' | 'note' | 'isDeleted'>>(seats: readonly S[], since: DateKey): S[] {
  const booked = new Set(seats.filter(takesSeat).map((s) => `${s.studentId}|${(s.note ?? '').trim().toLowerCase()}`))
  return seats
    .filter((s) => earnsMakeup(s) && s.dateKey >= since)
    .filter((s) => !booked.has(`${s.studentId}|${makeupLabel(s.dateKey).toLowerCase()}`))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

/** Make-ups missed (from `since` on): a make-up marked a no-show, whose credit is lost. Oldest first. */
export function makeupsLost<S extends Pick<Session, 'dateKey' | 'status' | 'note' | 'isDeleted'>>(seats: readonly S[], since: DateKey): S[] {
  return seats
    .filter((s) => !s.isDeleted && s.status === 'no_show' && seatKind(s.note) === 'makeup' && s.dateKey >= since)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}
