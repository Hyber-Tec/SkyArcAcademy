import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../settings/defaults'
import { toInstant } from '../time'
import type { TimestampLike } from '../types'
import { extraMinutes, payLineTotals, payLines, payModelsBetween } from './lines'
import type { PayClass } from './paidTime'
import { payPeriodLabel } from './periods'
import { effectiveRates } from './shifts'

// Made-up people and times in New York: classes from 6:00 to 8:00 PM on Tuesday, Oct 20.
const NY = 'America/New_York'
const DAY = '2026-10-20'
const t = (hhmm: string, dateKey = DAY) => toInstant(dateKey, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), NY).getTime()
const ts = (ms: number): TimestampLike => ({ seconds: ms / 1000, nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms })
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
const cls = (start: string, end: string, dateKey = DAY): PayClass => ({ dateKey, startMin: min(start), endMin: min(end), startAt: ts(t(start, dateKey)), endAt: ts(t(end, dateKey)), isDeleted: false })
const classes = [cls('18:00', '19:00'), cls('19:00', '20:00')]
const availability = [
  { staffId: 'maya', dateKey: DAY, ranges: [{ startMin: min('18:00'), endMin: min('20:00') }], unavailable: false, staffRole: 'coach' as const },
  { staffId: 'ana', dateKey: DAY, ranges: [{ startMin: min('15:00'), endMin: min('21:00') }], unavailable: false, staffRole: 'admin' as const },
]
const shift = (id: string, inAt: string, outAt: string | null, extra: Partial<{ staffId: string; dateKey: string; extraMin: number; extraNote: string }> = {}) => {
  const dateKey = extra.dateKey ?? DAY
  return { id, staffId: 'maya', dateKey, inMin: min(inAt), clockInAt: ts(t(inAt, dateKey)), clockOutAt: outAt ? ts(t(outAt, dateKey)) : null, ...extra }
}
const ratesFor = (id: string) => (id === 'ana' ? { rates: { teaching: 24, admin: 24 }, role: 'admin' as const } : { rates: { teaching: 30, admin: 30 }, role: 'coach' as const })
const lines = (shifts: ReturnType<typeof shift>[], opts: { from?: string; to?: string; withClasses?: boolean } = {}) =>
  payLines({ shifts, classes: opts.withClasses === false ? undefined : classes, availability, settings: DEFAULT_SETTINGS, ratesFor, from: opts.from ?? '2026-10-19', to: opts.to ?? '2026-10-25' })

