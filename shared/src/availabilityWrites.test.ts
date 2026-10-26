import { describe, expect, it } from 'vitest'
import { availabilityRecord, availabilitySummary, classesLeftUncovered, noCoachWarning, shrinkingDays } from './availabilityWrites'
import type { AcademyClass, Session, WithId } from './types'

const NY = 'America/New_York'
const open = { isOpen: true, openMin: 840, closeMin: 1260 }
const hoursOf = () => open
const t = (h: number, m = 0) => h * 60 + m

describe('saving a day of availability', () => {
  it('stores times, a not available mark, or nothing', () => {
    expect(availabilityRecord('s1', { dateKey: '2026-10-20', ranges: [{ startMin: 1000, endMin: 1100 }, { startMin: 960, endMin: 1000 }] }, NY, 'coach')).toMatchObject({
      staffId: 's1',
      dateKey: '2026-10-20',
      weekday: 'tuesday',
      ranges: [{ startMin: 960, endMin: 1100 }],
      unavailable: false,
      updatedVia: 'coach',
    })
    // Not available keeps no times, whatever was passed.
    expect(availabilityRecord('s1', { dateKey: '2026-10-20', ranges: [{ startMin: 960, endMin: 1000 }], unavailable: true }, NY, 'coach')).toMatchObject({ ranges: [], unavailable: true })
    expect(availabilityRecord('s1', { dateKey: '2026-10-20', ranges: [] }, NY, 'coach')).toBe(null)
    // Midnight in the academy's zone (EDT: 4 AM UTC).
    expect(availabilityRecord('s1', { dateKey: '2026-10-20', ranges: [], unavailable: true }, NY, 'admin')?.dayStartAt.toISOString()).toBe('2026-10-20T04:00:00.000Z')
  })
  it('says what changed', () => {
    expect(availabilitySummary('Hannah Moreno', [{ dateKey: '2026-10-20', ranges: [], unavailable: true }])).toBe('Marked Hannah Moreno not available on Tue, Oct 20')
    expect(availabilitySummary('Hannah Moreno', [{ dateKey: '2026-10-20', ranges: [{ startMin: 960, endMin: 1260 }] }])).toBe('Set Hannah Moreno’s availability on Tue, Oct 20: 4:00 PM – 9:00 PM')
    expect(availabilitySummary('Hannah Moreno', [{ dateKey: '2026-10-20', ranges: [] }])).toBe('Cleared Hannah Moreno’s availability on Tue, Oct 20')
    expect(availabilitySummary('Hannah Moreno', [{ dateKey: '2026-10-20', ranges: [] }, { dateKey: '2026-10-21', ranges: [] }])).toBe('Updated Hannah Moreno’s availability on 2 days')
  })
  it('keeps the name and the role, so other coaches see who’s in with them', () => {
    expect(availabilityRecord('s1', { dateKey: '2026-10-20', ranges: [{ startMin: 960, endMin: 1100 }] }, NY, 'coach', 'Hannah Moreno', 'coach')).toMatchObject({ staffName: 'Hannah Moreno', staffRole: 'coach' })
    expect(availabilityRecord('s1', { dateKey: '2026-10-20', ranges: [{ startMin: 960, endMin: 1100 }] }, NY, 'coach')).not.toHaveProperty('staffName')
  })
})

describe('classes a change leaves with no coach in', () => {
  const current = (d: string) => (d === '2026-10-20' || d === '2026-10-21' ? [{ startMin: 840, endMin: 1260 }] : [])
  const day = '2026-10-20'
  const cls = (id: string, startMin: number, endMin: number, p: Partial<AcademyClass> = {}) => ({ id, dateKey: day, startMin, endMin, seats: 6, isDeleted: false, ...p }) as WithId<AcademyClass>
  const seat = (classId: string, status: Session['status'] = 'confirmed') => ({ classId, status, isDeleted: false })
  const hours = (staffId: string, startMin: number, endMin: number) => ({ staffId, dateKey: day, ranges: [{ startMin, endMin }], unavailable: false })
  const classes = [cls('first', t(16, 30), t(18)), cls('second', t(18), t(19)), cls('empty', t(19), t(20)), cls('gone', t(19), t(20), { isDeleted: true })]
  const seats = [seat('first'), seat('first'), seat('second'), seat('empty', 'canceled'), seat('gone')]
  const opts = { staffId: 'pat', days: [{ dateKey: day, ranges: [], unavailable: true }], classes, seats, hoursOf, today: '2026-10-18', nowMin: 600 }

  it('finds the days that lose time', () => {
    const days = [
      { dateKey: '2026-10-20', ranges: [], unavailable: true },
      { dateKey: '2026-10-21', ranges: [{ startMin: 840, endMin: 1260 }] },
      { dateKey: '2026-10-22', ranges: [{ startMin: 840, endMin: 960 }] },
    ]
    expect(shrinkingDays(days, current, hoursOf)).toEqual(['2026-10-20'])
  })

  it('lists the classes with students that only this coach covered', () => {
    // Pat is in all evening, Sam only until 6: Pat leaving leaves the 6 PM class with nobody.
    const records = [hours('pat', t(16), t(21)), hours('sam', t(16), t(18))]
    const left = classesLeftUncovered({ ...opts, records })
    expect(left).toEqual([{ dateKey: day, startMin: t(18), endMin: t(19), students: 1 }])
    expect(noCoachWarning(left, 'coach')).toEqual({
      title: '1 class would have no coach in',
      description: 'No other coach is in for all or part of Tue, Oct 20, 6:00 PM – 7:00 PM (1 student). If you save, it stays on the schedule without a coach until another coach is in. If it’s urgent, tell the admin too.',
    })
    // Another coach in all evening covers everything; the manager doesn't teach.
    expect(classesLeftUncovered({ ...opts, records: [...records, hours('lee', t(16), t(21))] })).toEqual([])
    expect(classesLeftUncovered({ ...opts, records: [...records, { ...hours('ana', t(16), t(21)), staffRole: 'admin' as const }] })).toHaveLength(1)
    // Someone who doesn't teach changes nothing, and nor do classes over already.
    expect(classesLeftUncovered({ ...opts, records, staffRole: 'admin' })).toEqual([])
    expect(classesLeftUncovered({ ...opts, records, today: day, nowMin: t(19) })).toEqual([])
  })

  it('counts a coach leaving part of a class', () => {
    const records = [hours('pat', t(16), t(21)), hours('sam', t(16), t(18, 30))]
    const left = classesLeftUncovered({ ...opts, records, days: [{ dateKey: day, ranges: [{ startMin: t(16), endMin: t(18) }] }] })
    expect(left.map((c) => c.startMin)).toEqual([t(18)])
    expect(noCoachWarning([...left, ...left], 'admin').title).toBe('2 classes would have no coach in')
  })
})
