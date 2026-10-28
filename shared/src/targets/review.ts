import type { EvalShot, PaperShot } from '../shooting/evaluation'
import { ringRadiusMm } from '../shooting/target'
import type { Vec } from './geometry'
import { medianOf } from './image'
import type { CardScan, ScannedBull, ScannedShot } from './scan'
import { PELLET_RADIUS_MM, scoreHole } from './score'

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
  /** As a saved card has it (reopened to change it), until it's moved. */
  saved?: boolean
  /**
   * The hole's radius (mm) it is scored with: as the scan measured it, kept when the shot is moved. Null or missing for
   * a typed score, or a card saved before holes were measured: the card's `holeRadius` stands in.
   */
  radius?: number | null
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
  /**
   * The card's usual hole radius (mm): a shot a person adds is taken at this size, and so is one without its own.
   * Missing on a review made before holes were measured: the pellet's.
   */
  holeRadius?: number
}

/** How a bull stands: fine, worth a look, short of shots (they count as misses), or not seen and not typed. */
export type BullState = 'ok' | 'check' | 'missing' | 'unseen'

/** A shot the scan is sure enough about to need no look. */
export const SURE = 0.6

function fromScan(s: ScannedShot): ReviewShot {
  return { x: s.x, y: s.y, value: s.value, decimal: s.decimal, confidence: s.confidence, manual: false, radius: s.radius }
}

/** The radius a shot is drawn and scored with: its own, else the card's usual one, else the pellet's. */
export function holeRadiusOf(s: Pick<ReviewShot, 'radius'>, r?: Pick<CardReview, 'holeRadius'> | null): number {
  return s.radius ?? r?.holeRadius ?? PELLET_RADIUS_MM
}

/** A shot a person placed at (x, y), scored by the rule with its hole's radius (the pellet's when not given). */
export function placedShot(x: number, y: number, radius: number = PELLET_RADIUS_MM): ReviewShot {
  const px = Math.round(x * 100) / 100
  const py = Math.round(y * 100) / 100
  const { value, decimal } = scoreHole(Math.sqrt(px * px + py * py), radius)
  return { x: px, y: py, value, decimal, confidence: 1, manual: true, radius }
}

export function startReview(scan: CardScan): CardReview {
  const bulls = scan.bulls
    .filter((b) => b.kind === 'record')
    .sort((a, b) => a.n - b.n)
    .map((b) => ({ n: b.n, found: b.found, center: b.center, axes: b.axes, shots: b.shots.map(fromScan), extra: b.extra.map(fromScan) }))
  return { bulls, shotsPerBull: scan.shotsPerBull, holeRadius: scan.holeRadius ?? PELLET_RADIUS_MM }
}

/** A review with nothing found, for typing a card's scores bull by bull (a photo the scan couldn't read). */
export function typedReview(shotsPerBull = 1): CardReview {
  return {
    shotsPerBull,
    bulls: Array.from({ length: 10 }, (_, i) => ({ n: i + 1, found: false, center: { x: 0, y: 0 }, axes: [1, 0, 0, 1] as ScannedBull['axes'], shots: [], extra: [] })),
    holeRadius: PELLET_RADIUS_MM,
  }
}

/**
 * A close call: a hole whose edge only just touches its ring's line (by less than this), so the ring counts while a
 * person may see the hole short of the line. Worth a look: a hole's place and size read from a photo can be off by up
 * to about 0.3 mm, so closer than this the photo alone can't settle it.
 */
export const CLOSE_MM = 0.4

/**
 * The close call a placed shot is, if any: the ring whose line its hole only just touches, and by how much (mm). The
 * hole is taken at its own size (`holeRadiusOf`), as it was scored.
 */
export function closeCall(s: Pick<ReviewShot, 'x' | 'y' | 'value' | 'radius'>, r?: Pick<CardReview, 'holeRadius'> | null): { ring: number; byMm: number } | null {
  if (s.x === null || s.y === null || s.value < 1) return null
  const touch = ringRadiusMm(s.value) + holeRadiusOf(s, r) - Math.sqrt(s.x * s.x + s.y * s.y)
  return touch < CLOSE_MM ? { ring: s.value, byMm: Math.max(0, Math.round(touch * 100) / 100) } : null
}

export function bullState(b: ReviewBull, shotsPerBull: number, r?: Pick<CardReview, 'holeRadius'> | null): BullState {
  if (!b.found && !b.shots.length) return 'unseen'
  if (b.shots.length < shotsPerBull) return 'missing'
  if (b.extra.length || b.shots.some((s) => (s.confidence < SURE && !s.manual) || (!s.manual && closeCall(s, r)))) return 'check'
  return 'ok'
}

