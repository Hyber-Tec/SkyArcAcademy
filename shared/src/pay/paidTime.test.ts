import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../settings/defaults'
import { toInstant } from '../time'
import type { TimestampLike } from '../types'
import { type PayClass, autoClockOutAt, dayBounds, describePay, paidWindow, payRule, shiftPaidTime } from './paidTime'

// Made-up classes and coaches on a Tuesday in New York.
const NY = 'America/New_York'
const DAY = '2026-10-20'
const t = (hhmm: string, dateKey = DAY) => {
  const [h, m] = hhmm.split(':').map(Number)
  return toInstant(dateKey, h * 60 + m, NY).getTime()
}
const ts = (ms: number): TimestampLike => ({ seconds: ms / 1000, nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms })
const min = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))
const cls = (start: string, end: string, extra: Partial<PayClass> = {}): PayClass => ({
  dateKey: DAY,
  startMin: min(start),
  endMin: min(end),
  startAt: ts(t(start)),
  endAt: ts(t(end)),
  isDeleted: false,
  ...extra,
})
const inFor = (staffId: string, start: string, end: string, extra: object = {}) => ({ staffId, dateKey: DAY, ranges: [{ startMin: min(start), endMin: min(end) }], unavailable: false, staffRole: 'coach' as const, ...extra })
// Classes from 6:00 to 8:00 PM, an earlier one at 4:30 for some coaches.
const classes = [cls('16:30', '18:00'), cls('18:00', '19:00'), cls('19:00', '20:00')]
const rule = payRule(DEFAULT_SETTINGS)
const settings = (patch: Partial<typeof DEFAULT_SETTINGS.timeClock> = {}, auto: Partial<typeof DEFAULT_SETTINGS.timeClock.autoClockOut> = {}) => ({
  timeClock: { ...DEFAULT_SETTINGS.timeClock, ...patch, autoClockOut: { ...DEFAULT_SETTINGS.timeClock.autoClockOut, ...auto } },
})
const bounds = (staffId: string, inAt: string, availability: ReturnType<typeof inFor>[]) => dayBounds({ staffId, dateKey: DAY, clockInMs: t(inAt), classes, availability })
const paid = (inAt: string, outAt: string, b: ReturnType<typeof bounds>, r = rule) => {
  const w = paidWindow({ inMs: t(inAt), outMs: t(outAt), bounds: b, rule: r })
  return [w.startMs, w.endMs]
}

describe('a coach’s first and last class', () => {
  it('are the earliest and the latest they’re in for', () => {
    // In from 5:30: the 4:30 class overlaps their hours, so it's their first.
    expect(bounds('pat', '15:50', [inFor('pat', '17:30', '20:00')])).toEqual({ firstStartMs: t('16:30'), lastEndMs: t('20:00') })
    // In only until 6: their last class ends at 6.
    expect(bounds('pat', '15:50', [inFor('pat', '16:00', '18:00')])).toEqual({ firstStartMs: t('16:30'), lastEndMs: t('18:00') })
    // Someone else's hours don't count, nor do classes in the Trash.
    expect(dayBounds({ staffId: 'pat', dateKey: DAY, clockInMs: t('17:20'), classes: [cls('16:30', '18:00', { isDeleted: true }), ...classes.slice(1)], availability: [inFor('pat', '16:00', '21:00'), inFor('sam', '16:00', '17:00')] })).toEqual({
      firstStartMs: t('18:00'),
      lastEndMs: t('20:00'),
    })
  })

  it('without hours that day: the class they came for, and the day’s last', () => {
    expect(bounds('pat', '17:20', [])).toEqual({ firstStartMs: t('16:30'), lastEndMs: t('20:00') })
    expect(bounds('pat', '18:10', [])).toEqual({ firstStartMs: t('18:00'), lastEndMs: t('20:00') })
    expect(bounds('pat', '20:30', [])).toEqual({ firstStartMs: null, lastEndMs: t('20:00') })
    // The manager's hours don't make them a class's coach.
    expect(bounds('ana', '15:00', [inFor('ana', '15:00', '21:00', { staffRole: 'admin' })])).toEqual({ firstStartMs: t('16:30'), lastEndMs: t('20:00') })
  })

  it('are none on a day without classes', () => {
    expect(dayBounds({ staffId: 'pat', dateKey: '2026-10-21', clockInMs: t('16:00'), classes, availability: [] })).toBeNull()
  })
})

