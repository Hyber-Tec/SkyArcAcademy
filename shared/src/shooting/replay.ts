import { type Evaluation, pointOf } from './evaluation'
import type { ShotPoint } from './target'

/**
 * A result's shots in the order they were fired, for playing them back one by one on the target (the phone app's
 * score screen and the website's): SIUS series by series (sighters never count), a paper card bull by bull. Each
 * carries its place when it has one (SIUS directions, a scanned card) and the running total.
 */
export interface ReplayShot {
  /** 1, 2, 3… in firing order. */
  n: number
  /** The SIUS series it belongs to (1, 2…); null for a paper card. */
  series: number | null
  value: number
  point: ShotPoint | null
  /** The total so far, this shot included (one decimal for SIUS, whole for paper). */
  running: number
}

export function replayShots(e: Pick<Evaluation, 'source' | 'series'>): ReplayShot[] {
  const out: ReplayShot[] = []
  let running = 0
  for (const s of e.series) {
    for (const t of s.shots) {
      running = Math.round((running + t.v) * 10) / 10
      out.push({ n: out.length + 1, series: e.source === 'sius' ? s.n : null, value: t.v, point: pointOf(t), running })
    }
  }
  return out
}

/**
 * Whether a result's shots read in tenths: SIUS's, and a match sheet's printed with them ("8.9"); a paper card's are
 * whole numbers.
 */
export function showsTenths(e: Pick<Evaluation, 'source' | 'series'>): boolean {
  return e.source === 'sius' || (e.source === 'sheet' && e.series.some((s) => s.shots.some((t) => !Number.isInteger(t.v))))
}

/** Whether a result has shots with a place on the target, so it can be played back. */
export function canReplay(e: Pick<Evaluation, 'source' | 'series'>): boolean {
  return replayShots(e).some((s) => s.point !== null)
}

/** How long each shot stays the newest while playing: a whole result in about twelve seconds, 0.25 to 0.7 s a shot. */
export function replayStepMs(shots: number): number {
  return Math.round(Math.min(700, Math.max(250, 12000 / Math.max(1, shots))))
}
