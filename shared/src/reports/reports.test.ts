import { describe, expect, it } from 'vitest'
import { type Evaluation, type Position, paperEvaluation } from '../shooting/evaluation'
import { composeReport, reportName } from './compose'
import { evaluationsFingerprint, reportFacts } from './facts'
import { periodLabel, presetPeriod } from './period'

const sius = (id: string, dateKey: string, position: Position, values: number[], extra: Partial<Evaluation> = {}): Evaluation & { id: string } => {
  const shots = values.map((v, i) => ({ v, a: (i * 40) % 360 }))
  const total = Math.round(values.reduce((n, v) => n + v, 0) * 10) / 10
  return {
    id,
    studentId: 'mia',
    studentName: 'Mia Larkin',
    source: 'sius',
    position,
    dateKey,
    timeMin: 1110,
    shots: values.length,
    total,
    wholeTotal: values.reduce((n, v) => n + Math.floor(v), 0),
    innerTens: values.filter((v) => v >= 10.2).length,
    mpi: { x: -2, y: -1.6 },
    groupMm: 14,
    series: [{ n: 1, total, shots, mpi: null, groupMm: null }],
    sighters: 0,
    fileId: null,
    note: '',
    problems: [],
    sius: { printed: '', event: 'Air Rifle 60', clockFixMin: 0 },
    ...extra,
  }
}
const paper = (id: string, dateKey: string, position: Position, values: number[]) => ({
  id,
  ...paperEvaluation({ studentId: 'mia', studentName: 'Mia Larkin', position, dateKey, shots: values, total: null, fileId: null, note: '' }),
})

describe('report periods', () => {
  it('labels whole months and ranges', () => {
    expect(periodLabel('2026-09-01', '2026-09-30')).toBe('September 2026')
    expect(periodLabel('2026-09-02', '2026-10-15')).toBe('Sep 2 – Oct 15, 2026')
    expect(periodLabel('2025-12-20', '2026-01-10')).toBe('Dec 20, 2025 – Jan 10, 2026')
  })

  it('works out a preset’s dates', () => {
    expect(presetPeriod('last_month', '2026-10-16')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetPeriod('this_month', '2026-10-16')).toEqual({ from: '2026-10-01', to: '2026-10-16' })
    expect(presetPeriod('since_last', '2026-10-16', { lastReportTo: '2026-09-30' })).toEqual({ from: '2026-10-01', to: '2026-10-16' })
    expect(presetPeriod('last_30', '2026-10-16')).toEqual({ from: '2026-09-17', to: '2026-10-16' })
  })
})

describe('report figures', () => {
  const evaluations = [
    sius('e1', '2026-09-03', 'prone', [9, 9, 9, 9, 9, 9, 9, 9, 9, 9.5]),
    sius('e2', '2026-09-10', 'prone', [9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5]),
    sius('e3', '2026-09-17', 'prone', [10.3, 10.1, 10.0, 10.4, 10.2, 9.9, 10.0, 10.5, 10.0, 10.2]),
    sius('e4', '2026-09-24', 'prone', [10.2, 10.4, 10.0, 10.1, 10.6, 10.3, 10.0, 10.2, 10.0, 10.1]),
    paper('p1', '2026-09-20', 'standing', [8, 9, 7, 8, 8, 9, 8, 7, 9, 8]),
  ]
  const sessions = [
    { dateKey: '2026-09-03', status: 'present' as const, past: true },
    { dateKey: '2026-09-10', status: 'present' as const, past: true },
    { dateKey: '2026-09-14', status: 'no_show' as const, past: true },
    { dateKey: '2026-09-17', status: 'present' as const, past: true },
    { dateKey: '2026-09-21', status: 'canceled' as const, past: true },
    { dateKey: '2026-09-28', status: 'confirmed' as const, past: true },
  ]

  it('averages each position per 10 shots, in whole numbers and decimals', () => {
    const { facts, series } = reportFacts(evaluations, sessions, null)
    expect(series.map((s) => s.id)).toEqual(['e1', 'e2', 'e3', 'p1', 'e4'])
    const prone = facts.positions.find((p) => p.position === 'prone')!
    expect(prone).toMatchObject({ evaluations: 4, shots: 40, average: 94.8, first: { id: 'e1', wholePer10: 90 }, latest: { id: 'e4', wholePer10: 100 }, change: 9.5 })
    expect(prone.decimal).toBeCloseTo(97.25, 0)
    expect(prone.best?.id).toBe('e4')
    expect(prone.innerTensPct).toBe(25)
    expect(facts.positions.find((p) => p.position === 'standing')).toMatchObject({ evaluations: 1, average: 81, decimal: null, change: null })
    expect(facts.trend).toEqual({ level: 'improving', change: 9.5 })
    expect(facts.attendance).toEqual({ attended: 3, missed: 1, canceled: 1, unmarked: 1, percent: 75 })
    expect(facts.distribution.tens + facts.distribution.nines + facts.distribution.eights + facts.distribution.lower).toBe(50)
  })

  it('writes standard text that uses only the figures', () => {
    const doc = composeReport({
      academy: { name: 'Sky Arc Academy', contact: { phone: '', email: '', website: '', address: '' } },
      student: { id: 'mia', name: 'Mia Larkin', firstName: 'Mia', lastName: 'Larkin', level: 'Scout', program: null },
      period: { from: '2026-09-01', to: '2026-09-30', preset: 'last_month' },
      evaluations,
      sessions,
      previous: { reportId: 'r0', periodLabel: 'August 2026', average: 90, evaluations: 3 },
      by: { email: 'paige@example.test', name: 'Paige Sutton', role: 'admin' },
    })
    expect(doc.period.label).toBe('September 2026')
    expect(doc.status).toBe('draft')
    expect(doc.evaluationCount).toBe(5)
    expect(doc.facts.deltaAverage).toBe(2)
    expect(doc.narrative.overview).toContain('In September 2026, Mia shot 5 evaluations (1 standing and 4 prone), 50 scored shots in all.')
    expect(doc.narrative.overview).toContain('Prone scores rose from 90 to 100 per 10 shots.')
    expect(doc.narrative.overview).toContain('Mia came to 3 of 4 classes.')
    expect(doc.narrative.strengths[0]).toBe('Prone scores up 9.5 points per 10 shots over the period.')
    expect(doc.narrative.focusAreas[0]).toBe('Prone groups sit low left of the centre on average (2 mm left, 1.6 mm low).')
    expect(doc.narrative.goals.length).toBeGreaterThan(0)
    expect(doc.narrativeOriginal).toEqual(doc.narrative)
    expect(reportName(doc)).toBe('September 2026 progress report')
  })

  it('fingerprints what a report was built from', () => {
    const a = evaluationsFingerprint([{ id: 'e1', updatedAt: { toMillis: () => 1 } }, { id: 'e2' }])
    const b = evaluationsFingerprint([{ id: 'e2' }, { id: 'e1', updatedAt: { toMillis: () => 1 } }])
    const c = evaluationsFingerprint([{ id: 'e1', updatedAt: { toMillis: () => 2 } }, { id: 'e2' }])
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a.startsWith('2-')).toBe(true)
  })
})

