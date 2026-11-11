import { describe, expect, it } from 'vitest'
import {
  type AthleteResult,
  type OnlineAthlete,
  CHAMPIONSHIP_WORDS,
  checkWindowWords,
  confirmAllPlan,
  dueForRecheck,
  entrantOf,
  isScheduledHour,
  newestFirst,
  nextScheduled,
  resetWords,
  resultState,
  runSummary,
  scheduleWords,
  studentIndex,
  verdictFor,
  whyWords,
  windowsBack,
} from './resultsSite'

// Made-up athletes and students only.
const students = studentIndex([
  { id: 's1', name: 'Avery Stone', otherNames: ['Ave Stone'] },
  { id: 's2', name: 'Jordan Lee' },
  { id: 's3', name: 'Jordan Lee' },
  // Goes by a given name the results site lists her under, with her family name.
  { id: 's4', name: 'Ivy Rowan', lastName: 'Rowan', otherNames: ['Lianhua'] },
])
const teams = ['ARC 10.9*', 'ARC *']

describe('who is the academy’s', () => {
  it('follows a person’s answer first', () => {
    const athletes = new Map([
      ['averystone', { status: 'linked' as const, studentId: 's1' }],
      ['caseyday', { status: 'ignored' as const, studentId: null }],
    ])
    expect(verdictFor({ key: 'averystone', team: 'Lakeside' }, athletes, students, teams)).toEqual({ kind: 'linked', studentId: 's1' })
    expect(verdictFor({ key: 'caseyday', team: 'ARC 10.9' }, athletes, students, teams)).toEqual({ kind: 'ignored' })
  })

  it('suggests the academy’s teams, and students’ names, but only exact ones', () => {
    const none = new Map()
    expect(verdictFor({ key: 'riverbanks', team: 'ARC 10.9 P' }, none, students, teams)).toEqual({ kind: 'suggest', why: 'team', studentId: null })
    expect(verdictFor({ key: 'avestone', team: 'Lakeside' }, none, students, teams)).toEqual({ kind: 'suggest', why: 'name', studentId: 's1' })
    // Two students share the name: the person picks.
    expect(verdictFor({ key: 'jordanlee', team: null }, none, students, teams)).toEqual({ kind: 'suggest', why: 'name', studentId: null })
    // Another name she goes by, with her family name, either way round.
    expect(verdictFor({ key: 'lianhuarowan', team: 'Lakeside' }, none, students, teams)).toEqual({ kind: 'suggest', why: 'name', studentId: 's4' })
    expect(verdictFor({ key: 'rowanlianhua', team: null }, none, students, teams)).toEqual({ kind: 'suggest', why: 'name', studentId: 's4' })
    expect(verdictFor({ key: 'stoneavery', team: null }, none, students, teams)).toEqual({ kind: 'suggest', why: 'name', studentId: 's1' })
    // A near spelling, or another team: nobody.
    expect(verdictFor({ key: 'averystones', team: 'Lakeside' }, none, students, teams)).toEqual({ kind: 'none' })
    expect(verdictFor({ key: 'riverbanks', team: 'Arcadia' }, none, students, teams)).toEqual({ kind: 'none' })
  })

  it('keeps following someone still to confirm, wherever they shoot', () => {
    const athletes = new Map([['riverbanks', { status: 'new' as const, studentId: null }]])
    expect(verdictFor({ key: 'riverbanks', team: 'Their school' }, athletes, students, teams).kind).toBe('suggest')
  })

  it('reads people from the site’s lists', () => {
    expect(entrantOf({ DisplayName: 'Stone, Avery' }, 'r-1', 'ARC 10.9', '2026-10-31T19:00:00Z')).toEqual({
      key: 'averystone',
      name: 'Avery Stone',
      resultCofId: 'r-1',
      team: 'ARC 10.9',
      lastUpdated: '2026-10-31T19:00:00Z',
    })
    expect(entrantOf({ DisplayName: '' }, 'r-1', null)).toBeNull()
    expect(entrantOf({ GivenName: 'Avery' }, undefined, null)).toBeNull()
    expect(whyWords({ kind: 'suggest', why: 'team', studentId: null }, { team: 'ARC 10.9' }, 'October 3P')).toBe('On ARC 10.9 at October 3P')
    expect(whyWords({ kind: 'suggest', why: 'name', studentId: 's1' }, { team: null }, 'October 3P')).toBe('Named like a student, at October 3P')
  })
})

describe('when to look', () => {
  it('splits a look-back into two-week windows, newest first', () => {
    const w = windowsBack('2026-09-01', '2026-10-15')
    expect(w[0]).toEqual({ from: '2026-10-02', to: '2026-10-15' })
    expect(w[1]).toEqual({ from: '2026-09-18', to: '2026-10-01' })
    expect(w.at(-1)).toEqual({ from: '2026-09-01', to: '2026-09-03' })
    expect(windowsBack('2026-10-15', '2026-10-01')).toEqual([])
  })

  it('looks at a match of the academy’s athletes again for two months', () => {
    expect(dueForRecheck({ ours: 2, endDate: '2026-11-01' }, '2026-11-10')).toBe(true)
    expect(dueForRecheck({ ours: 2, endDate: '2026-09-12' }, '2026-11-10')).toBe(true)
    expect(dueForRecheck({ ours: 2, endDate: '2026-08-01' }, '2026-11-10')).toBe(false)
    expect(dueForRecheck({ ours: 0, endDate: '2026-11-09' }, '2026-11-10')).toBe(false)
  })

  it('says what a check did', () => {
    expect(runSummary({ matches: 1, results: 3, athletes: 0, requests: 9 })).toBe('1 match read, 3 results brought in or updated (9 requests to the site).')
    expect(newestFirst(['B', 'A'], 'A')).toEqual(['A', 'B'])
  })
})

