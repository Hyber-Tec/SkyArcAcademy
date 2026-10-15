/**
 * A member's role in the academy: **one role per person**. Owners are admins who also manage other admins and Access
 * Control.
 */
export type Role = 'owner' | 'admin' | 'coach' | 'parent' | 'student'

/** The portal a role opens. Owners use the admin portal. */
export type Portal = 'admin' | 'coach' | 'parent' | 'student'

/** Display and priority order. */
export const ROLES: readonly Role[] = ['owner', 'admin', 'coach', 'parent', 'student']

export const PORTALS: readonly Portal[] = ['admin', 'coach', 'parent', 'student']

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  admin: 'Admin',
  coach: 'Coach',
  parent: 'Parent',
  student: 'Student',
}

export const PORTAL_LABELS: Record<Portal, string> = {
  admin: 'Admin Portal',
  coach: 'Coach Portal',
  parent: 'Parent Portal',
  student: 'Student Portal',
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value)
}

export function portalOf(role: Role): Portal {
  return role === 'owner' ? 'admin' : role
}

/** Owners and admins run the branch. */
export function isAdminRole(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/** Employees: they have a staff record (clock, pay). Only coaches teach. */
export function isStaffRole(role: Role | null | undefined): boolean {
  return role === 'owner' || role === 'admin' || role === 'coach'
}

export type MemberStatus = 'active' | 'disabled'

/** Admin pages an owner can block for a specific admin (TE "blockedPages"). Enforced in the rules too. */
export type RestrictablePage = 'payRates' | 'payroll' | 'timeEntries' | 'accessControl'

export const RESTRICTABLE_PAGES: readonly { key: RestrictablePage; label: string; description: string }[] = [
  { key: 'payRates', label: 'Pay Rates', description: 'See and change employee pay rates' },
  { key: 'payroll', label: 'Payroll', description: 'See payroll reports and lock pay periods' },
  { key: 'timeEntries', label: 'Time Entries', description: 'Add or change worked times' },
  { key: 'accessControl', label: 'Access Control', description: 'Change other admins’ restrictions' },
]
