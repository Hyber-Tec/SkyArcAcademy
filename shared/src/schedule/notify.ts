import type { NotificationType } from '../comms'
import { type DateKey, formatDateKey, formatMinutes } from '../time'
import { SESSION_STATUS_LABELS } from './status'

/** The session fields the notification rules look at. */
export interface SessionSnapshot {
  /** The one coach a session had before classes were taught together; empty on a seat in a class. */
  coachId: string | null
  /**
   * Who teaches a seat in a class: the coaches in at its time (their availability that day), as the caller found them.
   * Its notices go to them; a session with its own `coachId` notifies that coach only.
   */
  coachIds?: readonly string[]
  studentName: string
  status: string
  dateKey: DateKey
  startMin: number
  endMin: number
  /** Start instant in ms. */
  startMs: number
  isDeleted?: boolean
}

/** Which of the coach's notification switches governs an item. */
export type SessionPref = 'sessionCreated' | 'sessionChanged' | 'sessionCanceled'

export interface SessionNotice {
  staffId: string
  type: NotificationType
  title: string
  body: string
  dateKey: DateKey
  pref: SessionPref
}

export interface NoticeContext {
  now: number
  /** Today in the branch zone. */
  today: DateKey
  /** Only sessions starting within this many hours notify (owner decision: 24). */
  windowHours: number
}

const date = (d: DateKey) => formatDateKey(d, 'weekdayShort') // "Wed, 9/30"
const time = (m: number) => formatMinutes(m) // "4:00 PM"
const range = (s: SessionSnapshot) => `${time(s.startMin)} – ${time(s.endMin)}`
const day = (s: SessionSnapshot, ctx: NoticeContext) => (s.dateKey === ctx.today ? 'today' : date(s.dateKey))
const statusLabel = (status: string) => SESSION_STATUS_LABELS[status as keyof typeof SESSION_STATUS_LABELS] ?? status

/** Whether a session starts inside the window: only those notify, so a caller can skip finding who's in otherwise. */
export function inNoticeWindow(s: Pick<SessionSnapshot, 'startMs'>, ctx: NoticeContext): boolean {
  return s.startMs >= ctx.now && s.startMs <= ctx.now + ctx.windowHours * 3_600_000
}

/** Who hears about a session: its own coach (from before classes were taught together), or the coaches in at its time. */
function coachesOf(s: SessionSnapshot): string[] {
  return s.coachId ? [s.coachId] : [...new Set(s.coachIds ?? [])].filter(Boolean)
}

/**
 * A new session that starts inside the window (after auto-confirm): True
 * Education's "Session Confirmed", to each coach who teaches it. Pending and
 * confirmed sessions only.
 */
export function sessionCreatedNotices(s: SessionSnapshot, ctx: NoticeContext): SessionNotice[] {
  if (s.isDeleted || !['pending', 'confirmed'].includes(s.status) || !inNoticeWindow(s, ctx)) return []
  return coachesOf(s).map((staffId) => ({
    staffId,
    type: 'session_created',
    title: 'Class Confirmed',
    body: `${s.studentName} on ${day(s, ctx)} at ${range(s)} has been confirmed.`,
    dateKey: s.dateKey,
    pref: 'sessionCreated',
  }))
}

/**
 * True Education's decision table for session updates, limited to sessions
 * starting inside the window (before or after the change), plus HyberCRM's
 * delete/restore-from-trash notices. They go to the coaches who teach the
 * session; at most one notice per coach.
 */
