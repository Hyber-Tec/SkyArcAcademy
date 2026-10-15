/** Firestore collection names. All academy data lives under `branches/{ACADEMY_ID}` (shared/src/academy.ts). */
export const ROOT = {
  branches: 'branches',
  users: 'users',
} as const

export const COL = {
  public: 'public',
  members: 'members',
  signupRequests: 'signupRequests',
  staff: 'staff',
  students: 'students',
  sessions: 'sessions',
  availability: 'availability',
  dayConfigs: 'dayConfigs',
  events: 'events',
  auditLog: 'auditLog',
  clockShifts: 'clockShifts',
  openShifts: 'openShifts',
  kioskPins: 'kioskPins',
  payroll: 'payroll',
  payPeriods: 'payPeriods',
  announcements: 'announcements',
  notifications: 'notifications',
} as const

export type BranchCollection = (typeof COL)[keyof typeof COL]

/** Collections under `users/{uid}`. */
export const USER_COL = {
  /** The phone app's installs, with their push tokens (`DeviceDoc`). */
  devices: 'devices',
  /** Server-only state (e.g. how many account emails were sent), no client access. */
  private: 'private',
} as const

/** Sub-documents with fixed IDs. */
export const DOC = {
  publicProfile: 'profile', // branches/{b}/public/profile
  privateProfile: 'profile', // students/{id}/private/profile
  compensation: 'compensation', // staff/{id}/private/compensation
  staffNotes: 'notes', // staff/{id}/private/notes
  payrollState: 'state', // branches/{b}/payroll/state
} as const

export function emailKey(email: string): string {
  return email.trim().toLowerCase()
}

export function branchDocPath(branchId: string): string {
  return `${ROOT.branches}/${branchId}`
}

export function branchColPath(branchId: string, col: BranchCollection): string {
  return `${ROOT.branches}/${branchId}/${col}`
}

export function availabilityDocId(staffId: string, dateKey: string): string {
  return `${staffId}_${dateKey}`
}
