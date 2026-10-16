import { LuMinus, LuTrendingDown, LuTrendingUp } from 'react-icons/lu'
import type { IconType } from 'react-icons'
import type { EvaluationPoint, ProgressReportDoc, TrendLevel } from '@shared/reports/types'
import { POSITIONS, POSITION_COLORS, POSITION_LABELS } from '@shared/shooting/evaluation'
import { formatInstant } from '@shared/time'

/** A report as stored, with its ID. */
export type Report = ProgressReportDoc & { id: string }

export const toDate = (t: unknown): Date | null => {
  const v = t as { toDate?: () => Date } | null
  return v?.toDate ? v.toDate() : null
}

export const one = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** "+2.5" / "−1" / "0": a signed difference, with a real minus sign. */
export function signed(n: number): string {
  if (n === 0) return '0'
  return `${n > 0 ? '+' : '−'}${one(Math.abs(n))}`
}

/** "Draft", "Shared Oct 4" or "Viewed Oct 5", as staff see a report's state. */
export function stateLabel(r: Pick<ProgressReportDoc, 'status' | 'sharedAt' | 'firstViewedAt'>, timezone: string): string {
  if (r.status !== 'shared') return 'Draft'
  const viewed = toDate(r.firstViewedAt)
  if (viewed) return `Viewed ${formatInstant(viewed, timezone, { month: 'short', day: 'numeric' })}`
  const shared = toDate(r.sharedAt)
  return shared ? `Shared ${formatInstant(shared, timezone, { month: 'short', day: 'numeric' })}` : 'Shared'
}

/** The trend chip's look: an icon and color for each level, so it never relies on color alone. */
export const TREND_STYLE: Record<TrendLevel, { icon: IconType; bg: string; fg: string; ring: string }> = {
  improving: { icon: LuTrendingUp, bg: '#0ca30c14', fg: '#087a08', ring: '#0ca30c40' },
  steady: { icon: LuMinus, bg: '#2f68c414', fg: '#24539e', ring: '#2f68c440' },
  dipping: { icon: LuTrendingDown, bg: '#fab2191a', fg: '#8a5d00', ring: '#fab21959' },
}

/** The scores-over-time lines: one per position, whole scores per 10 shots (charts.tsx `TrendChart`). */
export function trendSeries(points: readonly EvaluationPoint[]) {
  return POSITIONS.map((pos) => ({
    key: pos,
    label: POSITION_LABELS[pos],
    color: POSITION_COLORS[pos],
    points: points
      .filter((p) => p.position === pos)
      .map((p) => ({ dateKey: p.dateKey, value: p.wholePer10, detail: p.source === 'sius' ? `${one(p.per10)} decimal` : 'paper card' })),
  })).filter((s) => s.points.length)
}

/** The message of a Firebase error without its code prefix. */
export function errorMessage(e: unknown, fallback: string): string {
  const m = (e as { message?: string })?.message
  return m ? m.replace(/^Firebase: /, '').replace(/ \(.*\)\.?$/, '') : fallback
}
