import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db, LIGHT } from './app'
import { COL, ROOT } from '@shared/paths'
import { STUDENT_STATUS_LABELS, autoStudentStatus } from '@shared/people'
import { resolveSettings } from '@shared/settings/resolve'
import { addDays, todayKey } from '@shared/time'
import type { Branch, StudentStatus } from '@shared/types'

const DAY_MS = 86_400_000
/** How far back the daily job looks for sessions that happened (longer than any pause setting). */
const RECENT_DAYS = 60

async function activeBranches() {
  const snap = await db.collection(ROOT.branches).where('status', '==', 'active').get()
  return snap.docs.map((d) => ({ id: d.id, branch: d.data() as Branch }))
}

/**
 * Daily (early morning US time): refreshes each student's first, last and next session dates from the schedule (a past
 * session that wasn't canceled or missed counts as attended), then applies the automatic student statuses (enroll after
 * the first session, pause after inactivity, re-enroll when sessions return; manual statuses are kept).
 */
export const studentLifecycleDaily = onSchedule({ schedule: '0 8 * * *', timeZone: 'UTC', timeoutSeconds: 540, ...LIGHT }, async () => {
  for (const { id: branchId, branch } of await activeBranches()) {
    const settings = resolveSettings(branch.settings)
    const today = todayKey(branch.timezone || 'America/New_York')
    const base = `${ROOT.branches}/${branchId}`
    const [students, upcoming, recent] = await Promise.all([
      db.collection(`${base}/${COL.students}`).get(),
      db.collection(`${base}/${COL.sessions}`).where('dateKey', '>=', today).get(),
      db.collection(`${base}/${COL.sessions}`).where('dateKey', '>=', addDays(today, -RECENT_DAYS)).where('dateKey', '<', today).get(),
    ])
    const next = new Map<string, string>()
    for (const s of upcoming.docs) {
      const d = s.data()
      if (d.isDeleted || d.status === 'canceled' || !d.studentId) continue
      const cur = next.get(d.studentId)
      if (!cur || d.dateKey < cur) next.set(d.studentId, d.dateKey)
    }
    const first = new Map<string, string>()
    const last = new Map<string, string>()
    for (const s of recent.docs) {
      const d = s.data()
      if (d.isDeleted || d.status === 'canceled' || d.status === 'no_show' || !d.studentId) continue
      if (!first.has(d.studentId) || d.dateKey < first.get(d.studentId)!) first.set(d.studentId, d.dateKey)
      if (!last.has(d.studentId) || d.dateKey > last.get(d.studentId)!) last.set(d.studentId, d.dateKey)
    }
    const writer = db.bulkWriter()
    let changed = 0
    for (const st of students.docs) {
      const d = st.data()
      const nextDate = next.get(st.id) ?? null
      const recentLast = last.get(st.id) ?? null
      const stored = (d.lastSessionDate as string | null | undefined) ?? null
      const lastDate = recentLast && (!stored || recentLast > stored) ? recentLast : stored
      const patch: Record<string, unknown> = {}
      if ((d.nextSessionDate ?? null) !== nextDate) patch.nextSessionDate = nextDate
      if (stored !== lastDate) patch.lastSessionDate = lastDate
      if (!d.firstSessionDate && first.has(st.id)) patch.firstSessionDate = first.get(st.id)
      const status = autoStudentStatus(
        { status: d.status as StudentStatus, statusSource: d.statusSource === 'manual' ? 'manual' : 'auto', lastSessionDate: lastDate, hasUpcoming: !!nextDate },
        today,
        settings.students.autoStatus,
      )
      if (status) {
        patch.status = status
        patch.statusSource = 'auto'
        changed++
        void writer.create(db.collection(`${base}/${COL.auditLog}`).doc(), {
          at: FieldValue.serverTimestamp(),
          actorUid: 'system',
          actorEmail: 'system',
          actorName: 'System',
          actorRole: 'system',
          action: 'student.status_auto',
          category: 'people',
          entityType: 'student',
          entityId: st.id,
          summary: `${d.name} is now ${STUDENT_STATUS_LABELS[status]} (automatic)`,
          context:
            status === 'paused'
              ? `No class in ${settings.students.autoStatus.inactivityPauseDays} days and none scheduled`
              : 'Has a recent or upcoming class',
          dateKey: today,
          studentId: st.id,
          studentName: d.name ?? null,
          coachId: null,
          coachName: null,
          changes: [{ field: 'status', label: 'Status', from: STUDENT_STATUS_LABELS[d.status as StudentStatus] ?? d.status, to: STUDENT_STATUS_LABELS[status] }],
          via: 'function',
        })
      }
      if (Object.keys(patch).length) void writer.update(st.ref, { ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system' })
    }
    await writer.close()
    if (changed) logger.info('Student statuses updated', { branchId, changed })
  }
})

/** Daily: deletes inbox items, and trashed classes and sessions, older than each branch's retention. */
export const purgeExpired = onSchedule({ schedule: '30 8 * * *', timeZone: 'UTC', timeoutSeconds: 540, ...LIGHT }, async () => {
  const branches = await db.collection(ROOT.branches).get()
  for (const b of branches.docs) {
    const settings = resolveSettings((b.data() as Branch).settings)
    const base = `${ROOT.branches}/${b.id}`
    const now = Date.now()
    const inboxCutoff = Timestamp.fromMillis(now - settings.notifications.retentionDays * DAY_MS)
    const trashCutoff = now - settings.trash.retentionDays * DAY_MS
    const [inbox, trash, trashedClasses] = await Promise.all([
      db.collection(`${base}/${COL.notifications}`).where('createdAt', '<', inboxCutoff).limit(5000).get(),
      db.collection(`${base}/${COL.sessions}`).where('isDeleted', '==', true).get(),
      db.collection(`${base}/${COL.classes}`).where('isDeleted', '==', true).get(),
    ])
    const writer = db.bulkWriter()
    for (const d of inbox.docs) void writer.delete(d.ref)
    // A class goes to the Trash with its students, so both leave it on the same day.
    const purge = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
      let n = 0
      for (const d of docs) {
        const at = (d.get('deletedAt') as Timestamp | null)?.toMillis() ?? 0
        if (at && at < trashCutoff) {
          void writer.delete(d.ref)
          n++
        }
      }
      return n
    }
    const sessions = purge(trash.docs)
    const classes = purge(trashedClasses.docs)
    await writer.close()
    if (inbox.size || sessions || classes) logger.info('Purged', { branchId: b.id, notifications: inbox.size, sessions, classes })
  }
})
