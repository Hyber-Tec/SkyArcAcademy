import { describe, expect, it } from 'vitest'
import { type Evaluation, type Position, paperEvaluation } from '../shooting/evaluation'
import { comparablePositions, compareFacts, compareModes, comparePair, innerTensPct, latestComparablePosition, positionPoints } from './compare'
import { toPoint } from './facts'

// Made-up results: a SIUS result from its decimal shots (inner tens from 10.2), and a paper card from whole ones.
const sius = (id: string, dateKey: string, position: Position, values: number[], extra: Partial<Evaluation> = {}): Evaluation & { id: string } => {
  const total = Math.round(values.reduce((n, v) => n + v, 0) * 10) / 10
  return {
    id,
    studentId: 'ana',
    studentName: 'Ana Reyes',
    source: 'sius',
    position,
    dateKey,
    timeMin: 1080,
    shots: values.length,
    total,
    wholeTotal: values.reduce((n, v) => n + Math.floor(v), 0),
    innerTens: values.filter((v) => v >= 10.2).length,
    mpi: null,
    groupMm: 12,
    series: [{ n: 1, total, shots: values.map((v) => ({ v, a: 90 })), mpi: null, groupMm: null }],
    sighters: 0,
    fileId: null,
    note: '',
    problems: [],
    sius: null,
    ...extra,
  }
}
const paper = (id: string, dateKey: string, position: Position, values: number[]) => ({
  id,
  ...paperEvaluation({ studentId: 'ana', studentName: 'Ana Reyes', position, dateKey, shots: values, total: null, fileId: null, note: '' }),
})
const shots = (v: number, n: number) => Array<number>(n).fill(v)
const ten = (v: number) => shots(v, 10)

describe('which results compare', () => {
  const results = [
    paper('s1', '2026-09-02', 'standing', ten(7)),
    sius('p1', '2026-09-03', 'prone', ten(9.5)),
    sius('k1', '2026-09-04', 'kneeling', ten(9)),
    paper('s2', '2026-09-09', 'standing', ten(8)),
    sius('p0', '2026-09-10', 'prone', [], { total: 0, wholeTotal: 0 }), // no shots: never counted
  ]

  it('needs two scored results in a position', () => {
    expect(comparablePositions(results)).toEqual(['standing'])
    expect(comparablePositions([...results, sius('p2', '2026-09-12', 'prone', ten(10))])).toEqual(['standing', 'prone'])
  })

  it('opens on the position of the latest result that can be compared', () => {
    expect(latestComparablePosition(results)).toBe('standing')
    expect(latestComparablePosition([...results, sius('p2', '2026-09-12', 'prone', ten(10))])).toBe('prone')
    expect(latestComparablePosition([sius('k1', '2026-09-04', 'kneeling', ten(9))])).toBeNull()
  })

  it('lists a position’s results in the order they were shot, a day’s by their time', () => {
    const list = positionPoints(
      [sius('late', '2026-09-03', 'prone', ten(10), { timeMin: 1140 }), sius('early', '2026-09-03', 'prone', ten(9), { timeMin: 1020 }), sius('before', '2026-09-01', 'prone', ten(9.5))],
      'prone',
    )
    expect(list.map((p) => p.id)).toEqual(['before', 'early', 'late'])
  })
})

