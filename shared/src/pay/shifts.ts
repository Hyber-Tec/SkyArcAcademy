import type { Compensation, Staff, StaffRole } from '../types'
import { hourlyRate } from './rates'
import type { Rates } from './segment'

/** An employee's pay: their rate (in both of `rates`, until the phone app's update) and their role. */
export interface StaffPay {
  rates: Rates
  role: StaffRole | undefined
}

/** An employee's hourly rate from their compensation record ($0 until it's set), with their role. */
export function effectiveRates(staff: Pick<Staff, 'role'> | null | undefined, comp: Pick<Compensation, 'rates'> | null | undefined): StaffPay {
  const rate = hourlyRate(comp?.rates)
  return { rates: { teaching: rate, admin: rate }, role: staff?.role }
}
