import type { DateKey } from '../time'
import type { StaffRole } from '../types'
import type { Rates } from './segment'

/**
 * Everyone has one hourly rate (docs/DECISIONS.md §23, K1: the admin rate is gone). It's asked when an employee is
 * created, and anyone still without one is flagged on Home, Pay Rates and Payroll, so worked time is never paid $0
 * (round 3).
 */

/**
 * A person's hourly rate: `rates.teaching`, or `rates.admin` on older owners' and admins' records, which kept theirs
 * there. 0 when unset.
 */
export function hourlyRate(rates: Partial<Rates> | null | undefined): number {
  const teaching = Number(rates?.teaching)
  if (teaching > 0) return teaching
  const admin = Number(rates?.admin)
  return admin > 0 ? admin : 0
}

/**
 * What saving a rate stores: the rate in `teaching` and, until the phone app's update, in `admin` too (the phone's
 * builds in the stores read an owner's or admin's rate there).
 */
export function rateRecord(rate: number): Rates {
  return { teaching: rate, admin: rate }
}

/** Coaches and admins need an hourly rate, so their worked time is never paid $0; an owner's is optional. */
export function needsRate(role: StaffRole | null | undefined): boolean {
  return role === 'coach' || role === 'admin'
}

/** Someone whose worked time would be paid $0: they need a rate and have none. */
export function rateMissing(role: StaffRole | null | undefined, rates: Partial<Rates> | null | undefined): boolean {
  return needsRate(role) && !(hourlyRate(rates) > 0)
}

// ------------------------------------------------------------ until the phone app's update

/** @deprecated One rate since §23: `rateMissing`. Kept until the phone app's update. */
export type RateKind = 'teaching' | 'admin'

/** @deprecated There is no admin rate any more (§23, K1): always false. Kept until the phone app's update. */
export function coachesNeedAdminRate(_rules?: unknown, _today?: DateKey): boolean {
  return false
}

/** @deprecated `needsRate`. Kept until the phone app's update. */
export function requiredRates(role: StaffRole | null | undefined, _needAdminRate?: boolean): RateKind[] {
  return needsRate(role) ? ['teaching'] : []
}

/** @deprecated `rateMissing`: the one rate, as a list. Kept until the phone app's update. */
export function missingRates(role: StaffRole | null | undefined, rates: Partial<Rates> | null | undefined, _needAdminRate?: boolean): RateKind[] {
  return rateMissing(role, rates) ? ['teaching'] : []
}

/** @deprecated Every rate is the hourly rate. Kept until the phone app's update. */
export function rateName(_kind?: RateKind, _role?: StaffRole | null): string {
  return 'hourly rate'
}
