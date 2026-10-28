import { needsRate } from '@shared/pay/rates'
import type { StaffRole } from '@shared/types'

/**
 * Turns the hourly rate typed for a new employee into the one to save. Coaches and admins must have one above $0, so
 * payroll never prices their time at $0; an owner's may stay empty (no pay record then).
 */
export function readRate(role: StaffRole, draft: string): { rate: number | null } | { error: string } {
  const text = draft.trim()
  if (!needsRate(role) && text === '') return { rate: null }
  const n = Number(text)
  if (text === '' || !Number.isFinite(n) || n <= 0) return { error: 'Enter the hourly rate (dollars per hour).' }
  return { rate: Math.round(n * 100) / 100 }
}

/** What a person's hourly rate pays, in plain words. */
export function rateHelp(role: StaffRole): string {
  return role === 'coach'
    ? 'Paid for the time they’re clocked in at the kiosk, from shortly before their first class to the end of their last.'
    : role === 'admin'
      ? 'Paid for the time they’re clocked in at the kiosk.'
      : 'Optional. Leave it empty if they aren’t paid by the hour.'
}
