import { describe, expect, it } from 'vitest'
import { type IdMap, IMPORT_AUTHOR, type ImportFile, classesDocs, peopleDocs } from './academy-import'

// Made-up people only: the real import file lives in docs/internal/ and never reaches the tests.
const file: ImportFile = {
  version: 1,
  historyThrough: '2026-10-25',
  standingThrough: '2026-11-30',
  staff: [
    { key: 'pat', firstName: 'Pat', lastName: 'Rivera', legalName: 'Patricia Rivera', email: 'Pat.Rivera@Example.test', phone: '(555) 010-0001', role: 'admin', rate: 20, title: 'Manager', usualDays: ['monday', 'sunday'] },
    { key: 'sam', firstName: 'Sam', lastName: 'Okafor', legalName: 'Sam Okafor', email: 'sam@example.test', phone: '(555) 010-0002', role: 'coach', rate: 18, title: 'Coach', usualDays: ['tuesday'], sundays: 'rotation' },
  ],
  students: [
    { key: 'avery-stone', firstName: 'Avery', lastName: 'Stone', otherName: 'Minji', grade: '7', gradeChecked: false, level: 'Scout', program: 'Launchpad', rifle: 'C4', parents: [{ email: 'Parent.Stone@Example.test', phone: '(555) 010-0100', relation: 'Mother' }], notes: ['Every other week: Sun 5-6 (2026-11)'], contacts: true },
    { key: 'blake-rivers', firstName: 'Blake', lastName: 'Rivers', otherName: null, grade: null, gradeChecked: false, level: 'Grandmaster', program: null, rifle: null, parents: [], notes: [], contacts: false },
  ],
  days: [],
  duty: [],
}

const opts = (ids: IdMap) => ({ academyId: 'test', now: new Date('2026-11-01T12:00:00Z'), today: '2026-11-01', levels: ['Scout', 'Marksman'], programs: ['Launchpad'], ids })

describe('the academy import: people', () => {
  it('writes staff with their rate and notes, students with their parents, and no access at all', () => {
    const ids: IdMap = {}
    const { docs, problems, summary } = peopleDocs(file, opts(ids))
    const at = (suffix: string) => docs.find((d) => d.path.endsWith(suffix))?.data
    const pat = ids['staff:pat']
    const avery = ids['student:avery-stone']
    expect(pat).toMatch(/^[A-Za-z0-9]{20}$/)
    expect(at(`/staff/${pat}`)).toMatchObject({ name: 'Pat Rivera', email: 'pat.rivera@example.test', role: 'admin', status: 'active', createdBy: IMPORT_AUTHOR })
    expect(at(`/staff/${pat}/private/compensation`)).toMatchObject({ rates: { teaching: 20, admin: 20 } })
    expect(at(`/staff/${pat}/private/notes`)?.adminNote).toBe('Legal name: Patricia Rivera. Manager. Usual days: Mon, Sun.')
    expect(at(`/staff/${ids['staff:sam']}/private/notes`)?.adminNote).toBe('Coach. Usual days: Tue; Sundays in turn.')
    expect(at(`/students/${avery}`)).toMatchObject({ name: 'Avery Stone', grade: '7', level: 'Scout', program: 'Launchpad', rifle: 'C4', status: 'enrolled' })
    expect(at(`/students/${avery}/private/profile`)).toMatchObject({
      parents: [{ name: '', email: 'parent.stone@example.test', phone: '(555) 010-0100', relation: 'Mother' }],
      adminNote: 'Also called Minji. Grade from the contacts list, not yet reviewed. Every other week: Sun 5-6 (2026-11).',
    })
    expect(docs.some((d) => d.path.includes('/members/'))).toBe(false)
    expect(problems).toEqual([`Blake Rivers: level "Grandmaster" isn't one of the academy's levels; left empty.`])
    expect(summary).toEqual({ staff: 2, students: 2, parents: 1, withoutParents: ['Blake Rivers'] })
  })

  it('keeps the same IDs on a second run', () => {
    const ids: IdMap = {}
    const first = peopleDocs(file, opts(ids)).docs.map((d) => d.path)
    const again = peopleDocs(file, opts(ids)).docs.map((d) => d.path)
    expect(again).toEqual(first)
    expect(Object.keys(ids).sort()).toEqual(['staff:pat', 'staff:sam', 'student:avery-stone', 'student:blake-rivers'])
  })
})

