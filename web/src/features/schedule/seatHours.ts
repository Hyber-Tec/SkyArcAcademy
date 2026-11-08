import { effectiveRanges } from '@shared/availability'
import { MIN_SEAT_MINUTES, type SeatTimeProblem, seatTimeProblem, spillOf, uncovered } from '@shared/schedule/classes'
import { formatMinutes } from '@shared/time'
import type { AvailabilityRange, Session, WithId } from '@shared/types'
import type { Board } from './board'
import { classRange } from './seatParts'
import type { ClassView } from './useClassData'

/**
 * A student's own hours in their class (the owner's pick, 2026-11-08, docs/DECISIONS.md §38): drag either edge of their
 * card on the timeline (stretch.tsx), or ⋯ → Change hours. Past the class, they hold a seat in the class next to it
 * until they leave. These are the checks and the words both use.
 */

type Span = { startMin: number; endMin: number }

/** What stops these hours, in the office's words. */
export function problemText(p: SeatTimeProblem): string {
  switch (p.kind) {
    case 'short':
      return `At least ${MIN_SEAT_MINUTES} minutes.`
    case 'class':
      return `Keep at least ${MIN_SEAT_MINUTES} minutes of the class.`
    case 'hours':
      return 'Outside the opening hours.'
    case 'busy':
      return `Already in the ${classRange(p.at.startMin, p.at.endMin)} class then.`
    case 'full':
      return `The ${classRange(p.at.startMin, p.at.endMin)} class has no seat free then.`
  }
}

/** Checks a seat's new hours against its day on the schedule. */
export function hoursProblem(b: Board, seat: WithId<Session>, next: Span): SeatTimeProblem | null {
  const day = b.byDate.get(seat.dateKey) ?? []
  const hours = b.hoursOf(seat.dateKey)
  return seatTimeProblem(seat, next, {
    classes: day.map((v) => v.c),
    seats: day.flatMap((v) => v.seats),
    openMin: hours.isOpen ? hours.openMin : 0,
    closeMin: hours.isOpen ? hours.closeMin : 24 * 60,
  })
}

/** The classes a seat would hold a seat in, past its own: those its time outside its class reaches. */
export function heldIn(b: Board, seat: WithId<Session>, next: Span, home: ClassView): ClassView[] {
  const spill = spillOf(next, home.c)
  return (b.byDate.get(seat.dateKey) ?? []).filter((x) => x.c.id !== home.c.id && spill.some((r) => r.startMin < x.c.endMin && r.endMin > x.c.startMin))
}

/**
 * The parts of these hours outside the class with no coach in (who's in that day): a student staying after the last
 * class, or in before the first, needs someone there.
 */
export function noCoachDuring(b: Board, dateKey: string, next: Span, home: ClassView): AvailabilityRange[] {
  const hours = b.hoursOf(dateKey)
  const coaches = b
    .inOn(dateKey)
    .filter((a) => (a.staffRole ? a.staffRole === 'coach' : true) && b.teaches(a.staffId))
    .flatMap((a) => effectiveRanges(a.ranges ?? [], hours))
  return spillOf(next, home.c).flatMap((r) => uncovered(r, coaches))
}

/** "until 5:30", "from 3:30", or "3:30–5:30": a seat's hours past its class, for its card. */
export function stretchLabel(seat: Span, c: Span): string | null {
  const early = seat.startMin < c.startMin
  const late = seat.endMin > c.endMin
  const short = (m: number) => formatMinutes(m).replace(/:00/, '').replace(/\s?[AP]M$/, '')
  if (early && late) return `${short(seat.startMin)}–${short(seat.endMin)}`
  if (late) return `until ${short(seat.endMin)}`
  if (early) return `from ${short(seat.startMin)}`
  return null
}

/** "5:30", "6": a time on a small card. */
const clock = (m: number) => formatMinutes(m).replace(/:00 /, ' ').replace(/ [AP]M$/, '')

/** A guest's words: "until 5:30" (staying on) or "from 4:30" (in early), and "From the 4–5 PM class". */
export function guestWords(seat: WithId<Session>, v: ClassView, home: ClassView | undefined) {
  const late = home ? home.c.startMin < v.c.startMin : seat.startMin < v.c.startMin
  return {
    late,
    when: late ? `until ${clock(seat.endMin)}` : `from ${clock(seat.startMin)}`,
    what: home ? `${late ? 'From' : 'Early for'} the ${classRange(home.c.startMin, home.c.endMin)} class` : 'From another class',
  }
}
