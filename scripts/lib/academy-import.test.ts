import { describe, expect, it } from 'vitest'
import { type IdMap, IMPORT_AUTHOR, type ImportFile, peopleDocs } from './academy-import'

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