describe('paid time (K2, K3)', () => {
  const evening = bounds('pat', '17:20', [inFor('pat', '17:30', '20:00')])
  // Pat's first class is the 6:00 one here: in from 6.
  const fromSix = dayBounds({ staffId: 'pat', dateKey: DAY, clockInMs: t('17:20'), classes: classes.slice(1), availability: [inFor('pat', '18:00', '20:00')] })

  it('starts 30 minutes before the first class: an earlier clock-in doesn’t count', () => {
    expect(paid('17:20', '20:00', fromSix)).toEqual([t('17:30'), t('20:00')])
    expect(paid('16:00', '17:00', evening)).toEqual([t('16:00'), t('17:00')])
  })

  it('counts a later clock-in from the clock-in', () => {
    expect(paid('17:45', '20:00', fromSix)).toEqual([t('17:45'), t('20:00')])
    expect(paid('18:20', '20:00', fromSix)).toEqual([t('18:20'), t('20:00')])
  })

  it('follows the arrival window set', () => {
    expect(paid('17:20', '20:00', fromSix, payRule(settings({ arrivalMinutes: 15 })))).toEqual([t('17:45'), t('20:00')])
    expect(paid('17:20', '20:00', fromSix, payRule(settings({ arrivalMinutes: 0 })))).toEqual([t('18:00'), t('20:00')])
  })

  it('ends with the last class: a later clock-out doesn’t count, an earlier one does', () => {
    expect(paid('17:30', '20:20', fromSix)).toEqual([t('17:30'), t('20:00')])
    expect(paid('17:30', '19:40', fromSix)).toEqual([t('17:30'), t('19:40')])
  })

  it('follows the clock-out when pay doesn’t end with the last class', () => {
    expect(paid('17:30', '20:20', fromSix, payRule(settings({}, { atLastClass: false })))).toEqual([t('17:30'), t('20:20')])
    expect(paid('17:30', '20:20', fromSix, payRule(settings({}, { enabled: false })))).toEqual([t('17:30'), t('20:20')])
  })

  it('is the clock times on a day without classes', () => {
    expect(paid('09:10', '12:05', null)).toEqual([t('09:10'), t('12:05')])
  })

  it('is nothing for time wholly outside it', () => {
    // Clocked in after the last class; clocked out before the window.
    const late = bounds('pat', '20:30', [])
    expect(paid('20:30', '21:00', late)).toEqual([t('20:30'), t('20:30')])
    expect(paid('15:00', '15:40', fromSix)).toEqual([t('17:30'), t('17:30')])
  })

  it('pays owners and admins as clocked, and a shift still open up to now', () => {
    const shift = { staffId: 'ana', dateKey: DAY, clockInAt: ts(t('15:00')), clockOutAt: ts(t('21:00')) }
    const byRole = (role: 'admin' | 'coach') => shiftPaidTime(shift, { role, classes, availability: [inFor('ana', '15:00', '21:00')], rule })
    expect(byRole('admin')).toEqual({ startMs: t('15:00'), endMs: t('21:00') })
    expect(byRole('coach')).toEqual({ startMs: t('16:00'), endMs: t('20:00') })
    // Without the day's classes, every shift is paid as clocked.
    expect(shiftPaidTime(shift, { role: 'coach', rule })).toEqual({ startMs: t('15:00'), endMs: t('21:00') })
    // Clocked in at 3:00 and still in at 6:30, in from 6: paid from 5:30 so far.
    const open = { ...shift, staffId: 'pat', clockOutAt: null }
    expect(shiftPaidTime(open, { role: 'coach', classes, availability: [inFor('pat', '18:00', '20:00')], rule, nowMs: t('18:30') })).toEqual({ startMs: t('17:30'), endMs: t('18:30') })
  })

  it('says how pay works, as set', () => {
    expect(describePay(DEFAULT_SETTINGS)).toContain('starts 30 minutes before their first class of the day')
    expect(describePay(DEFAULT_SETTINGS)).toContain('ends at the end of their last class')
    expect(describePay(settings({ arrivalMinutes: 0 }, { atLastClass: false }))).toContain('starts at their first class of the day (an earlier clock-in doesn’t count) and ends when they clock out')
  })
})

describe('the automatic clock-out (K3)', () => {
  const shift = (staffId: string, inAt: string, dateKey = DAY) => ({ staffId, dateKey, inMin: min(inAt), clockInMs: t(inAt, dateKey) })
  const at = (s: ReturnType<typeof shift>, availability: ReturnType<typeof inFor>[], set = settings()) => autoClockOutAt({ shift: s, classes, availability, settings: set, timeZone: NY })

  it('is at the end of their last class', () => {
    expect(at(shift('pat', '16:00'), [inFor('pat', '16:00', '18:00')])).toEqual({ atMs: t('18:00'), by: 'last_class' })
    // In for no class: the day's last; the manager too.
    expect(at(shift('ana', '15:00'), [inFor('ana', '15:00', '21:00', { staffRole: 'admin' })])).toEqual({ atMs: t('20:00'), by: 'last_class' })
  })

  it('is the set time on a day without classes, or after the last class', () => {
    expect(at(shift('pat', '10:00', '2026-10-21'), [])).toEqual({ atMs: t('00:00', '2026-10-22'), by: 'set_time' })
    expect(at(shift('pat', '20:30'), [])).toEqual({ atMs: t('00:00', '2026-10-21'), by: 'set_time' })
    expect(at(shift('pat', '10:00', '2026-10-21'), [], settings({}, { localTime: '21:30' }))).toEqual({ atMs: t('21:30', '2026-10-21'), by: 'set_time' })
  })

  it('is the set time every day with the last class off, and never when it’s off', () => {
    expect(at(shift('pat', '16:00'), [inFor('pat', '16:00', '18:00')], settings({}, { atLastClass: false }))).toEqual({ atMs: t('00:00', '2026-10-21'), by: 'set_time' })
    expect(at(shift('pat', '16:00'), [], settings({}, { enabled: false }))).toBeNull()
    expect(at(shift('pat', '10:00', '2026-10-21'), [], settings({}, { localTime: 'soon' }))).toBeNull()
  })
})
