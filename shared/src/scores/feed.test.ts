import { describe, expect, it } from 'vitest'
import type { Position } from '../shooting/evaluation'
import { dayWords, feedGroups, lastScores, lastSevenDays, presetHint, quietStudents, rangeDates, rangeLabel, recentBests, sortFeed } from './feed'
import { resultRows } from './match'

// Made-up results. Today is Monday, November 2, 2026; the academy's weeks run Monday to Sunday.
const TODAY = '2026-11-02'
let n = 0
const r = (studentId: string, dateKey: string, position: Position, wholeTotal: number, extra: Record<string, unknown> = {}) => ({
  id: `r${++n}`,
  studentId,
  source: 'sius' as const,
  position,
  dateKey,
  timeMin: 600 + n,
  shots: 10,
  total: wholeTotal,
  wholeTotal,
  innerTens: null,
  series: [],
  match: null as { name: string; course: string } | null,
  ...extra,
})

describe('the dates the page shows', () => {
  it('turns each preset into its days', () => {
    expect(rangeDates({ preset: 'today' }, TODAY)).toEqual({ from: TODAY, to: TODAY })
    expect(rangeDates({ preset: '7d' }, TODAY)).toEqual({ from: '2026-10-27', to: TODAY })
    expect(rangeDates({ preset: '30d' }, TODAY)).toEqual({ from: '2026-10-04', to: TODAY })
    expect(rangeDates({ preset: 'month' }, TODAY)).toEqual({ from: '2026-11-01', to: TODAY })
    expect(rangeDates({ preset: 'lastMonth' }, TODAY)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(rangeDates({ preset: 'lastMonth' }, '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })

  it('takes days picked in either order', () => {
    expect(rangeDates({ preset: 'custom', from: '2026-10-18', to: '2026-10-12' }, TODAY)).toEqual({ from: '2026-10-12', to: '2026-10-18' })
  })

  it('names them', () => {
    expect(rangeLabel({ preset: '30d' }, TODAY)).toBe('Last 30 days')
    expect(rangeLabel({ preset: 'custom', from: '2026-10-12', to: '2026-10-18' }, TODAY)).toBe('Oct 12 – Oct 18')
    expect(rangeLabel({ preset: 'custom', from: '2026-10-12', to: '2026-10-12' }, TODAY)).toBe('Oct 12')
    expect(rangeLabel({ preset: 'custom', from: '2025-12-30', to: '2026-01-02' }, TODAY)).toBe('Dec 30, 2025 – Jan 2')
    expect(presetHint('7d', TODAY)).toBe('Oct 27 – today')
    expect(presetHint('month', TODAY)).toBe('Nov 1 – today')
    expect(presetHint('month', '2026-11-01')).toBe('today')
    expect(presetHint('lastMonth', TODAY)).toBe('October')
    expect(presetHint('lastMonth', '2026-01-15')).toBe('December 2025')
  })

  it('says a day in a few words', () => {
    expect(dayWords(TODAY, TODAY)).toBe('Today')
    expect(dayWords('2026-11-01', TODAY)).toBe('Yesterday')
    expect(dayWords('2026-10-31', TODAY)).toBe('Sat, Oct 31')
    expect(dayWords('2025-12-30', TODAY)).toBe('Dec 30, 2025')
  })
})

describe('the feed’s headings', () => {
  const of = (x: { dateKey: string; match?: string | null }) => ({ dateKey: x.dateKey, match: x.match ?? null })

  it('gives this week’s and last week’s days their own, then each earlier week one', () => {
    const days = ['2026-11-02', '2026-11-01', '2026-10-31', '2026-10-26', '2026-10-25', '2026-10-19', '2026-10-12'].map((dateKey) => ({ dateKey }))
    const groups = feedGroups(days, of, TODAY, 'monday')
    expect(groups.map((g) => [g.title, g.sub, g.day])).toEqual([
      ['Today', 'Monday, November 2', true],
      ['Yesterday', 'Sunday, November 1', true],
      ['Saturday', 'October 31', true],
      ['Monday', 'October 26', true],
      ['Week of October 19', 'Oct 19 – Oct 25', false],
      ['Week of October 12', 'Oct 12 – Oct 18', false],
    ])
    expect(groups[4].rows.map((x) => x.dateKey)).toEqual(['2026-10-25', '2026-10-19'])
  })

  it('follows the academy’s week', () => {
    const groups = feedGroups([{ dateKey: '2026-10-25' }], of, TODAY, 'sunday')
    // Weeks from Sunday: last week began on Sunday, October 25.
    expect(groups[0].title).toBe('Sunday')
  })

  it('names a competition’s day by its match', () => {
    const groups = feedGroups([{ dateKey: '2026-10-31', match: 'Fall Junior Open' }, { dateKey: '2026-10-31' }], of, TODAY, 'monday')
    expect(groups[0].sub).toBe('October 31 · Fall Junior Open')
  })

  it('keeps the order the results come in, oldest first too', () => {
    const groups = feedGroups([{ dateKey: '2026-10-12' }, { dateKey: '2026-10-31' }, { dateKey: '2026-11-02' }], of, TODAY, 'monday')
    expect(groups.map((g) => g.title)).toEqual(['Week of October 12', 'Saturday', 'Today'])
  })

  it('says the year of a week in another year', () => {
    expect(feedGroups([{ dateKey: '2025-12-29' }], of, TODAY, 'monday')[0].title).toBe('Week of December 29, 2025')
  })
})

describe('sorting the feed', () => {
  const rows = resultRows([r('ana', '2026-11-01', 'prone', 90), r('ben', '2026-11-02', 'prone', 95), r('cy', '2026-10-31', 'prone', 80), r('dee', '2026-10-30', 'prone', 0, { shots: 0 })])
  const names: Record<string, string> = { ana: 'Ana Lee', ben: 'Ben Ito', cy: 'Cy Park', dee: 'Dee Moss' }
  const nameOf = (x: (typeof rows)[number]) => names[x.results[0].studentId]

  it('by when, newest or oldest first', () => {
    expect(sortFeed(rows, 'new', nameOf).map(nameOf)).toEqual(['Ben Ito', 'Ana Lee', 'Cy Park', 'Dee Moss'])
    expect(sortFeed(rows, 'old', nameOf).map(nameOf)).toEqual(['Dee Moss', 'Cy Park', 'Ana Lee', 'Ben Ito'])
  })

  it('by score, a result without one last', () => {
    expect(sortFeed(rows, 'high', nameOf).map(nameOf)).toEqual(['Ben Ito', 'Ana Lee', 'Cy Park', 'Dee Moss'])
    expect(sortFeed(rows, 'low', nameOf).map(nameOf)).toEqual(['Cy Park', 'Ana Lee', 'Ben Ito', 'Dee Moss'])
  })

  it('by name', () => {
    expect(sortFeed(rows, 'name', nameOf).map(nameOf)).toEqual(['Ana Lee', 'Ben Ito', 'Cy Park', 'Dee Moss'])
  })
})

describe('the last seven days', () => {
  it('counts results and students, against the seven days before', () => {
    const list = [
      r('ana', '2026-11-02', 'prone', 90),
      r('ana', '2026-10-28', 'standing', 80),
      r('ben', '2026-10-27', 'prone', 170, { shots: 20 }), // 85 per 10
      r('ben', '2026-10-26', 'prone', 80), // the week before
      r('cy', '2026-10-20', 'standing', 70), // the week before
      r('cy', '2026-10-19', 'standing', 60), // too early
    ]
    const week = lastSevenDays(resultRows(list), TODAY)
    expect(week).toMatchObject({ from: '2026-10-27', to: TODAY, results: 3, students: 2, before: 2 })
    const prone = week.positions.find((p) => p.position === 'prone')!
    // Every shot counts: (90 + 170) over 30 shots, against 80 over 10.
    expect(prone).toEqual({ position: 'prone', results: 2, average: 86.7, before: 80, change: 6.7 })
    expect(week.positions.find((p) => p.position === 'standing')).toEqual({ position: 'standing', results: 1, average: 80, before: 70, change: 10 })
    expect(week.positions.find((p) => p.position === 'kneeling')).toEqual({ position: 'kneeling', results: 0, average: null, before: null, change: null })
  })

  it('counts a competition’s sheet once, each of its positions in its own average', () => {
    const sheet = { source: 'sheet' as const, match: { name: 'Made-up Open', course: '3x20' } }
    const list = [r('ana', '2026-10-31', 'kneeling', 90, sheet), r('ana', '2026-10-31', 'prone', 95, sheet), r('ana', '2026-10-31', 'standing', 80, sheet)]
    const week = lastSevenDays(resultRows(list), TODAY)
    expect(week.results).toBe(1)
    expect(week.positions.map((p) => p.results)).toEqual([1, 1, 1])
  })
})

describe('who hasn’t had a score lately', () => {
  const list = [r('ana', '2026-10-31', 'prone', 90), r('ben', '2026-09-24', 'prone', 85), r('ben', '2026-09-20', 'prone', 85), r('cy', '2026-10-03', 'prone', 70), r('dee', '2026-08-01', 'prone', 0, { shots: 0 })]
  const last = lastScores(list)

  it('knows each student’s last scored result', () => {
    expect(Object.fromEntries(last)).toEqual({ ana: '2026-10-31', ben: '2026-09-24', cy: '2026-10-03' })
  })

  it('lists enrolled students without one in 30 days, longest first, then those without any', () => {
    const students = [
      { id: 'ana', status: 'enrolled' as const },
      { id: 'ben', status: 'enrolled' as const },
      { id: 'cy', status: 'enrolled' as const }, // 30 days ago: outside the last 30 days
      { id: 'dee', status: 'enrolled' as const, signUpDate: '2026-09-01' }, // nothing scored
      { id: 'eve', status: 'enrolled' as const, signUpDate: '2026-10-20' }, // signed up two weeks ago: not yet
      { id: 'fay', status: 'paused' as const },
    ]
    expect(quietStudents(students, last, TODAY)).toEqual([
      { id: 'ben', last: '2026-09-24', days: 39 },
      { id: 'cy', last: '2026-10-03', days: 30 },
      { id: 'dee', last: null, days: null },
    ])
  })
})

describe('the week’s new bests', () => {
  it('lists the bests of the last seven days, newest first', () => {
    const list = [r('ana', '2026-10-25', 'prone', 90), r('ana', '2026-10-28', 'prone', 95), r('ben', '2026-11-02', 'prone', 99)]
    const bests = new Set(list.map((x) => x.id))
    expect(recentBests(list, bests, TODAY).map((x) => x.dateKey)).toEqual(['2026-11-02', '2026-10-28'])
  })
})
