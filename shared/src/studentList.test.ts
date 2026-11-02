import { describe, expect, it } from 'vitest'
import {
  type SortableStudent,
  type StudentSort,
  classesAhead,
  compareStudents,
  findStudent,
  inStudentTab,
  lastClassLabel,
  lastClassOf,
  levelGroups,
  nextClassLabel,
  nextClassOf,
  pickStudentSort,
} from './studentList'

// A Monday.
const today = '2026-11-02'

describe('the status tabs', () => {
  it('keep each status apart, and the inactive ones together', () => {
    expect(inStudentTab('enrolled', 'all')).toBe(true)
    expect(inStudentTab('enrolled', 'enrolled')).toBe(true)
    expect(inStudentTab('paused', 'enrolled')).toBe(false)
    expect(inStudentTab('signed_up', 'signed_up')).toBe(true)
    for (const s of ['finished', 'no_answer', 'not_interested'] as const) expect(inStudentTab(s, 'inactive')).toBe(true)
    expect(inStudentTab('paused', 'inactive')).toBe(false)
  })
})

describe('finding a student', () => {
  const avery = { name: 'Avery Stone', nameLower: 'avery stone', otherNames: ['Ave Stone', 'Seo-yeon Stone'] }

  it('finds them by their name, or by another name, and says which', () => {
    expect(findStudent(avery, '')).toEqual({ found: true, also: null })
    expect(findStudent(avery, '  STONE ')).toEqual({ found: true, also: null })
    expect(findStudent(avery, 'seo')).toEqual({ found: true, also: 'Seo-yeon Stone' })
    expect(findStudent(avery, 'jordan')).toEqual({ found: false, also: null })
    expect(findStudent({ name: 'Mia Larkin', nameLower: 'mia larkin' }, 'mia')).toEqual({ found: true, also: null })
  })
})

