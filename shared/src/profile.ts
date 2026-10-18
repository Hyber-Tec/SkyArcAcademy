import type { AuditChange, NotificationPrefs, Staff } from './types'

/**
 * What a coach keeps up to date about themself on their employee record (`staff/{id}`), from the website's Profile
 * and the phone app's More: their contact details and their notification switches. The rules let a coach change only
 * these fields of their own record (firestore.rules, `staff`), and every change writes an audit entry. The website
 * (web/src/features/coach/api.ts) and the phone app save them the same way.
 */

/** The contact details a coach keeps up to date themself. Only admins see them. */
export interface MyDetails {
  phone: string
  /** `YYYY-MM-DD`, or null when not given. */
  dob: string | null
  address: string
}

const DETAIL_LABELS: Record<keyof MyDetails, string> = { phone: 'Phone', dob: 'Date of birth', address: 'Address' }

/** The details as the employee record has them. */
export function detailsOf(staff: Partial<Pick<Staff, 'phone' | 'dob' | 'address'>> | null | undefined): MyDetails {
  return { phone: staff?.phone ?? '', dob: staff?.dob ?? null, address: staff?.address ?? '' }
}

/** What saving writes: the spaces at either end trimmed, and no birth date as null. */
export function cleanDetails(details: MyDetails): MyDetails {
  return { phone: details.phone.trim(), dob: details.dob || null, address: details.address.trim() }
}

/** True when saving `draft` would change what's saved. */
export function detailsDiffer(saved: MyDetails, draft: MyDetails): boolean {
  const a = cleanDetails(saved)
  const b = cleanDetails(draft)
  return a.phone !== b.phone || a.dob !== b.dob || a.address !== b.address
}

/** The audit entry's changes, field by field (an empty value counts as none), as the website records them. */
export function detailChanges(before: MyDetails, after: MyDetails): AuditChange[] {
  const out: AuditChange[] = []
  for (const field of Object.keys(DETAIL_LABELS) as (keyof MyDetails)[]) {
    const from = before[field] || null
    const to = after[field] || null
    if (from !== to) out.push({ field, label: DETAIL_LABELS[field], from, to })
  }
  return out
}

/** The audit log's line for saving the details. */
export function detailsSummary(staffName: string): string {
  return `Updated ${staffName}’s contact details`
}

/** The four notification switches, in the order the website and the app show them. */
export const NOTIFICATION_SWITCHES: readonly { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: 'announcements', label: 'Announcements', description: 'New posts from the academy, and posts sent to you again.' },
  { key: 'sessionCreated', label: 'New classes', description: 'A class booked for you.' },
  { key: 'sessionChanged', label: 'Class changes', description: 'A new day or time, a no-show, or a class moved to or from you.' },
  { key: 'sessionCanceled', label: 'Cancellations', description: 'A confirmed class canceled, removed or put back.' },
]

/** A missing switch counts as on, as the server reads it (functions/src/notify.ts). */
export function prefOn(prefs: Partial<NotificationPrefs> | null | undefined, key: keyof NotificationPrefs): boolean {
  return prefs?.[key] !== false
}

/** How many switches are on, in a few words: "All on", "Off", "2 of 4 on". */
export function notificationsSummary(prefs: Partial<NotificationPrefs> | null | undefined): string {
  const on = NOTIFICATION_SWITCHES.filter((s) => prefOn(prefs, s.key)).length
  return on === NOTIFICATION_SWITCHES.length ? 'All on' : on === 0 ? 'Off' : `${on} of ${NOTIFICATION_SWITCHES.length} on`
}

/** The audit entry's line and change for turning one switch on or off. */
export function notificationAudit(key: keyof NotificationPrefs, on: boolean, staffName: string): { summary: string; change: AuditChange } {
  const label = NOTIFICATION_SWITCHES.find((s) => s.key === key)?.label ?? key
  return {
    summary: `Turned ${on ? 'on' : 'off'} “${label}” notifications for ${staffName}`,
    change: { field: `notificationPrefs.${key}`, label: `${label} notifications`, from: on ? 'Off' : 'On', to: on ? 'On' : 'Off' },
  }
}
