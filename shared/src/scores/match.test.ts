import { describe, expect, it } from 'vitest'
import { type MatchResult, matchResults, matchTotal, seriesInnerTens, seriesLabel, seriesTotalText } from './match'
import { sheetSeriesOf } from './sheetSave'

const shots = (vs: number[]) => vs.map((v) => ({ v, a: null }))
const result = (id: string, position: MatchResult['position'], values: number[][], extra: Partial<MatchResult> = {}): MatchResult => {
  const all = values.flat()
  const whole = all.reduce((n, v) => n + Math.floor(v), 0)
  return {
    id,
    source: 'sheet',
    position,
    dateKey: '2026-08-22',
    shots: all.length,
    total: whole,
    wholeTotal: whole,
    innerTens: all.filter((v) => v >= 10.2).length,
    series: values.map((vs, i) => ({ n: i + 1, total: Math.round(vs.reduce((n, v) => n + v, 0) * 10) / 10, shots: shots(vs), mpi: null, groupMm: null })),
    match: { name: 'Made-up Open', course: '3x20' },
    ...extra,
  }
}

describe('a match from its results sheet', () => {
  const k = result('k', 'kneeling', [[9.3, 7.4, 10.6, 8.1, 9.8, 10.2, 8.5, 7.9, 9.0, 9.7]])
  const s = result('s', 'standing', [[5.8, 10.4, 6.1, 7.7, 4.9, 6.6, 8.3, 7.0, 5.5, 6.4]])
  const p = result('p', 'prone', [[10.5, 9.4, 10.3, 8.6, 10.9, 9.1, 8.8, 9.5, 10.0, 9.9]])
  const other = result('o', 'prone', [[9, 9, 9, 9, 9, 9, 9, 9, 9, 9]], { match: { name: 'Another match', course: '' } })

  it('takes the results of the same sheet together, in the sheet’s order', () => {
    expect(matchResults(s, [s, other, p, k]).map((r) => r.id)).toEqual(['k', 'p', 's'])
  })

  it('counts a whole-number match in whole numbers, and its inner tens', () => {
    expect(matchTotal([k, p, s])).toEqual({ total: k.total + p.total + s.total, innerTens: 2 + 3 + 1, whole: true })
    expect(seriesTotalText(k.series[0], true)).toBe('86')
    expect(seriesInnerTens(k.series[0])).toBe(2)
  })

  it('names a series by its shots, as the sheet does', () => {
    expect(seriesLabel('kneeling', k.series[0])).toBe('K1–K10')
    expect(seriesLabel('prone', { n: 2, shots: shots([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) })).toBe('P11–P20')
  })
})

describe('saving a sheet’s shots with their places', () => {
  it('gives each shot its place and direction, and each series its printed centre', () => {
    const values = [9.4, 10.1, 8.7, 9.9, 10.4, 8.2, 9.0, 9.6, 10.0, 8.8, 7.5, 9.3]
    const points = values.map((_, i) => ({ x: i === 0 ? 0 : 1, y: i === 0 ? 2 : 0 }))
    const series = sheetSeriesOf(values, { points, centres: [{ x: 0.5, y: -0.25 }, null] })
    expect(series.map((s) => s.shots.length)).toEqual([10, 2])
    expect(series[0].shots[0]).toEqual({ v: 9.4, a: 90, x: 0, y: 2 })
    expect(series[0].mpi).toEqual({ x: 0.5, y: -0.25 })
    expect(series[1].mpi).toBeNull()
  })

  it('keeps the scores alone when the places don’t fit', () => {
    const series = sheetSeriesOf([9.1, 9.2], { points: [{ x: 1, y: 1 }], centres: [] })
    expect(series[0].shots).toEqual([{ v: 9.1, a: null }, { v: 9.2, a: null }])
  })
})
