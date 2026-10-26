import { effectiveRanges } from '../availability'
import type { DayHours } from '../settings/defaults'
import { type DateKey, parseDateKey } from '../time'
import type { AcademyClass, Availability, AvailabilityRange, Session } from '../types'

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
type DayRecord = Pick<Availability, 'staffId' | 'dateKey' | 'ranges' | 'unavailable'> & Partial<Pick<Availability, 'staffName' | 'staffRole'>>

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

/**
 * Make-ups still owed: canceled seats (from `since` on) with no make-up booked for them yet, i.e. no later seat of the
 * same student labelled "MU for" the missed date. Oldest first.
 */
export function makeupsOwed<S extends Pick<Session, 'studentId' | 'dateKey' | 'status' | 'note' | 'isDeleted'>>(seats: readonly S[], since: DateKey): S[] {
  const booked = new Set(seats.filter(takesSeat).map((s) => `${s.studentId}|${(s.note ?? '').trim().toLowerCase()}`))
  return seats
    .filter((s) => !s.isDeleted && s.status === 'canceled' && s.dateKey >= since && seatKind(s.note) !== 'trial')
    .filter((s) => !booked.has(`${s.studentId}|${makeupLabel(s.dateKey).toLowerCase()}`))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}
