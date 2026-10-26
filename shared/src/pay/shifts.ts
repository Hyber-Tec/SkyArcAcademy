import { type BusinessRules, payModelOn } from '../settings/businessRules'
import type { BranchSettings } from '../settings/defaults'
import type { ClockShift, Compensation, Session, Staff, StaffRole } from '../types'
import { type PricedSegment, type Rates, payModelFor, priceShift } from './segment'

/** What a shift is worth: its priced segments, or `open` while the person is still clocked in. */
export interface ShiftPay<S> {
  shift: S
  segments: PricedSegment[]
  open: boolean
}

/** An employee's rates, and their role: owners and admins are paid one rate, coaches follow the branch pay model. */
export interface StaffPay {
  rates: Rates
  role: StaffRole | undefined
}

/** An employee's rates from their compensation record ($0 until they're set), with their role. */
export function effectiveRates(staff: Pick<Staff, 'role'> | null | undefined, comp: Pick<Compensation, 'rates'> | null | undefined): StaffPay {
  return { rates: comp?.rates ?? { teaching: 0, admin: 0 }, role: staff?.role }
}

type PricedShiftInput = Pick<ClockShift, 'staffId' | 'dateKey' | 'inMin' | 'clockInAt' | 'clockOutAt' | 'forcedType'>
type TeachingSession = Pick<Session, 'coachId' | 'isDeleted' | 'status' | 'startAt' | 'endAt'>

/**
 * Prices shifts with the shared engine, oldest first (the website's payroll pages): teaching is time inside classes
 * with a student whose status counts as teaching (`payroll.teachingSessionStatuses`, by default attended ones), the
 * rest of the shift is admin time, and each shift follows the academy's pay model on its date. Classes are taught by
 * everyone in, so any class counts for whoever is clocked in; a session with its own coach (from before) counts for
 * that coach only. Open shifts are listed without pay.
 */
export function priceShifts<S extends PricedShiftInput>(opts: {
  shifts: readonly S[]
  sessions: readonly TeachingSession[]
  settings: Pick<BranchSettings, 'payroll'>
  rules: Pick<BusinessRules, 'payModels'>
  ratesFor: (staffId: string) => StaffPay
}): ShiftPay<S>[] {
  const counted = new Set(opts.settings.payroll.teachingSessionStatuses)
  return opts.shifts
    .slice()
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.inMin - b.inMin)
    .map((shift) => {
      if (!shift.clockOutAt) return { shift, segments: [], open: true }
      const windows = opts.sessions
        .filter((s) => (!s.coachId || s.coachId === shift.staffId) && !s.isDeleted && counted.has(s.status))
        .map((s) => ({ startMs: s.startAt.toMillis(), endMs: s.endAt.toMillis() }))
      const { rates, role } = opts.ratesFor(shift.staffId)
      const model = payModelFor({ role, branchModel: payModelOn(opts.rules, shift.dateKey) })
      const segments = priceShift({ startMs: shift.clockInAt.toMillis(), endMs: shift.clockOutAt.toMillis() }, windows, rates, model, shift.forcedType)
      return { shift, segments, open: false }
    })
}
