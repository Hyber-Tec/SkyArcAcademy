import { describe, expect, it } from 'vitest'
import { type Mat3, applyH, fitEllipse, fitHomography } from './geometry'
import { type CardReview, type ReviewBull, bullState, changeShotsPerBull, closeCall, placeShot, placedShot, removeShot, reviewFromShots, reviewShots, reviewTotals, startReview, takeExtra, typeScores } from './review'
import { scanCard } from './scan'
import { MISS_BEYOND_MM, scoreAt } from './score'
import { type SyntheticShot, drawSyntheticCard } from './synthetic'

describe('scoreAt (ISSF: the hole touching a ring counts it)', () => {
  it('scores whole rings with the 4.5 mm pellet touching the line', () => {
    expect(scoreAt(0)).toEqual({ value: 10, decimal: 10.9 })
    expect(scoreAt(2.5)).toEqual({ value: 10, decimal: 10 })
    expect(scoreAt(2.51).value).toBe(9)
    expect(scoreAt(5).value).toBe(9)
    expect(scoreAt(10).value).toBe(7)
    expect(scoreAt(10.01).value).toBe(6)
    expect(scoreAt(MISS_BEYOND_MM)).toEqual({ value: 1, decimal: 1 })
    expect(scoreAt(MISS_BEYOND_MM + 0.01)).toEqual({ value: 0, decimal: 0 })
  })

  it('gives the electronic decimal for the same point', () => {
    expect(scoreAt(0.3).decimal).toBe(10.8)
    expect(scoreAt(6).decimal).toBe(8.6)
  })
})

describe('geometry', () => {
  it('fits a homography that maps the points back', () => {
    const H: Mat3 = [1.2, 0.1, 30, -0.05, 0.9, 12, 0.0004, -0.0002, 1]
    const from = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 0, y: 80 },
      { x: 100, y: 80 },
      { x: 50, y: 40 },
    ]
    const fitted = fitHomography(from, from.map((p) => applyH(H, p)))!
    for (const p of [{ x: 25, y: 60 }, { x: 90, y: 10 }]) {
      const a = applyH(H, p)
      const b = applyH(fitted, p)
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6)
    }
  })

  it('fits an ellipse to points on one', () => {
    const xs: number[] = []
    const ys: number[] = []
    for (let k = 0; k < 40; k++) {
      const t = (k / 40) * Math.PI * 2
      xs.push(200 + 50 * Math.cos(t) * Math.cos(0.3) - 35 * Math.sin(t) * Math.sin(0.3))
      ys.push(100 + 50 * Math.cos(t) * Math.sin(0.3) + 35 * Math.sin(t) * Math.cos(0.3))
    }
    const e = fitEllipse(xs, ys, { x: 205, y: 98 }, 40)!
    expect(e.cx).toBeCloseTo(200, 6)
    expect(e.cy).toBeCloseTo(100, 6)
    expect(e.a).toBeCloseTo(50, 6)
    expect(e.b).toBeCloseTo(35, 6)
    expect(e.angle).toBeCloseTo(0.3, 6)
  })
})

/** Ten shots, one per record bull, clear of the ring lines so their scores are certain. */
const SHOTS: SyntheticShot[] = [
  { bull: 1, x: 1.2, y: 0.4, look: 'wall' },
  { bull: 2, x: -3.4, y: 1.1, look: 'fibres' },
  { bull: 3, x: 5.8, y: -2.9, look: 'wall' },
  { bull: 4, x: -1.0, y: -8.6, look: 'fibres' },
  { bull: 5, x: 11.3, y: 0.9, look: 'wall' },
  { bull: 6, x: -6.1, y: 6.4, look: 'fibres' },
  { bull: 7, x: 0.6, y: 16.2, look: 'wall' },
  { bull: 8, x: 4.4, y: 3.6, look: 'fibres' },
  { bull: 9, x: -13.6, y: -4.1, look: 'wall' },
  { bull: 10, x: 1.6, y: -0.9, look: 'fibres' },
]

function recordShots(scan: ReturnType<typeof scanCard>) {
  return scan.bulls
    .filter((b) => b.kind === 'record')
    .sort((p, q) => p.n - q.n)
    .map((b) => ({ n: b.n, found: b.found, shots: b.shots }))
}

