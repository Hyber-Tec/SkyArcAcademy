import { describe, expect, it } from 'vitest'
import { availabilityRecord, availabilitySummary, sessionsLeftUncovered, shrinkingDays, uncoveredWarning } from './availabilityWrites'
import type { Session, WithId } from './types'

const NY = 'America/New_York'
const open = { isOpen: true, openMin: 840, closeMin: 1260 }
const hoursOf = () => open

function session(p: Partial<Session> & { id: string }): WithId<Session> {
  return { studentName: 'Ava Patel', coachId: 's1', dateKey: '2026-10-20', startMin: 960, endMin: 1050, status: 'confirmed', isDeleted: false, ...p } as WithId<Session>
}

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
})

describe('booked classes a change leaves uncovered', () => {
  const current = (d: string) => (d === '2026-10-20' || d === '2026-10-21' ? [{ startMin: 840, endMin: 1260 }] : [])
  it('finds the days that lose time', () => {
    const days = [
      { dateKey: '2026-10-20', ranges: [], unavailable: true },
      { dateKey: '2026-10-21', ranges: [{ startMin: 840, endMin: 1260 }] },
      { dateKey: '2026-10-22', ranges: [{ startMin: 840, endMin: 960 }] },
    ]
    expect(shrinkingDays(days, current, hoursOf)).toEqual(['2026-10-20'])
  })
  it('lists the classes that were covered and no longer are', () => {
    const sessions = [
      session({ id: 'a', startMin: 1080, endMin: 1170 }),
      session({ id: 'b' }),
      session({ id: 'c', status: 'canceled' as Session['status'] }),
      session({ id: 'd', dateKey: '2026-10-21' }),
      session({ id: 'e', dateKey: '2026-10-19' }),
    ]
    const left = sessionsLeftUncovered({ days: [{ dateKey: '2026-10-20', ranges: [], unavailable: true }], currentRanges: current, hoursOf, sessions, today: '2026-10-18', nowMin: 600 })
    expect(left.map((s) => s.id)).toEqual(['b', 'a'])
    expect(uncoveredWarning(left, 'coach').title).toBe('2 booked classes are in this time')
    expect(uncoveredWarning(left.slice(0, 1), 'coach').description).toContain('Ava Patel (Tue, Oct 20, 4:00 PM – 5:30 PM) is booked in the time you’re removing.')
  })
})
