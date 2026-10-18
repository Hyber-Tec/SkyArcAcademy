import { describe, expect, it } from 'vitest'
import type { PayModel } from '../settings/businessRules'
import type { SessionStatus } from '../settings/defaults'
import type { TimestampLike } from '../types'
import { payLineTotals, payLines, payModelsBetween } from './lines'
import { payPeriodLabel } from './periods'
import { effectiveRates } from './shifts'

// Made-up people and times (UTC stands in for the academy's zone: the lines follow the dates given).
const at = (dateKey: string, hhmm: string): TimestampLike => {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  const ms = Date.UTC(y, mo - 1, d, h, m)
  return { seconds: ms / 1000, nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms }
}
const shift = (id: string, dateKey: string, inAt: string, outAt: string | null, extra: Partial<{ staffId: string; forcedType: 'teaching' | 'admin' | null }> = {}) => ({
  id,
  staffId: 'maya',
  dateKey,
  inMin: Number(inAt.slice(0, 2)) * 60 + Number(inAt.slice(3)),
  clockInAt: at(dateKey, inAt),
  clockOutAt: outAt ? at(dateKey, outAt) : null,
  forcedType: null,
  ...extra,
})
const cls = (studentId: string, dateKey: string, start: string, end: string, extra: Partial<{ coachId: string; status: SessionStatus; isDeleted: boolean }> = {}) => ({
  coachId: 'maya',
  studentId,
  dateKey,
  status: 'present' as SessionStatus,
  isDeleted: false,
  startAt: at(dateKey, start),
  endAt: at(dateKey, end),
  ...extra,
})
const settings = { payroll: { teachingSessionStatuses: ['present'] as SessionStatus[], hoursDecimals: 2, payPeriod: { type: 'biweekly' as const, anchorDate: '2026-01-04' } } }
const only = (model: PayModel) => ({ payModels: [{ model, from: '2000-01-01' }] })
const coach = () => ({ rates: { teaching: 30, admin: 15 }, role: 'coach' as const })
const range = { from: '2026-09-28', to: '2026-10-04' }

