import { type Evaluation, pointOf } from './evaluation'
import type { ShotPoint } from './target'

/**
 * A result's shots in the order they were fired, for playing them back one by one on the target (the phone app's
 * score screen and the website's): SIUS series by series (sighters never count), a paper card bull by bull. Each
 * carries its place when it has one (SIUS directions, a scanned card, a results sheet's picture), the running total,
 * and the shots its place may be swapped with.
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
  /** The shots (their `n`) this one's place may be swapped with: `swappableShots`. Empty when its place is certain. */
  swapWith: number[]
}

export function replayShots(e: Pick<Evaluation, 'source' | 'series'>): ReplayShot[] {
  const out: ReplayShot[] = []
  const swaps = swappableShots(e)
  let running = 0
  for (const s of e.series) {
    for (const t of s.shots) {
      running = Math.round((running + t.v) * 10) / 10
      const n = out.length + 1
      out.push({ n, series: e.source === 'sius' ? s.n : null, value: t.v, point: pointOf(t), running, swapWith: swaps.get(n) ?? [] })
    }
  }
  return out
}

/**
 * Which shots' places may be swapped (the fourth meeting's R3): a results sheet prints every shot's score in firing
 * order, so the order is certain, but not which hole is which. Each shot is put on the circle its score allows, where
 * the sheet's picture shows a hole (shared/src/scores/sheetShots.ts), so two shots with the same score in one series
 * share the same circle, and nothing says which of their two holes came first. Those are listed here, by shot number
 * (1, 2, 3… across the result), each with the others it may be swapped with. SIUS prints each shot's own arrow, and a
 * paper card has no firing order to get wrong, so only results sheets have any.
 */
export function swappableShots(e: Pick<Evaluation, 'source' | 'series'>): Map<number, number[]> {
  const out = new Map<number, number[]>()
  let n = 0
  for (const s of e.series) {
    const byScore = new Map<number, number[]>()
    for (const t of s.shots) {
      n++
      if (e.source !== 'sheet' || pointOf(t) === null) continue
      const key = Math.round(t.v * 10)
      byScore.set(key, [...(byScore.get(key) ?? []), n])
    }
    for (const same of byScore.values()) if (same.length > 1) for (const k of same) out.set(k, same.filter((m) => m !== k))
  }
  return out
}

/** "shot 9", "shots 9 and 12", "shots 3, 9 and 12": the shots one may be swapped with, in words. */
export function swapWords(swapWith: readonly number[]): string {
  const list = swapWith.map(String)
  if (list.length <= 1) return `shot ${list[0] ?? ''}`.trim()
  return `shots ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
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
