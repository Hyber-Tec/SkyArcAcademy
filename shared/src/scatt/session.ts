import type { Position } from '../shooting/evaluation'
import { type DateKey, dateKeyOf, minutesOf } from '../time'
import type { TimestampLike } from '../types'
import { encodeTrace } from './codec'
import { type Point, type RawPoint, SCATT_TARGETS, holdRatios, processTrace, scattDirection, scattScore, shotStats } from './trace'

/**
 * A SCATT session as the app keeps it (the fourth meeting's R2): what the server reads from a SCATT file a coach drops
 * in a student's Drive folder (functions/src/scatt), built here from the file's rows. Families watch it, never add it.
 * Every number is SCATT's own (shared/src/scatt/trace.ts). Places are the app's way round: millimetres from the
 * centre, x right and y UP (SCATT stores y down). The name inside the file is never kept.
 */

/** One shot: SCATT's numbers for it. */
export interface ScattShot {
  /** Its number among the session's match shots (1, 2, 3…); null for a sighter. */
  n: number | null
  /** The series of ten it's in (match shots). */
  series: number | null
  sighting: boolean
  /** SCATT's score, in tenths, from where the aim was when the shot went off. */
  score: number
  /** Where: mm from the centre, x right and y up. */
  x: number
  y: number
  /** SCATT's arrow: 0 for the centre, 1 up, then clockwise to 8 (up-left). */
  dir: number
  /** Seconds aiming before the shot. */
  aimS: number | null
  /** How far the aim moved, in mm a second: over the last second (S1), and the last quarter second (S2). */
  s1: number | null
  s2: number | null
  /** The shot's distance from the average aim of its last second (mm). */
  da: number | null
  /** Percent of the last second inside the 10 ring ("10.0"), and steady within the 10's size ("10a0"). */
  in10: number | null
  steady: number | null
  /** When it went off: ms after the session's start. */
  at: number
}

/** `branches/{b}/scattSessions/{id}`: one session, without its traces (`scattTraces/{id}`). */
export interface ScattSession {
  studentId: string
  studentName: string
  dateKey: DateKey
  timeMin: number
  /** As set in SCATT; null when it wasn't. */
  position: Position | null
  target: string
  caliber: number
  shots: ScattShot[]
  matchShots: number
  sighters: number
  /** The match shots' total in tenths, and in whole numbers. */
  total: number | null
  totalInt: number | null
  series: { n: number; total: number; totalInt: number }[]
  /** The match shots' average place, and averages of their numbers. */
  mpi: { x: number; y: number } | null
  averages: { aimS: number; s1: number; s2: number; da: number } | null
  /** The Drive file it came from, and SCATT's own id of the session (kept once). */
  fileId: string
  uuid: string
  createdAt?: TimestampLike | null
  createdBy?: string | null
}

/** `branches/{b}/scattTraces/{id}`: each shot's trace, in the order of the session's shots. */
export interface ScattTraces {
  studentId: string
  /** Samples a second. */
  rateHz: number
  shots: { t0: number; xy: string }[]
}

/** How much of each trace is kept: up to this long before the shot, and after it. */
export const TRACE_BEFORE_MS = 8000
export const TRACE_AFTER_MS = 1200
/** The kept traces' rate: SCATT draws at 200 a second; 50 plays smoothly and keeps a session small. */
export const TRACE_RATE_HZ = 50

/** SCATT's positions, by its number (0: not set). */
const POSITIONS: Record<number, Position> = { 1: 'prone', 2: 'kneeling', 3: 'standing' }

// ------------------------------------------------------------------ the file's rows

export interface RawShot {
  timer: number
  /** The sample it went off at, in its trace. */
  offset: number
  match: boolean
  deleted: boolean
  missed: boolean
}

export interface RawTrace {
  timer: number
  timerEnter: number
  points: RawPoint[]
  shots: RawShot[]
}

export interface RawSession {
  uuid: string
  personId: number
  timer: number
  targetUuid: string
  caliber: number
  caliberUnits: number
  position: number
  sampleRate: number
  traces: RawTrace[]
}

const round = (v: number, d: number) => {
  const f = 10 ** d
  return Math.round(v * f) / f
}
const r2 = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : round(v, 2))

/** Why a session in a file isn't kept, for the import's note. */
export type SkipReason = 'target' | 'noShots'

/**
 * A session from the file's rows: each shot with SCATT's numbers, and each shot's trace (y up, 50 a second, from 8
 * seconds before the shot to 1.2 after). Null with a reason when it can't be kept: a target the app doesn't know, or
 * no shot at all.
 */