describe('payLines', () => {
  it('under Classes taught: one line per block of classes, and no clock-ins (closed or open)', () => {
    const lines = payLines({
      shifts: [shift('s1', '2026-09-30', '16:00', '19:00'), shift('s2', '2026-10-01', '16:00', null)],
      sessions: [
        cls('a', '2026-10-01', '16:30', '17:30'),
        cls('b', '2026-10-01', '16:30', '17:30'),
        cls('c', '2026-09-30', '17:30', '18:30'),
        cls('d', '2026-09-30', '18:30', '19:30', { status: 'canceled' }),
      ],
      settings,
      rules: only('classes'),
      ratesFor: coach,
      ...range,
    })
    expect(lines.map((l) => (l.open ? ['open', l.dateKey] : [l.type, l.dateKey, l.segment.hours, l.segment.pay, l.students, l.shift]))).toEqual([
      ['classes', '2026-09-30', 1, 30, 1, null],
      ['classes', '2026-10-01', 1, 30, 2, null],
    ])
    expect(lines[0].key).toBe(`class-maya-${at('2026-09-30', '17:30').toMillis()}`)
  })

  it('under Teaching + Admin: each part of a time entry is a line of that entry, and an open entry is listed without pay', () => {
    const closed = shift('s1', '2026-09-30', '15:00', '18:00')
    const open = shift('s2', '2026-10-02', '16:00', null)
    const lines = payLines({
      shifts: [open, closed],
      sessions: [cls('a', '2026-09-30', '16:00', '17:00')],
      settings,
      rules: only('teaching_admin'),
      ratesFor: coach,
      ...range,
    })
    expect(lines.map((l) => (l.open ? ['open', l.key, l.startMs] : [l.type, l.key, l.segment.pay, l.parts]))).toEqual([
      ['admin', 's1-0', 15, 3],
      ['teaching', 's1-1', 30, 3],
      ['admin', 's1-2', 15, 3],
      ['open', 's2', at('2026-10-02', '16:00').toMillis()],
    ])
    expect(lines.slice(0, 3).every((l) => !l.open && l.shift === closed)).toBe(true)
    expect(lines[3].shift).toBe(open)
  })

  it('leaves unpaid time out under Teaching only, counting only the paid parts', () => {
    const lines = payLines({
      shifts: [shift('s1', '2026-09-30', '15:00', '18:00')],
      sessions: [cls('a', '2026-09-30', '16:00', '17:00')],
      settings,
      rules: only('teaching_only'),
      ratesFor: coach,
      ...range,
    })
    expect(lines.map((l) => (l.open ? 'open' : [l.type, l.segment.hours, l.parts]))).toEqual([['teaching', 1, 1]])
  })

  it('pays owners and admins their one rate for clocked time, and lists their open entries under every model', () => {
    const lines = payLines({
      shifts: [shift('m1', '2026-09-30', '15:00', '18:00', { staffId: 'manager' }), shift('m2', '2026-10-01', '15:00', null, { staffId: 'manager' })],
      sessions: [cls('a', '2026-09-30', '16:00', '17:00', { coachId: 'manager' })],
      settings,
      rules: only('classes'),
      ratesFor: () => ({ rates: { teaching: 0, admin: 24 }, role: 'admin' }),
      ...range,
    })
    expect(lines.map((l) => (l.open ? ['open', l.staffId] : [l.type, l.segment.pay]))).toEqual([
      ['admin', 72],
      ['open', 'manager'],
    ])
  })

  it('lists only the dates asked for, oldest first, using the day before for teaching that crosses midnight', () => {
    const lines = payLines({
      shifts: [
        shift('late', '2026-09-28', '00:00', '01:00'),
        shift('early', '2026-09-27', '22:00', '23:00'),
        shift('after', '2026-10-05', '16:00', '17:00'),
        shift('sun', '2026-10-04', '09:00', '10:00'),
      ],
      sessions: [
        // Sunday night's class runs past midnight into Monday's entry; Sunday itself isn't listed.
        { ...cls('a', '2026-09-27', '23:00', '00:00'), endAt: at('2026-09-28', '00:30') },
        cls('b', '2026-10-05', '16:00', '17:00'),
      ],
      settings,
      rules: only('teaching_admin'),
      ratesFor: coach,
      ...range,
    })
    expect(lines.map((l) => (l.open ? 'open' : [l.key, l.type, l.segment.hours]))).toEqual([
      ['late-0', 'teaching', 0.5],
      ['late-1', 'admin', 0.5],
      ['sun-0', 'admin', 1],
    ])
  })

  it('adds up the paid lines, the blocks of classes and the open entries', () => {
    const lines = payLines({
      // The academy moves to Classes taught on Oct 1: the open entry before it is still listed, the one after isn't.
      shifts: [shift('s1', '2026-09-30', '15:00', '18:00'), shift('s2', '2026-09-29', '16:00', null), shift('s3', '2026-10-02', '16:00', null)],
      sessions: [cls('a', '2026-09-30', '16:00', '17:00'), cls('b', '2026-10-01', '16:00', '17:30')],
      settings,
      rules: { payModels: [{ model: 'teaching_admin', from: '2000-01-01' }, { model: 'classes', from: '2026-10-01' }] },
      ratesFor: coach,
      ...range,
    })
    const t = payLineTotals(lines)
    expect([t.teaching, t.admin, t.total, t.classBlocks, t.open]).toEqual([{ hours: 2.5, pay: 75 }, { hours: 2, pay: 30 }, { hours: 4.5, pay: 105 }, 1, 1])
  })
})

describe('payModelsBetween', () => {
  const rules = {
    payModels: [
      { model: 'hourly' as const, from: '2000-01-01' },
      { model: 'teaching_admin' as const, from: '2026-10-01' },
      { model: 'classes' as const, from: '2026-10-15' },
    ],
  }
  it('lists the models in force at some point between the dates', () => {
    expect(payModelsBetween(rules, '2026-09-01', '2026-09-30')).toEqual(['hourly'])
    expect(payModelsBetween(rules, '2026-09-27', '2026-10-10')).toEqual(['hourly', 'teaching_admin'])
    expect(payModelsBetween(rules, '2026-10-01', '2026-10-31')).toEqual(['teaching_admin', 'classes'])
    expect(payModelsBetween(rules, '2026-10-15', '2026-10-15')).toEqual(['classes'])
  })
})

describe('effectiveRates and payPeriodLabel', () => {
  it('prices at $0 until rates are set', () => {
    expect(effectiveRates({ role: 'coach' }, null)).toEqual({ rates: { teaching: 0, admin: 0 }, role: 'coach' })
    expect(effectiveRates(undefined, { rates: { teaching: 28, admin: 20 } })).toEqual({ rates: { teaching: 28, admin: 20 }, role: undefined })
  })

  it('names a pay period by its first and last day', () => {
    expect(payPeriodLabel({ start: '2026-10-11', end: '2026-10-24' })).toBe('Oct 11 – Oct 24, 2026')
  })
})