// The classes on two made-up days: a Sunday before the clocks go back (EDT) and a Monday after (EST), listed out of
// order. The manager (Pat) is in on both, but doesn't teach.
const withClasses: ImportFile = {
  ...file,
  days: [
    {
      dateKey: '2026-11-02',
      classes: [
        {
          startMin: 990,
          endMin: 1080,
          seats: [
            { student: 'avery-stone', kind: 'regular', label: '', status: 'canceled', note: 'Absent: make-up planned for 11/5' },
            { student: 'blake-rivers', kind: 'regular', label: '', status: 'confirmed' },
          ],
        },
        { startMin: 1050, endMin: 1110, seats: [{ student: 'blake-rivers', kind: 'practice', label: 'Practice', status: 'confirmed' }] },
      ],
    },
    {
      dateKey: '2026-10-25',
      classes: [
        {
          startMin: 840,
          endMin: 930,
          seats: [
            { student: 'avery-stone', kind: 'regular', label: '', status: 'present' },
            { student: 'casey-nobody', kind: 'regular', label: '', status: 'present' },
            { student: 'blake-rivers', kind: 'trial', label: 'Trial 1', status: 'present', startMin: 900, endMin: 930, note: 'Sister of a student' },
          ],
        },
        { startMin: 930, endMin: 1020, seats: [{ student: 'avery-stone', kind: 'makeup', label: 'MU for 10/18', status: 'present' }] },
      ],
    },
  ],
  duty: [
    { staff: 'pat', dateKey: '2026-10-25', startMin: 810, endMin: 1050 },
    { staff: 'sam', dateKey: '2026-10-25', startMin: 810, endMin: 1050 },
    { staff: 'sam', dateKey: '2026-11-02', startMin: 960, endMin: 1020 },
    { staff: 'sam', dateKey: '2026-11-02', startMin: 1050, endMin: 1110 },
    { staff: 'pat', dateKey: '2026-11-02', startMin: 960, endMin: 1110 },
    { staff: 'jordan-unlisted', dateKey: '2026-11-02', startMin: 960, endMin: 1200 },
  ],
}

const classOpts = (ids: IdMap, seatsPerClass = 6) => ({ academyId: 'test', now: new Date('2026-11-01T12:00:00Z'), timezone: 'America/New_York', seatsPerClass, ids })

