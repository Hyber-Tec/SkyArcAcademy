import { queryParams } from './auth'
import type { NotificationType } from './comms'
import type { TimestampLike } from './types'

/**
 * Push notifications to the phone app (iPhone and Android, through Firebase Cloud Messaging). Every inbox item the
 * server writes (`branches/{b}/notifications`) is also pushed to the recipient's phones, honoring the same
 * per-person switches (`staff.notificationPrefs`), so the inbox, the bell and the phone always say the same thing.
 */

/** `users/{uid}/devices/{deviceId}`: one per app install, written by the app, removed when it signs out. */
export interface DeviceDoc {
  /** The FCM registration token. */
  token: string
  /** The signed-in email (lower case): the server finds a recipient's phones by it. */
  email: string
  platform: 'ios' | 'android'
  /** "1.0.0 (3)". */
  appVersion: string
  /** "Apple iPhone 17 Pro, iOS 27.0": for the person's own list of devices. */
  label: string
  createdAt: TimestampLike | null
  updatedAt: TimestampLike | null
}

/** Android notification channels (the app creates them; a push names one). */
export const PUSH_CHANNELS = {
  sessions: { id: 'sessions', name: 'Classes', description: 'New classes and changes to your schedule' },
  announcements: { id: 'announcements', name: 'Announcements', description: 'News from your academy' },
} as const

export type PushChannel = keyof typeof PUSH_CHANNELS

export function channelFor(type: NotificationType | string): PushChannel {
  return type.startsWith('announcement') ? 'announcements' : 'sessions'
}

/**
 * The data every push carries (all strings, as FCM requires). `link` is the inbox item's in-app path below the
 * branch (`coach/schedule?date=…`, `coach/announcements/{id}`); the app opens the matching screen, the website
 * the matching page (`url`).
 */
export interface PushData {
  [key: string]: string
  type: string
  branchId: string
  notificationId: string
  link: string
  url: string
  sessionId: string
  announcementId: string
  dateKey: string
}

/** Where a push or an inbox item leads in the phone app, from its `link`. */
export type AppTarget =
  | { screen: 'schedule'; dateKey: string | null; sessionId: string | null }
  | { screen: 'announcement'; announcementId: string }
  | { screen: 'announcements' }
  /** A family's classes on a day (a class changed, a request answered). */
  | { screen: 'classes'; dateKey: string | null; sessionId: string | null }
  /** A family's scores (a new score). */
  | { screen: 'scores'; evaluationId: string | null }
  /** A shared progress report. */
  | { screen: 'report'; reportId: string }
  | { screen: 'today' }

export function appTargetOf(
  link: string,
  refs?: { sessionId?: string | null; announcementId?: string | null; dateKey?: string | null; evaluationId?: string | null; reportId?: string | null },
): AppTarget {
  const [path, search = ''] = (link ?? '').split('?')
  const params = queryParams(search)
  const parts = path.split('/').filter(Boolean)
  // The staff's announcements, or a family's News (the same posts).
  const posts = parts.findIndex((p) => p === 'announcements' || p === 'news')
  if (posts >= 0) {
    const id = parts[posts + 1] ?? refs?.announcementId ?? null
    return id ? { screen: 'announcement', announcementId: id } : { screen: 'announcements' }
  }
  if (parts.includes('schedule')) {
    return { screen: 'schedule', dateKey: params.get('date') ?? refs?.dateKey ?? null, sessionId: refs?.sessionId ?? null }
  }
  if (parts.includes('classes')) return { screen: 'classes', dateKey: params.get('date') ?? refs?.dateKey ?? null, sessionId: refs?.sessionId ?? null }
  if (parts.includes('scores')) return { screen: 'scores', evaluationId: params.get('score') ?? refs?.evaluationId ?? null }
  if (parts[0] === 'report' && (parts[1] ?? refs?.reportId)) return { screen: 'report', reportId: parts[1] ?? refs?.reportId ?? '' }
  return { screen: 'today' }
}
