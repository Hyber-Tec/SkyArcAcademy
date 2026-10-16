import type { PaperShot } from '../shooting/evaluation'
import type { Vec } from './geometry'
import type { CardScan, ScannedBull, ScannedShot } from './scan'
import { scoreAt } from './score'

/**
 * The phone app's review of a scanned card: what the scan found, which a person then checks bull by bull (move a
 * shot, add or remove one, take another mark instead, or type the score of a bull the photo didn't show) before it is
 * saved. Pure functions over plain data, so the screen stays simple and every change is tested here.
 */

export interface ReviewShot {
  /** Millimetres from the bull's centre, x right and y up; null for a score typed in without a place. */
  x: number | null
  y: number | null
  value: number
  decimal: number | null
  /** How sure the scan was, 0 to 1; 1 for a shot a person placed or typed. */
  confidence: number
  /** Placed, moved or typed by a person. */
  manual: boolean
}

export interface ReviewBull {
  n: number
  /** Whether the photo showed the bull: one it didn't (covered, cut off) can only take typed scores. */
  found: boolean
  center: Vec
  axes: ScannedBull['axes']
  shots: ReviewShot[]
  /** Other marks that looked like holes, for the person to take instead. */
  extra: ReviewShot[]
}

export interface CardReview {
  bulls: ReviewBull[]
  shotsPerBull: number
}

/** How a bull stands: fine, worth a look, short of shots (they count as misses), or not seen and not typed. */
export type BullState = 'ok' | 'check' | 'missing' | 'unseen'

/** A shot the scan is sure enough about to need no look. */
export const SURE = 0.6

function fromScan(s: ScannedShot): ReviewShot {
  return { x: s.x, y: s.y, value: s.value, decimal: s.decimal, confidence: s.confidence, manual: false }
}

/** A shot a person placed at (x, y), scored by the rule. */
export function placedShot(x: number, y: number): ReviewShot {
  const px = Math.round(x * 100) / 100
  const py = Math.round(y * 100) / 100
  const { value, decimal } = scoreAt(Math.sqrt(px * px + py * py))
  return { x: px, y: py, value, decimal, confidence: 1, manual: true }
}

export function startReview(scan: CardScan): CardReview {
  const bulls = scan.bulls
    .filter((b) => b.kind === 'record')
    .sort((a, b) => a.n - b.n)
    .map((b) => ({ n: b.n, found: b.found, center: b.center, axes: b.axes, shots: b.shots.map(fromScan), extra: b.extra.map(fromScan) }))
  return { bulls, shotsPerBull: scan.shotsPerBull }
}

/** A review with nothing found, for typing a card's scores bull by bull (a photo the scan couldn't read). */
export function typedReview(shotsPerBull = 1): CardReview {
  return {
    shotsPerBull,
    bulls: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, found: false, center: { x: 0, y: 0 }, axes: [1, 0, 0, 1] as ScannedBull['axes'], shots: [], extra: [] })),
  }
}

export function bullState(b: ReviewBull, shotsPerBull: number): BullState {
  if (!b.found && !b.shots.length) return 'unseen'
  if (b.shots.length < shotsPerBull) return 'missing'
  if (b.extra.length || b.shots.some((s) => s.confidence < SURE)) return 'check'
  return 'ok'
}

function withBull(r: CardReview, n: number, change: (b: ReviewBull) => ReviewBull): CardReview {
  return { ...r, bulls: r.bulls.map((b) => (b.n === n ? change(b) : b)) }
}

/**
 * Puts a shot at (x, y) mm on bull `n`: moves shot `index`, or with no index adds one (while the bull is short of
 * shots) or else moves the shot nearest to the point.
 */
export function placeShot(r: CardReview, n: number, index: number | null, x: number, y: number): CardReview {
  return withBull(r, n, (b) => {
    const shot = placedShot(x, y)
    if (index !== null && index >= 0 && index < b.shots.length) return { ...b, shots: b.shots.map((s, i) => (i === index ? shot : s)) }
    if (b.shots.length < r.shotsPerBull) return { ...b, shots: [...b.shots, shot] }
    let nearest = 0
    let best = Infinity
    b.shots.forEach((s, i) => {
      const d = s.x === null || s.y === null ? Infinity : (s.x - x) ** 2 + (s.y - y) ** 2
      if (d < best) {
        best = d
        nearest = i
      }
    })
    return { ...b, shots: b.shots.map((s, i) => (i === nearest ? shot : s)) }
  })
}