describe('a student’s next and last class', () => {
  const seat = (studentId: string, dateKey: string, startMin: number, extra: Partial<{ status: 'pending' | 'confirmed' | 'present' | 'no_show' | 'canceled'; isDeleted: boolean }> = {}) => ({
    studentId,
    dateKey,
    startMin,
    endMin: startMin + 60,
    status: extra.status ?? 'confirmed',
    isDeleted: extra.isDeleted ?? false,
  })

  it('takes the first class that hasn’t ended, with its time', () => {
    // 5:30 PM: the 4 PM class has ended, the 5 PM one is going on.
    const ahead = classesAhead(
      [seat('a', '2026-11-05', 1080), seat('a', today, 1020), seat('a', today, 960), seat('b', '2026-11-03', 960), seat('b', '2026-11-03', 900)],
      today,
      1050,
    )
    expect(ahead.get('a')).toEqual({ next: { dateKey: today, startMin: 1020, endMin: 1080 }, endedToday: true })
    expect(ahead.get('b')).toEqual({ next: { dateKey: '2026-11-03', startMin: 900, endMin: 960 }, endedToday: false })
  })

  it('skips canceled seats, no-shows, deleted seats and past days', () => {
    const ahead = classesAhead(
      [
        seat('a', '2026-11-03', 960, { status: 'canceled' }),
        seat('a', '2026-11-04', 960, { status: 'no_show' }),
        seat('a', '2026-11-05', 960, { isDeleted: true }),
        seat('a', '2026-11-01', 960),
        seat('a', '2026-11-06', 1020),
      ],
      today,
      600,
    )
    expect(ahead.get('a')).toEqual({ next: { dateKey: '2026-11-06', startMin: 1020, endMin: 1080 }, endedToday: false })
  })

  it('uses the record’s date until the classes are read, or past the days they cover', () => {
    const until = '2026-11-15'
    const timed = { next: { dateKey: '2026-11-05', startMin: 1080, endMin: 1140 }, endedToday: false }
    expect(nextClassOf({ nextSessionDate: '2026-11-05' }, timed, true, today, until)).toEqual({ dateKey: '2026-11-05', startMin: 1080, endMin: 1140 })
    expect(nextClassOf({ nextSessionDate: '2026-11-05' }, undefined, false, today, until)).toEqual({ dateKey: '2026-11-05', startMin: null, endMin: null })
    expect(nextClassOf({ nextSessionDate: '2026-11-23' }, undefined, true, today, until)).toEqual({ dateKey: '2026-11-23', startMin: null, endMin: null })
    // Read, and nothing before the 15th: the record's date is from before a change.
    expect(nextClassOf({ nextSessionDate: '2026-11-05' }, undefined, true, today, until)).toBeNull()
    // A date that has passed (the night's update hasn't run).
    expect(nextClassOf({ nextSessionDate: '2026-10-30' }, undefined, false, today, until)).toBeNull()
    expect(nextClassOf({ nextSessionDate: null }, undefined, false, today, until)).toBeNull()
  })

  it('makes today the last class once one has ended today', () => {
    expect(lastClassOf({ lastSessionDate: '2026-10-29' }, { next: null, endedToday: true }, today)).toBe(today)
    expect(lastClassOf({ lastSessionDate: '2026-10-29' }, { next: null, endedToday: false }, today)).toBe('2026-10-29')
    expect(lastClassOf({ lastSessionDate: null }, undefined, today)).toBeNull()
  })

  it('words the next class by how soon it is', () => {
    const at = (dateKey: string, startMin: number | null) => ({ dateKey, startMin, endMin: startMin === null ? null : startMin + 60 })
    expect(nextClassLabel(at(today, 1080), today, false)).toEqual({ when: 'Today, 6:00 PM', sub: '', isToday: true })
    expect(nextClassLabel(at('2026-11-03', 1020), today, false)).toEqual({ when: 'Tomorrow, 5:00 PM', sub: '', isToday: false })
    expect(nextClassLabel(at('2026-11-05', 1080), today, false)).toEqual({ when: 'Thu, 6:00 PM', sub: 'in 3 days', isToday: false })
    expect(nextClassLabel(at('2026-11-05', 960), today, true)).toEqual({ when: 'Thu, 4:00 PM', sub: 'in 3 days · first class', isToday: false })
    expect(nextClassLabel(at(today, 960), today, true).sub).toBe('first class')
    // A week on, the date: "Mon" would read as today.
    expect(nextClassLabel(at('2026-11-09', 1080), today, false)).toEqual({ when: 'Nov 9, 6:00 PM', sub: 'in 7 days', isToday: false })
    // The time isn't known: the day alone.
    expect(nextClassLabel(at('2026-11-23', null), today, false)).toEqual({ when: 'Nov 23', sub: 'in 21 days', isToday: false })
    expect(nextClassLabel(at('2026-11-04', null), today, false).when).toBe('Wed')
  })

  it('words the last class more quietly the longer ago it was', () => {
    expect(lastClassLabel(today, today)).toBe('Today')
    expect(lastClassLabel('2026-11-01', today)).toBe('Yesterday')
    expect(lastClassLabel('2026-10-08', today)).toBe('25 days ago')
    expect(lastClassLabel('2026-09-18', today)).toBe('45 days ago')
    expect(lastClassLabel('2026-09-17', today)).toBe('2 months ago')
    expect(lastClassLabel('2026-05-17', today)).toBe('6 months ago')
    expect(lastClassLabel('2025-10-01', today)).toBe('Over a year ago')
  })
})

