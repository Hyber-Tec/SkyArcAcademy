import type { DayRecord } from '../schedule/classes'
import type { BusinessRules, PayModel } from '../settings/businessRules'
import type { BranchSettings } from '../settings/defaults'
import type { DateKey } from '../time'
import type { ClockShift } from '../types'
import { type PayClass, payRule, shiftPaidTime } from './paidTime'
import { hourlyRate } from './rates'
import { type HoursPay, type PaySegment, priceMinutes, priceTime, sumPay } from './segment'
import type { StaffPay } from './shifts'

/**
 * The records of payroll: what the website's payroll pages (the office's and a coach's own), Time Entries and the
 * phone's list show, built once here so they always show the same lines for the same person and dates. Pay comes from
 * the kiosk only (docs/DECISIONS.md §23, K5): each time entry's paid part (`paidTime.ts`) and its extra time (K6), at
 * the person's one rate (K1).
 */

/**
 * What a paid line is: the paid part of a time entry (`worked`), or extra time an admin added to it (`extra`).
 * `classes`, `teaching` and `admin` are no longer made (Hourly is the only pay model); they stay in the type until the
 * phone app's update.
 */
export type PayLineType = 'worked' | 'extra' | 'classes' | 'teaching' | 'admin'

export const PAY_LINE_LABELS: Record<PayLineType, string> = { worked: 'Worked', extra: 'Extra time', classes: 'Classes', teaching: 'Teaching', admin: 'Admin' }

type LineShift = Pick<ClockShift, 'staffId' | 'dateKey' | 'inMin' | 'clockInAt' | 'clockOutAt' | 'extraMin' | 'extraNote'> & { id: string }

/** A paid line: the paid part of a time entry, or its extra time. */
export interface PaidLine<S> {
  open: false
  /** Unique in the list, and the same from one render to the next. */
  key: string
  staffId: string
  dateKey: DateKey
  startMs: number
  type: PayLineType
  /** The paid time, its hours, the rate and the pay. Extra time has no time of day: it sits at the paid time's end. */
  segment: PaySegment
  /** The time entry the line is part of. */
  shift: S | null
  /** Paid lines the same time entry makes (its worked time and its extra time). */
  parts: number
  /** @deprecated Blocks of classes are no longer paid: always null. Kept until the phone app's update. */
  students: number | null
  /**
   * A worked line whose paid time differs from the clock (an early clock-in, a clock-out after the last class): the
   * clock-in and clock-out, to show both ("In 5:20 · paid from 5:30").
   */
  clocked?: { inMs: number; outMs: number }
  /** Extra time: why it was added. */
  note?: string
}

/** A time entry still clocked in: its time is paid once it's clocked out. */
export interface OpenLine<S> {
  open: true
  key: string
  staffId: string
  dateKey: DateKey
  /** The clock-in. */
  startMs: number
  shift: S
}

export type PayLine<S> = PaidLine<S> | OpenLine<S>

/**
 * The lines of pay dated `from` to `to` (inclusive), oldest first: each closed time entry's paid part, priced at the
 * person's rate (time wholly outside a coach's paid hours isn't a line), its extra time, and the time entries still
 * clocked in, whose time will be paid. With the day's `classes` and who's in (`availability`), a coach's paid part
 * starts `arrivalMinutes` before their first class and ends with their last (`paidTime.ts`); without them, every shift
 * is paid as clocked.
 */
