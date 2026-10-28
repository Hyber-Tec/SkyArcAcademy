import type { NotificationType } from './comms'
import type { Role } from './roles'
import type { TimestampLike } from './types'

/**
 * What families and the office are told, and their switches (the manager's second meeting: everyone hears of what
 * concerns them, and can turn kinds of notices off so nobody is flooded; docs/DECISIONS.md §23). Coaches keep their
 * four switches on their staff record (`NotificationPrefs`, More → Notifications on the phone, Profile on the website).
 * A switch that was never set is on. The inbox, the website's bell and the phone's push all follow the same switch.
 */
export type NoticeKey = 'classChanges' | 'requests' | 'scores' | 'reports' | 'announcements' | 'websiteMessages'

/** `branches/{b}/notificationPrefs/{email}`: a parent's, student's, owner's or admin's switches. */
export type NoticePrefs = Partial<Record<NoticeKey, boolean>> & { updatedAt?: TimestampLike | null }

export interface NoticeSwitch {
  key: NoticeKey
  label: string
  help: string
}

export const FAMILY_SWITCHES: readonly NoticeSwitch[] = [
  { key: 'classChanges', label: 'Class changes', help: 'A class canceled, moved, removed or missed' },
  { key: 'requests', label: 'Answers to requests', help: 'When the academy approves or declines a class you asked for' },
  { key: 'scores', label: 'New scores', help: 'When a new score is saved' },
  { key: 'reports', label: 'Progress reports', help: 'When the academy shares a progress report' },
  { key: 'announcements', label: 'News from the academy', help: 'Posts the academy shares with families' },
]

export const OFFICE_SWITCHES: readonly NoticeSwitch[] = [
  { key: 'classChanges', label: 'Cancellations from families', help: 'When a parent or student cancels a class' },
  { key: 'requests', label: 'Requests from families', help: 'A makeup, a moved class or an extra class to approve' },
  { key: 'websiteMessages', label: 'Messages from the website', help: 'Trial requests and questions sent from the public website' },
]

/** The switches a role sees (coaches have their own, on their staff record). */
export function noticeSwitchesFor(role: Role): readonly NoticeSwitch[] {
  if (role === 'parent' || role === 'student') return FAMILY_SWITCHES
  if (role === 'owner' || role === 'admin') return OFFICE_SWITCHES
  return []
}

/** Which switch a notice to a family or the office follows (null: always sent). */
export function noticeKeyOf(type: NotificationType): NoticeKey | null {
  if (type.startsWith('session_') || type === 'class_canceled_by_family') return 'classChanges'
  if (type === 'class_requested' || type === 'request_approved' || type === 'request_rejected') return 'requests'
  if (type === 'score_added') return 'scores'
  if (type === 'report_shared') return 'reports'
  if (type.startsWith('announcement')) return 'announcements'
  if (type === 'website_message') return 'websiteMessages'
  return null
}

export function noticeOn(prefs: NoticePrefs | null | undefined, key: NoticeKey | null): boolean {
  return key === null || prefs?.[key] !== false
}
