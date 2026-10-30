import { type Evaluation, POSITIONS, type Position, inOrder, kindOf, per10 } from '../shooting/evaluation'
import { type ShotPoint, meanPoint, wholeScore } from '../shooting/target'
import type { SessionStatus } from '../settings/defaults'
import type { DateKey } from '../time'
import type { CompetitionFact, EvaluationPoint, PositionFacts, ReportFacts, TrendLevel } from './types'

/** The figures a report is built from, all computed here (never typed in, never written by AI). */

const round1 = (n: number) => Math.round(n * 10) / 10
const avg = (values: number[]) => (values.length ? round1(values.reduce((n, v) => n + v, 0) / values.length) : null)

/** A whole-number per-10 change this big (or more) counts as improving; this much down counts as a dip. */
export const TREND_UP = 1
export const TREND_DOWN = -1.5

/** An evaluation as a report point. */
export function toPoint(e: Evaluation & { id: string }): EvaluationPoint {
  return {
    id: e.id,
    dateKey: e.dateKey,
    position: e.position,
    source: e.source,
    shots: e.shots,
    total: e.total,
    wholeTotal: e.wholeTotal,
    per10: per10(e.total, e.shots) ?? 0,
    wholePer10: per10(e.wholeTotal, e.shots) ?? 0,
    innerTens: e.innerTens,
    groupMm: e.groupMm,
    mpi: e.mpi,
    marks: e.series.flatMap((s) => s.shots.map((t) => (typeof t.x === 'number' && typeof t.y === 'number' ? { v: t.v, a: t.a, x: t.x, y: t.y } : { v: t.v, a: t.a }))),
  }
}

/** Second half of the list against the first (whole per 10); null with fewer than two. */
export function halvesChange(points: readonly EvaluationPoint[]): number | null {
  if (points.length < 2) return null
  const mid = Math.floor(points.length / 2)
  const first = avg(points.slice(0, mid).map((p) => p.wholePer10))
  const second = avg(points.slice(points.length - mid).map((p) => p.wholePer10))
  return first === null || second === null ? null : round1(second - first)
}

function positionFacts(position: Position, points: EvaluationPoint[]): PositionFacts {
  const sius = points.filter((p) => p.source === 'sius')
  const shots = points.reduce((n, p) => n + p.shots, 0)
  const siusShots = sius.reduce((n, p) => n + p.shots, 0)
  const best = points.reduce<EvaluationPoint | null>((b, p) => (!b || p.wholePer10 > b.wholePer10 || (p.wholePer10 === b.wholePer10 && p.per10 > b.per10) ? p : b), null)
  const first = points[0] ?? null
  const latest = points[points.length - 1] ?? null
  const mpis = sius.map((p) => p.mpi).filter((m): m is ShotPoint => !!m)
  const groups = sius.map((p) => p.groupMm).filter((g): g is number => typeof g === 'number' && g > 0)
  const wholes = points.map((p) => p.wholePer10)
  return {
    position,
    evaluations: points.length,
    shots,
    average: shots ? round1((points.reduce((n, p) => n + p.wholeTotal, 0) / shots) * 10) : null,
    decimal: siusShots ? round1((sius.reduce((n, p) => n + p.total, 0) / siusShots) * 10) : null,
    best: best ? { id: best.id, wholePer10: best.wholePer10, per10: best.per10, dateKey: best.dateKey, source: best.source } : null,
    first: first ? { id: first.id, wholePer10: first.wholePer10, dateKey: first.dateKey } : null,
    latest: latest ? { id: latest.id, wholePer10: latest.wholePer10, dateKey: latest.dateKey } : null,
    change: halvesChange(points),
    innerTensPct: siusShots ? Math.round((sius.reduce((n, p) => n + (p.innerTens ?? 0), 0) / siusShots) * 100) : null,
    groupMm: avg(groups),
    mpi: meanPoint(mpis),
    range: wholes.length ? { low: Math.min(...wholes), high: Math.max(...wholes) } : null,
  }
}

/** Overall trend: each position's change, weighted by its evaluations. */
export function trendOf(positions: readonly PositionFacts[]): { level: TrendLevel | null; change: number | null } {
  const counted = positions.filter((p) => p.change !== null)
  if (!counted.length) return { level: null, change: null }
  const weight = counted.reduce((n, p) => n + p.evaluations, 0)
  const change = round1(counted.reduce((n, p) => n + (p.change as number) * p.evaluations, 0) / weight)
  return { level: change >= TREND_UP ? 'improving' : change <= TREND_DOWN ? 'dipping' : 'steady', change }
}

export interface FactsSession {
  dateKey: DateKey
  status: SessionStatus
  /** The class has ended (attendance can only be taken after). */
  past: boolean
}

export interface PreviousReport {
  reportId: string
  periodLabel: string
  average: number | null
  evaluations: number
  /** Its positions' averages, to compare like with like (missing for reports from before). */
  positions?: { position: Position; average: number | null }[]
}

/**
 * The change since the previous report, over the positions both periods shot (each weighted by this period's shots):
 * a standing-only month isn't measured against a prone-only one (P10). Without the previous positions, the averages.
 */