export function payLines<S extends LineShift>(opts: {
  shifts: readonly S[]
  /** The classes on those dates (classes in the Trash are left out). */
  classes?: readonly PayClass[]
  /** Who's in on those dates: everyone's availability (a coach's classes are the ones they're in for). */
  availability?: readonly DayRecord[]
  settings: Pick<BranchSettings, 'timeClock'>
  ratesFor: (staffId: string) => StaffPay
  from: DateKey
  to: DateKey
  /** @deprecated Classes are no longer paid from the schedule: not read. Kept until the phone app's update. */
  sessions?: readonly unknown[]
  /** @deprecated Hourly is the only pay model: not read. Kept until the phone app's update. */
  rules?: Pick<BusinessRules, 'payModels'>
}): PayLine<S>[] {
  const { from, to, ratesFor } = opts
  const rule = payRule(opts.settings)
  const listed = opts.shifts.filter((s) => s.dateKey >= from && s.dateKey <= to)
  // Each day's classes and who's in, read once.
  const dates = new Set(listed.map((s) => s.dateKey))
  const classesOn = groupBy((opts.classes ?? []).filter((c) => dates.has(c.dateKey)), (c) => c.dateKey)
  const recordsOn = groupBy((opts.availability ?? []).filter((a) => dates.has(a.dateKey)), (a) => a.dateKey)
  const out: PayLine<S>[] = []
  for (const shift of listed) {
    if (!shift.clockOutAt) {
      out.push({ open: true, key: shift.id, staffId: shift.staffId, dateKey: shift.dateKey, startMs: shift.clockInAt.toMillis(), shift })
      continue
    }
    const { rates, role } = ratesFor(shift.staffId)
    const rate = hourlyRate(rates)
    const paid = shiftPaidTime(shift, { role, classes: opts.classes ? (classesOn.get(shift.dateKey) ?? []) : undefined, availability: recordsOn.get(shift.dateKey) ?? [], rule })
    const inMs = shift.clockInAt.toMillis()
    const outMs = shift.clockOutAt.toMillis()
    const lines: Omit<PaidLine<S>, 'parts'>[] = []
    const base = { open: false as const, staffId: shift.staffId, dateKey: shift.dateKey, shift, students: null }
    if (paid.endMs > paid.startMs) {
      lines.push({
        ...base,
        key: `${shift.id}-worked`,
        startMs: paid.startMs,
        type: 'worked',
        segment: priceTime(paid.startMs, paid.endMs, rate),
        ...(paid.startMs !== inMs || paid.endMs !== outMs ? { clocked: { inMs, outMs } } : {}),
      })
    }
    const extra = extraMinutes(shift)
    if (extra > 0) {
      const at = Math.max(paid.endMs, paid.startMs)
      lines.push({ ...base, key: `${shift.id}-extra`, startMs: at, type: 'extra', segment: priceMinutes(extra, rate, at), note: (shift.extraNote ?? '').trim() })
    }
    for (const l of lines) out.push({ ...l, parts: lines.length })
  }
  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMs - b.startMs || a.staffId.localeCompare(b.staffId) || Number(isExtra(a)) - Number(isExtra(b)))
}

/** A shift's extra minutes (K6): a whole number from 0 up. */
export function extraMinutes(shift: Pick<ClockShift, 'extraMin'>): number {
  const n = Math.round(Number(shift.extraMin ?? 0))
  return Number.isFinite(n) && n > 0 ? n : 0
}

const isExtra = (l: PayLine<unknown>) => !l.open && l.type === 'extra'

export interface PayLineTotals {
  /** Paid hours and pay. */
  total: HoursPay
  /** The worked time's part. */
  worked: HoursPay
  /** The extra time's part. */
  extra: HoursPay
  /** Time entries still clocked in. */
  open: number
  /** @deprecated Teaching and admin time are no longer told apart: the total. Kept until the phone app's update. */
  teaching: HoursPay
  /** @deprecated No admin time any more: zero. Kept until the phone app's update. */
  admin: HoursPay
  /** @deprecated Blocks of classes are no longer paid: 0. Kept until the phone app's update. */
  classBlocks: number
}

/** What lines add up to: paid hours and pay, their worked and extra parts, and the time entries still open. */
export function payLineTotals(lines: readonly PayLine<unknown>[]): PayLineTotals {
  const paid = lines.filter((l): l is PaidLine<unknown> => !l.open)
  const total = sumPay(paid.map((l) => l.segment))
  return {
    total,
    worked: sumPay(paid.filter((l) => l.type !== 'extra').map((l) => l.segment)),
    extra: sumPay(paid.filter((l) => l.type === 'extra').map((l) => l.segment)),
    open: lines.length - paid.length,
    teaching: total,
    admin: { hours: 0, pay: 0 },
    classBlocks: 0,
  }
}

/** @deprecated Hourly is the only pay model (§23, K5): always ['hourly']. Kept until the phone app's update. */
export function payModelsBetween(_rules?: Pick<BusinessRules, 'payModels'>, _from?: DateKey, _to?: DateKey): PayModel[] {
  return ['hourly']
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const k = key(item)
    const list = out.get(k)
    if (list) list.push(item)
    else out.set(k, [item])
  }
  return out
}
