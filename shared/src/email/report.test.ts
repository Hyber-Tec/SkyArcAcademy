import { describe, expect, it } from 'vitest'
import { reportEmail, reportSignInUrl } from './report'

const base = {
  to: 'maya.larkin@example.test',
  name: 'Maya Larkin',
  studentFirstName: 'Mia',
  academyName: 'Sky Arc Academy',
  periodLabel: 'September 2026',
  evaluations: 4,
  average: 94.8,
  url: reportSignInUrl('r1', 'maya.larkin@example.test'),
  forStudent: false,
}

describe('report emails', () => {
  it('tells a parent whose report it is, what it covers and how to open it', () => {
    const e = reportEmail(base)
    expect(e.subject).toBe('Mia’s September 2026 progress report')
    expect(e.text).toContain('Hi Maya,')
    expect(e.text).toContain('Sky Arc Academy shared Mia’s progress report for September 2026. It covers 4 scored evaluations, averaging 94.8 per 10 shots.')
    expect(e.text).toContain('Sign in to read it: https://skyarcacademy.web.app/login?next=%2Freport%2Fr1&email=maya.larkin%40example.test')
    expect(e.html).toContain('href="https://skyarcacademy.web.app/login?next=%2Freport%2Fr1&amp;email=maya.larkin%40example.test"')
  })

  it('speaks to the student on their own account', () => {
    const e = reportEmail({ ...base, to: 'mia@example.test', name: 'Mia Larkin', forStudent: true, evaluations: 1, average: 90 })
    expect(e.subject).toBe('Your September 2026 progress report')
    expect(e.text).toContain('shared your progress report for September 2026. It covers 1 scored evaluation, averaging 90 per 10 shots.')
    expect(e.text).toContain('linked to your student record')
  })

  it('escapes names in the HTML and never names anyone but the academy', () => {
    const e = reportEmail({ ...base, studentFirstName: '<Mia>', evaluations: 0, average: null })
    expect(e.html).toContain('&lt;Mia&gt;')
    expect(e.html).not.toContain('<Mia>')
    expect(e.text).toContain('shared <Mia>’s progress report for September 2026.')
  })
})
