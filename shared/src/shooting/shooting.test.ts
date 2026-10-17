import { describe, expect, it } from 'vitest'
import { evaluationPoints, paperEvaluation, per10, shotGroup, shotTotals } from './evaluation'
import { canReplay, replayShots, replayStepMs } from './replay'
import { groupSizeMm, meanPoint, offsetWords, radiusFromScore, ringRadiusMm, shotPoint, targetViewMm, wholeScore } from './target'

describe('the 10 m air rifle target', () => {
  it('places shots from their score and direction', () => {
    expect(ringRadiusMm(10)).toBe(0.25)
    expect(ringRadiusMm(4)).toBe(15.25)
    expect(radiusFromScore(10.9)).toBe(0.125)
    expect(radiusFromScore(9)).toBeCloseTo(4.875)
    expect(radiusFromScore(0)).toBeNull()
    expect(shotPoint(9, 90)?.x).toBeCloseTo(0)
    expect(shotPoint(9, 90)?.y).toBeCloseTo(4.875, 1)
    expect(shotPoint(9, null)).toBeNull()
  })

  it('measures groups like SIUS: centre to centre plus a pellet', () => {
    expect(groupSizeMm([])).toBeNull()
    expect(groupSizeMm([{ x: 1, y: 1 }])).toBe(0)
    expect(groupSizeMm([{ x: 0, y: 0 }, { x: 3, y: 4 }])).toBe(9.5)
    expect(meanPoint([{ x: 1, y: 2 }, { x: 3, y: -2 }])).toEqual({ x: 2, y: 0 })
  })

  it('scores whole numbers and names where a group sits', () => {
    expect(wholeScore(10.4)).toBe(10)
    expect(wholeScore(9.9)).toBe(9)
    expect(offsetWords({ x: -2.1, y: -1.6 })).toBe('low left')
    expect(offsetWords({ x: 0.4, y: 2 })).toBe('high')
    expect(offsetWords({ x: 0.4, y: -1 })).toBeNull()
  })
})

describe('evaluations', () => {
  it('compares results of any length per 10 shots', () => {
    expect(per10(192, 20)).toBe(96)
    expect(per10(87, 10)).toBe(87)
    expect(per10(0, 0)).toBeNull()
  })

  it('totals decimal shots, whole scores and inner tens', () => {
    const shots = [10.4, 9.9, 10.2, 8.0].map((v) => ({ v, a: 0 }))
    expect(shotTotals(shots)).toEqual({ total: 38.5, wholeTotal: 37, innerTens: 2 })
    expect(shotGroup([{ v: 10, a: 0 }, { v: 10, a: 180 }]).groupMm).toBeCloseTo(9.25, 0)
  })

  it('makes a paper card from its shots, or from its total alone', () => {
    const card = paperEvaluation({ studentId: 's', studentName: 'S', position: 'prone', dateKey: '2026-10-01', shots: [9, 10, 8, 9, 9, 10, 7, 9, 8, 9], total: null, fileId: null, note: '' })
    expect(card).toMatchObject({ source: 'paper', shots: 10, total: 88, wholeTotal: 88, innerTens: null })
    expect(card.series[0].shots).toHaveLength(10)
    const totalOnly = paperEvaluation({ studentId: 's', studentName: 'S', position: 'standing', dateKey: '2026-10-01', shots: null, total: 76, fileId: null, note: '' })
    expect(totalOnly).toMatchObject({ shots: 10, total: 76, series: [] })
  })

  it('keeps a scanned card’s shot places, with their direction, MPI and group', () => {
    const card = paperEvaluation({ studentId: 's', studentName: 'S', position: 'prone', dateKey: '2026-10-01', shots: [{ v: 10, x: 1, y: 0 }, { v: 9, x: -1, y: 3 }, 8], total: null, fileId: null, note: '' })
    expect(card.total).toBe(27)
    expect(card.series[0].shots).toEqual([{ v: 10, a: 0, x: 1, y: 0 }, { v: 9, a: 108.4, x: -1, y: 3 }, { v: 8, a: null }])
    expect(card.mpi).toEqual({ x: 0, y: 1.5 })
    expect(card.groupMm).toBe(8.1)
    expect(evaluationPoints(card)).toEqual([{ x: 1, y: 0 }, { x: -1, y: 3 }])
  })

  it('plays a result back shot by shot, with the running total', () => {
    const card = paperEvaluation({ studentId: 's', studentName: 'S', position: 'prone', dateKey: '2026-10-01', shots: [{ v: 10, x: 1, y: 0 }, 9, { v: 8, x: 0, y: -6 }], total: null, fileId: null, note: '' })
    expect(replayShots(card)).toEqual([
      { n: 1, series: null, value: 10, point: { x: 1, y: 0 }, running: 10 },
      { n: 2, series: null, value: 9, point: null, running: 19 },
      { n: 3, series: null, value: 8, point: { x: 0, y: -6 }, running: 27 },
    ])
    expect(canReplay(card)).toBe(true)
    expect(canReplay(paperEvaluation({ studentId: 's', studentName: 'S', position: 'prone', dateKey: '2026-10-01', shots: [10, 9], total: null, fileId: null, note: '' }))).toBe(false)
    // About twelve seconds for a whole result, never rushed nor slow.
    expect([10, 20, 40, 60].map(replayStepMs)).toEqual([700, 600, 300, 250])
  })

  it('zooms a target picture to the shots', () => {
    const full = ringRadiusMm(1) + 1.5
    // A tight group: no closer in than the 5 ring.
    expect(targetViewMm([{ x: 1, y: 1 }], 300)).toBe(ringRadiusMm(5) + 1)
    // Out to the farthest shot, with its pellet.
    expect(targetViewMm([{ x: 0, y: -16 }], 300)).toBeCloseTo(16 + 2.25 + 0.8)
    // The whole target: asked for, a shot near the edge, or a small picture.
    expect(targetViewMm([{ x: 1, y: 1 }], 300, 'full')).toBe(full)
    expect(targetViewMm([{ x: 22, y: 0 }], 300)).toBe(full)
    expect(targetViewMm([{ x: 1, y: 1 }], 100)).toBe(full)
  })
})