export function buildSession(
  raw: RawSession,
  who: { studentId: string; studentName: string; fileId: string; timeZone: string },
): { session: Omit<ScattSession, 'createdAt' | 'createdBy'>; traces: ScattTraces } | { skip: SkipReason } {
  const target = SCATT_TARGETS[raw.targetUuid]
  if (!target) return { skip: 'target' }
  const caliber = raw.caliberUnits === 6 || raw.caliber > 1 ? raw.caliber : raw.caliber * 1000
  const sr = raw.sampleRate
  const rr = 200
  const shots: ScattShot[] = []
  const traces: ScattTraces['shots'] = []
  let nMatch = 0
  let prevShotMs: number | null = null
  for (const tr of [...raw.traces].sort((a, b) => a.timer - b.timer)) {
    const live = tr.shots.filter((s) => !s.deleted).sort((a, b) => a.timer - b.timer)
    if (!live.length || !tr.points.length) continue
    const proc = processTrace(tr.points, sr, rr)
    for (const sh of live) {
      const off = Math.max(0, Math.min(sh.offset, tr.points.length - 1))
      const idx = Math.floor((off * rr) / sr)
      const [bx, by] = idx < proc.length ? proc[idx] : [tr.points[off][0], tr.points[off][1]]
      const score = scattScore(bx, by, target, caliber)
      const st = shotStats(proc, off, sr, rr)
      const hold = st ? holdRatios(proc, off, sr, rr, st.aap, target, caliber) : null
      if (sh.match) nMatch++
      // SCATT's aiming time: from entering the target, or from the shot before when that's later.
      const shotMs = tr.timer + Math.floor((off * 1000) / sr)
      const enter = tr.timerEnter >= 1 ? tr.timerEnter : tr.timer
      let aimMs = shotMs - enter
      if (prevShotMs !== null && shotMs - prevShotMs < aimMs) aimMs = shotMs - prevShotMs
      prevShotMs = shotMs
      shots.push({
        n: sh.match ? nMatch : null,
        series: sh.match ? Math.floor((nMatch - 1) / 10) + 1 : null,
        sighting: !sh.match,
        score,
        x: round(bx, 2),
        y: round(-by, 2),
        dir: scattDirection(bx, by, score),
        aimS: aimMs >= 0 ? round(aimMs / 1000, 2) : null,
        s1: st ? r2(st.s1) : null,
        s2: st ? r2(st.s2) : null,
        da: st ? r2(Math.hypot(st.aap[0] - bx, st.aap[1] - by)) : null,
        in10: hold ? hold['10.0'] : null,
        steady: hold ? hold['10a0'] : null,
        at: Math.max(0, shotMs - raw.timer),
      })
      // The trace around the shot, every fourth sample (200 → 50 a second), y up.
      const step = rr / TRACE_RATE_HZ
      const first = Math.max(0, idx - Math.round((TRACE_BEFORE_MS * rr) / 1000))
      const last = Math.min(proc.length - 1, idx + Math.round((TRACE_AFTER_MS * rr) / 1000))
      const start = first + ((idx - first) % step)
      const pts: Point[] = []
      for (let i = start; i <= last; i += step) pts.push([proc[i][0], -proc[i][1]])
      traces.push({ t0: Math.round(((start - idx) * 1000) / rr), xy: encodeTrace(pts) })
    }
  }
  if (!shots.length) return { skip: 'noShots' }
  const match = shots.filter((s) => !s.sighting)
  const sum = (f: (s: ScattShot) => number) => match.reduce((a, s) => a + f(s), 0)
  const series: ScattSession['series'] = []
  for (let k = 0; k < match.length; k += 10) {
    const g = match.slice(k, k + 10)
    series.push({ n: k / 10 + 1, total: round(g.reduce((a, s) => a + s.score, 0), 1), totalInt: g.reduce((a, s) => a + Math.trunc(s.score), 0) })
  }
  const avg = (f: (s: ScattShot) => number | null) => {
    const vals = match.map(f).filter((v): v is number => v !== null)
    return vals.length ? round(vals.reduce((a, v) => a + v, 0) / vals.length, 2) : 0
  }
  return {
    session: {
      studentId: who.studentId,
      studentName: who.studentName,
      dateKey: dateKeyOf(raw.timer, who.timeZone),
      timeMin: minutesOf(raw.timer, who.timeZone),
      position: POSITIONS[raw.position] ?? null,
      target: target.name,
      caliber,
      shots,
      matchShots: match.length,
      sighters: shots.length - match.length,
      total: match.length ? round(sum((s) => s.score), 1) : null,
      totalInt: match.length ? sum((s) => Math.trunc(s.score)) : null,
      series,
      mpi: match.length ? { x: round(sum((s) => s.x) / match.length, 2), y: round(sum((s) => s.y) / match.length, 2) } : null,
      averages: match.length ? { aimS: avg((s) => s.aimS), s1: avg((s) => s.s1), s2: avg((s) => s.s2), da: avg((s) => s.da) } : null,
      fileId: who.fileId,
      uuid: raw.uuid,
    },
    traces: { studentId: who.studentId, rateHz: TRACE_RATE_HZ, shots: traces },
  }
}

/** A session's document ID: SCATT's own id, the same however often the file is dropped in. */
export const scattSessionId = (uuid: string): string => `scatt-${uuid.replace(/[^A-Za-z0-9-]/g, '').toLowerCase()}`

/** "Prone", or "Position not set in SCATT". */
export const scattPositionWords = (p: Position | null): string => (p ? p[0].toUpperCase() + p.slice(1) : 'Position not set in SCATT')
