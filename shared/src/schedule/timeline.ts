import type { DateKey } from '../time'
import type { ClockShift } from '../types'

/**
 * The schedule's timeline (V2, the owner's pick of the second round of designs, 2026-10-28): a row per person in that
 * day, with their hours and their clock-in behind it, and each class as one block across the rows of everyone in at its
 * time, whether they teach it or not (the owner, 2026-10-29). These are its sums, kept pure: the order of the rows, the
 * pieces a class breaks into, the rows' heights, a block's slots, the time range and the clocked-in stretches.
 */

/** Someone in that day, as a row. */
export interface TimelinePerson {
  id: string
  /** Teaches (a coach). Owners and admins can be in without teaching: their rows go under the coaches' where they can. */
  teaches: boolean
  /** When they're first in that day (minutes after midnight), for the natural order. */
  firstMin: number
  name: string
}

/** A class, as the rows see it. */
export interface TimelineClass {
  id: string
  /** Who teaches it (empty: no coach is in, and it shows on the "No coach in" row). */
  coachIds: readonly string[]
  /** Everyone in at its time, teaching or not: its block spans their rows. Its coaches when left out. */
  inIds?: readonly string[]
}

/** The row for the classes nobody is in to teach. */
export const NO_COACH_ROW = '_none'

/** Past this many rows the order is found by moving rows one at a time, not by trying every order. */
const EXHAUSTIVE_MAX = 7

/** Runs of adjacent rows, as [first, last] index pairs, top to bottom. */
export function runsOf(indices: readonly number[]): [number, number][] {
  const runs: [number, number][] = []
  for (const i of [...new Set(indices)].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1]
    if (last && last[1] === i - 1) last[1] = i
    else runs.push([i, i])
  }
  return runs
}

/** The rows a class's block spans: everyone in at its time, and the "No coach in" row when none of them teaches it. */
export function classRows(c: TimelineClass): string[] {
  const ids = [...new Set([...c.coachIds, ...(c.inIds ?? [])])]
  return c.coachIds.length ? ids : [...ids, NO_COACH_ROW]
}

/** The pieces of a class with this row order: the runs of the rows it spans. */
export function classPieces(order: readonly string[], c: TimelineClass): [number, number][] {
  return runsOf(classRows(c).map((id) => order.indexOf(id)).filter((i) => i >= 0))
}

/** How many pieces the classes break into with this order (one per class when every class's rows are adjacent). */
export function piecesCount(order: readonly string[], classes: readonly TimelineClass[]): number {
  return classes.reduce((n, c) => n + classPieces(order, c).length, 0)
}

const naturalOrder = (a: TimelinePerson, b: TimelinePerson) => a.firstMin - b.firstMin || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)

/**
 * The rows, top to bottom. First everyone in at a class's time, and the "No coach in" row when a class has nobody in to
 * teach it, ordered so each class's rows sit next to each other (the fewest pieces); between orders as good, the coaches
 * above the people who don't teach (owners, admins), then the one closest to who's in first, then by name. Then the
 * people in that day at no class's time, coaches first.
 */
export function timelineRows(people: readonly TimelinePerson[], classes: readonly TimelineClass[]): string[] {
  const sorted = [...people].sort(naturalOrder)
  const inClass = new Set(classes.flatMap(classRows))
  const coaches = sorted.filter((p) => p.teaches && inClass.has(p.id)).map((p) => p.id)
  const others = sorted.filter((p) => !p.teaches && inClass.has(p.id)).map((p) => p.id)
  const none = inClass.has(NO_COACH_ROW) ? [NO_COACH_ROW] : []
  const idle = [...sorted.filter((p) => p.teaches && !inClass.has(p.id)), ...sorted.filter((p) => !p.teaches && !inClass.has(p.id))].map((p) => p.id)
  return [...bestOrder([...coaches, ...others, ...none], new Set(coaches), classes), ...idle]
}

type Score = [pieces: number, coachesBelow: number, moved: number]

/**
 * The order with the fewest pieces; between those, the fewest coaches under a row that isn't a coach's (someone who
 * doesn't teach, or "No coach in"); then the least moved from the natural order.
 */
function bestOrder(natural: readonly string[], coaches: ReadonlySet<string>, classes: readonly TimelineClass[]): string[] {
  if (natural.length < 3) return [...natural]
  const home = new Map(natural.map((id, i) => [id, i]))
  // Each class's rows, once: the search below tries thousands of orders.
  const spans = classes.map(classRows).filter((ids) => ids.some((id) => home.has(id)))
  const pieces = (order: readonly string[]) => {
    const at = new Map(order.map((id, i) => [id, i]))
    return spans.reduce((n, ids) => n + runsOf(ids.flatMap((id) => at.get(id) ?? [])).length, 0)
  }
  const moved = (order: readonly string[]) => order.reduce((n, id, i) => n + Math.abs(i - (home.get(id) ?? i)), 0)
  const coachesBelow = (order: readonly string[]) => {
    let n = 0
    let others = 0
    for (const id of order) {
      if (coaches.has(id)) n += others
      else others++
    }
    return n
  }
  const score = (order: readonly string[]): Score => [pieces(order), coachesBelow(order), moved(order)]
  const better = (a: Score, b: Score) => (a[0] !== b[0] ? a[0] < b[0] : a[1] !== b[1] ? a[1] < b[1] : a[2] < b[2])
  let best = [...natural]
  let bestScore = score(best)
  // The natural order (coaches on top) with one piece per class: nothing does better.
  if (bestScore[0] === spans.length) return best
  if (natural.length <= EXHAUSTIVE_MAX) {
    for (const order of permutations(natural)) {
      const s = score(order)
      if (better(s, bestScore)) {
        best = order
        bestScore = s
      }
    }
    return best
  }
  // Many rows: move one at a time while that helps.
  for (let improved = true; improved; ) {
    improved = false
    for (let from = 0; from < best.length; from++) {
      for (let to = 0; to < best.length; to++) {
        if (from === to) continue
        const next = [...best]
        const [id] = next.splice(from, 1)
        next.splice(to, 0, id)
        const s = score(next)
        if (better(s, bestScore)) {
          best = next
          bestScore = s
          improved = true
        }
      }
    }
  }
  return best
}