describe('the two results compared', () => {
  // Whole per 10 shots: 90, 85 (decimal 90), 85 (decimal 85), 92, 88.
  const list = positionPoints(
    [
      sius('r1', '2026-09-01', 'prone', ten(9)),
      sius('r2', '2026-09-08', 'prone', [...shots(9.4, 5), ...shots(8.6, 5)]),
      sius('r3', '2026-09-15', 'prone', [...shots(9, 5), ...shots(8, 5)]),
      sius('r4', '2026-09-22', 'prone', [10.1, 10.1, ...shots(9.3, 8)]),
      sius('r5', '2026-09-29', 'prone', [...shots(9.1, 8), 8.2, 8.2]),
    ],
    'prone',
  )
  const ids = (pair: ReturnType<typeof comparePair> | null) => (pair ? [pair.a.id, pair.b.id, ...pair.labels] : null)

  it('reads the made-up results as intended', () => {
    expect(list.map((p) => [p.wholePer10, p.per10])).toEqual([
      [90, 90],
      [85, 90],
      [85, 85],
      [92, 94.6],
      [88, 89.2],
    ])
  })

  it('puts the latest against the first, the one before it, or the lowest so far', () => {
    expect(ids(comparePair(list, 'first'))).toEqual(['r1', 'r5', 'First', 'Latest'])
    expect(ids(comparePair(list, 'previous'))).toEqual(['r4', 'r5', 'Previous', 'Latest'])
    // r2 and r3 are both 85 per 10 in whole numbers: r3's decimal is lower.
    expect(ids(comparePair(list, 'lowest'))).toEqual(['r3', 'r5', 'Lowest', 'Latest'])
  })

  it('keeps the earliest of results that are equal to the decimal', () => {
    const same = positionPoints([sius('a', '2026-09-01', 'prone', ten(8)), sius('b', '2026-09-02', 'prone', ten(8)), sius('c', '2026-09-03', 'prone', ten(9))], 'prone')
    expect(comparePair(same, 'lowest')?.a.id).toBe('a')
  })

  it('compares any two picked, the earlier on the left, the first and the latest until then', () => {
    expect(ids(comparePair(list, 'choose'))).toEqual(['r1', 'r5', 'Earlier', 'Later'])
    expect(ids(comparePair(list, 'choose', { picks: ['r4', 'r2'] }))).toEqual(['r2', 'r4', 'Earlier', 'Later'])
    expect(ids(comparePair(list, 'choose', { picks: ['r3', null] }))).toEqual(['r3', 'r5', 'Earlier', 'Later'])
    // A pick that's gone (deleted since) falls back to the default.
    expect(ids(comparePair(list, 'choose', { picks: ['gone', 'r2'] }))).toEqual(['r1', 'r2', 'Earlier', 'Later'])
  })

  it('has nothing to compare for the same result twice', () => {
    expect(comparePair(list, 'choose', { picks: ['r2', 'r2'] })).toBeNull()
  })

  it('compares against the result a screen is about', () => {
    const at = { anchorId: 'r3', anchorLabel: 'This result' }
    expect(ids(comparePair(list, 'previous', at))).toEqual(['r2', 'r3', 'Previous', 'This result'])
    expect(ids(comparePair(list, 'first', at))).toEqual(['r1', 'r3', 'First', 'This result'])
    // Only the results before it count for the lowest.
    expect(ids(comparePair(list, 'lowest', { anchorId: 'r2' }))).toEqual(['r1', 'r2', 'Lowest', 'This result'])
    // Picked: by default the first against it; it keeps its name on whichever side it lands.
    expect(ids(comparePair(list, 'choose', at))).toEqual(['r1', 'r3', 'Earlier', 'This result'])
    expect(ids(comparePair(list, 'choose', { ...at, picks: ['r5', 'r3'] }))).toEqual(['r3', 'r5', 'This result', 'Later'])
  })

  it('offers only a pick for a position’s first result, compared by default with the latest', () => {
    expect(compareModes(list, 'r1')).toEqual(['choose'])
    expect(compareModes(list, 'r2')).toEqual(['lowest', 'previous', 'first', 'choose'])
    expect(compareModes(list)).toEqual(['lowest', 'previous', 'first', 'choose'])
    expect(comparePair(list, 'previous', { anchorId: 'r1' })).toBeNull()
    expect(ids(comparePair(list, 'choose', { anchorId: 'r1' }))).toEqual(['r1', 'r5', 'This result', 'Later'])
  })

  it('takes the latest when the result given isn’t in the list', () => {
    expect(ids(comparePair(list, 'previous', { anchorId: 'elsewhere' }))).toEqual(['r4', 'r5', 'Previous', 'Latest'])
  })

  it('needs two results', () => {
    expect(compareModes(list.slice(0, 1))).toEqual([])
    expect(comparePair(list.slice(0, 1), 'first')).toBeNull()
    expect(comparePair([], 'choose')).toBeNull()
  })
})

describe('what changed between them', () => {
  it('gives the score, the inner tens and the group', () => {
    const a = toPoint(sius('a', '2026-09-01', 'prone', [10.3, 10.1, 10, 10.4, 9.8, 9.9, 10, 10.5, 10, 10.2], { groupMm: 14.2 }))
    const b = toPoint(sius('b', '2026-09-08', 'prone', [10.3, 10.4, 10.2, 10.6, 10.2, 10.1, 10, 10.5, 10.2, 10.3], { groupMm: 11 }))
    expect(a.wholePer10).toBe(98)
    expect(innerTensPct(a)).toBe(40)
    expect(compareFacts(a, b)).toEqual({ change: 2, innerTens: { a: 40, b: 80, change: 40 }, group: { a: 14.2, b: 11, change: -3.2 } })
  })

  it('leaves out what a typed paper card doesn’t have', () => {
    const a = toPoint(paper('a', '2026-09-01', 'standing', [8, 9, 7, 8, 8, 9, 8, 7, 9, 8]))
    const b = toPoint(sius('b', '2026-09-08', 'standing', ten(9.1)))
    expect(innerTensPct(a)).toBeNull()
    expect(compareFacts(a, b)).toEqual({ change: 9, innerTens: null, group: null })
  })
})