describe('the championships searched nationwide', () => {
  it('are the far-away events, not every match with "state" in its name', () => {
    for (const name of ['2025 Gary Anderson Invitational', 'Daisy Nationals Air Rifle 2026', 'GHSA State Championship 2026', 'GA Junior Olympics - Combined'])
      expect(CHAMPIONSHIP_WORDS.test(name)).toBe(true)
    for (const name of ['Walton October 3P', 'State Qualifier Postal', 'CMP 3PAR Postal', 'Match 31 Oct 2026']) expect(CHAMPIONSHIP_WORDS.test(name)).toBe(false)
  })
})

describe('the schedule', () => {
  const tz = 'America/New_York'
  // Sunday, November 15, 2026, 10:05 PM in New York (03:05 UTC on the 16th).
  const sundayNight = Date.UTC(2026, 10, 16, 3, 5)
  const sunday10pm = { on: true, days: [0], hour: 22 }

  it('checks in its hour, on its days, in the academy’s time', () => {
    expect(isScheduledHour(sunday10pm, sundayNight, tz)).toBe(true)
    expect(isScheduledHour(sunday10pm, sundayNight + 3600_000, tz)).toBe(false)
    expect(isScheduledHour({ ...sunday10pm, days: [1] }, sundayNight, tz)).toBe(false)
    expect(isScheduledHour({ ...sunday10pm, on: false }, sundayNight, tz)).toBe(false)
  })

  it('says when it checks next, and how it goes in words', () => {
    expect(nextScheduled(sunday10pm, sundayNight, tz)).toEqual({ dateKey: '2026-11-22', hour: 22 })
    expect(nextScheduled({ on: true, days: [1, 4], hour: 8 }, sundayNight, tz)).toEqual({ dateKey: '2026-11-16', hour: 8 })
    expect(nextScheduled({ ...sunday10pm, on: false }, sundayNight, tz)).toBeNull()
    expect(scheduleWords(sunday10pm)).toBe('Every Sunday at 10 PM')
    expect(scheduleWords({ on: true, days: [4, 1], hour: 8 })).toBe('Mondays and Thursdays at 8 AM')
    expect(scheduleWords({ on: true, days: [0, 1, 2, 3, 4, 5, 6], hour: 0 })).toBe('Every day at 12 AM')
    expect(scheduleWords({ on: false, days: [0], hour: 22 })).toBe('Off')
  })
})

describe('what became of a result', () => {
  it('is in the scores, or says why not yet', () => {
    expect(resultState({ evaluations: { standing: 'e1' } })).toBe('in')
    expect(resultState({ evaluations: {}, error: 'The results site doesn’t give this result.', tries: 2 })).toBe('notPublished')
    expect(resultState({ evaluations: {}, error: null, tries: 1 })).toBe('noShots')
    expect(resultState({ evaluations: {} })).toBe('waiting')
    expect(resultState({ evaluations: {}, error: 'x', tries: 10 })).toBe('stopped')
  })
})

describe('the page’s answers', () => {
  const result = (dateKey: string): AthleteResult => ({ matchId: 'm', matchName: 'Made-up October 3P', dateKey: dateKey as AthleteResult['dateKey'], team: 'ARC 10.9', host: null, lastUpdated: null, evaluations: {} })
  const athletes: (Pick<OnlineAthlete, 'status' | 'suggestedStudentId' | 'results'> & { id: string })[] = [
    { id: 'averystone', status: 'new', suggestedStudentId: 's-avery', results: { r1: result('2026-11-05'), r2: result('2026-10-20') } },
    { id: 'ivyrowan', status: 'new', suggestedStudentId: null, results: { r3: result('2026-11-09') } },
    { id: 'milohart', status: 'new', suggestedStudentId: 's-gone', results: { r4: result('2026-11-10') } },
    { id: 'noraquinn', status: 'linked', suggestedStudentId: 's-nora', results: { r5: result('2026-11-10') } },
  ]
  it('Confirm all links only the athletes to confirm whose suggested student is still there, and counts the families’ news', () => {
    const plan = confirmAllPlan(athletes, '2026-11-11', (id) => id !== 's-gone')
    expect(plan.links).toEqual([{ key: 'averystone', studentId: 's-avery' }])
    expect(plan.results).toBe(2)
    // Nov 5 is within the last week of Nov 11 (the family hears of it); Oct 20 isn't.
    expect(plan.news).toBe(1)
    expect(confirmAllPlan(athletes, '2026-11-13', () => true).news).toBe(1)
  })
  it('says how far back a check looks', () => {
    expect([7, 14, 30, 60].map(checkWindowWords)).toEqual(['The last week', 'The last 2 weeks', 'The last month', 'The last 2 months'])
    expect(checkWindowWords(10)).toBe('The last 10 days')
  })
  it('says what Start over took away and put back', () => {
    expect(resetWords({ athletes: 16, results: 9, scans: 3, matches: 198, checks: 2 })).toBe(
      'Removed 16 athletes, 9 results from the scores, 198 matches looked at and 2 checks; 3 results sheet scans are as they were.',
    )
    expect(resetWords({ athletes: 1, results: 1, scans: 1, matches: 1, checks: 1 })).toBe(
      'Removed 1 athlete, 1 result from the scores, 1 match looked at and 1 check; 1 results sheet scan is as it was.',
    )
    expect(resetWords({ athletes: 0, results: 0, scans: 0, matches: 0, checks: 0 })).toBe('Removed 0 athletes, 0 results from the scores, 0 matches looked at and 0 checks.')
  })
})
