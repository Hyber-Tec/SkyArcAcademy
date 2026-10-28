import type { DateKey } from '../time'
import type { ClockShift } from '../types'

/**
 * The schedule's timeline (V2, the owner's pick of the second round of designs, 2026-10-28): a row per person in that
 * day, with their hours and their clock-in behind it, and each class as one block across the rows of the coaches who
 * teach it. These are its sums, kept pure: the order of the rows, the pieces a class breaks into, the rows' heights,
 * the time range and the clocked-in stretches.
 */

/** Someone in that day, as a row. */
export interface TimelinePerson {
  id: string
  /** Teaches (a coach). Owners and admins can be in without teaching: their rows go at the bottom. */
  teaches: boolean
  /** When they're first in that day (minutes after midnight), for the natural order. */
  firstMin: number
  name: string
}

/** A class, as the rows see it: who teaches it (empty: nobody is in). */
export interface TimelineClass {
  id: string
  coachIds: readonly string[]
}

/** The row for the classes nobody is in for. */
export const NO_COACH_ROW = '_none'

/** Past this many coaches the order is found by moving rows one at a time, not by trying every order. */
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

/** The pieces of a class with this row order: the runs of its coaches' rows (the no-coach row for a class nobody's in for). */
export function classPieces(order: readonly string[], coachIds: readonly string[]): [number, number][] {
  const ids = coachIds.length ? coachIds : [NO_COACH_ROW]
  return runsOf(ids.map((id) => order.indexOf(id)).filter((i) => i >= 0))
}

/** How many pieces the classes break into with this order (one per class when every class's coaches are adjacent). */
export function piecesCount(order: readonly string[], classes: readonly TimelineClass[]): number {
  return classes.reduce((n, c) => n + classPieces(order, c.coachIds).length, 0)
}

const naturalOrder = (a: TimelinePerson, b: TimelinePerson) => a.firstMin - b.firstMin || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)

/**
 * The rows, top to bottom: the coaches who teach that day, ordered so each class's coaches sit next to each other (the
 * fewest pieces; between orders as good, the one closest to who's in first, then by name); then coaches in without a
 * class; then the "No coach in" row when a class has nobody; then the people who don't teach (owners, admins).
 */
export function timelineRows(people: readonly TimelinePerson[], classes: readonly TimelineClass[]): string[] {
  const teaching = new Set(classes.flatMap((c) => c.coachIds))
  const sorted = [...people].sort(naturalOrder)
  const coaches = sorted.filter((p) => p.teaches && teaching.has(p.id)).map((p) => p.id)
  const idle = sorted.filter((p) => p.teaches && !teaching.has(p.id)).map((p) => p.id)
  const others = sorted.filter((p) => !p.teaches).map((p) => p.id)
  const none = classes.some((c) => !c.coachIds.length) ? [NO_COACH_ROW] : []
  return [...bestOrder(coaches, classes), ...idle, ...none, ...others]
}

/** The coaches' order with the fewest pieces, then the least moved from their natural order. */
function bestOrder(natural: readonly string[], classes: readonly TimelineClass[]): string[] {
  if (natural.length < 3) return [...natural]
  const home = new Map(natural.map((id, i) => [id, i]))
  const moved = (order: readonly string[]) => order.reduce((n, id, i) => n + Math.abs(i - (home.get(id) ?? i)), 0)
  const score = (order: readonly string[]): [number, number] => [piecesCount(order, classes), moved(order)]
  const better = (a: [number, number], b: [number, number]) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
  let best = [...natural]
  let bestScore = score(best)
  if (bestScore[0] === classes.filter((c) => c.coachIds.length).length) return best
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
  // Many coaches: move one row at a time while that helps.
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

/** How many items fit across a width (at least one). */
export function gridColumns(width: number, minItem: number, gap: number): number {
  return Math.max(1, Math.floor((width + gap) / (minItem + gap)))
}

/** The height of a grid of items `cols` across: each row as tall as its tallest item, `gap` between rows. */
export function gridHeight(heights: readonly number[], cols: number, gap: number): number {
  let total = 0
  for (let i = 0; i < heights.length; i += cols) total += Math.max(...heights.slice(i, i + cols))
  const rows = Math.ceil(heights.length / cols)
  return total + Math.max(0, rows - 1) * gap
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
