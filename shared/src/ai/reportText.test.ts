import { describe, expect, it } from 'vitest'
import { composeReport } from '../reports/compose'
import { type Evaluation, type Position, paperEvaluation } from '../shooting/evaluation'
import { mentionsAi, numbersNotInFigures, parseReportText, reportFiguresText, reportTextPrompt } from './reportText'

// A made-up student and made-up results (never the academy's samples).
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

const report = composeReport({
  academy: { name: 'Made-up Academy', contact: { phone: '', email: '', website: '', address: '' } },
  student: { id: 'mia', name: 'Mia Larkin', firstName: 'Mia', lastName: 'Larkin', level: 'Development', program: null },
  period: { from: '2026-09-01', to: '2026-09-30', preset: 'last_month' },
  evaluations: [
    sius('e1', '2026-09-03', 'prone', [9, 9, 9, 9, 9, 9, 9, 9, 9, 9.5]),
    sius('e2', '2026-09-10', 'prone', [9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5]),
    sius('e3', '2026-09-17', 'prone', [10.3, 10.1, 10.0, 10.4, 10.2, 9.9, 10.0, 10.5, 10.0, 10.2]),
    sius('e4', '2026-09-24', 'prone', [10.2, 10.4, 10.0, 10.1, 10.6, 10.3, 10.0, 10.2, 10.0, 10.1]),
    paper('p1', '2026-09-20', 'standing', [8, 9, 7, 8, 8, 9, 8, 7, 9, 8]),
    sius('c1', '2026-09-27', 'prone', [10, 10, 10, 10, 10, 10, 10, 10, 10, 10.4], { kind: 'competition', match: { name: 'Made-up Fall Open', course: 'Air Rifle 10' } }),
  ],
  sessions: [
    { dateKey: '2026-09-03', status: 'present', past: true },
    { dateKey: '2026-09-10', status: 'present', past: true },
    { dateKey: '2026-09-17', status: 'no_show', past: true },
    { dateKey: '2026-09-24', status: 'present', past: true },
  ],
  previous: null,
  by: { email: 'admin@example.test', name: 'Admin', role: 'admin' },
})

describe('the report text prompt', () => {
  it('gives the figures in plain lines, with the first name only', () => {
    const text = reportFiguresText(report)
    expect(text).toContain("Student's first name: Mia")
    expect(text).not.toContain('Larkin')
    expect(text).toContain('Period: September 2026')
    expect(text).toContain('Practice results: 5 (4 SIUS results, 1 paper card), 50 scored shots')
    expect(text).toMatch(/- Prone: 4 results, 40 shots; average \d+(\.\d)? per 10 shots \(\d+(\.\d)? in decimals\)/)
    expect(text).toContain('- Standing: 1 result, 10 shots')
    expect(text).toContain('Attendance: came to 3 of 4 classes (75%), missed 1')
    // The competition apart from practice.
    expect(text).toContain('Competitions in the period (apart from practice, not in the figures above):')
    expect(text).toMatch(/- Sep 27, Made-up Fall Open, prone: 100\.4 over 10 shots/)
  })

  it('puts the rules in the instructions and the figures in the message', () => {
    const p = reportTextPrompt(report)
    expect(p.system).toMatch(/Never invent a number/)
    expect(p.system).toMatch(/Never compare the student with other students/)
    expect(p.system).toMatch(/Never mention AI/)
    expect(p.system).toMatch(/80 to 150 words/)
    expect(p.user).toContain('How to read the figures')
    expect(p.user).toContain(reportFiguresText(report))
  })

  it('says "building back up" for a dip, as families read it', () => {
    const dipping = { ...report, facts: { ...report.facts, trend: { level: 'dipping' as const, change: -2 } } }
    expect(reportFiguresText(dipping)).toContain('Trend over the period: Building back up (second half against the first: -2 per 10 shots)')
  })

  it('says when there are no results', () => {
    const none = { ...report, facts: { ...report.facts, evaluations: { total: 0, sius: 0, paper: 0, shots: 0 }, positions: [] } }
    expect(reportFiguresText(none)).toContain('Practice results: none were scored in this period.')
  })
})

