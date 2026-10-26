import type { ClassView } from '@shared/schedule/classes'
import { type Conflict, type ConflictKind, type ConflictSeat, isAhead, seatConflicts } from '@shared/schedule/conflicts'
import type { DayHours } from '@shared/settings/defaults'
import type { DateKey } from '@shared/time'
import type { Student } from '@shared/types'

/** Classes as the schedule reads them, for pages outside it (Home): shared with the phone app. */
export { classViews } from '@shared/schedule/classes'

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