describe('sorting students', () => {
  const order = { levels: ['Discovery', 'Scout', 'Hunter'], grades: ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'College', 'Adult'] }
  const kid = (nameLower: string, extra: Partial<SortableStudent> = {}): SortableStudent => ({
    nameLower,
    grade: '',
    level: null,
    signUpDate: null,
    next: null,
    last: null,
    ...extra,
  })
  const sorted = (list: SortableStudent[], sort: StudentSort) => [...list].sort((a, b) => compareStudents(a, b, sort, order)).map((s) => s.nameLower)

  it('turns a sort around when it’s picked again, and starts each in its own direction', () => {
    expect(pickStudentSort({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' })
    expect(pickStudentSort({ key: 'name', dir: 'asc' }, 'signUp')).toEqual({ key: 'signUp', dir: 'desc' })
    expect(pickStudentSort({ key: 'signUp', dir: 'desc' }, 'next')).toEqual({ key: 'next', dir: 'asc' })
    expect(pickStudentSort({ key: 'next', dir: 'asc' }, 'last')).toEqual({ key: 'last', dir: 'desc' })
  })

  it('orders grades and levels as the academy lists them, the missing ones last both ways', () => {
    const list = [kid('ava', { grade: 'College' }), kid('ben', { grade: '10' }), kid('cy', { grade: '9' }), kid('di'), kid('eli', { grade: 'Kinder' })]
    expect(sorted(list, { key: 'grade', dir: 'asc' })).toEqual(['cy', 'ben', 'ava', 'eli', 'di'])
    expect(sorted(list, { key: 'grade', dir: 'desc' })).toEqual(['eli', 'ava', 'ben', 'cy', 'di'])
    const levels = [kid('ava', { level: 'Hunter' }), kid('ben'), kid('cy', { level: 'Discovery' }), kid('di', { level: 'Retired level' }), kid('eli', { level: 'Discovery' })]
    expect(sorted(levels, { key: 'level', dir: 'asc' })).toEqual(['cy', 'eli', 'ava', 'di', 'ben'])
  })

  it('puts the soonest class first, a known time before an unknown one that day', () => {
    const at = (dateKey: string, startMin: number | null) => ({ dateKey, startMin, endMin: null })
    const list = [kid('ava', { next: at('2026-11-03', 960) }), kid('ben'), kid('cy', { next: at(today, 1140) }), kid('di', { next: at(today, 960) }), kid('eli', { next: at('2026-11-03', null) })]
    expect(sorted(list, { key: 'next', dir: 'asc' })).toEqual(['di', 'cy', 'ava', 'eli', 'ben'])
    expect(sorted(list, { key: 'next', dir: 'desc' })).toEqual(['eli', 'ava', 'cy', 'di', 'ben'])
  })

  it('puts the newest sign-ups and the latest classes first, and breaks ties by name', () => {
    const list = [kid('cy', { signUpDate: '2026-01-05', last: '2026-10-30' }), kid('ava', { signUpDate: '2026-09-01', last: '2026-11-01' }), kid('ben', { last: '2026-11-01' })]
    expect(sorted(list, { key: 'signUp', dir: 'desc' })).toEqual(['ava', 'cy', 'ben'])
    expect(sorted(list, { key: 'last', dir: 'desc' })).toEqual(['ava', 'ben', 'cy'])
    expect(sorted(list, { key: 'name', dir: 'desc' })).toEqual(['cy', 'ben', 'ava'])
  })
})

describe('grouping students by level', () => {
  const ladder = ['Discovery', 'Scout', 'Hunter']
  const rows = [
    { n: 'ava', l: 'Hunter' },
    { n: 'ben', l: null },
    { n: 'cy', l: 'Discovery' },
    { n: 'di', l: 'Old level' },
    { n: 'eli', l: 'Discovery' },
  ]

  it('goes from the lowest level up, then levels no longer listed, then no level yet', () => {
    const groups = levelGroups(rows, (r) => r.l, ladder)
    expect(groups.map((g) => [g.level, g.rows.map((r) => r.n)])).toEqual([
      ['Discovery', ['cy', 'eli']],
      ['Hunter', ['ava']],
      ['Old level', ['di']],
      [null, ['ben']],
    ])
  })

  it('goes from the highest when the levels are sorted that way, no level yet still last', () => {
    expect(levelGroups(rows, (r) => r.l, ladder, true).map((g) => g.level)).toEqual(['Hunter', 'Discovery', 'Old level', null])
    expect(levelGroups([], (r: { l: string }) => r.l, ladder)).toEqual([])
  })
})
