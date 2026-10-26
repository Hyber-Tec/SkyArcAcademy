import type { Timestamp } from 'firebase-admin/firestore'
import { onDocumentUpdated } from 'firebase-functions/v2/firestore'
import { db, LIGHT } from './app'
import { sendNotifications } from './notify'
import { dayHours } from '@shared/availability'
import { COL, ROOT } from '@shared/paths'
import { coachesIn } from '@shared/schedule/classes'
import { type SessionNotice, type SessionSnapshot, inNoticeWindow, sessionChangeNotices } from '@shared/schedule/notify'
import { resolveSettings } from '@shared/settings/resolve'
import type { BranchSettings, DayHours } from '@shared/settings/defaults'
import { todayKey } from '@shared/time'
import type { Availability, Branch, DayConfig, NotificationPrefs } from '@shared/types'

export function snapshotOf(d: FirebaseFirestore.DocumentData): SessionSnapshot {
  return {
    coachId: (d.coachId as string | null) ?? null,
    studentName: String(d.studentName ?? ''),
    status: String(d.status ?? ''),
    dateKey: String(d.dateKey ?? ''),
    startMin: Number(d.startMin ?? 0),
    endMin: Number(d.endMin ?? 0),
    startMs: (d.startAt as Timestamp | undefined)?.toMillis() ?? 0,
    isDeleted: d.isDeleted === true,
  }
}

export async function branchContext(branchId: string): Promise<{ settings: BranchSettings; timezone: string; active: boolean }> {
  const snap = await db.doc(`${ROOT.branches}/${branchId}`).get()
  const b = snap.data() as Branch | undefined
  return { settings: resolveSettings(b?.settings), timezone: b?.timezone ?? 'America/New_York', active: b?.status === 'active' }
}

/** The staff who teach: active coaches (the manager, an admin, can be in without teaching). */
export async function teachingCoaches(branchId: string): Promise<Set<string>> {
  const snap = await db.collection(`${ROOT.branches}/${branchId}/${COL.staff}`).where('role', '==', 'coach').get()
  return new Set(snap.docs.filter((d) => d.data().status === 'active').map((d) => d.id))
}

/** A date's opening hours, and who's in that day: everyone's hours (their availability). */
export async function dayStaffing(branchId: string, dateKey: string, settings: BranchSettings): Promise<{ hours: DayHours; day: Availability[] }> {
  const base = `${ROOT.branches}/${branchId}`
  const [cfg, avail] = await Promise.all([
    db.doc(`${base}/${COL.dayConfigs}/${dateKey}`).get(),
    db.collection(`${base}/${COL.availability}`).where('dateKey', '==', dateKey).get(),
  ])
  return {
    hours: dayHours(dateKey, settings, cfg.exists ? new Map([[dateKey, cfg.data() as DayConfig]]) : null),
    day: avail.docs.map((d) => d.data() as Availability),
  }
}

/**
 * Who hears about each seat in a class (classes are taught together): the active coaches in at its time. A session
 * with its own coach, from before, notifies that coach only and needs nothing read.
 */
export async function withCoachesIn(branchId: string, settings: BranchSettings, snaps: SessionSnapshot[]): Promise<SessionSnapshot[]> {
  const dates = [...new Set(snaps.filter((s) => !s.coachId && s.dateKey).map((s) => s.dateKey))]
  if (!dates.length) return snaps
  const [teaching, days] = await Promise.all([teachingCoaches(branchId), Promise.all(dates.map((d) => dayStaffing(branchId, d, settings)))])
  const byDate = new Map(dates.map((d, i) => [d, days[i]]))
  return snaps.map((s) => {
    const d = s.coachId ? undefined : byDate.get(s.dateKey)
    return d ? { ...s, coachIds: coachesIn(s, d.day, d.hours, (staffId) => teaching.has(staffId)).map((c) => c.staffId) } : s
  })
}

/** Resolves each notice's coach to their member email, honors their switches and writes the inbox items. */
export async function deliverSessionNotices(branchId: string, sessionId: string, notices: SessionNotice[], dedupeKey: string) {
  if (!notices.length) return
  const items = []
  for (const n of notices) {
    const [staff, members] = await Promise.all([
      db.doc(`${ROOT.branches}/${branchId}/${COL.staff}/${n.staffId}`).get(),
      db.collection(`${ROOT.branches}/${branchId}/${COL.members}`).where('staffId', '==', n.staffId).limit(1).get(),
    ])
    const prefs = (staff.data()?.notificationPrefs ?? {}) as Partial<NotificationPrefs>
    if (prefs[n.pref] === false) continue
    const member = members.docs[0]
    if (!member || member.data().status !== 'active') continue
    items.push({
      recipientKey: member.id,
      type: n.type,
      title: n.title,
      body: n.body,
      link: `coach/schedule?date=${n.dateKey}`,
      refs: { sessionId, dateKey: n.dateKey },
    })
  }
  await sendNotifications(branchId, items, dedupeKey)
}

/**
 * Session changes inside the notification window reach the inboxes of the coaches who teach it (TE's decision table):
 * the coaches in at its time, or a session's own coach from before classes were taught together.
 */
export const onSessionUpdated = onDocumentUpdated({ document: 'branches/{branchId}/sessions/{sessionId}', ...LIGHT }, async (event) => {
  const before = event.data?.before.data()
  const after = event.data?.after.data()
  if (!before || !after) return
  const { branchId, sessionId } = event.params
  const ctx = await branchContext(branchId)
  if (!ctx.active) return
  const notice = { now: Date.now(), today: todayKey(ctx.timezone), windowHours: ctx.settings.notifications.sessionChangeWindowHours }
  const snaps = [snapshotOf(before), snapshotOf(after)]
  // Most changes (attendance, classes further off) notify nobody: who's in is read only when someone may hear.
  if (!snaps.some((s) => inNoticeWindow(s, notice))) return
  const [b, a] = await withCoachesIn(branchId, ctx.settings, snaps)
  await deliverSessionNotices(branchId, sessionId, sessionChangeNotices(b, a, notice), `sess-${sessionId}-${event.id}`)
})
