import { halves, trendLevel } from '../reports/facts'
import type { TrendLevel } from '../reports/types'
import { type Evaluation, inOrder, wholePer10 } from './evaluation'
import { type PositionProgress, positionProgress } from './progress'

type Scored = Pick<Evaluation, 'position' | 'dateKey' | 'timeMin' | 'wholeTotal' | 'shots'> & { id: string }

/** Which way a position is going, from its results. */
export interface PositionTrend {
  level: TrendLevel
  /** The newer half's average minus the older half's, per 10 shots, to one decimal. */
  change: number
  /** Each half's average per 10 shots. */
  newer: number
  older: number
  /** How many results each half holds. */
  size: number
}

export interface PositionSummary extends PositionProgress {
  /** Each result's whole score per 10 shots, oldest first: the small line on the position's tile. */
  line: number[]
  /** Null with a single result. */
  trend: PositionTrend | null
}

/**
 * Each position at a glance, as a student's Scores tab shows it: the average per 10 shots (every counted shot, so a
 * 20-shot SIUS result weighs twice a 10-shot card), the best result, how many there are, each result's score in date
 * order for a small line, and which way it's going. Only the positions with results, in the usual order.
 *
 * Which way it's going is the progress reports' rule (reports/facts.ts, `halves`), so the tab and a report never
 * disagree: the results in date order are split into two halves (with an odd number, the middle one is in neither),
 * each half's results are averaged per 10 shots, and the newer half is set against the older one. A change of +1 or
 * more is improving, −1.5 or less is dipping, anything between is steady. A single result has no trend.
 */
export function positionSummaries(evaluations: readonly Scored[]): PositionSummary[] {
  return positionProgress(evaluations).map((p) => {
    const line = inOrder(evaluations.filter((e) => e.position === p.position && e.shots > 0)).map((e) => wholePer10(e) ?? 0)
    const h = halves(line.map((v) => ({ wholePer10: v })))
    return { ...p, line, trend: h ? { level: trendLevel(h.change), ...h } : null }
  })
}
