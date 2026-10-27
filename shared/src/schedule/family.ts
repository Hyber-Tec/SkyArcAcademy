import type { SessionStatus } from '../settings/defaults'

/**
 * A class as families read it, on the website and in the phone app: the status in plain words (never the staff's
 * "Pending" or "No-show"), and the note without the schedule sheets' shorthand.
 */
export const FAMILY_STATUS_LABELS: Record<SessionStatus, string> = {
  pending: 'Scheduled',
  confirmed: 'Confirmed',
  present: 'Attended',
  no_show: 'Missed',
  canceled: 'Canceled',
}

/** The status in plain words; a class that has ended without a mark yet says so, rather than "Scheduled". */
export function familyStatusLabel(status: SessionStatus, ended: boolean): string {
  if (ended && (status === 'pending' || status === 'confirmed')) return 'Not marked yet'
  return FAMILY_STATUS_LABELS[status] ?? FAMILY_STATUS_LABELS.pending
}

/** A class's note for families: the sheets' "MU for 10/12" reads "Makeup for 10/12"; anything else as typed. */
export function familyNote(note: string | null | undefined): string {
  return (note ?? '').trim().replace(/^MU\b/, 'Makeup')
}
