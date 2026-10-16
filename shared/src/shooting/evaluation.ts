import type { DateKey } from '../time'
import type { AuditStamp } from '../types'
import { type ShotPoint, groupSizeMm, isInnerTen, meanPoint, shotPoint, wholeScore } from './target'

/** Position = Standing / Kneeling / Prone (the academy's words). */
export type Position = 'standing' | 'kneeling' | 'prone'

export const POSITIONS: readonly Position[] = ['standing', 'kneeling', 'prone']

export const POSITION_LABELS: Record<Position, string> = {
  standing: 'Standing',
  kneeling: 'Kneeling',
  prone: 'Prone',
}

/**
 * One color per position, the same in every chart and report (Sky Arc red for standing). Checked for color-blind
 * separation on the light chart paper; charts always draw on light paper, so these never sit on a dark surface.
 */
export const POSITION_COLORS: Record<Position, string> = {
  standing: '#c80000',
  kneeling: '#1f5fbf',
  prone: '#00876b',
}

export function isPosition(value: unknown): value is Position {
  return typeof value === 'string' && (POSITIONS as readonly string[]).includes(value)
}

/** Where scores come from: a SIUS result (decimal scores) or a paper card (whole numbers, entered by hand for now). */
export type EvaluationSource = 'sius' | 'paper'

export const SOURCE_LABELS: Record<EvaluationSource, string> = { sius: 'SIUS', paper: 'Paper' }

export interface EvalShot {
  /** The score: decimal from SIUS (10.4), whole from a paper card (10). */
  v: number
  /** Direction from the centre in degrees (0 right, 90 up), when SIUS printed an arrow. */
  a: number | null
}

export interface EvalSeries {
  /** The series number on the result (1, 2, 3…). */
  n: number
  total: number
  shots: EvalShot[]
  mpi: ShotPoint | null
  groupMm: number | null
}

/**
 * `branches/{b}/evaluations/{id}`: one scored target, a SIUS result or a paper card. The Drive keeps the file; this
 * keeps the scores, and the progress reports are built from these. Staff read them; families see them only through a
 * shared report.
 */
export interface Evaluation extends AuditStamp {
  studentId: string
  studentName: string
  source: EvaluationSource
  position: Position
  dateKey: DateKey
  /** Minutes after local midnight in the academy's zone; null when unknown (a paper card). */
  timeMin: number | null
  /** Match shots (sighters never count). */
  shots: number
  /** The total as the source gives it: decimal for SIUS (186.8), whole for a paper card. */
  total: number
  /** Every shot's whole score added up. For a paper card it equals `total`. */
  wholeTotal: number
  /** SIUS: shots of 10.2 or better. */
  innerTens: number | null
  mpi: ShotPoint | null
  groupMm: number | null
  series: EvalSeries[]
  /** SIUS: sighter shots fired (never counted). */
  sighters: number
  /** The Drive file it came from (the SIUS PDF or the card's photo). */
  fileId: string | null
  /** A coach's note on this evaluation. */
  note: string
  /** What looked wrong when the result was read ("Series 2 adds up to 94.1, not 94.0"); empty when all is well. */
  problems: string[]
  /** SIUS only: the result's time as printed, the program, and the correction made for the computer's clock. */
  sius: { printed: string; event: string; clockFixMin: number } | null
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** The average of every 10 shots, so a 20-shot result and a 10-shot card compare (192.0 over 20 → 96.0). */
export function per10(total: number, shots: number): number | null {
  return shots > 0 ? round1((total / shots) * 10) : null
}

/** The whole-number average of every 10 shots (a paper card's scale). */
export function wholePer10(e: Pick<Evaluation, 'wholeTotal' | 'shots'>): number | null {
  return per10(e.wholeTotal, e.shots)
}

/** Evaluations in date order (then time), the order every chart reads them in. */
export function inOrder<T extends { dateKey: DateKey; timeMin?: number | null; id: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || (a.timeMin ?? 0) - (b.timeMin ?? 0) || a.id.localeCompare(b.id))
}

/** Shots with a direction, as points (SIUS). */
export function evaluationPoints(e: Pick<Evaluation, 'series'>): ShotPoint[] {
  return e.series.flatMap((s) => s.shots.map((t) => shotPoint(t.v, t.a)).filter((p): p is ShotPoint => p !== null))
}

/** A paper card's evaluation from its whole-number shots (or only its total, when that's all that was written). */
export function paperEvaluation(input: {
  studentId: string
  studentName: string
  position: Position
  dateKey: DateKey
  shots: number[] | null
  total: number | null
  shotCount?: number
  fileId: string | null
  note: string
}): Omit<Evaluation, keyof AuditStamp> {
  const shots = (input.shots ?? []).map((v) => Math.max(0, Math.min(10, Math.round(v))))
  const total = shots.length ? shots.reduce((n, v) => n + v, 0) : Math.max(0, Math.round(input.total ?? 0))
  const count = shots.length || input.shotCount || 10
  return {
    studentId: input.studentId,
    studentName: input.studentName,
    source: 'paper',
    position: input.position,
    dateKey: input.dateKey,
    timeMin: null,
    shots: count,
    total,
    wholeTotal: total,
    innerTens: null,
    mpi: null,
    groupMm: null,
    series: shots.length ? [{ n: 1, total, shots: shots.map((v) => ({ v, a: null })), mpi: null, groupMm: null }] : [],
    sighters: 0,
    fileId: input.fileId,
    note: input.note,
    problems: [],
    sius: null,
  }
}

/** Totals rebuilt from shots: the decimal total, the whole total and the inner tens. */
export function shotTotals(shots: readonly EvalShot[]): { total: number; wholeTotal: number; innerTens: number } {
  return {
    total: round1(shots.reduce((n, t) => n + t.v, 0)),
    wholeTotal: shots.reduce((n, t) => n + wholeScore(t.v), 0),
    innerTens: shots.filter((t) => isInnerTen(t.v)).length,
  }
}

/** MPI and group of a set of SIUS shots, rebuilt from their scores and directions. */
export function shotGroup(shots: readonly EvalShot[]): { mpi: ShotPoint | null; groupMm: number | null } {
  const points = shots.map((t) => shotPoint(t.v, t.a)).filter((p): p is ShotPoint => p !== null)
  return { mpi: meanPoint(points), groupMm: groupSizeMm(points) }
}