describe('competitions and positions in a report', () => {
  it('lists competitions apart and leaves them out of the figures', () => {
    const practice = paper('p1', '2026-09-03', 'standing', [9, 9, 8, 9, 10, 9, 8, 9, 9, 9])
    const match = sius('c1', '2026-09-12', 'standing', [10.4, 9.8, 10.1, 9.6, 10.3, 9.9, 10.2, 9.7, 10.0, 9.5], { kind: 'competition', match: { name: 'Lakeside Fall', course: '10 Shots' } })
    const { facts, series } = reportFacts([practice, match], [], null)
    expect(series.map((p) => p.id)).toEqual(['p1'])
    expect(facts.evaluations.total).toBe(1)
    expect(facts.average).toBe(89)
    expect(facts.competitions).toEqual([{ id: 'c1', dateKey: '2026-09-12', match: 'Lakeside Fall', position: 'standing', shots: 10, total: 99.5, innerTens: 3, decimal: true, wholePer10: 95, since: null }])
  })

  it('measures the change since the last report over the positions both periods shot', () => {
    const now = [paper('p1', '2026-10-03', 'prone', [10, 10, 9, 10, 9, 10, 10, 9, 10, 10])]
    const before = { reportId: 'r0', periodLabel: 'September 2026', average: 80, evaluations: 4, positions: [{ position: 'standing' as const, average: 80 }] }
    // Only standing last time, only prone now: nothing to compare.
    expect(reportFacts(now, [], before).facts.deltaAverage).toBeNull()
    const both = { ...before, positions: [...before.positions, { position: 'prone' as const, average: 95 }] }
    expect(reportFacts(now, [], both).facts.deltaAverage).toBe(2)
    // A report from before positions were kept: the averages, as before.
    expect(reportFacts(now, [], { reportId: 'r0', periodLabel: 'September 2026', average: 90, evaluations: 3 }).facts.deltaAverage).toBe(7)
  })
})

describe('competitions in a report, each against the match before it', () => {
  const match = (id: string, dateKey: string, position: 'kneeling' | 'prone', total: number) =>
    ({ id, studentId: 's', studentName: 'S', source: 'sheet', kind: 'competition', position, dateKey, timeMin: null, shots: 20, total, wholeTotal: total, innerTens: 3, mpi: null, groupMm: null, series: [], sighters: 0, fileId: null, note: '', problems: [], sius: null, match: { name: `Match ${id}`, course: '3x20' } }) as unknown as Evaluation & { id: string }

  it('compares with the same position’s last match, before the period too', () => {
    const earlier = [match('a', '2026-09-12', 'kneeling', 160), match('b', '2026-09-12', 'prone', 180)]
    const now = [match('c', '2026-10-24', 'kneeling', 170), match('d', '2026-10-30', 'kneeling', 174)]
    const { facts } = reportFacts(now, [], null, earlier)
    const byId = new Map(facts.competitions!.map((c) => [c.id, c]))
    expect(byId.get('c')!.since).toEqual({ dateKey: '2026-09-12', match: 'Match a', wholePer10: 80 })
    expect(byId.get('d')!.since).toEqual({ dateKey: '2026-10-24', match: 'Match c', wholePer10: 85 })
  })

  it('says nothing for the first match in a position', () => {
    const { facts } = reportFacts([match('c', '2026-10-24', 'prone', 170)], [], null, [])
    expect(facts.competitions![0].since).toBeNull()
  })
})
