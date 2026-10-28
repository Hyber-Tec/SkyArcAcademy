import type { Role } from './roles'
import type { AuditStamp, TimestampLike } from './types'
import type { AnnouncementWebsite } from './website/types'

// ------------------------------------------------------------ announcements

/** "all" = everyone in the coach portal; "members" = the listed people. */
export type AnnouncementAudience = 'all' | 'members'

export interface AnnouncementAttachment {
  name: string
  url: string
  /** Storage path, for deletes. */
  path: string
  size: number
  contentType: string
}

/** `branches/{b}/announcements/{id}`. */
export interface Announcement extends AuditStamp {
  title: string
  /** Sanitized HTML. Images are uploaded to Storage, never inlined. */
  contentHtml: string
  /** Plain text for search and previews. */
  contentText: string
  category: string
  audienceType: AnnouncementAudience
  /** Member email keys when the audience is "members". */
  audienceKeys: string[]
  /**
   * Parents and students see it too, on their Home in the portal and the app (the owner's question of 2026-10-17;
   * docs/DECISIONS.md §16). Off unless the admin turns it on; comments stay with staff. Absent on older posts: off.
   */
  families?: boolean
  /** Shown on the public website's News too (docs/DECISIONS.md §18). Absent on older posts: off. */
  website?: AnnouncementWebsite
  commentsEnabled: boolean
  pinned: boolean
  pinnedAt: TimestampLike | null
  archived: boolean
  /**
   * Set when the admin asks to notify the audience (publish with "Notify", or
   * "Notify again" on edit). The server writes inbox items when it changes.
   */
  notifyRequestedAt: TimestampLike | null
  attachments: AnnouncementAttachment[]
  authorKey: string
  authorName: string
  /** Maintained by Cloud Functions. */
  readCount: number
  commentCount: number
}

/** `announcements/{id}/reads/{emailKey}`: written once, the first time the person opens the post. */
export interface AnnouncementRead {
  email: string
  name: string
  branchId: string
  announcementId: string
  readAt: TimestampLike
}

/** `announcements/{id}/comments/{id}`. */
export interface AnnouncementComment {
  authorKey: string
  authorName: string
  authorRole: Role
  text: string
  createdAt: TimestampLike
}

export const ANNOUNCEMENT_COMMENT_MAX = 2000

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" }

/** HTML → searchable text: drops style/script blocks, turns tags into spaces, collapses whitespace. */
export function stripHtmlToText(html: string): string {
  return (html ?? '')
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, e: string) => ENTITIES[e] ?? ' ')
    .replace(/[​ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Comment text as stored: trimmed, zero-width spaces removed, non-breaking spaces normalized. */
export function cleanCommentText(text: string): string {
  return (text ?? '').replace(/​/g, '').replace(/ /g, ' ').trim()
}

/** Category list: the branch defaults in order, then the ones used on posts A→Z (case-insensitive de-dup). */
export function announcementCategories(defaults: readonly string[], used: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (name: string) => {
    const n = (name ?? '').trim()
    if (!n || seen.has(n.toLowerCase())) return
    seen.add(n.toLowerCase())
    out.push(n)
  }
  defaults.forEach(add)
  ;[...used].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })).forEach(add)
  return out
}

/** Who may see a post in the coach portal. */
export function isInAudience(a: Pick<Announcement, 'audienceType' | 'audienceKeys'>, memberKey: string): boolean {
  return a.audienceType === 'all' || (a.audienceKeys ?? []).includes(memberKey)
}

/** Whether parents and students see a post (shown to families, and not archived). */
export function isForFamilies(a: Pick<Announcement, 'families' | 'archived'>): boolean {
  return a.families === true && !a.archived
}

// ------------------------------------------------------------ notifications

export type NotificationType =
  | 'announcement'
  | 'announcement_updated'
  | 'session_created'
  | 'session_canceled'
  | 'session_restored'
  | 'session_deleted'
  | 'session_time_changed'
  | 'session_date_changed'
  | 'session_reassigned_in'
  | 'session_reassigned_out'
  | 'session_no_show'
  | 'report_shared'
  | 'website_message'
  // Families' cancellations and requests (docs/DECISIONS.md §23): the office hears of them, the family of the answer.
  | 'class_canceled_by_family'
  | 'class_requested'
  | 'request_approved'
  | 'request_rejected'
  // A new score for a student, to their family.
  | 'score_added'

/** `branches/{b}/notifications/{id}`: the in-app inbox (written by Cloud Functions). */
export interface AppNotification {
  recipientKey: string
  type: NotificationType
  title: string
  body: string
  /** In-app path below the branch, e.g. "coach/announcements/abc". */
  link: string
  refs: {
    sessionId?: string | null
    announcementId?: string | null
    dateKey?: string | null
    reportId?: string | null
    messageId?: string | null
    requestId?: string | null
    evaluationId?: string | null
  }
  createdAt: TimestampLike
  readAt: TimestampLike | null
}

export const NOTIFICATION_TYPES: Record<NotificationType, { label: string; color: string }> = {
  announcement: { label: 'Announcement', color: '#6B7280' },
  announcement_updated: { label: 'Announcement Updated', color: '#6B7280' },
  session_created: { label: 'New Class', color: '#16A34A' },
  session_canceled: { label: 'Class Canceled', color: '#DC2626' },
  session_restored: { label: 'Class Restored', color: '#D97706' },
  session_deleted: { label: 'Class Removed', color: '#DC2626' },
  session_time_changed: { label: 'Time Changed', color: '#2563EB' },
  session_date_changed: { label: 'Date Changed', color: '#7C3AED' },
  session_reassigned_in: { label: 'You Were Assigned', color: '#16A34A' },
  session_reassigned_out: { label: 'Class Reassigned', color: '#D97706' },
  session_no_show: { label: 'No-show', color: '#DC2626' },
  report_shared: { label: 'Progress Report', color: '#C80000' },
  website_message: { label: 'From the Website', color: '#0A0A0A' },
  class_canceled_by_family: { label: 'Canceled by the Family', color: '#DC2626' },
  class_requested: { label: 'Class Request', color: '#D97706' },
  request_approved: { label: 'Request Approved', color: '#16A34A' },
  request_rejected: { label: 'Request Declined', color: '#6B7280' },
  score_added: { label: 'New Score', color: '#2563EB' },
}

export function notificationMeta(type: string): { label: string; color: string } {
  return NOTIFICATION_TYPES[type as NotificationType] ?? { label: 'Notification', color: '#9CA3AF' }
}
