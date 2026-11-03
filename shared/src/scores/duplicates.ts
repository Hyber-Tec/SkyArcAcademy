import { type Evaluation, type EvaluationSource, POSITION_LABELS } from '../shooting/evaluation'
import { formatDateKey } from '../time'

/**
 * A result already saved, caught before it's saved again (the manager's third meeting, CP2: he uploaded the same PDF
 * twice). Every way of adding a result checks the new one against the student's saved results and the others being
 * added with it: the Drive's SIUS PDFs, the Scores page's and the Scores tab's cards and sheets, and the phone's scans.
 */

/** What tells one result from another: whose, the day, the position, the shots and total, and what only some have. */
export interface ResultPrint {
  studentId: string
  dateKey: string
  position: string
  shots: number
  total: number
  /** A SIUS result's time as printed on its report. */
  printed?: string | null
  /** Each shot's value in order, when the result has its shots. */
  values?: readonly number[] | null
}

/** A saved result's print: its SIUS report's printed time, and its shots' values from its series. */
export function printOf(e: Pick<Evaluation, 'studentId' | 'dateKey' | 'position' | 'shots' | 'total' | 'series' | 'sius'>): ResultPrint {
  const values = (e.series ?? []).flatMap((s) => s.shots.map((t) => t.v))
  return { studentId: e.studentId, dateKey: e.dateKey, position: e.position, shots: e.shots, total: e.total, printed: e.sius?.printed ?? null, values: values.length ? values : null }
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.05

/**
 * Whether two results are one result added twice. A SIUS report is known by its printed time and total, whatever
 * position it was filed under; any other result by the same student, day, position, number of shots and total, and
 * the same shots in the same order when both have theirs (two cards with the same total that day are different cards).
 */
export function sameResult(a: ResultPrint, b: ResultPrint): boolean {
  if (a.studentId !== b.studentId) return false
  if (a.printed && b.printed) return a.printed === b.printed && same(a.total, b.total)
  if (a.dateKey !== b.dateKey || a.position !== b.position || a.shots !== b.shots || !same(a.total, b.total)) return false
  const x = a.values?.length ? a.values : null
  const y = b.values?.length ? b.values : null
  return !x || !y || (x.length === y.length && x.every((v, i) => same(v, y[i])))
}

/** The first of `saved` that `r` repeats, or null. */
export function repeatOf<T extends ResultPrint>(r: ResultPrint, saved: readonly T[]): T | null {
  return saved.find((s) => sameResult(r, s)) ?? null
}

const WHAT: Record<EvaluationSource, string> = { sius: 'SIUS result', paper: 'paper card', sheet: 'competition result' }

/** "the prone paper card of Nov 2 (85)": a saved result, as a warning names it. */
export function resultWords(e: Pick<Evaluation, 'position' | 'source' | 'dateKey' | 'total'>): string {
  const total = Number.isInteger(e.total) ? String(e.total) : e.total.toFixed(1)
  return `the ${POSITION_LABELS[e.position].toLowerCase()} ${WHAT[e.source]} of ${formatDateKey(e.dateKey, 'monthDay')} (${total})`
}