describe('the academy import: classes', () => {
  it('writes each class with its seats, labelled in the sheets’ words and taught by whoever is in', () => {
    const ids: IdMap = {}
    const { docs, problems, summary } = classesDocs(withClasses, classOpts(ids))
    const at = (path: string) => docs.find((d) => d.path === `branches/test/${path}`)?.data
    const sunday = ids['class:2026-10-25:840-930']
    const avery = ids['student:avery-stone']
    expect(sunday).toMatch(/^[A-Za-z0-9]{20}$/)
    expect(at(`classes/${sunday}`)).toMatchObject({
      dateKey: '2026-10-25',
      weekday: 'sunday',
      startMin: 840,
      endMin: 930,
      startAt: new Date('2026-10-25T18:00:00Z'),
      endAt: new Date('2026-10-25T19:30:00Z'),
      dayEndAt: new Date('2026-10-26T04:00:00Z'),
      seats: 6,
      note: '',
      source: 'import',
      isDeleted: false,
      createdBy: IMPORT_AUTHOR,
    })
    expect(at(`classes/${ids['class:2026-11-02:990-1080']}`)).toMatchObject({ startAt: new Date('2026-11-02T21:30:00Z'), dayEndAt: new Date('2026-11-03T05:00:00Z') })
    expect(at(`sessions/${ids['seat:2026-10-25:840-930:avery-stone']}`)).toMatchObject({
      classId: sunday,
      coachId: '',
      coachName: '',
      studentId: avery,
      studentName: 'Avery Stone',
      studentGrade: '7',
      note: '',
      status: 'present',
      dateKey: '2026-10-25',
      weekday: 'sunday',
      startMin: 840,
      endMin: 930,
      visualOrder: 0,
      source: 'import',
      isDeleted: false,
    })
    // A seat for part of the class keeps its own time; its own note follows its label.
    expect(at(`sessions/${ids['seat:2026-10-25:840-930:blake-rivers']}`)).toMatchObject({
      note: 'Trial 1 · Sister of a student',
      studentGrade: '',
      startMin: 900,
      endMin: 930,
      startAt: new Date('2026-10-25T19:00:00Z'),
      visualOrder: 2,
    })
    expect(at(`sessions/${ids['seat:2026-10-25:930-1020:avery-stone']}`)).toMatchObject({ note: 'MU for 10/18', classId: ids['class:2026-10-25:930-1020'] })
    expect(at(`sessions/${ids['seat:2026-11-02:990-1080:avery-stone']}`)).toMatchObject({ note: 'Absent: make-up planned for 11/5', status: 'canceled' })
    // Who's in: one record a person and day, with their name and role (the manager is in but doesn't teach).
    const sam = ids['staff:sam']
    expect(at(`availability/${sam}_2026-11-02`)).toEqual({
      staffId: sam,
      staffName: 'Sam Okafor',
      staffRole: 'coach',
      dateKey: '2026-11-02',
      weekday: 'monday',
      ranges: [
        { startMin: 960, endMin: 1020 },
        { startMin: 1050, endMin: 1110 },
      ],
      unavailable: false,
      hidden: false,
      dayStartAt: new Date('2026-11-02T05:00:00Z'),
      updatedVia: 'admin',
      createdAt: new Date('2026-11-01T12:00:00Z'),
      createdBy: IMPORT_AUTHOR,
      updatedAt: new Date('2026-11-01T12:00:00Z'),
      updatedBy: IMPORT_AUTHOR,
    })
    expect(at(`availability/${ids['staff:pat']}_2026-10-25`)).toMatchObject({ staffName: 'Pat Rivera', staffRole: 'admin', dayStartAt: new Date('2026-10-25T04:00:00Z') })
    expect(problems).toEqual([
      'Mon, Nov 2: hours for "jordan-unlisted", who isn\'t among the import\'s staff; left out.',
      'Sun, Oct 25, 2:00 PM – 3:30 PM: a seat for "casey-nobody", who isn\'t among the import\'s students; left out.',
      'Mon, Nov 2, 4:30 PM – 6:00 PM: no coach in 5:00 PM – 5:30 PM.',
      'Blake Rivers: two seats at once on Mon, Nov 2 (4:30 PM – 6:00 PM and 5:30 PM – 6:30 PM); both kept.',
    ])
    expect(summary).toEqual({
      days: 2,
      from: '2026-10-25',
      to: '2026-11-02',
      classes: 4,
      seats: 6,
      kinds: { regular: 3, makeup: 1, practice: 1, trial: 1, evaluation: 0 },
      canceled: 1,
      whosIn: 4,
    })
  })

  it('reports a full class, two classes at once, and a label that says something else', () => {
    const twice: ImportFile = {
      ...withClasses,
      days: [
        ...withClasses.days,
        {
          dateKey: '2026-11-03',
          classes: [
            { startMin: 1020, endMin: 1080, seats: [{ student: 'avery-stone', kind: 'practice', label: '', status: 'confirmed' }] },
            { startMin: 1020, endMin: 1080, seats: [] },
          ],
        },
      ],
    }
    const ids: IdMap = {}
    const { problems } = classesDocs(twice, classOpts(ids, 1))
    expect(problems).toContain('Sun, Oct 25, 2:00 PM – 3:30 PM: 2 students for 1 seat.')
    expect(problems).toContain('Tue, Nov 3, 5:00 PM – 6:00 PM: two classes at the same time; both kept.')
    expect(problems).toContain('Tue, Nov 3, 5:00 PM – 6:00 PM: no coach in.')
    expect(problems).toContain('Avery Stone, Tue, Nov 3, 5:00 PM – 6:00 PM: "" reads as regular, not practice.')
    expect(ids['class:2026-11-03:1020-1080#2']).not.toBe(ids['class:2026-11-03:1020-1080'])
  })

  it('keeps the same IDs on a second run', () => {
    const ids: IdMap = {}
    const first = classesDocs(withClasses, classOpts(ids)).docs.map((d) => d.path)
    const again = classesDocs(withClasses, classOpts(ids)).docs.map((d) => d.path)
    expect(again).toEqual(first)
    expect(Object.keys(ids).filter((k) => k.startsWith('class:')).sort()).toEqual([
      'class:2026-10-25:840-930',
      'class:2026-10-25:930-1020',
      'class:2026-11-02:1050-1110',
      'class:2026-11-02:990-1080',
    ])
    expect(Object.keys(ids).filter((k) => k.startsWith('seat:'))).toHaveLength(6)
  })
})
