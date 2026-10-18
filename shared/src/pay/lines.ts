import { type BusinessRules, type PayModel, payModelOn } from '../settings/businessRules'
import type { BranchSettings } from '../settings/defaults'
import type { DateKey } from '../time'
import type { ClockShift, Session } from '../types'
import { priceClassBlocks } from './classes'
import { type PayTotals, type PricedSegment, payModelFor, totals } from './segment'
import { type StaffPay, priceShifts } from './shifts'

/**
 * The records of payroll: what the website's payroll pages (the office's and a coach's own) and the phone's list, built
 * once here so they always show the same lines for the same person and dates.
 */

/** What a paid line is: a block of classes taught (from the schedule), or teaching or admin time from a time entry. */
export type PayLineType = 'classes' | 'teaching' | 'admin'

export const PAY_LINE_LABELS: Record<PayLineType, string> = { classes: 'Classes', teaching: 'Teaching', admin: 'Admin' }

type LineShift = Pick<ClockShift, 'staffId' | 'dateKey' | 'inMin' | 'clockInAt' | 'clockOutAt' | 'forcedType'> & { id: string }
type LineSession = Pick<Session, 'coachId' | 'studentId' | 'dateKey' | 'isDeleted' | 'status' | 'startAt' | 'endAt'>

/** A paid line: a part of a time entry, or a block of classes taught. */
export interface PaidLine<S> {
  open: false
  /** Unique in the list, and the same from one render to the next. */
  key: string
  staffId: string
  dateKey: DateKey
  startMs: number
  type: PayLineType
  /** The time, its hours, the rate and the pay. */
  segment: PricedSegment
  /** The time entry the line is part of; null for a block of classes taught, which comes from the schedule. */
  shift: S | null
  /** Paid lines the same time entry makes (1 for a block of classes). */
  parts: number
  /** A block of classes taught: the students in it. */
  students: number | null
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
 * The lines of pay dated `from` to `to` (inclusive), oldest first: the paid parts of each time entry, priced with the
 * academy's pay model on its date (unpaid time, such as every clock-in under Classes taught, isn't a line), the blocks
 * of classes taught under Classes taught, and time entries still clocked in whose time will be paid. Sessions are best
 * read a day wider than the dates, for teaching that crosses midnight; class blocks outside the dates are left out.
 */
export function payLines<S extends LineShift>(opts: {
  shifts: readonly S[]
  sessions: readonly LineSession[]
  settings: Pick<BranchSettings, 'payroll'>
  rules: Pick<BusinessRules, 'payModels'>
  ratesFor: (staffId: string) => StaffPay
  from: DateKey
  to: DateKey
}): PayLine<S>[] {
  const { sessions, settings, rules, ratesFor, from, to } = opts
  const listed = (d: DateKey) => d >= from && d <= to
  const out: PayLine<S>[] = []
  for (const p of priceShifts({ shifts: opts.shifts.filter((s) => listed(s.dateKey)), sessions, settings, rules, ratesFor })) {
    const { shift } = p
    if (p.open) {
      // Under Classes taught clocking in is only a log: a shift still open there will never be pay.
      const model = payModelFor({ role: ratesFor(shift.staffId).role, branchModel: payModelOn(rules, shift.dateKey) })
      if (model !== 'classes') out.push({ open: true, key: shift.id, staffId: shift.staffId, dateKey: shift.dateKey, startMs: shift.clockInAt.toMillis(), shift })
      continue
    }
    const paid = p.segments.filter((s) => !s.unpaid)
    paid.forEach((segment, i) =>
      out.push({
        open: false,
        key: `${shift.id}-${i}`,
        staffId: shift.staffId,
        dateKey: shift.dateKey,
        startMs: segment.startMs,
        type: segment.type,
        segment,
        shift,
        parts: paid.length,
        students: null,
      }),
    )
  }
  for (const b of priceClassBlocks({ sessions, settings, rules, ratesFor })) {
    if (!listed(b.dateKey)) continue
    out.push({
      open: false,
      key: `class-${b.staffId}-${b.segment.startMs}`,
      staffId: b.staffId,
      dateKey: b.dateKey,
      startMs: b.segment.startMs,
      type: 'classes',
      segment: b.segment,
      shift: null,
      parts: 1,
      students: b.students,
    })
  }
  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMs - b.startMs || a.staffId.localeCompare(b.staffId))
}

/** What lines add up to: paid hours and pay by type, how many are blocks of classes, and the time entries still open. */
export function payLineTotals(lines: readonly PayLine<unknown>[]): PayTotals & { classBlocks: number; open: number } {
  const paid = lines.filter((l): l is PaidLine<unknown> => !l.open)
  return { ...totals(paid.map((l) => l.segment)), classBlocks: paid.filter((l) => l.type === 'classes').length, open: lines.length - paid.length }
}

/** The pay models in force at some point between two dates (inclusive), for what a payroll summary shows. */
export function payModelsBetween(rules: Pick<BusinessRules, 'payModels'>, from: DateKey, to: DateKey): PayModel[] {
  return rules.payModels.filter((p, i) => p.from <= to && (rules.payModels[i + 1]?.from ?? '9999-12-31') > from).map((p) => p.model)
}
