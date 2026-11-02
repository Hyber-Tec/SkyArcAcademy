import { describe, expect, it } from 'vitest'
import { halves, halvesChange, trendLevel } from '../reports/facts'
import { positionSummaries } from './summary'

// Made-up results: whole totals over their shots (per 10 shots in brackets).
const r = (id: string, position: 'standing' | 'kneeling' | 'prone', dateKey: string, wholeTotal: number, shots = 10, timeMin: number | null = null) => ({ id, position, dateKey, wholeTotal, shots, timeMin })

describe('each position at a glance', () => {
  it('gives the average over every shot, the best, the count and the line in date order', () => {
    const [prone] = positionSummaries([
      r('p3', 'prone', '2026-09-15', 85),
      r('p1', 'prone', '2026-09-01', 82),
      r('p2', 'prone', '2026-09-08', 170, 20), // 85 per 10, twice the shots of a card
    ])
    expect(prone.position).toBe('prone')
    expect(prone.results).toBe(3)
    expect(prone.average).toBe(84.3) // (82 + 170 + 85) / 40 shots × 10
    expect(prone.best).toEqual({ id: 'p2', per10: 85, dateKey: '2026-09-08' })
    expect(prone.latest?.id).toBe('p3')
    expect(prone.line).toEqual([82, 85, 85])
  })

  it('orders a day’s results by their time', () => {
    const [s] = positionSummaries([r('b', 'standing', '2026-09-01', 72, 10, 1100), r('a', 'standing', '2026-09-01', 70, 10, 1000)])
    expect(s.line).toEqual([70, 72])
  })

  it('leaves out positions without results and results without shots', () => {
    const list = positionSummaries([r('k', 'kneeling', '2026-09-01', 0, 0), r('s', 'standing', '2026-09-02', 74)])
    expect(list.map((p) => p.position)).toEqual(['standing'])
  })

  it('has no trend with one result', () => {
    expect(positionSummaries([r('s', 'standing', '2026-09-02', 74)])[0].trend).toBeNull()
  })

  it('sets the newer half of the results against the older half, as the reports do', () => {
    const rising = positionSummaries([r('a', 'standing', '2026-09-01', 70), r('b', 'standing', '2026-09-02', 72), r('c', 'standing', '2026-09-03', 74), r('d', 'standing', '2026-09-04', 76)])[0]
    expect(rising.trend).toEqual({ level: 'improving', change: 4, newer: 75, older: 71, size: 2 })

    // An odd number: the middle result is in neither half.
    const flat = positionSummaries([r('a', 'prone', '2026-09-01', 80), r('b', 'prone', '2026-09-02', 60), r('c', 'prone', '2026-09-03', 80)])[0]
    expect(flat.trend).toMatchObject({ level: 'steady', change: 0, size: 1 })

    const falling = positionSummaries([r('a', 'kneeling', '2026-09-01', 90), r('b', 'kneeling', '2026-09-02', 88), r('c', 'kneeling', '2026-09-03', 85), r('d', 'kneeling', '2026-09-04', 84)])[0]
    expect(falling.trend).toMatchObject({ level: 'dipping', change: -4.5 })
  })
})

describe('the reports’ trend rule', () => {
  it('calls +1 or more improving, −1.5 or less dipping, and anything between steady', () => {
    expect(trendLevel(1)).toBe('improving')
    expect(trendLevel(0.9)).toBe('steady')
    expect(trendLevel(-1.4)).toBe('steady')
    expect(trendLevel(-1.5)).toBe('dipping')
  })

  it('needs two results', () => {
    expect(halves([{ wholePer10: 80 }])).toBeNull()
    expect(halvesChange([{ wholePer10: 80 }, { wholePer10: 83.5 }])).toBe(3.5)
  })
})