export function sessionChangeNotices(before: SessionSnapshot, after: SessionSnapshot, ctx: NoticeContext): SessionNotice[] {
  if (!inNoticeWindow(before, ctx) && !inNoticeWindow(after, ctx)) return []
  const out: SessionNotice[] = []
  const add = (to: readonly string[], n: Omit<SessionNotice, 'staffId' | 'dateKey'>, s: SessionSnapshot) => {
    for (const staffId of to) if (staffId && !out.some((o) => o.staffId === staffId)) out.push({ staffId, dateKey: s.dateKey, ...n })
  }

  // Moved to / back from the trash.
  if (!before.isDeleted && after.isDeleted) {
    if (before.status === 'confirmed') {
      add(coachesOf(before), { type: 'session_deleted', title: 'Class Deleted', body: `${before.studentName} on ${day(before, ctx)} at ${range(before)} was removed from the schedule.`, pref: 'sessionCanceled' }, before)
    }
    return out
  }
  if (before.isDeleted && !after.isDeleted) {
    if (after.status === 'confirmed') {
      add(coachesOf(after), { type: 'session_restored', title: 'Class Restored', body: `${after.studentName} on ${day(after, ctx)} at ${range(after)} is back on the schedule.`, pref: 'sessionCanceled' }, after)
    }
    return out
  }
  if (after.isDeleted) return out

  // Cancellations and their corrections.
  if (before.status === 'confirmed' && after.status === 'canceled') {
    const body =
      after.dateKey === ctx.today
        ? `${after.studentName}’s ${time(after.startMin)} class today is canceled.`
        : `${after.studentName} on ${date(after.dateKey)} at ${time(after.startMin)} has been canceled.`
    add(coachesOf(after), { type: 'session_canceled', title: 'Cancellation Alert', body, pref: 'sessionCanceled' }, after)
    return out
  }
  if (before.status === 'canceled' && after.status !== 'canceled') {
    const body =
      after.dateKey === ctx.today
        ? `Correction: ${after.studentName}’s ${time(after.startMin)} class today is NOT canceled. Status: ${statusLabel(after.status)}.`
        : `Correction: ${after.studentName} on ${date(after.dateKey)} is NOT canceled. Status: ${statusLabel(after.status)}.`
    add(coachesOf(after), { type: 'session_restored', title: 'Class Restored', body, pref: 'sessionCanceled' }, after)
    return out
  }
  if (after.status === 'canceled') return out
  // Tentative sessions don't notify.
  if (before.status === 'pending' && after.status === 'pending') return out

  // Another coach (a session with its own coach, from before): tell both, nothing else. A seat in a class has no coach
  // of its own to reassign: whoever is in at its time teaches it.
  if (before.coachId && after.coachId && before.coachId !== after.coachId) {
    add([before.coachId], { type: 'session_reassigned_out', title: 'Class Removed', body: `You no longer have ${before.studentName} on ${date(before.dateKey)} at ${range(before)}.`, pref: 'sessionChanged' }, before)
    add([after.coachId], { type: 'session_reassigned_in', title: 'Class Assigned', body: `You've been assigned to ${after.studentName}'s class on ${date(after.dateKey)} at ${range(after)}.`, pref: 'sessionChanged' }, after)
    return out
  }

  // A seat moved to another time leaves the coaches in at the old one and joins those at the new one: each hears of it
  // when their time is inside the window.
  const to = [before, after].filter((s) => inNoticeWindow(s, ctx)).flatMap(coachesOf)
  const changed = (n: Omit<SessionNotice, 'staffId' | 'dateKey' | 'pref'>) => add(to, { ...n, pref: 'sessionChanged' }, after)
  if (after.status === 'no_show' && before.status !== 'no_show') {
    changed({ type: 'session_no_show', title: 'No-show', body: `${after.studentName}'s class on ${date(after.dateKey)} at ${time(after.startMin)} was marked a no-show.` })
  } else if (before.dateKey !== after.dateKey) {
    changed({ type: 'session_date_changed', title: 'Class Date Changed', body: `${after.studentName}'s class moved from ${date(before.dateKey)} to ${date(after.dateKey)} at ${range(after)}.` })
  } else if (before.startMin !== after.startMin || before.endMin !== after.endMin) {
    changed({ type: 'session_time_changed', title: 'Time Changed', body: `${after.studentName}'s class on ${date(after.dateKey)}: ${range(before)} → ${range(after)}.` })
  }
  return out
}
