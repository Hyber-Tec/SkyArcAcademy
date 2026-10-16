import type { DateKey } from './time'
import { diffDays } from './time'
import type { StaffStatus, StudentStatus } from './types'

// ------------------------------------------------------------------ students

export const STUDENT_STATUSES: readonly StudentStatus[] = [
  'signed_up',
  'enrolled',
  'paused',
  'no_answer',
  'not_interested',
  'finished',
]

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  signed_up: 'Signed Up',
  enrolled: 'Enrolled',
  paused: 'Paused',
  no_answer: 'No Answer',
  not_interested: 'Not Interested',
  finished: 'Finished',
}

/** Badge colors (bg / text / border), from True Education's directory palette. */
export const STUDENT_STATUS_COLORS: Record<StudentStatus, { bg: string; text: string; border: string }> = {
  signed_up: { bg: '#f0f9ff', text: '#0369a1', border: '#bae6fd' },
  enrolled: { bg: '#f0fdf4', text: '#166534', border: '#bbf7d0' },
  paused: { bg: '#fff7ed', text: '#9a3412', border: '#fed7aa' },
  no_answer: { bg: '#f8fafc', text: '#334155', border: '#e2e8f0' },
  not_interested: { bg: '#fee2e2', text: '#991b1b', border: '#fecaca' },
  finished: { bg: '#fff1f2', text: '#9f1239', border: '#fecdd3' },
}

/** Statuses excluded from grade advancement. */
export const INACTIVE_STUDENT_STATUSES: readonly StudentStatus[] = ['finished', 'no_answer', 'not_interested']

export function isInactiveStudent(status: StudentStatus): boolean {
  return INACTIVE_STUDENT_STATUSES.includes(status)
}

export interface LifecycleInput {
  status: StudentStatus
  statusSource: 'auto' | 'manual'
  lastSessionDate: DateKey | null
  /** A non-canceled, non-deleted session today or later. */
  hasUpcoming: boolean
}

export interface LifecycleSettings {
  enabled: boolean
  inactivityPauseDays: number
  respectManual: boolean
}

/**
 * True Education's automatic status transitions (studentLifecycle.js):
 * Signed Up → Enrolled once a session exists; Enrolled → Paused after N days
 * without a session and none upcoming; Paused → Enrolled when a session is
 * upcoming or recent. Other statuses, and (by default) statuses an admin set
 * by hand, never change automatically. Returns null when nothing changes.
 */
export function autoStudentStatus(input: LifecycleInput, today: DateKey, settings: LifecycleSettings): StudentStatus | null {
  if (!settings.enabled || (settings.respectManual && input.statusSource === 'manual')) return null
  const idle = input.lastSessionDate ? diffDays(input.lastSessionDate, today) : null
  switch (input.status) {
    case 'signed_up':
      return input.hasUpcoming || input.lastSessionDate ? 'enrolled' : null
    case 'enrolled':
      return !input.hasUpcoming && idle !== null && idle >= settings.inactivityPauseDays ? 'paused' : null
    case 'paused':
      return input.hasUpcoming || (idle !== null && idle < settings.inactivityPauseDays) ? 'enrolled' : null
    default:
      return null
  }
}

// --------------------------------------------------------------------- staff

export const STAFF_STATUSES: readonly StaffStatus[] = ['active', 'on_hold', 'finished']

export const STAFF_STATUS_LABELS: Record<StaffStatus, string> = {
  active: 'Active',
  on_hold: 'On Hold',
  finished: 'Finished',
}

export const STAFF_STATUS_COLORS: Record<StaffStatus, { bg: string; text: string; border: string }> = {
  active: { bg: '#f0fdf4', text: '#15803d', border: '#bbf7d0' },
  on_hold: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
  finished: { bg: '#f8fafc', text: '#475569', border: '#cbd5e1' },
}

// ------------------------------------------------------------------- helpers

/** "Today" / "Yesterday" / "3 days ago" / "Tomorrow" / "in 5 days". */
export function relativeDayLabel(target: DateKey, today: DateKey): string {
  const d = diffDays(today, target)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d === -1) return 'Yesterday'
  return d > 0 ? `in ${d} days` : `${-d} days ago`
}

/** Formats 10-digit US numbers as (555) 010-1234; anything else is returned as typed. */
export function formatPhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits.startsWith('1')) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return raw ?? ''
}

export function fullName(first: string, last: string): string {
  return `${(first ?? '').trim()} ${(last ?? '').trim()}`.trim()
}

/** Student label used on schedule cards: "Ava Patel (11)". */
/** "Grade 8" for a school grade; other grades ("College", "Adult") as they are. */
export function gradeLabel(grade: string): string {
  return /^\d+$/.test(grade.trim()) ? `Grade ${grade.trim()}` : grade
}

export function studentLabel(name: string, grade: string | null | undefined): string {
  return grade ? `${name} (${grade})` : name
}

/** Up to `max` initials of a name, for avatars ("Jiwoo Hwang" → "JH"); "?" when there's no name. */
export function initials(name: string, max = 2): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, max).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/** Next grade for grade advancement; null when the grade isn't numeric. */
export function nextGrade(grade: string): string | null {
  if (!/^\d+$/.test(grade.trim())) return null
  return String(Number(grade) + 1)
}