describe('scanCard on a made-up photo of the card', () => {
  it('finds every bull and every shot, and scores them', () => {
    const img = drawSyntheticCard({ width: 1000, height: 1333, shots: SHOTS, tilt: { x: 0.0002, y: -0.0002 }, turnDeg: 3, ink: true })
    const scan = scanCard(img)
    expect(scan.ok).toBe(true)
    expect(scan.shotsPerBull).toBe(1)
    expect(scan.bulls.filter((b) => b.found)).toHaveLength(12)
    for (const b of recordShots(scan)) {
      const want = SHOTS.find((s) => s.bull === b.n)!
      expect(b.shots, `bull ${b.n}`).toHaveLength(1)
      const got = b.shots[0]
      expect(Math.hypot(got.x - want.x, got.y - want.y), `bull ${b.n}`).toBeLessThan(0.4)
      expect(got.value, `bull ${b.n}`).toBe(scoreAt(Math.hypot(want.x, want.y)).value)
    }
  })

  it('knows which bull is which with the phone held sideways or the card upside down', () => {
    for (const turnDeg of [90, 180, -90]) {
      const img = drawSyntheticCard({ width: turnDeg === 180 ? 1000 : 1333, height: turnDeg === 180 ? 1333 : 1000, shots: SHOTS, turnDeg })
      const scan = scanCard(img)
      expect(scan.ok, `turned ${turnDeg}°`).toBe(true)
      for (const b of recordShots(scan)) {
        const want = SHOTS.find((s) => s.bull === b.n)!
        expect(Math.hypot(b.shots[0].x - want.x, b.shots[0].y - want.y), `turned ${turnDeg}°, bull ${b.n}`).toBeLessThan(0.4)
      }
    }
  })

  it('counts two shots per bull when the card has them', () => {
    const second = SHOTS.map((s) => ({ ...s, x: -s.y * 0.8 + 1.5, y: s.x * 0.8 - 2.5 }))
    const img = drawSyntheticCard({ width: 1000, height: 1333, shots: [...SHOTS, ...second] })
    const scan = scanCard(img)
    expect(scan.shotsPerBull).toBe(2)
    for (const b of recordShots(scan)) expect(b.shots, `bull ${b.n}`).toHaveLength(2)
  })

  it('says a covered bull wasn’t seen, and still reads the rest', () => {
    const img = drawSyntheticCard({ width: 1000, height: 1333, shots: SHOTS, coveredBulls: [5] })
    const scan = scanCard(img)
    expect(scan.ok).toBe(true)
    const five = scan.bulls.find((b) => b.kind === 'record' && b.n === 5)!
    expect(five.found).toBe(false)
    expect(five.shots).toHaveLength(0)
    expect(recordShots(scan).filter((b) => b.found)).toHaveLength(9)
  })

  it('says why when there is no card in the photo', () => {
    const blank = drawSyntheticCard({ width: 600, height: 800, shots: [], centre: { x: -2000, y: -2000 } })
    const scan = scanCard(blank)
    expect(scan.ok).toBe(false)
    expect(scan.reason).toMatch(/No target found/)
  })
})

