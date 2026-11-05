import type { SessionStatus } from '../settings/defaults'
import type { Lang } from '../i18n'

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

/** The same in Korean (docs/DECISIONS.md §36). */
export const FAMILY_STATUS_LABELS_KO: Record<SessionStatus, string> = {
  pending: '예정',
  confirmed: '확정',
  present: '출석',
  no_show: '결석',
  canceled: '취소됨',
}

/** The status in plain words; a class that has ended without a mark yet says so, rather than "Scheduled". */
export function familyStatusLabel(status: SessionStatus, ended: boolean, lang: Lang = 'en'): string {
  const labels = lang === 'ko' ? FAMILY_STATUS_LABELS_KO : FAMILY_STATUS_LABELS
  if (ended && (status === 'pending' || status === 'confirmed')) return lang === 'ko' ? '출석 확인 전' : 'Not marked yet'
  return labels[status] ?? labels.pending
}

/** A class's note for families: the sheets' "MU for 10/12" reads "Makeup for 10/12" (보강 10/12); anything else as typed. */
export function familyNote(note: string | null | undefined, lang: Lang = 'en'): string {
  return (note ?? '').trim().replace(/^MU\b/, lang === 'ko' ? '보강' : 'Makeup')
}