/** Takes a shot off bull `n` (a hole that isn't one); the bull is then short of a shot, which counts as a miss. */
export function removeShot(r: CardReview, n: number, index: number): CardReview {
  return withBull(r, n, (b) => ({ ...b, shots: b.shots.filter((_, i) => i !== index) }))
}

/** Takes another mark as a shot: added while the bull is short, otherwise in place of its least sure shot. */
export function takeExtra(r: CardReview, n: number, extraIndex: number): CardReview {
  return withBull(r, n, (b) => {
    const mark = b.extra[extraIndex]
    if (!mark) return b
    const taken = { ...mark, confidence: 1, manual: true }
    const extra = b.extra.filter((_, i) => i !== extraIndex)
    if (b.shots.length < r.shotsPerBull) return { ...b, shots: [...b.shots, taken], extra }
    let weakest = 0
    b.shots.forEach((s, i) => {
      if (s.confidence < b.shots[weakest].confidence) weakest = i
    })
    return { ...b, shots: b.shots.map((s, i) => (i === weakest ? taken : s)), extra: [...extra, b.shots[weakest]] }
  })
}

/** Scores typed in for a bull (whole numbers), without places: for one the photo didn't show well. */
export function typeScores(r: CardReview, n: number, values: number[]): CardReview {
  return withBull(r, n, (b) => ({
    ...b,
    shots: values.slice(0, r.shotsPerBull).map((v) => ({ x: null, y: null, value: Math.max(0, Math.min(10, Math.round(v))), decimal: null, confidence: 1, manual: true })),
  }))
}

/** One or two shots per bull: extra shots move to the marks, and marks fill a bull that's now short. */
export function changeShotsPerBull(r: CardReview, shotsPerBull: number): CardReview {
  const k = Math.max(1, Math.min(3, Math.round(shotsPerBull)))
  return {
    shotsPerBull: k,
    bulls: r.bulls.map((b) => {
      const all = [...b.shots, ...b.extra]
      const placed = all.filter((s) => s.x !== null).sort((p, q) => Number(q.manual) - Number(p.manual) || q.confidence - p.confidence)
      const typed = b.shots.filter((s) => s.x === null)
      const shots = [...typed, ...placed].slice(0, k)
      return { ...b, shots, extra: placed.filter((s) => !shots.includes(s)) }
    }),
  }
}

export interface ReviewTotals {
  /** Every counted shot's whole score (a missing shot counts 0). */
  total: number
  /** Shots the card should have (bulls × shots per bull). */
  shots: number
  /** Shots no hole was found for: they count as misses. */
  missing: number
  /** Bulls worth a look before saving. */
  toCheck: number
}

export function reviewTotals(r: CardReview): ReviewTotals {
  let total = 0
  let missing = 0
  let toCheck = 0
  for (const b of r.bulls) {
    total += b.shots.reduce((n, s) => n + s.value, 0)
    missing += Math.max(0, r.shotsPerBull - b.shots.length)
    if (bullState(b, r.shotsPerBull) !== 'ok') toCheck++
  }
  return { total, shots: r.bulls.length * r.shotsPerBull, missing, toCheck }
}

/** The card's shots for its evaluation, bull by bull: each placed or typed shot, and a 0 for each one missing. */
export function reviewShots(r: CardReview): PaperShot[] {
  const out: PaperShot[] = []
  for (const b of r.bulls) {
    for (const s of b.shots.slice(0, r.shotsPerBull)) out.push(s.x === null || s.y === null ? { v: s.value } : { v: s.value, x: s.x, y: s.y })
    for (let k = b.shots.length; k < r.shotsPerBull; k++) out.push({ v: 0 })
  }
  return out
}
