/**
 * Money and hours for pay. Everyone is paid one hourly rate for the time the kiosk records (docs/DECISIONS.md §23: K1,
 * K5); a coach's paid part of a shift is worked out in `paidTime.ts`. Hours are rounded to 0.01 h and the pay is computed
 * from the rounded hours.
 */

export const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100

/** "$1,234.50" (US dollars). */
export function formatMoney(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function hoursOf(ms: number): number {
  return round2(ms / 3_600_000)
}

export interface Interval {
  startMs: number
  endMs: number
}

/** Paid time: when it was, its hours (rounded to 0.01 h), the rate and the pay. */
export interface PaySegment extends Interval {
  hours: number
  rate: number
  pay: number
}

/** Prices time at a rate: its hours rounded to 0.01 h, and the pay from the rounded hours. */
export function priceTime(startMs: number, endMs: number, rate: number): PaySegment {
  const hours = hoursOf(Math.max(0, endMs - startMs))
  return { startMs, endMs, hours, rate, pay: round2(hours * rate) }
}

/** Prices minutes that have no time of day (extra time), placed at `atMs`. */
export function priceMinutes(minutes: number, rate: number, atMs: number): PaySegment {
  const hours = round2(minutes / 60)
  return { startMs: atMs, endMs: atMs, hours, rate, pay: round2(hours * rate) }
}

export interface HoursPay {
  hours: number
  pay: number
}

/** Hours and pay added up. */
export function sumPay(segments: readonly Pick<PaySegment, 'hours' | 'pay'>[]): HoursPay {
  let hours = 0
  let pay = 0
  for (const s of segments) {
    hours += s.hours
    pay += s.pay
  }
  return { hours: round2(hours), pay: round2(pay) }
}

/** "+1:00 h": extra time as the website and the audit log show it. */
export function formatExtra(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  return `+${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} h`
}

/** A person's stored rates (`Compensation.rates`): their one hourly rate, in both until the phone app's update. */
export interface Rates {
  teaching: number
  admin: number
}

/**
 * @deprecated One rate since docs/DECISIONS.md §23: the type an admin once forced a shift's pay to
 * (`ClockShift.forcedType`, no longer read).
 */
export type PayType = 'teaching' | 'admin'

/** @deprecated Teaching and admin time are no longer told apart: `HoursPay`. Kept until the phone app's update. */
export interface PayTotals {
  teaching: HoursPay
  admin: HoursPay
  total: HoursPay
}
