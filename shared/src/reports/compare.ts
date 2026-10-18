import { type Evaluation, POSITIONS, type Position, inOrder } from '../shooting/evaluation'
import { toPoint } from './facts'
import type { EvaluationPoint } from './types'

/**
 * Two results of one position side by side, as families ask ("how far has she come?"), the same on the website and in
 * the phone app: the latest (or the result a screen is about, its anchor) against the lowest one before it, the one
 * just before it or the position's first, or any two picked. Scores are per 10 shots in whole numbers (every source's
 * scale), then a SIUS result's decimals, as the charts and the reports count them.
 */

export type CompareMode = 'lowest' | 'previous' | 'first' | 'choose'

/** The modes, in the order they're offered. */
export const COMPARE_MODES: readonly CompareMode[] = ['lowest', 'previous', 'first', 'choose']

type Scored = Evaluation & { id: string }

const scored = (evaluations: readonly Scored[], position: Position) => evaluations.filter((e) => e.position === position && e.shots > 0)

/** A position's scored results (those with shots), as points in the order they were shot. */
export function positionPoints(evaluations: readonly Scored[], position: Position): EvaluationPoint[] {
  return inOrder(scored(evaluations, position)).map(toPoint)
}

/** The positions with two scored results or more (what a comparison needs), in the usual order. */
export function comparablePositions(evaluations: readonly Scored[]): Position[] {
  return POSITIONS.filter((p) => scored(evaluations, p).length >= 2)
}

/** The position a comparison opens on: the latest result's, among the positions that can be compared. */
export function latestComparablePosition(evaluations: readonly Scored[]): Position | null {
  const positions = comparablePositions(evaluations)
  return inOrder(evaluations.filter((e) => e.shots > 0 && positions.includes(e.position))).pop()?.position ?? null
}

type Comparable = { id: string; wholePer10: number; per10: number }

/** The anchor's place in a position's list: the result given (when it's there), otherwise the latest. */
function anchorOf(list: readonly { id: string }[], anchorId: string | null | undefined): { index: number; given: boolean } {
  const at = anchorId ? list.findIndex((p) => p.id === anchorId) : -1
  return at >= 0 ? { index: at, given: true } : { index: list.length - 1, given: false }
}

/**
 * The modes a position's results (in order) can be compared in, for the anchor (the latest unless one is given): all of
 * them once a result comes before it, only "choose" for a position's first result, none with fewer than two results.
 */
export function compareModes(list: readonly { id: string }[], anchorId?: string | null): CompareMode[] {
  if (list.length < 2) return []
  return anchorOf(list, anchorId).index > 0 ? [...COMPARE_MODES] : ['choose']
}

export interface ComparePair<P> {
  /** The earlier result, on the left. */
  a: P
  /** The later one (the anchor, unless two were picked). */
  b: P
  /** What each side is: "First" and "Latest", "Previous" and "This result", "Earlier" and "Later". */
  labels: [string, string]
}

/**
 * The two results a mode compares, from a position's results in the order they were shot (`positionPoints`):
 * - `previous`: the one just before the anchor; `first`: the position's first; `lowest`: the lowest before the anchor
 *   (whole per 10 shots, then the decimal; the earliest of equal ones). Each against the anchor.
 * - `choose`: the two `picks` (in any order; by default the position's first and the anchor, or the latest when the
 *   anchor is the first), the earlier on the left.
 * The anchor is the result given by `anchorId` (a score's own screen, named `anchorLabel`, "This result" by default),
 * or else the latest ("Latest"). Null when there is nothing to compare: fewer than two results, no result before the
 * anchor, or the same result picked twice.
 */
export function comparePair<P extends Comparable>(
  list: readonly P[],
  mode: CompareMode,
  opts: { anchorId?: string | null; anchorLabel?: string; picks?: readonly (string | null | undefined)[] } = {},
): ComparePair<P> | null {
  if (list.length < 2) return null
  const { index, given } = anchorOf(list, opts.anchorId)
  const anchor = list[index]
  const name = given ? (opts.anchorLabel ?? 'This result') : 'Latest'
  if (mode === 'choose') {
    const pick = (id: string | null | undefined) => (id ? (list.find((p) => p.id === id) ?? null) : null)
    const one = pick(opts.picks?.[0]) ?? list[0]
    const two = pick(opts.picks?.[1]) ?? (index > 0 ? anchor : list[list.length - 1])
    if (one.id === two.id) return null
    const [a, b] = list.indexOf(one) < list.indexOf(two) ? [one, two] : [two, one]
    // The anchor keeps its name when it's one of the two picked.
    const label = (p: P, plain: string) => (given && p.id === anchor.id ? name : plain)
    return { a, b, labels: [label(a, 'Earlier'), label(b, 'Later')] }
  }
  if (index === 0) return null
  if (mode === 'previous') return { a: list[index - 1], b: anchor, labels: ['Previous', name] }
  if (mode === 'first') return { a: list[0], b: anchor, labels: ['First', name] }
  const lowest = list.slice(0, index).reduce((lo, p) => (p.wholePer10 < lo.wholePer10 || (p.wholePer10 === lo.wholePer10 && p.per10 < lo.per10) ? p : lo))
  return { a: lowest, b: anchor, labels: ['Lowest', name] }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** A result's share of inner tens (%): SIUS results only. */
export function innerTensPct(p: Pick<EvaluationPoint, 'innerTens' | 'shots'>): number | null {
  return p.innerTens !== null && p.shots ? Math.round((p.innerTens / p.shots) * 100) : null
}

export interface CompareFacts {
  /** The later result's score per 10 shots less the earlier one's, in whole numbers. */
  change: number
  /** Both SIUS results: each one's share of inner tens (%) and the change, in points. */
  innerTens: { a: number; b: number; change: number } | null
  /** Both groups measured: each one's size (mm) and the change (smaller is tighter). */
  group: { a: number; b: number; change: number } | null
}

/** What changed from one result to the other: the score per 10 shots, the share of inner tens and the group size. */
export function compareFacts(a: EvaluationPoint, b: EvaluationPoint): CompareFacts {
  const tensA = innerTensPct(a)
  const tensB = innerTensPct(b)
  return {
    change: round1(b.wholePer10 - a.wholePer10),
    innerTens: tensA !== null && tensB !== null ? { a: tensA, b: tensB, change: tensB - tensA } : null,
    group: a.groupMm !== null && b.groupMm !== null ? { a: a.groupMm, b: b.groupMm, change: round1(b.groupMm - a.groupMm) } : null,
  }
}