function* permutations(items: readonly string[]): Generator<string[]> {
  if (items.length <= 1) {
    yield [...items]
    return
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)]
    for (const p of permutations(rest)) yield [items[i], ...p]
  }
}

/** A block piece and the height its content needs. */
export interface PieceNeed {
  /** The rows it spans, [first, last]. */
  rows: readonly [number, number]
  need: number
}

/**
 * Each row's height: at least its base, and tall enough that every block piece fits across the rows it spans (`inset`:
 * the space a piece leaves above and below itself). A piece short of room grows its rows in equal parts.
 */
export function rowHeights(base: readonly number[], pieces: readonly PieceNeed[], inset: number): number[] {
  const h = [...base]
  for (let pass = 0; pass <= h.length + 1; pass++) {
    let changed = false
    for (const p of pieces) {
      const [a, b] = p.rows
      const have = h.slice(a, b + 1).reduce((n, x) => n + x, 0) - 2 * inset
      if (have >= p.need) continue
      const add = Math.ceil((p.need - have) / (b - a + 1))
      for (let i = a; i <= b; i++) h[i] += add
      changed = true
    }
    if (!changed) break
  }
  return h
}

/** A class block's slots, top to bottom, every one the size of a student's card. */
export interface ClassSlots<S, R> {
  /** Its students (a canceled one too, in its place). */
  cells: S[]
  /** Families' requests for it: those waiting on the office first, then those suggested to a family. */
  requests: R[]
  /** The seats still open once each request has taken one's place. */
  open: number
}

/**
 * A class block's slots, in one column (the owner, 2026-10-29): its students, then families' requests, each in an open
 * seat's place (six seats, four taken, one request: the four, the request, one open seat; more requests than open seats
 * go on under them), then the seats still open.
 */
export function classSlots<S, R extends { status: string }>(cells: readonly S[], open: number, requests: readonly R[]): ClassSlots<S, R> {
  const waiting = [...requests].sort((a, b) => Number(a.status !== 'pending') - Number(b.status !== 'pending'))
  return { cells: [...cells], requests: waiting, open: Math.max(0, open - waiting.length) }
}

/** How tall `n` slots of `size` are, one under the other with `gap` between them. */
export function stackHeight(n: number, size: number, gap: number): number {
  return n > 0 ? n * size + (n - 1) * gap : 0
}

/** A stretch of a day, in minutes after midnight. */
export interface Span {
  startMin: number
  endMin: number
}

/**
 * The time a day's timeline shows: from a little before the first thing that day (someone in, a clock-in, a class) to a
 * little after the last, on the half hour. With nothing that day, its opening hours.
 */
export function timelineRange(spans: readonly Span[], fallback: Span): Span {
  if (!spans.length) return { startMin: fallback.startMin, endMin: Math.max(fallback.endMin, fallback.startMin + 60) }
  const first = Math.min(...spans.map((s) => s.startMin))
  const last = Math.max(...spans.map((s) => s.endMin))
  const startMin = Math.max(0, Math.floor((first - 15) / 30) * 30)
  const endMin = Math.min(24 * 60, Math.ceil((last + 15) / 30) * 30)
  return { startMin, endMin: Math.max(endMin, startMin + 60) }
}

/** A clocked-in stretch on a day's row; `open`: still in (its end is now, today). */
export interface ClockSpan extends Span {
  open: boolean
}

/**
 * Where a shift sits on a day's row: from the clock-in to the clock-out as clocked, or, still in, to now (today) or the
 * end of the day (a shift left open from an earlier day). A shift past midnight ends at midnight on its first day.
 */
export function clockSpan(shift: Pick<ClockShift, 'dateKey' | 'inMin' | 'outMin' | 'outDateKey' | 'status'>, day: DateKey, today: DateKey, nowMin: number): ClockSpan | null {
  if (shift.dateKey !== day) return null
  if (shift.status === 'open' || shift.outMin == null) {
    const end = day === today ? Math.max(shift.inMin + 1, nowMin) : 24 * 60
    return { startMin: shift.inMin, endMin: end, open: true }
  }
  const end = shift.outDateKey && shift.outDateKey > day ? 24 * 60 : shift.outMin
  return { startMin: shift.inMin, endMin: Math.max(shift.inMin + 1, end), open: false }
}
