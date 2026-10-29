import { describe, expect, it } from 'vitest'
import { ringRadiusMm } from '../shooting/target'
import { type Mat3, applyH, fitEllipse, fitHomography } from './geometry'
import { type CardReview, type ReviewBull, bullState, changeShotsPerBull, closeCall, holeRadiusOf, placeShot, placedShot, removeShot, reviewFromShots, reviewShots, reviewTotals, startReview, takeExtra, typeScores } from './review'
import { CARD_HOLES, scanCard } from './scan'
import { MISS_BEYOND_MM, PELLET_RADIUS_MM, scoreAt, scoreHole } from './score'
import { SYNTHETIC_HOLE_MM, type SyntheticShot, drawSyntheticCard } from './synthetic'

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

describe('scoreHole (the same rule with the hole’s own size)', () => {
  it('is scoreAt with the pellet’s size', () => {
    for (let d = 0; d <= MISS_BEYOND_MM + 1; d += 0.013) expect(scoreHole(d, PELLET_RADIUS_MM)).toEqual(scoreAt(d))
  })

  it('counts a ring when the hole’s own edge reaches its line', () => {
    // Ring 8's line is at 5.25 mm: a 2 mm hole touches it with its centre up to 7.25 mm out, a pellet's up to 7.5.
    expect(scoreHole(ringRadiusMm(8) + 2, 2).value).toBe(8)
    expect(scoreHole(ringRadiusMm(8) + 2.01, 2).value).toBe(7)
    expect(scoreHole(7.4, 2).value).toBe(7)
    expect(scoreAt(7.4).value).toBe(8)
    // A bigger hole reaches further.
    expect(scoreHole(ringRadiusMm(8) + 2.4, 2.4).value).toBe(8)
    expect(scoreHole(ringRadiusMm(1) + 1.9, 1.9).value).toBe(1)
    expect(scoreHole(ringRadiusMm(1) + 1.91, 1.9)).toEqual({ value: 0, decimal: 0 })
  })

  it('keeps the tenths and the whole score in step', () => {
    let seed = 7
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    for (let k = 0; k < 2000; k++) {
      const s = scoreHole(next() * 26, 1.5 + next())
      expect(Math.floor(s.decimal + 1e-9)).toBe(s.value)
    }
    expect(scoreHole(0, 2).decimal).toBe(10.9)
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
      expect(got.value, `bull ${b.n}`).toBe(scoreHole(Math.hypot(want.x, want.y), got.radius).value)
    }
  })

  it('measures each hole’s size, and scores it with that size', () => {
    // Clean holes of three sizes on one card, some near a ring's line: 0.15 mm short of it with their own edge (where a
    // pellet-sized circle would touch it), or 0.15 mm over it.
    const sized: SyntheticShot[] = [
      { bull: 1, x: 0, y: ringRadiusMm(8) + 1.95, radiusMm: 1.8 },
      { bull: 2, x: ringRadiusMm(7) + 2.15, y: 0, radiusMm: 2.3 },
      { bull: 3, x: -3.1, y: 2.2, radiusMm: 2.05 },
      { bull: 4, x: 0, y: -(ringRadiusMm(6) + 1.95), radiusMm: 1.8 },
      { bull: 6, x: 4.2, y: 4.2, radiusMm: 2.3 },
      { bull: 8, x: -1.2, y: -0.8, radiusMm: 2.05 },
    ]
    const scan = scanCard(drawSyntheticCard({ width: 1500, height: 2000, shots: sized }))
    expect(scan.ok).toBe(true)
    for (const want of sized) {
      const got = scan.bulls.find((b) => b.kind === 'record' && b.n === want.bull)!.shots[0]
      expect(got.radiusFrom, `bull ${want.bull}`).toBe('hole')
      expect(Math.abs(got.radius - want.radiusMm!), `bull ${want.bull}`).toBeLessThan(0.08)
      expect(Math.hypot(got.x - want.x, got.y - want.y), `bull ${want.bull}`).toBeLessThan(0.15)
      expect(got.value, `bull ${want.bull}`).toBe(scoreHole(Math.hypot(want.x, want.y), want.radiusMm).value)
    }
    // The small holes reach no further than their own edge: a pellet-sized circle would have touched the next ring.
    const one = scan.bulls.find((b) => b.kind === 'record' && b.n === 1)!.shots[0]
    expect(one.value).toBe(7)
    expect(scoreAt(Math.hypot(one.x, one.y)).value).toBe(8)
    expect(scan.holeRadiusFrom).toBe('card')
    expect(scan.holeRadius).toBeGreaterThan(1.8)
    expect(scan.holeRadius).toBeLessThan(2.3)
  })

  it('takes the card’s usual hole for one it can’t measure, and the pellet’s when too few were', () => {
    // Bull 7's two holes touch: read as one long mark and split, neither's size can be told.
    const touching: SyntheticShot[] = [...SHOTS.filter((s) => s.bull !== 7), { bull: 7, x: -4, y: 6 }, { bull: 7, x: -1.5, y: 6.3 }]
    const two = SHOTS.map((s) => ({ ...s, x: -s.y * 0.8 + 1.5, y: s.x * 0.8 - 2.5 }))
    const scan = scanCard(drawSyntheticCard({ width: 1000, height: 1333, shots: [...touching, ...two.filter((s) => s.bull !== 7)] }), { shotsPerBull: 2 })
    const seven = scan.bulls.find((b) => b.kind === 'record' && b.n === 7)!.shots
    expect(seven).toHaveLength(2)
    expect(seven.map((s) => s.radiusFrom)).toEqual(['card', 'card'])
    expect(seven.map((s) => s.radius)).toEqual([scan.holeRadius, scan.holeRadius])
    expect(scan.holeRadiusFrom).toBe('card')
    // Fewer than CARD_HOLES holes measured on the whole card: the pellet's size stands in.
    const few = scanCard(
      drawSyntheticCard({
        width: 1000,
        height: 1333,
        shots: [
          { bull: 7, x: -4, y: 6 },
          { bull: 7, x: -1.5, y: 6.3 },
        ],
      }),
      { shotsPerBull: 2 },
    )
    expect(CARD_HOLES).toBeGreaterThan(2)
    expect(few.holeRadius).toBe(PELLET_RADIUS_MM)
    expect(few.holeRadiusFrom).toBe('pellet')
    expect(few.bulls.find((b) => b.kind === 'record' && b.n === 7)!.shots.map((s) => s.radiusFrom)).toEqual(['pellet', 'pellet'])
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

describe('scanCard whatever the card lies on', () => {
  /**
   * One shot per bull from the 10 to the 1, on the black, across its edge and on the paper, clean or with torn fibres,
   * each hole's edge well inside its ring so the score is certain. A hole shows what's behind the card: lighter than
   * the black and darker than the paper on a desk, darker than the black too on a black one.
   */
  const at = (d: number, deg: number) => ({ x: Math.round(d * Math.cos((deg * Math.PI) / 180) * 100) / 100, y: Math.round(d * Math.sin((deg * Math.PI) / 180) * 100) / 100 })
  const RINGS: SyntheticShot[] = [
    { bull: 1, ...at(1.0, -37), look: 'wall' },
    { bull: 2, ...at(3.55, 135), look: 'fibres' },
    { bull: 3, ...at(6.05, 45), look: 'wall', radiusMm: 2.15 },
    { bull: 4, ...at(8.55, 180), look: 'fibres' },
    { bull: 5, ...at(11.05, -90), look: 'wall', radiusMm: 1.95 },
    { bull: 6, ...at(16.05, -45), look: 'wall' },
    { bull: 7, ...at(18.55, -135), look: 'fibres' },
    { bull: 8, ...at(21.05, 90), look: 'wall' },
    { bull: 9, ...at(23.55, 45), look: 'wall', radiusMm: 2.15 },
    { bull: 10, ...at(13.55, 135), look: 'fibres' },
  ]

  for (const background of ['white', 'brown', 'grey', 'black'] as const) {
    it(`finds and scores every hole on a ${background} background`, () => {
      const scan = scanCard(drawSyntheticCard({ width: 1000, height: 1333, shots: RINGS, background, ink: true, tilt: { x: -0.0002, y: 0.0001 }, turnDeg: -2, seed: 3 }))
      expect(scan.ok).toBe(true)
      expect(scan.shotsPerBull).toBe(1)
      expect(scan.holeRadiusFrom).toBe('card')
      for (const b of recordShots(scan)) {
        const want = RINGS.find((s) => s.bull === b.n)!
        const radius = want.radiusMm ?? SYNTHETIC_HOLE_MM
        expect(b.shots, `bull ${b.n}`).toHaveLength(1)
        const got = b.shots[0]
        expect(Math.hypot(got.x - want.x, got.y - want.y), `bull ${b.n}`).toBeLessThan(0.3)
        expect(got.value, `bull ${b.n}`).toBe(scoreHole(Math.hypot(want.x, want.y), radius).value)
        // Measured as the card shows it, torn fibres reaching a little past the hole.
        if (got.radiusFrom === 'hole') {
          expect(got.radius, `bull ${b.n}`).toBeGreaterThan(radius - 0.08)
          expect(got.radius, `bull ${b.n}`).toBeLessThan(radius + (want.look === 'fibres' ? 0.17 : 0.08))
        }
      }
      // The coaches' red marks aren't holes, even beside a brown one.
      expect(scan.bulls.flatMap((b) => b.extra)).toHaveLength(0)
    })
  }

  it('has a hole in every ring, the 10 to the 1', () => {
    expect(RINGS.map((s) => scoreHole(Math.hypot(s.x, s.y), s.radiusMm ?? SYNTHETIC_HOLE_MM).value)).toEqual([10, 9, 8, 7, 6, 4, 3, 2, 1, 5])
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

  it('carries the scan’s hole sizes', () => {
    expect(review.holeRadius).toBe(scan.holeRadius)
    expect(review.bulls[0].shots[0].radius).toBe(scan.bulls.find((b) => b.kind === 'record' && b.n === 1)!.shots[0].radius)
  })

  it('places, moves and removes shots, scored by the rule', () => {
    // An added shot takes the card's usual hole: 2 mm here, so the 9's line (2.75 mm) is touched up to 4.75 mm out.
    let r = placeShot({ ...review, holeRadius: 2 }, 3, null, 0, 4.7)
    expect(r.bulls[2].shots).toEqual([{ x: 0, y: 4.7, value: 9, decimal: 9, confidence: 1, manual: true, radius: 2 }])
    r = placeShot(r, 3, 0, 0, 4.8)
    expect(r.bulls[2].shots[0]).toMatchObject({ value: 8, radius: 2 })
    // A moved shot keeps its own hole's size, whatever the card's.
    const own: CardReview = { ...r, bulls: r.bulls.map((b) => (b.n === 3 ? { ...b, shots: [{ ...b.shots[0], radius: 2.3 }] } : b)) }
    expect(placeShot(own, 3, 0, 0, 5.0).bulls[2].shots[0]).toMatchObject({ value: 9, radius: 2.3 })
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
    expect(shots[0]).toMatchObject({ v: 10, x: expect.any(Number), y: expect.any(Number), r: review.bulls[0].shots[0].radius })
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
  it('flags a hole that only just touches its ring’s line, at the hole’s own size', () => {
    // Ring 8's line is touched with a pellet-sized hole's centre up to 7.5 mm out, with a 2 mm hole's up to 7.25.
    expect(closeCall(placedShot(0, 7.3))).toEqual({ ring: 8, byMm: 0.2 })
    expect(closeCall(placedShot(0, 7.15))).toEqual({ ring: 8, byMm: 0.35 })
    expect(closeCall(placedShot(0, 6.9))).toBeNull()
    expect(closeCall(placedShot(0, 7.05, 2))).toEqual({ ring: 8, byMm: 0.2 })
    expect(closeCall(placedShot(0, 6.8, 2))).toBeNull()
    // Without a size of its own, the card's usual one.
    expect(closeCall({ x: 0, y: 7.05, value: 8 }, { holeRadius: 2 })).toEqual({ ring: 8, byMm: 0.2 })
    expect(holeRadiusOf({}, null)).toBe(PELLET_RADIUS_MM)
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

  it('reopens a card with the sizes its holes were saved with, and keeps older cards’ scores', () => {
    const ys = [7.1, 7.11, 7.12, 7.13, 7.14, 7.15, 7.16, 7.17, 7.18, 7.19]
    const saved = reviewFromShots(ys.map((y, i) => ({ v: 8, x: 0, y, r: i < 6 ? 2 : 2.2 })), () => ({ center: { x: 5, y: 5 }, axes: [6, 0, 0, 6] }))
    expect(saved.holeRadius).toBe(2)
    expect(saved.bulls[0].shots[0]).toMatchObject({ value: 8, radius: 2, decimal: scoreHole(7.1, 2).decimal })
    expect(reviewShots(saved)[9]).toEqual({ v: 8, x: 0, y: 7.19, r: 2.2 })
    // Saved before holes were measured: the saved score stays, the hole is taken at the pellet's size.
    const older = reviewFromShots(Array.from({ length: 10 }, () => ({ v: 8, x: 0, y: 7.4 })), () => null)
    expect(older.holeRadius).toBe(PELLET_RADIUS_MM)
    expect(older.bulls[0].shots[0]).toMatchObject({ value: 8, radius: null, decimal: scoreAt(7.4).decimal })
    expect(reviewTotals(older).total).toBe(80)
  })
})