const good = {
  overview: 'Mia had a strong September in prone.',
  strengths: ['Prone scores rose through the month.', 'Came to most classes.'],
  focusAreas: ['Standing is the next step.'],
  goals: [{ goal: 'Beat this month’s best in prone.', measure: 'Across next month’s results.' }],
}

describe('reading the answer', () => {
  it('takes the JSON as it is, in a fence, or with words around it', () => {
    expect(parseReportText(JSON.stringify(good))).toEqual({ ok: true, value: good })
    expect(parseReportText('```json\n' + JSON.stringify(good) + '\n```')).toEqual({ ok: true, value: good })
    expect(parseReportText(`Here it is: ${JSON.stringify(good)} Hope it helps.`)).toEqual({ ok: true, value: good })
  })

  it('tidies the text and keeps at most 4 strengths, 3 focus areas and 3 goals', () => {
    const many = {
      overview: '  Mia   had\na strong month. ',
      strengths: ['a', 'b', '', 'c', 'd', 'e'],
      focusAreas: ['f', 'g', 'h', 'i'],
      goals: [1, 2, 3, 4].map((n) => ({ goal: `Goal ${n}`, measure: 'm' })),
    }
    const r = parseReportText(JSON.stringify(many))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.overview).toBe('Mia had a strong month.')
    expect(r.value.strengths).toEqual(['a', 'b', 'c', 'd'])
    expect(r.value.focusAreas).toEqual(['f', 'g', 'h'])
    expect(r.value.goals).toHaveLength(3)
  })

  it('refuses what isn’t the shape', () => {
    expect(parseReportText('Sorry, I can’t.')).toEqual({ ok: false, error: 'The answer wasn’t JSON.' })
    expect(parseReportText(JSON.stringify({ ...good, overview: '' })).ok).toBe(false)
    expect(parseReportText(JSON.stringify({ ...good, strengths: 'Strong' })).ok).toBe(false)
    expect(parseReportText(JSON.stringify({ ...good, focusAreas: [] })).ok).toBe(false)
    expect(parseReportText(JSON.stringify({ ...good, goals: [{ goal: '', measure: 'x' }] })).ok).toBe(false)
  })

  it('refuses a draft that speaks of AI, but not a student called Ai', () => {
    expect(parseReportText(JSON.stringify({ ...good, overview: 'As an AI, I think Mia did well.' }))).toEqual({ ok: false, error: 'The answer spoke of AI.' })
    expect(mentionsAi({ ...good, overview: 'This report was written by a language model.' })).toBe(true)
    expect(mentionsAi({ ...good, overview: 'AI had a strong month.' }, 'AI')).toBe(false)
    expect(mentionsAi({ ...good, overview: 'Mia kept her aim steady.' })).toBe(false)
  })
})

describe('numbers not in the figures', () => {
  const prompt = reportTextPrompt(report)
  const avg = report.facts.positions.find((p) => p.position === 'prone')!.average!

  it('lets through the figures (and their rounding), dates and small counts', () => {
    const v = {
      ...good,
      overview: `In September 2026 Mia averaged ${avg} per 10 shots in prone, about ${Math.round(avg)}, and came to 3 of 4 classes (75%). On Sep 24 she shot 10 tens.`,
    }
    expect(numbersNotInFigures(v, prompt)).toEqual([])
  })

  it('finds a number made up', () => {
    const v = { ...good, overview: 'Mia averaged 63.7 per 10 shots and shot 1,234 shots.', goals: [{ goal: 'Average 99 per 10 shots.', measure: 'Next month.' }] }
    expect(numbersNotInFigures(v, prompt)).toEqual(['63.7', '1234', '99'])
  })
})
