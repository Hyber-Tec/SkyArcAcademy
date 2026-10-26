import { coachesIn, takesSeat } from '@shared/schedule/classes'
import { type Conflict, type ConflictKind, type ConflictSeat, isAhead, seatConflicts } from '@shared/schedule/conflicts'
import type { DayHours } from '@shared/settings/defaults'
import type { DateKey } from '@shared/time'
import type { AcademyClass, Availability, Session, Student, WithId } from '@shared/types'
import type { ClassView } from './useClassData'

const stamp = (t: unknown) => (t && typeof t === 'object' && 'toMillis' in t ? (t as { toMillis: () => number }).toMillis() : 0)

/**
 * Classes as the schedule reads them, for pages outside it (Home): each class with its students (in the order booked)
 * and the coaches in at its time, by date, earliest first. `isCoach` says who teaches (the manager can be in without
 * teaching). Students from before classes were taught together (no class) are left out, as on the schedule.
 */
export function classViews(
  classes: readonly WithId<AcademyClass>[],
  seats: readonly WithId<Session>[],
  availability: readonly WithId<Availability>[],
  hoursOf: (dateKey: DateKey) => DayHours,
  isCoach: (staffId: string) => boolean,
): Map<DateKey, ClassView[]> {
  const seatsOf = new Map<string, WithId<Session>[]>()
  for (const s of seats) {
    if (s.isDeleted || !s.classId) continue
    const list = seatsOf.get(s.classId)
    if (list) list.push(s)
    else seatsOf.set(s.classId, [s])
  }
  const dayOf = new Map<DateKey, WithId<Availability>[]>()
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

/** A class that may not happen as booked, and why. */
export interface ClassConflict {
  v: ClassView
  /** Every reason once: the class's own first (closed, outside hours, no coach in, too many students), then its students'. */
  conflicts: Conflict[]
  /** Its students in conflict, by session ID. */
  bySeat: Map<string, Conflict[]>
}

const ORDER: readonly ConflictKind[] = ['center_closed', 'outside_hours', 'no_coach', 'over_capacity', 'student_double_booked', 'student_inactive', 'coach_inactive', 'coach_unavailable']

/**
 * The classes still ahead that may not happen as booked (`seatConflicts` on each of their students), soonest first. A
 * class with no students has nothing to check.
 */
export function classConflicts(
  byDate: ReadonlyMap<DateKey, readonly ClassView[]>,
  opts: {
    hoursOf: (dateKey: DateKey) => DayHours
    /** For students marked paused or no longer coming; unknown students are left alone. */
    studentsById?: ReadonlyMap<string, Pick<Student, 'status'>> | null
    today: DateKey
    nowMin: number
  },
): ClassConflict[] {
  const out: ClassConflict[] = []
  for (const dateKey of [...byDate.keys()].sort()) {
    const views = byDate.get(dateKey) ?? []
    const hours = opts.hoursOf(dateKey)
    // Each student's seats that day, for a student in two classes at once.
    const theirs = new Map<string, ConflictSeat[]>()
    for (const v of views) {
      for (const s of v.seats) {
        const list = theirs.get(s.studentId)
        if (list) list.push(s)
        else theirs.set(s.studentId, [s])
      }
    }
    for (const v of views) {
      if (!isAhead(v.c, opts.today, opts.nowMin)) continue
      const bySeat = new Map<string, Conflict[]>()
      for (const s of v.seats) {
        if (!isAhead(s, opts.today, opts.nowMin)) continue
        const list = seatConflicts(s, {
          hours,
          class: v.c,
          coaches: v.coaches,
          classSeats: v.seats,
          studentStatus: opts.studentsById?.get(s.studentId)?.status ?? null,
          studentSeats: theirs.get(s.studentId) ?? [],
        })
        if (list.length) bySeat.set(s.id, list)
      }
      if (!bySeat.size) continue
      const seen = new Set<string>()
      const conflicts: Conflict[] = []
      for (const list of bySeat.values()) {
        for (const k of list) {
          if (seen.has(k.message)) continue
          seen.add(k.message)
          conflicts.push(k)
        }
      }
      conflicts.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
      out.push({ v, conflicts, bySeat })
    }
  }
  return out
}
