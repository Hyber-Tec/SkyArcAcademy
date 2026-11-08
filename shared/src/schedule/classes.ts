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

type Span = Pick<AcademyClass, 'startMin' | 'endMin'>

/**
 * The time a seat spends outside its class (docs/DECISIONS.md §38): before the class starts (in early) and after it
 * ends (staying late). Empty for a seat inside its class's time, a half-hour trial's too.
 */
export function spillOf(s: Span, c: Span): AvailabilityRange[] {
  const out: AvailabilityRange[] = []
  if (s.startMin < c.startMin) out.push({ startMin: s.startMin, endMin: Math.min(c.startMin, s.endMin) })
  if (s.endMin > c.endMin) out.push({ startMin: Math.max(c.endMin, s.startMin), endMin: s.endMin })
  return out
}

/** A seat whose hours reach past its class: in before it starts, or staying after it ends. */
export const stretched = (s: Span, c: Span) => s.startMin < c.startMin || s.endMin > c.endMin

type DaySeat = Pick<Session, 'classId' | 'dateKey' | 'startMin' | 'endMin' | 'status' | 'isDeleted'>

/**
 * The seats of a day's other classes in during this class's time (docs/DECISIONS.md §38): a student staying on from
 * the class before, or in early for the one after. Each takes one of this class's seats while they're there. Only the
 * time outside their own class counts, so classes that overlap don't count each other's students.
 */
export function guestsOf<S extends DaySeat>(c: { id: string } & Pick<AcademyClass, 'dateKey' | 'startMin' | 'endMin'>, seats: readonly S[], classOf: (id: string) => Span | undefined): S[] {
  return seats.filter((s) => {
    if (!s.classId || s.classId === c.id || s.dateKey !== c.dateKey || !takesSeat(s)) return false
    const home = classOf(s.classId)
    return !!home && spillOf(s, home).some((r) => r.startMin < c.endMin && r.endMin > c.startMin)
  })
}

/**
 * Each live class's seats taken: its students coming, and the students of its day's other classes in during it
 * (`guestsOf`). The server's `classSeats`, which families read to see where seats are open, are counted this way.
 */
export function takenByClass(classes: readonly ({ id: string } & Pick<AcademyClass, 'dateKey' | 'startMin' | 'endMin' | 'isDeleted'>)[], seats: readonly DaySeat[]): Map<string, number> {
  const live = new Map(classes.filter((c) => !c.isDeleted).map((c) => [c.id, c]))
  const byDay = new Map<string, DaySeat[]>()
  const own = new Map<string, number>()
  for (const s of seats) {
    if (!s.classId || !live.has(s.classId)) continue
    const day = byDay.get(s.dateKey)
    if (day) day.push(s)
    else byDay.set(s.dateKey, [s])
    if (takesSeat(s)) own.set(s.classId, (own.get(s.classId) ?? 0) + 1)
  }
  const classOf = (id: string) => live.get(id)
  return new Map([...live.values()].map((c) => [c.id, (own.get(c.id) ?? 0) + guestsOf(c, byDay.get(c.dateKey) ?? [], classOf).length]))
}

/** Why a seat can't have these hours (docs/DECISIONS.md §38); null when it can. */
export type SeatTimeProblem =
  | { kind: 'short' }
  /** Fewer than 15 minutes left in its own class. */
  | { kind: 'class' }
  /** Before the day opens or after it closes. */
  | { kind: 'hours' }
  /** The student has another seat then. */
  | { kind: 'busy'; at: Span }
  /** A class it would reach into has no seat free then. */
  | { kind: 'full'; at: Span }

/** The shortest a seat can be, and the least it keeps of its own class. */
export const MIN_SEAT_MINUTES = 15

/**
 * Checks a seat's new hours (stretched past its class, or shortened inside it) against its day: at least 15 minutes,
 * 15 of them in its own class, inside the opening hours, no other seat of the student's then, and a seat free in every
 * class it reaches into.
 */
export function seatTimeProblem(
  seat: { id: string; studentId: string } & DaySeat,
  next: Span,
  day: { classes: readonly ({ id: string } & Pick<AcademyClass, 'dateKey' | 'startMin' | 'endMin' | 'seats' | 'isDeleted'>)[]; seats: readonly ({ id: string; studentId: string } & DaySeat)[]; openMin: number; closeMin: number },
): SeatTimeProblem | null {
  if (next.endMin - next.startMin < MIN_SEAT_MINUTES) return { kind: 'short' }
  const live = day.classes.filter((c) => !c.isDeleted && c.dateKey === seat.dateKey)
  const home = live.find((c) => c.id === seat.classId)
  if (home && Math.min(next.endMin, home.endMin) - Math.max(next.startMin, home.startMin) < MIN_SEAT_MINUTES) return { kind: 'class' }
  if (next.startMin < Math.min(day.openMin, home?.startMin ?? day.openMin) || next.endMin > Math.max(day.closeMin, home?.endMin ?? day.closeMin)) return { kind: 'hours' }
  const others = day.seats.filter((s) => s.id !== seat.id && s.dateKey === seat.dateKey)
  const busy = others.find((s) => s.studentId === seat.studentId && takesSeat(s) && s.startMin < next.endMin && s.endMin > next.startMin)
  if (busy) return { kind: 'busy', at: busy }
  if (!home) return null
  const classOf = (id: string) => live.find((c) => c.id === id)
  for (const c of live) {
    if (c.id === home.id || !spillOf(next, home).some((r) => r.startMin < c.endMin && r.endMin > c.startMin)) continue
    const taken = others.filter((s) => s.classId === c.id && takesSeat(s)).length + guestsOf(c, others, classOf).length
    if (taken + 1 > c.seats) return { kind: 'full', at: c }
  }
  return null
}