describe('the review of a scanned card', () => {
  const scan = scanCard(drawSyntheticCard({ width: 1000, height: 1333, shots: SHOTS.filter((s) => s.bull !== 3), coveredBulls: [5] }))
  const review = startReview(scan)

  it('starts from the scan: a bull without a hole is short, a covered one unseen', () => {
    expect(review.bulls.map((b) => b.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(bullState(review.bulls[2], 1)).toBe('missing')
    expect(bullState(review.bulls[4], 1)).toBe('unseen')
    const totals = reviewTotals(review)
    expect(totals.missing).toBe(2)
    expect(totals.shots).toBe(10)
  })

  it('places, moves and removes shots, scored by the rule', () => {
    let r = placeShot(review, 3, null, 0, 4.9)
    expect(r.bulls[2].shots).toEqual([{ x: 0, y: 4.9, value: 9, decimal: 9, confidence: 1, manual: true }])
    r = placeShot(r, 3, 0, 0, 5.1)
    expect(r.bulls[2].shots[0].value).toBe(8)
    r = removeShot(r, 3, 0)
    expect(bullState(r.bulls[2], 1)).toBe('missing')
  })

  it('takes typed scores for a bull the photo didn’t show, and counts missing shots as 0', () => {
    const r = typeScores(review, 5, [7])
    expect(bullState(r.bulls[4], 1)).toBe('ok')
    const shots = reviewShots(r)
    expect(shots).toHaveLength(10)
    expect(shots[2]).toEqual({ v: 0 })
    expect(shots[4]).toEqual({ v: 7 })
    expect(shots[0]).toMatchObject({ v: 10, x: expect.any(Number), y: expect.any(Number) })
    expect(reviewTotals(r).total).toBe(shots.reduce((n, s) => n + s.v, 0))
  })

  it('switches between one and two shots per bull', () => {
    const two = changeShotsPerBull(review, 2)
    expect(two.shotsPerBull).toBe(2)
    expect(reviewTotals(two).shots).toBe(20)
    const one = changeShotsPerBull(placeShot(two, 1, null, -3, 3), 1)
    expect(one.bulls[0].shots).toHaveLength(1)
    expect(one.bulls[0].shots[0].manual).toBe(true)
    expect(one.bulls[0].extra.length).toBeGreaterThan(0)
  })

  it('takes another mark in place of the least sure shot', () => {
    const r = placeShot(review, 1, 0, 6, 6)
    const withMark: CardReview = { ...r, bulls: r.bulls.map((b) => (b.n === 1 ? { ...b, extra: [placedShot(1, 1)] } : b)) }
    const taken = takeExtra(withMark, 1, 0)
    expect(taken.bulls[0].shots).toHaveLength(1)
    expect(taken.bulls[0].shots[0]).toMatchObject({ x: 1, y: 1, value: 10 })
    expect(taken.bulls[0].extra).toHaveLength(1)
  })
})

describe('close calls and saved cards', () => {
  it('flags a hole that only just touches its ring’s line', () => {
    // Ring 8's line is touched with the hole's centre up to 7.5 mm out.
    expect(closeCall(placedShot(0, 7.3))).toEqual({ ring: 8, byMm: 0.2 })
    expect(closeCall(placedShot(0, 7.15))).toEqual({ ring: 8, byMm: 0.35 })
    expect(closeCall(placedShot(0, 6.9))).toBeNull()
    expect(closeCall({ x: null, y: null, value: 8 })).toBeNull()
  })

  it('asks for a look at a close call the scan found, not one a person placed', () => {
    const bull = (manual: boolean): ReviewBull => ({ n: 1, found: true, center: { x: 0, y: 0 }, axes: [1, 0, 0, 1], shots: [{ ...placedShot(0, 7.4), manual }], extra: [] })
    expect(bullState(bull(false), 1)).toBe('check')
    expect(bullState(bull(true), 1)).toBe('ok')
  })

  it('rebuilds a saved card bull by bull, one or two shots each', () => {
    const one = reviewFromShots(Array.from({ length: 10 }, (_, i) => (i === 3 ? { v: 0 } : { v: 9, x: 1, y: -3 })), () => ({ center: { x: 5, y: 5 }, axes: [6, 0, 0, 6] }))
    expect(one.shotsPerBull).toBe(1)
    expect(one.bulls[3].shots).toHaveLength(0)
    expect(one.bulls[0].shots[0]).toMatchObject({ x: 1, y: -3, value: 9, saved: true })
    // A shot moved after reopening is the person's own again.
    const moved = placeShot(one, 1, 0, 0, 0).bulls[0].shots[0]
    expect(moved).toMatchObject({ value: 10, manual: true })
    expect(moved.saved).toBeUndefined()
    expect(reviewShots(one)).toHaveLength(10)
    const two = reviewFromShots(Array.from({ length: 20 }, (_, i) => ({ v: i % 2 ? 8 : 7 })), () => null)
    expect(two.shotsPerBull).toBe(2)
    expect(two.bulls[9].shots.map((s) => s.value)).toEqual([7, 8])
    expect(two.bulls[0].found).toBe(false)
    expect(reviewTotals(two).total).toBe(150)
  })
})
