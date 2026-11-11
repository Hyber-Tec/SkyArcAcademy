import { describe, expect, it } from 'vitest'
import { decodeTrace, encodeTrace } from './codec'
import { type RawSession, TRACE_RATE_HZ, buildSession, scattPositionWords, scattSessionId } from './session'
import { type RawPoint, SCATT_TARGETS, processTrace, scattDirection, scattScore } from './trace'

// Made-up traces only: an aim that settles on a point, as a sensor at 120 samples a second would give it.
const TARGET_ID = Object.keys(SCATT_TARGETS)[0]
const T = SCATT_TARGETS[TARGET_ID]

/** An aim moving from (20, 20) to (x, y) over `n` samples, then holding there (SCATT's way: y down). */
function settle(x: number, y: number, n = 600, hold = 240): RawPoint[] {
  const pts: RawPoint[] = []
  for (let i = 0; i < n; i++) {
    const k = i / n
    pts.push([20 + (x - 20) * k, 20 + (y - 20) * k, Number.NaN, -1])
  }
  for (let i = 0; i < hold; i++) pts.push([x, y, Number.NaN, -1])
  return pts
}

describe('SCATT’s arithmetic', () => {
  it('scores from the pellet’s edge, as SCATT does: 10.9 in the middle, 0 off the card', () => {
    expect(scattScore(0, 0, T, 4.5)).toBe(10.9)
    // The 10's edge (its ring, 0.5 mm, plus the pellet) is 2.5 mm out: 10.0 there, 10.5 halfway in.
    expect(scattScore(2.5, 0, T, 4.5)).toBe(10)
    expect(scattScore(1.25, 0, T, 4.5)).toBe(10.5)
    // Rings are 2.5 mm apart: 10 mm out is the 7's edge, 8.75 mm halfway into the 7.
    expect(scattScore(10, 0, T, 4.5)).toBe(7)
    expect(scattScore(8.75, 0, T, 4.5)).toBe(7.5)
    expect(scattScore(100, 0, T, 4.5)).toBe(0)
  })

  it('points the arrow the way SCATT does (y down): up, right, down, left', () => {
    expect(scattDirection(0, -5, 9.0)).toBe(1)
    expect(scattDirection(5, 0, 9.0)).toBe(3)
    expect(scattDirection(0, 5, 9.0)).toBe(5)
    expect(scattDirection(-5, 0, 9.0)).toBe(7)
    expect(scattDirection(0.1, 0, 10.9)).toBe(0)
  })

  it('smooths a still aim into the same still aim', () => {
    const still: RawPoint[] = Array.from({ length: 240 }, () => [3, -4, Number.NaN, -1] as RawPoint)
    const out = processTrace(still, 120)
    expect(out.length).toBeGreaterThan(390)
    for (const [x, y] of out.slice(10)) {
      expect(x).toBeCloseTo(3, 6)
      expect(y).toBeCloseTo(-4, 6)
    }
  })

  it('keeps a trace in hundredths of a millimetre', () => {
    const pts: [number, number][] = [
      [0, 0],
      [1.234, -5.678],
      [-40.5, 39.99],
    ]
    expect(decodeTrace(encodeTrace(pts))).toEqual([
      [0, 0],
      [1.23, -5.68],
      [-40.5, 39.99],
    ])
    expect(decodeTrace(encodeTrace([[500, -500]]))).toEqual([[327.67, -327.68]])
    expect(decodeTrace('')).toEqual([])
  })
})

describe('a session from a SCATT file', () => {
  const start = Date.UTC(2026, 9, 31, 14, 0, 0)
  const raw = (over: Partial<RawSession> = {}): RawSession => ({
    uuid: '{AAAA-1111}',
    personId: 1,
    timer: start,
    targetUuid: TARGET_ID,
    caliber: 4.5,
    caliberUnits: 6,
    position: 1,
    sampleRate: 120,
    traces: [
      // A sighter, then two match shots: the first settles in the middle, the second high and right (y down).
      { timer: start + 1000, timerEnter: start + 1500, points: settle(0, 0), shots: [{ timer: start + 8000, offset: 700, match: false, deleted: false, missed: false }] },
      { timer: start + 20000, timerEnter: start + 20500, points: settle(0.2, 0.1), shots: [{ timer: start + 27000, offset: 700, match: true, deleted: false, missed: false }] },
      { timer: start + 40000, timerEnter: start + 40800, points: settle(6, -6), shots: [{ timer: start + 47000, offset: 700, match: true, deleted: false, missed: false }] },
      // A deleted shot is left out.
      { timer: start + 60000, timerEnter: start + 60500, points: settle(1, 1), shots: [{ timer: start + 67000, offset: 700, match: true, deleted: true, missed: false }] },
    ],
    ...over,
  })
  const who = { studentId: 's1', studentName: 'Student One', fileId: 'f1', timeZone: 'America/New_York' }

  it('numbers the match shots, keeps the sighter apart, and turns places the app’s way up', () => {
    const r = buildSession(raw(), who)
    if (!('session' in r)) throw new Error('skipped')
    const { session: s, traces } = r
    expect(s).toMatchObject({ studentId: 's1', dateKey: '2026-10-31', timeMin: 10 * 60, position: 'prone', matchShots: 2, sighters: 1, uuid: '{AAAA-1111}', fileId: 'f1' })
    expect(s.shots.map((x) => [x.n, x.sighting, x.series])).toEqual([
      [null, true, null],
      [1, false, 1],
      [2, false, 1],
    ])
    const high = s.shots[2]
    // SCATT's y down is the app's y up: the shot above the centre has a positive y, and SCATT's up-right arrow.
    expect(high.x).toBeCloseTo(6, 1)
    expect(high.y).toBeCloseTo(6, 1)
    expect(high.dir).toBe(2)
    expect(s.shots[1].score).toBeGreaterThan(10.5)
    expect(s.total).toBeCloseTo(s.shots[1].score + high.score, 5)
    expect(s.series).toHaveLength(1)
    // Aiming time from entering the target: 700 samples at 120 a second, less the half second before entering.
    expect(s.shots[1].aimS).toBeCloseTo(700 / 120 - 0.5, 1)
    expect(s.shots[1].in10).toBe(100)
    expect(traces.rateHz).toBe(TRACE_RATE_HZ)
    expect(traces.shots).toHaveLength(3)
    const t = decodeTrace(traces.shots[2].xy)
    expect(traces.shots[2].t0).toBeLessThan(0)
    expect(t.length).toBeGreaterThan(100)
    // The trace ends after the shot near the shot's own place, y up.
    const last = t[t.length - 1]
    expect(last[0]).toBeCloseTo(6, 0)
    expect(last[1]).toBeCloseTo(6, 0)
  })

  it('skips a session on a target the app doesn’t know, or with no shot', () => {
    expect(buildSession(raw({ targetUuid: '{made-up}' }), who)).toEqual({ skip: 'target' })
    expect(buildSession(raw({ traces: [] }), who)).toEqual({ skip: 'noShots' })
  })

  it('names sessions by SCATT’s own id, and says when the position wasn’t set', () => {
    expect(scattSessionId('{AAAA-1111}')).toBe('scatt-aaaa-1111')
    expect(scattPositionWords(null)).toBe('Position not set in SCATT')
    expect(scattPositionWords('kneeling')).toBe('Kneeling')
  })
})
