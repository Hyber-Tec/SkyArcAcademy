import { describe, expect, it } from 'vitest'
import { CHAMPIONSHIP_WORDS, dueForRecheck, entrantOf, newestFirst, runSummary, studentIndex, verdictFor, whyWords, windowsBack } from './resultsSite'

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

  it('checks a match again daily for two weeks, then weekly until it’s official, for two months', () => {
    const m = { ours: 2, status: 'UNOFFICIAL' }
    expect(dueForRecheck({ ...m, endDate: '2026-11-01' }, '2026-11-10', 3)).toBe(true)
    expect(dueForRecheck({ ...m, endDate: '2026-10-01' }, '2026-11-10', 3)).toBe(true)
    expect(dueForRecheck({ ...m, status: 'OFFICIAL', endDate: '2026-10-01' }, '2026-11-10', 3)).toBe(false)
    expect(dueForRecheck({ ...m, status: 'OFFICIAL', endDate: '2026-10-01' }, '2026-11-10', 0)).toBe(true)
    expect(dueForRecheck({ ...m, endDate: '2026-08-01' }, '2026-11-10', 0)).toBe(false)
    expect(dueForRecheck({ ...m, ours: 0, endDate: '2026-11-09' }, '2026-11-10', 3)).toBe(false)
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
