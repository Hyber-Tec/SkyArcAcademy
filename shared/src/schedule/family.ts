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
  const labels = FAMILY_STATUS_LABELS
  if (ended && (status === 'pending' || status === 'confirmed')) return 'Not marked yet'
  return labels[status] ?? labels.pending
}

/** A class's note for families: the sheets' "MU for 10/12" reads "Makeup for 10/12"; anything else as typed. */
export function familyNote(note: string | null | undefined): string {
  return (note ?? '').trim().replace(/^MU\b/, 'Makeup')
}
