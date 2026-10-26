import { describe, expect, it } from 'vitest'
import type { SessionStatus } from '../settings/defaults'
import type { TimestampLike } from '../types'
import { priceClassBlocks } from './classes'
import { totals } from './segment'
import { priceShifts } from './shifts'

const at = (hhmm: string): TimestampLike => {
  const [h, m] = hhmm.split(':').map(Number)
  const ms = Date.UTC(2026, 8, 30, h, m)
  return { seconds: ms / 1000, nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms }
}
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
const cls = (studentId: string, start: string, end: string, extra: Partial<{ coachId: string; dateKey: string; status: SessionStatus; isDeleted: boolean }> = {}) => ({
  coachId: 'maya',
  studentId,
  dateKey: '2026-09-30',
  startMin: min(start),
  endMin: min(end),
  status: 'present' as SessionStatus,
  isDeleted: false,
  startAt: at(start),
  endAt: at(end),
  ...extra,
})
const settings = { payroll: { teachingSessionStatuses: ['present'] as SessionStatus[], hoursDecimals: 2, payPeriod: { type: 'biweekly' as const, anchorDate: '2026-01-04' } } }
const rules = { payModels: [{ model: 'classes' as const, from: '2000-01-01' }] }
const coach = () => ({ rates: { teaching: 30, admin: 15 }, role: 'coach' as const })

describe('priceClassBlocks', () => {
  it('pays a class taught together to every coach in at its time, once each', () => {
    const together = { coachId: '' }
    const availability = [
      { staffId: 'maya', dateKey: '2026-09-30', ranges: [{ startMin: min('16:00'), endMin: min('20:00') }], unavailable: false },
      { staffId: 'theo', dateKey: '2026-09-30', ranges: [{ startMin: min('16:00'), endMin: min('18:00') }], unavailable: false },
      { staffId: 'iris', dateKey: '2026-09-30', ranges: [], unavailable: true },
    ]
    const out = priceClassBlocks({
      sessions: [cls('a', '16:30', '18:00', together), cls('b', '16:30', '18:00', together), cls('c', '18:00', '19:00', together)],
      availability,
      settings,
      rules,
      ratesFor: coach,
    })
    expect(out.map((b) => [b.staffId, b.students, b.segment.hours])).toEqual([
      ['maya', 2, 1.5],
      ['theo', 2, 1.5],
      ['maya', 1, 1],
    ])
  })

  it('pays each block once, however many students, and keeps blocks back to back apart', () => {
    const out = priceClassBlocks({
      sessions: [
        cls('a', '16:30', '17:30'),
        cls('b', '16:30', '17:30'),
        cls('c', '16:30', '17:30'),
        // A trial visit inside the block, and a class that runs past the next block's start.
        cls('t', '16:45', '17:15'),
        cls('d', '17:30', '19:00'),
        cls('e', '18:30', '19:30'),
        cls('f', '20:00', '20:30'),
      ],
      settings,
      rules,
      ratesFor: coach,
    })
    expect(out.map((b) => [b.segment.hours, b.segment.pay, b.students])).toEqual([
      [1, 30, 4],
      [2, 60, 2],
      [0.5, 15, 1],
    ])
    expect(out.every((b) => b.segment.type === 'teaching' && b.staffId === 'maya')).toBe(true)
    expect(Object.keys(out[0].segment).sort()).toEqual(['endMs', 'hours', 'pay', 'rate', 'startMs', 'type'])
  })

  it('counts only attended classes, each coach on their own', () => {
    const out = priceClassBlocks({
      sessions: [
        cls('a', '16:30', '17:30', { status: 'no_show' }),
        cls('b', '16:30', '17:30', { status: 'canceled' }),
        cls('c', '16:30', '17:30', { isDeleted: true }),
        cls('d', '16:30', '17:30', { coachId: 'joel' }),
        cls('e', '16:30', '17:30', { status: 'confirmed' }),
      ],
      settings,
      rules,
      ratesFor: coach,
    })
    expect(out.map((b) => [b.staffId, b.segment.hours])).toEqual([['joel', 1]])
  })

  it('applies from the day the academy starts paying this way, and never to owners or admins', () => {
    const switched = { payModels: [{ model: 'hourly' as const, from: '2000-01-01' }, { model: 'classes' as const, from: '2026-10-01' }] }
    const sessions = [cls('a', '16:30', '17:30'), cls('a', '16:30', '17:30', { dateKey: '2026-10-01' }), cls('b', '16:30', '17:30', { dateKey: '2026-10-01', coachId: 'manager' })]
    const out = priceClassBlocks({ sessions, settings, rules: switched, ratesFor: (id) => (id === 'manager' ? { rates: { teaching: 0, admin: 25 }, role: 'admin' } : coach()) })
    expect(out.map((b) => [b.staffId, b.dateKey])).toEqual([['maya', '2026-10-01']])
  })

  it('keeps clocked time as an unpaid log', () => {
    const [p] = priceShifts({
      shifts: [{ staffId: 'maya', dateKey: '2026-09-30', inMin: 960, clockInAt: at('16:00'), clockOutAt: at('19:00'), forcedType: null }],
      sessions: [cls('a', '16:30', '17:30')],
      settings,
      rules,
      ratesFor: coach,
    })
    expect(p.segments.map((s) => [s.hours, s.pay, s.unpaid])).toEqual([[3, 0, true]])
    expect(totals(p.segments).total).toEqual({ hours: 0, pay: 0 })
  })
})
