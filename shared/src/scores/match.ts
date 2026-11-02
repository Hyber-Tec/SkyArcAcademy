import { type EvalSeries, type Evaluation, POSITIONS, type Position, inOrder, per10 } from '../shooting/evaluation'
import { isInnerTen, wholeScore } from '../shooting/target'

/**
 * A competition as its results sheet has it (the owner, 2026-10-29: "in one competition we have six sections; tap one
 * and see its shots and the animation"): the results saved from one sheet (one per position) taken together, each
 * position's shots in series of ten as the sheet prints them ("K1–K10 · 71 - 1"). The phone app and the website show it
 * the same way.
 */

export type MatchResult = Pick<Evaluation, 'source' | 'position' | 'dateKey' | 'total' | 'wholeTotal' | 'innerTens' | 'shots' | 'series' | 'match'> & {
  id: string
  /** Whose: a list of several students' results (the Scores page) keeps each student's sheet apart. */
  studentId?: string
}

/** A 3×20's order on the sheet: kneeling, prone, standing. */
export const MATCH_ORDER: readonly Position[] = ['kneeling', 'prone', 'standing']

/** The sheet's letter for a position's shots ("K1", "P12", "S20"). */
export const POSITION_LETTER: Record<Position, string> = { kneeling: 'K', prone: 'P', standing: 'S' }

/** The results saved from one match's sheet: the same student, the same day, the same match, in the sheet's order. */
export function matchResults<E extends MatchResult>(e: E, all: readonly E[]): E[] {
  const name = e.match?.name ?? ''
  const sameStudent = (x: E) => !e.studentId || !x.studentId || x.studentId === e.studentId
  const same = all.filter((x) => x.source === 'sheet' && x.dateKey === e.dateKey && (x.match?.name ?? '') === name && sameStudent(x))
  const list = same.some((x) => x.id === e.id) ? same : [e, ...same]
  const order = (p: Position) => (MATCH_ORDER.includes(p) ? MATCH_ORDER.indexOf(p) : POSITIONS.indexOf(p))
  return [...list].sort((a, b) => order(a.position) - order(b.position))
}

/** One line of a student's results: a result, or a match's results sheet with all its positions. */
export interface ResultRow<E> {
  /**
   * The result's ID, or for a results sheet its student's match ("sheet:stu1:2026-10-17:Fall Junior 3P"), which stays as
   * its results change.
   */
  key: string
  /** The result, or the sheet's results in the sheet's order. */
  results: E[]
  /** A competition from its results sheet, its positions together. */
  match: boolean
}

/** The key of the row a results sheet's result is in: the student's (when known), the day's and the match's. */
export const matchKey = (e: Pick<MatchResult, 'dateKey' | 'match' | 'studentId'>) => `sheet:${e.studentId ? `${e.studentId}:` : ''}${e.dateKey}:${e.match?.name ?? ''}`

/**
 * A student's results as their list shows them, newest first (by date, then time): each result a row of its own, but a
 * competition's results sheet one row for all its positions, as the sheet has them (`matchResults`). Several students'
 * results (the Scores page) give each student's sheet its own row.
 */
export function resultRows<E extends MatchResult & { timeMin?: number | null }>(evaluations: readonly E[]): ResultRow<E>[] {
  const rows: ResultRow<E>[] = []
  const seen = new Set<string>()
  for (const e of inOrder(evaluations).reverse()) {
    if (e.source !== 'sheet') {
      rows.push({ key: e.id, results: [e], match: false })
      continue
    }
    const key = matchKey(e)
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ key, results: matchResults(e, evaluations), match: true })
  }
  return rows
}

/** A whole-number match ("486 - 15") keeps its totals whole; a decimal one ("587.4") its tenths. */
export const isWholeResult = (r: Pick<Evaluation, 'total' | 'wholeTotal'>) => Number.isInteger(r.total) && r.total === r.wholeTotal

/** A series' total as the match counts it: whole numbers, or tenths. */
export function seriesTotalText(s: Pick<EvalSeries, 'total' | 'shots'>, whole: boolean): string {
  return whole ? String(s.shots.reduce((n, t) => n + wholeScore(t.v), 0)) : s.total.toFixed(1)
}

export const seriesInnerTens = (s: Pick<EvalSeries, 'shots'>) => s.shots.filter((t) => isInnerTen(t.v)).length

/** "K1–K10", "P11–P20": the shots a series holds, as the sheet numbers them. */
export function seriesLabel(position: Position, s: Pick<EvalSeries, 'n' | 'shots'>): string {
  const first = (s.n - 1) * 10 + 1
  return `${POSITION_LETTER[position]}${first}–${POSITION_LETTER[position]}${first + s.shots.length - 1}`
}

/** A shot's label on the sheet ("K14"). */
export const shotLabel = (position: Position, series: number, index: number) => `${POSITION_LETTER[position]}${(series - 1) * 10 + index + 1}`

/** A row's score per 10 shots, in whole numbers: its result's, or its match's over every shot of its positions. */
export function rowPer10(results: readonly Pick<Evaluation, 'wholeTotal' | 'shots'>[]): number | null {
  return per10(
    results.reduce((n, r) => n + r.wholeTotal, 0),
    results.reduce((n, r) => n + r.shots, 0),
  )
}

/** The match's total and inner tens over its results (inner tens only when every result has them). */
export function matchTotal(results: readonly MatchResult[]): { total: number; innerTens: number | null; whole: boolean } {
  const whole = results.every(isWholeResult)
  const total = results.reduce((n, r) => n + r.total, 0)
  const innerTens = results.every((r) => r.innerTens !== null) ? results.reduce((n, r) => n + (r.innerTens ?? 0), 0) : null
  return { total: whole ? total : Math.round(total * 10) / 10, innerTens, whole }
}