describe('payLines', () => {
  it('pays a coach from 30 minutes before their first class to the end of their last, keeping the clock times', () => {
    const [l] = lines([shift('s1', '17:20', '20:20')])
    expect(l).toMatchObject({ open: false, type: 'worked', key: 's1-worked', startMs: t('17:30'), parts: 1, students: null, clocked: { inMs: t('17:20'), outMs: t('20:20') } })
    expect(!l.open && l.segment).toEqual({ startMs: t('17:30'), endMs: t('20:00'), hours: 2.5, rate: 30, pay: 75 })
  })

  it('pays a shift inside those hours as clocked', () => {
    const [l] = lines([shift('s1', '17:40', '19:30')])
    expect(!l.open && [l.segment.hours, l.segment.pay, l.clocked]).toEqual([1.83, 54.9, undefined])
  })

  it('adds extra time as its own line, at the rate, with its note', () => {
    const out = lines([shift('s1', '17:30', '20:00', { extraMin: 60, extraNote: ' Travel ' })])
    expect(out.map((l) => (l.open ? 'open' : [l.type, l.segment.hours, l.segment.pay, l.parts, l.note ?? null]))).toEqual([
      ['worked', 2.5, 75, 2, null],
      ['extra', 1, 30, 2, 'Travel'],
    ])
    expect(!out[1].open && out[1].segment.startMs).toBe(t('20:00'))
    expect(extraMinutes({ extraMin: -5 })).toBe(0)
    expect(extraMinutes({})).toBe(0)
  })

  it('pays nothing without a clock-in (K5), and no line for time wholly outside the paid hours', () => {
    expect(lines([])).toEqual([])
    // Clocked in after the last class: only the extra time is paid.
    const out = lines([shift('s1', '20:30', '21:00', { extraMin: 30, extraNote: 'Inventory' })])
    expect(out.map((l) => (l.open ? 'open' : [l.type, l.segment.hours]))).toEqual([['extra', 0.5]])
  })

  it('pays owners and admins as clocked, and lists entries still clocked in without pay', () => {
    const out = lines([shift('a1', '15:00', '21:00', { staffId: 'ana' }), shift('m2', '17:00', null)])
    expect(out.map((l) => (l.open ? ['open', l.key, l.startMs] : [l.type, l.staffId, l.segment.hours, l.segment.pay, l.clocked ?? null]))).toEqual([
      ['worked', 'ana', 6, 144, null],
      ['open', 'm2', t('17:00')],
    ])
  })

  it('lists only the dates asked for, oldest first, and pays as clocked without the classes', () => {
    const shifts = [shift('late', '17:20', '20:20'), shift('before', '16:00', '17:00', { dateKey: '2026-10-18' }), shift('next', '09:00', '10:30', { dateKey: '2026-10-21' })]
    expect(lines(shifts).map((l) => (l.open ? 'open' : [l.key, l.segment.hours]))).toEqual([
      ['late-worked', 2.5],
      ['next-worked', 1.5],
    ])
    expect(lines(shifts, { withClasses: false }).map((l) => (l.open ? 'open' : [l.key, l.segment.hours]))).toEqual([
      ['late-worked', 3],
      ['next-worked', 1.5],
    ])
  })

  it('keeps the phone’s older call working: sessions and rules are no longer read', () => {
    const out = payLines({ shifts: [shift('s1', '17:20', '20:20')], sessions: [{}], rules: { payModels: [{ model: 'classes', from: '2000-01-01' }] }, settings: DEFAULT_SETTINGS, ratesFor, from: DAY, to: DAY })
    expect(out.map((l) => (l.open ? 'open' : [l.type, l.segment.hours]))).toEqual([['worked', 3]])
  })

  it('adds up the paid lines, their worked and extra parts, and the open entries', () => {
    const out = lines([shift('s1', '17:20', '20:20', { extraMin: 60, extraNote: 'Travel' }), shift('a1', '15:00', '21:00', { staffId: 'ana' }), shift('m2', '17:00', null)])
    const total = payLineTotals(out)
    expect(total).toEqual({
      total: { hours: 9.5, pay: 249 },
      worked: { hours: 8.5, pay: 219 },
      extra: { hours: 1, pay: 30 },
      open: 1,
      teaching: { hours: 9.5, pay: 249 },
      admin: { hours: 0, pay: 0 },
      classBlocks: 0,
    })
  })
})

describe('one rate, one model', () => {
  it('reads the one rate, in both of the phone’s fields', () => {
    expect(effectiveRates({ role: 'coach' }, null)).toEqual({ rates: { teaching: 0, admin: 0 }, role: 'coach' })
    expect(effectiveRates({ role: 'admin' }, { rates: { teaching: 0, admin: 22 } })).toEqual({ rates: { teaching: 22, admin: 22 }, role: 'admin' })
    expect(effectiveRates(undefined, { rates: { teaching: 28, admin: 20 } })).toEqual({ rates: { teaching: 28, admin: 28 }, role: undefined })
  })

  it('pays Hourly whatever the dates', () => {
    expect(payModelsBetween({ payModels: [{ model: 'classes', from: '2000-01-01' }] }, '2026-10-01', '2026-10-31')).toEqual(['hourly'])
  })

  it('names a pay period by its first and last day', () => {
    expect(payPeriodLabel({ start: '2026-10-11', end: '2026-10-24' })).toBe('Oct 11 – Oct 24, 2026')
  })
})