/**
 * A saved paper card back as a review, to look at and correct: its shots are kept bull by bull (each bull's shots, a
 * missing one as a 0 without a place), so one or two shots per bull come back where they were, with the scores and
 * hole sizes they were saved with (a card saved before holes were measured keeps its scores, its holes taken at the
 * pellet's size). Where the bulls are drawn is the caller's (`place`: the bull's centre and millimetre axes on the
 * picture shown, or null without one).
 */
export function reviewFromShots(shots: readonly Pick<EvalShot, 'v' | 'x' | 'y' | 'r'>[], place: (n: number) => { center: Vec; axes: ScannedBull['axes'] } | null): CardReview {
  const perBull = shots.length >= 20 && shots.length % 10 === 0 ? shots.length / 10 : 1
  const sizes = shots.flatMap((t) => (typeof t.r === 'number' && t.r > 0 ? [t.r] : []))
  const holeRadius = sizes.length ? Math.round(medianOf(sizes) * 100) / 100 : PELLET_RADIUS_MM
  const bulls: ReviewBull[] = Array.from({ length: 10 }, (_, i) => {
    const n = i + 1
    const at = place(n)
    const own = shots.slice(i * perBull, (i + 1) * perBull)
    const kept = own
      .filter((t) => (typeof t.x === 'number' && typeof t.y === 'number') || t.v > 0)
      .map((t): ReviewShot => {
        const placed = typeof t.x === 'number' && typeof t.y === 'number'
        const radius = placed && typeof t.r === 'number' && t.r > 0 ? t.r : null
        const decimal = placed ? scoreHole(Math.sqrt((t.x as number) ** 2 + (t.y as number) ** 2), radius ?? PELLET_RADIUS_MM).decimal : null
        return { x: placed ? (t.x as number) : null, y: placed ? (t.y as number) : null, value: t.v, decimal, confidence: 1, manual: true, saved: true, radius }
      })
    return { n, found: !!at, center: at?.center ?? { x: 0, y: 0 }, axes: at?.axes ?? [1, 0, 0, 1], shots: kept, extra: [] }
  })
  return { bulls, shotsPerBull: perBull, holeRadius }
}

function withBull(r: CardReview, n: number, change: (b: ReviewBull) => ReviewBull): CardReview {
  return { ...r, bulls: r.bulls.map((b) => (b.n === n ? change(b) : b)) }
}

/**
 * Puts a shot at (x, y) mm on bull `n`: moves shot `index`, or with no index adds one (while the bull is short of
 * shots) or else moves the shot nearest to the point. A moved shot keeps its hole's size; an added one takes the card's.
 */
export function placeShot(r: CardReview, n: number, index: number | null, x: number, y: number): CardReview {
  const added = r.holeRadius ?? PELLET_RADIUS_MM
  return withBull(r, n, (b) => {
    const moved = (s: ReviewShot) => placedShot(x, y, s.x === null ? added : holeRadiusOf(s, r))
    if (index !== null && index >= 0 && index < b.shots.length) return { ...b, shots: b.shots.map((s, i) => (i === index ? moved(s) : s)) }
    if (b.shots.length < r.shotsPerBull) return { ...b, shots: [...b.shots, placedShot(x, y, added)] }
    let nearest = 0
    let best = Infinity
    b.shots.forEach((s, i) => {
      const d = s.x === null || s.y === null ? Infinity : (s.x - x) ** 2 + (s.y - y) ** 2
      if (d < best) {
        best = d
        nearest = i
      }
    })
    return { ...b, shots: b.shots.map((s, i) => (i === nearest ? moved(s) : s)) }
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
    ...r,
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
    if (bullState(b, r.shotsPerBull, r) !== 'ok') toCheck++
  }
  return { total, shots: r.bulls.length * r.shotsPerBull, missing, toCheck }
}

/**
 * The card's shots for its evaluation, bull by bull: each placed or typed shot, and a 0 for each one missing. A placed
 * shot keeps its hole's radius, so the card reopens scored and drawn as it was saved.
 */
export function reviewShots(r: CardReview): PaperShot[] {
  const out: PaperShot[] = []
  for (const b of r.bulls) {
    for (const s of b.shots.slice(0, r.shotsPerBull)) out.push(s.x === null || s.y === null ? { v: s.value } : { v: s.value, x: s.x, y: s.y, r: Math.round(holeRadiusOf(s, r) * 100) / 100 })
    for (let k = b.shots.length; k < r.shotsPerBull; k++) out.push({ v: 0 })
  }
  return out
}