export function deltaSince(positions: readonly PositionFacts[], average: number | null, previous: PreviousReport | null): number | null {
  if (!previous || average === null) return null
  if (!previous.positions) return previous.average != null ? round1(average - previous.average) : null
  const before = new Map(previous.positions.filter((p) => p.average !== null).map((p) => [p.position, p.average as number]))
  const both = positions.filter((p) => p.average !== null && before.has(p.position) && p.shots > 0)
  const shots = both.reduce((n, p) => n + p.shots, 0)
  if (!shots) return null
  return round1(both.reduce((n, p) => n + ((p.average as number) - (before.get(p.position) as number)) * p.shots, 0) / shots)
}

/**
 * Attendance over some classes: attended against missed (canceled classes don't count either way), and past classes
 * nobody has marked yet. The reports and the families' Home show it.
 */
export function attendanceFacts(sessions: readonly FactsSession[]): ReportFacts['attendance'] {
  const attended = sessions.filter((s) => s.status === 'present').length
  const missed = sessions.filter((s) => s.status === 'no_show').length
  return {
    attended,
    missed,
    canceled: sessions.filter((s) => s.status === 'canceled').length,
    unmarked: sessions.filter((s) => s.past && (s.status === 'pending' || s.status === 'confirmed')).length,
    percent: attended + missed ? Math.round((attended / (attended + missed)) * 100) : null,
  }
}

/** The same position's latest match on an earlier day (another match the same day isn't "before" it). */
function lastMatchBefore(e: Evaluation, matches: readonly Evaluation[]): CompetitionFact['since'] {
  const prior = matches.filter((m) => m.position === e.position && m.dateKey < e.dateKey && m.shots > 0)
  const last = prior.reduce<Evaluation | null>((best, m) => (!best || m.dateKey > best.dateKey ? m : best), null)
  return last ? { dateKey: last.dateKey, match: last.match?.name ?? '', wholePer10: per10(last.wholeTotal, last.shots) ?? 0 } : null
}

/** The period's figures from its evaluations (already in the period), its classes and the last shared report. */
export function reportFacts(
  evaluations: readonly (Evaluation & { id: string })[],
  sessions: readonly FactsSession[],
  previous: PreviousReport | null,
  /** The student's competitions before the period, each match compared with the one before it. */
  earlier: readonly (Evaluation & { id: string })[] = [],
): { facts: ReportFacts; series: EvaluationPoint[] } {
  // Competitions stand apart from practice (§23): listed on their own, left out of the figures and the charts.
  const ordered = inOrder(evaluations)
  const before = inOrder(earlier).filter((e) => kindOf(e) === 'competition')
  const competitions: CompetitionFact[] = ordered
    .filter((e) => kindOf(e) === 'competition')
    .map((e, _, all) => ({
      id: e.id,
      dateKey: e.dateKey,
      match: e.match?.name ?? '',
      position: e.position,
      shots: e.shots,
      total: e.total,
      innerTens: e.innerTens,
      decimal: e.source !== 'paper' && !Number.isInteger(e.total),
      wholePer10: per10(e.wholeTotal, e.shots) ?? 0,
      since: lastMatchBefore(e, [...before, ...all]),
    }))
  const series = ordered.filter((e) => kindOf(e) !== 'competition').map(toPoint)
  const positions = POSITIONS.map((pos) => positionFacts(pos, series.filter((p) => p.position === pos))).filter((p) => p.evaluations > 0)
  const shots = series.reduce((n, p) => n + p.shots, 0)
  const sius = series.filter((p) => p.source === 'sius')
  const siusShots = sius.reduce((n, p) => n + p.shots, 0)
  const scored = series.flatMap((p) => p.marks.map((m) => wholeScore(m.v)))
  const average = shots ? round1((series.reduce((n, p) => n + p.wholeTotal, 0) / shots) * 10) : null
  const groups = sius.map((p) => p.groupMm).filter((g): g is number => typeof g === 'number' && g > 0)
  const facts: ReportFacts = {
    evaluations: { total: series.length, sius: sius.length, paper: series.length - sius.length, shots },
    positions,
    average,
    decimal: siusShots ? round1((sius.reduce((n, p) => n + p.total, 0) / siusShots) * 10) : null,
    innerTensPct: siusShots ? Math.round((sius.reduce((n, p) => n + (p.innerTens ?? 0), 0) / siusShots) * 100) : null,
    groupMm: avg(groups),
    distribution: {
      tens: scored.filter((v) => v >= 10).length,
      nines: scored.filter((v) => v === 9).length,
      eights: scored.filter((v) => v === 8).length,
      lower: scored.filter((v) => v <= 7).length,
    },
    attendance: attendanceFacts(sessions),
    trend: trendOf(positions),
    previous: previous ? { reportId: previous.reportId, periodLabel: previous.periodLabel, average: previous.average, evaluations: previous.evaluations } : null,
    deltaAverage: deltaSince(positions, average, previous),
    competitions,
  }
  return { facts, series }
}

/**
 * What a report was built from, as one string: a different one now means an evaluation was added, changed or
 * removed since ("Check before sharing").
 */
export function evaluationsFingerprint(list: readonly { id: string; updatedAt?: unknown }[]): string {
  const ms = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? (t as { seconds?: number } | null)?.seconds ?? 0
  const keys = list.map((e) => `${e.id}:${ms(e.updatedAt)}`).sort()
  let h = 5381
  for (const ch of keys.join('|')) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0
  return `${list.length}-${h.toString(36)}`
}
