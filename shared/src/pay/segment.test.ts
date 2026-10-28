import { describe, expect, it } from 'vitest'
import { recentPeriods, periodContaining } from './periods'
import { formatExtra, formatMoney, hoursOf, priceMinutes, priceTime, sumPay } from './segment'

const T = (hhmm: string) => {
  const [h, m, s = '0'] = hhmm.split(':')
  return Date.UTC(2026, 8, 30, Number(h), Number(m), Number(s))
}

describe('hours and pay', () => {
  it('rounds hours to 0.01 h and pays the rounded hours', () => {
    expect(priceTime(T('15:30'), T('22:15'), 20)).toEqual({ startMs: T('15:30'), endMs: T('22:15'), hours: 6.75, rate: 20, pay: 135 })
    expect(priceTime(T('16:00'), T('17:50'), 35)).toMatchObject({ hours: 1.83, pay: 64.05 })
    expect(priceTime(T('15:59:40'), T('16:00'), 20)).toMatchObject({ hours: 0.01, pay: 0.2 })
    expect(priceTime(T('16:00'), T('15:00'), 20)).toMatchObject({ hours: 0, pay: 0 })
    expect(hoursOf(90 * 60_000)).toBe(1.5)
  })

  it('prices extra time at the rate, with no time of day', () => {
    expect(priceMinutes(60, 24.5, T('20:00'))).toEqual({ startMs: T('20:00'), endMs: T('20:00'), hours: 1, rate: 24.5, pay: 24.5 })
    expect(priceMinutes(20, 30, 0)).toMatchObject({ hours: 0.33, pay: 9.9 })
  })

  it('adds up, and says amounts and extra time plainly', () => {
    expect(sumPay([{ hours: 1.83, pay: 64.05 }, { hours: 1.92, pay: 67.2 }])).toEqual({ hours: 3.75, pay: 131.25 })
    expect(sumPay([])).toEqual({ hours: 0, pay: 0 })
    expect(formatMoney(1234.5)).toBe('$1,234.50')
    expect(formatExtra(60)).toBe('+1:00 h')
    expect(formatExtra(95)).toBe('+1:35 h')
    expect(formatExtra(30)).toBe('+0:30 h')
  })
})

describe('pay periods', () => {
  it('computes weekly and biweekly periods from an anchor', () => {
    expect(periodContaining('2026-10-01', 'weekly', '2026-01-04')).toEqual({ start: '2026-09-27', end: '2026-10-03' })
    expect(periodContaining('2026-10-01', 'biweekly', '2026-01-04')).toEqual({ start: '2026-09-27', end: '2026-10-10' })
  })
  it('computes semi-monthly and monthly periods', () => {
    expect(periodContaining('2026-10-01', 'semimonthly', '2026-01-04')).toEqual({ start: '2026-10-01', end: '2026-10-15' })
    expect(periodContaining('2026-10-20', 'semimonthly', '2026-01-04')).toEqual({ start: '2026-10-16', end: '2026-10-31' })
    expect(periodContaining('2026-02-10', 'monthly', '2026-01-04')).toEqual({ start: '2026-02-01', end: '2026-02-28' })
  })
  it('lists recent periods newest first', () => {
    expect(recentPeriods('2026-10-01', 'semimonthly', '2026-01-04', 3).map((p) => p.start)).toEqual(['2026-10-01', '2026-09-16', '2026-09-01'])
  })
})
