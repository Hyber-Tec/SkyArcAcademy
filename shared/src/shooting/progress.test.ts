import { describe, expect, it } from 'vitest'
import { personalBestIds, positionProgress } from './progress'

// Made-up results: whole totals over their shots (per 10 shots in brackets).
const r = (id: string, position: 'standing' | 'kneeling' | 'prone', dateKey: string, wholeTotal: number, shots = 10, timeMin: number | null = null) => ({ id, position, dateKey, wholeTotal, shots, timeMin })

describe('a student’s progress by position', () => {
  const results = [
    r('p1', 'prone', '2026-09-01', 82), // 82
    r('p2', 'prone', '2026-09-08', 170, 20), // 85
    r('p3', 'prone', '2026-09-15', 85), // 85, a tie
    r('p4', 'prone', '2026-09-22', 91), // 91
    r('s1', 'standing', '2026-09-03', 70),
    r('s2', 'standing', '2026-09-10', 68),
    r('k0', 'kneeling', '2026-09-05', 0, 0), // no shots: not counted
  ]

  it('gives each position with results its count, average, best and latest', () => {
    const p = positionProgress(results)
    expect(p.map((x) => x.position)).toEqual(['standing', 'prone'])
    const prone = p.find((x) => x.position === 'prone')!
    expect(prone.results).toBe(4)
    expect(prone.average).toBe(85.6) // (82 + 170 + 85 + 91) / 50 shots × 10
    expect(prone.best).toEqual({ id: 'p4', per10: 91, dateKey: '2026-09-22' })
    expect(prone.latest).toEqual({ id: 'p4', per10: 91, dateKey: '2026-09-22' })
    const standing = p.find((x) => x.position === 'standing')!
    expect(standing.best?.id).toBe('s1')
    expect(standing.latest?.id).toBe('s2')
  })

  it('keeps the earliest of tied bests', () => {
    const p = positionProgress([r('a', 'prone', '2026-09-01', 90), r('b', 'prone', '2026-09-02', 90)])
    expect(p[0].best?.id).toBe('a')
  })

  it('marks a result that beat every earlier one in its position, never the first or a tie', () => {
    expect([...personalBestIds(results)].sort()).toEqual(['p2', 'p4'])
  })

  it('reads results in the order they were shot, whatever order they come in', () => {
    const shuffled = [results[3], results[0], results[2], results[1]]
    expect([...personalBestIds(shuffled)].sort()).toEqual(['p2', 'p4'])
  })

  it('orders results of one day by their time', () => {
    const sameDay = [r('late', 'prone', '2026-09-01', 95, 10, 900), r('early', 'prone', '2026-09-01', 80, 10, 600)]
    expect([...personalBestIds(sameDay)]).toEqual(['late'])
  })

  it('has nothing to say without results', () => {
    expect(positionProgress([])).toEqual([])
    expect(personalBestIds([]).size).toBe(0)
  })
})
