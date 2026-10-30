import { describe, expect, it } from 'vitest'
import { type MatchResult, matchResults, matchTotal, seriesInnerTens, seriesLabel, seriesTotalText } from './match'

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
  const k = result('k', 'kneeling', [[7.2, 8.6, 10.5, 9.1, 9.9, 10.3, 8.0, 8.8, 9.4, 10.0]])
  const s = result('s', 'standing', [[6.6, 10.7, 5.2, 8.5, 4.4, 5.4, 7.9, 6.2, 6.3, 6.9]])
  const p = result('p', 'prone', [[10.2, 10.3, 8.1, 10.1, 8.4, 9.2, 8.9, 10.8, 9.9, 8.9]])
  const other = result('o', 'prone', [[9, 9, 9, 9, 9, 9, 9, 9, 9, 9]], { match: { name: 'Another match', course: '' } })

  it('takes the results of the same sheet together, in the sheet’s order', () => {
    expect(matchResults(s, [s, other, p, k]).map((r) => r.id)).toEqual(['k', 'p', 's'])
  })

  it('counts a whole-number match in whole numbers, and its inner tens', () => {
    expect(matchTotal([k, p, s])).toEqual({ total: k.total + p.total + s.total, innerTens: 2 + 3 + 1, whole: true })
    expect(seriesTotalText(k.series[0], true)).toBe('88')
    expect(seriesInnerTens(k.series[0])).toBe(2)
  })

  it('names a series by its shots, as the sheet does', () => {
    expect(seriesLabel('kneeling', k.series[0])).toBe('K1–K10')
    expect(seriesLabel('prone', { n: 2, shots: shots([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) })).toBe('P11–P20')
  })
})