/**
 * A seat's hours once its class's time changes: a seat for the whole class keeps the whole class; one stretched past
 * it keeps coming as early or staying as late around the new time; one for part of it keeps its length inside it.
 */
export function seatTimeFor(s: Span, before: Span, next: Span): Span {
  const whole = { startMin: next.startMin, endMin: next.endMin }
  if (s.startMin === before.startMin && s.endMin === before.endMin) return whole
  if (stretched(s, before)) {
    // As far from the class's start and end as before: "30 minutes after the class" stays 30 minutes after it.
    const startMin = Math.max(0, next.startMin + s.startMin - before.startMin)
    const endMin = Math.min(24 * 60, next.endMin + s.endMin - before.endMin)
    const inClass = Math.min(endMin, next.endMin) - Math.max(startMin, next.startMin)
    return endMin - startMin < MIN_SEAT_MINUTES || inClass < MIN_SEAT_MINUTES ? whole : { startMin, endMin }
  }
  const length = Math.min(s.endMin - s.startMin, next.endMin - next.startMin)
  const startMin = Math.min(Math.max(next.startMin, s.startMin + next.startMin - before.startMin), next.endMin - length)
  return { startMin, endMin: startMin + length }
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
  /**
   * Students of the day's other classes in during this one (staying on from the class before, or in early for the one
   * after: `guestsOf`). Each takes one of its seats while there.
   */
  guests: WithId<Session>[]
  /** Seats in use: its students coming (a canceled student frees theirs) and its guests. */
  taken: number
  coaches: ClassCoach[]
}

const stamp = (t: unknown) => (t && typeof t === 'object' && 'toMillis' in t ? (t as { toMillis: () => number }).toMillis() : 0)

/**
 * Classes as the website's schedule and Home and the phone app read them: each with its students (in the order booked),
 * the students of other classes in during its time, and the coaches in at its time, by date, earliest first. `isCoach`
 * says who teaches (the manager can be in without teaching). Classes and students in the Trash are left out, and so are
 * students from before classes were taught together (no class).
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
  const live = new Map(classes.filter((c) => !c.isDeleted).map((c) => [c.id, c]))
  // Each day's seats in a live class, for the students in during another class's time.
  const seatsOn = new Map<DateKey, WithId<Session>[]>()
  for (const [id, list] of seatsOf) {
    const c = live.get(id)
    if (!c) continue
    const day = seatsOn.get(c.dateKey)
    if (day) day.push(...list)
    else seatsOn.set(c.dateKey, [...list])
  }
  const classOf = (id: string) => live.get(id)
  const out = new Map<DateKey, ClassView[]>()
  for (const c of live.values()) {
    const list = (seatsOf.get(c.id) ?? []).sort((a, b) => (a.visualOrder ?? 0) - (b.visualOrder ?? 0) || stamp(a.createdAt) - stamp(b.createdAt))
    const guests = guestsOf(c, seatsOn.get(c.dateKey) ?? [], classOf).sort((a, b) => a.startMin - b.startMin || a.studentName.localeCompare(b.studentName))
    const view: ClassView = { c, seats: list, guests, taken: list.filter(takesSeat).length + guests.length, coaches: coachesIn(c, dayOf.get(c.dateKey) ?? [], hoursOf(c.dateKey), isCoach) }
    const day = out.get(c.dateKey)
    if (day) day.push(view)
    else out.set(c.dateKey, [view])
  }
  for (const list of out.values()) list.sort((a, b) => a.c.startMin - b.c.startMin || a.c.endMin - b.c.endMin)
  return out
}

/**
 * A class's seats as the schedule draws them (the owner, 2026-11-08, docs/DECISIONS.md §38): the students coming, in
 * their order, then every seat still open; the canceled ones leave the seats for a line under them, so a seat freed by
 * a cancellation shows open. `guests`: students of other classes in during this one, who take seats too.
 */
export function cellsOf<S extends Pick<Session, 'status'>>(seats: readonly S[], capacity: number, guests = 0): { cells: S[]; open: number; canceled: S[] } {
  const cells = seats.filter((s) => s.status !== 'canceled')
  return { cells, open: Math.max(0, capacity - cells.length - guests), canceled: seats.filter((s) => s.status === 'canceled') }
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
