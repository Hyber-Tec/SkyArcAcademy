import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { db, LIGHT } from './app'
import { sendNotifications } from './notify'
import { pinHash } from './pins'
import { familyClassesLink, familyOf, noticesFor } from './recipients'
import { dayStaffing, deliverSessionNotices, snapshotOf, teachingCoaches, withCoachesIn } from './sessionNotify'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { dayHours } from '@shared/availability'
import { COL, ROOT, availabilityDocId } from '@shared/paths'
import { type PayClass, autoClockOutAt } from '@shared/pay/paidTime'
import { coachesIn } from '@shared/schedule/classes'
import { type ConflictSeat, type ConflictSession, seatConflicts, sessionConflicts, staffCoachState } from '@shared/schedule/conflicts'
import { resolveBusinessRules } from '@shared/settings/businessRules'
import { familyBookedNotice } from '@shared/schedule/familyNotices'
import { type SessionSnapshot, inNoticeWindow, sessionCreatedNotices } from '@shared/schedule/notify'
import { resolveSettings } from '@shared/settings/resolve'
import type { BranchSettings } from '@shared/settings/defaults'
import { dateKeyOf, formatMinutes, minutesOf, todayKey } from '@shared/time'
import type { AcademyClass, Availability, Branch, DayConfig, Member, Session, StaffStatus, StudentStatus } from '@shared/types'


// ------------------------------------------------------------------ helpers

interface Caller {
  uid: string
  email: string
  name: string
  role: 'owner' | 'admin'
}

async function requireAdmin(branchId: string, auth: { uid: string; token: Record<string, unknown> } | undefined): Promise<Caller> {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) {
    throw new HttpsError('unauthenticated', 'Sign in first.')
  }
  const email = (auth.token.email as string).toLowerCase()
  const member = await db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`).get()
  const m = member.data()
  if (!m || m.status !== 'active' || (m.role !== 'owner' && m.role !== 'admin')) throw new HttpsError('permission-denied', 'Only the academy’s admins can do this.')
  return { uid: auth.uid, email, name: (m.displayName as string) || (auth.token.name as string) || email, role: m.role }
}

async function loadBranch(branchId: string): Promise<{ branch: Branch; settings: BranchSettings }> {
  const snap = await db.doc(`${ROOT.branches}/${branchId}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Academy not found.')
  const branch = snap.data() as Branch
  return { branch, settings: resolveSettings(branch.settings) }
}

function audit(branchId: string, entry: Record<string, unknown>) {
  return db.collection(`${ROOT.branches}/${branchId}/${COL.auditLog}`).add({
    at: FieldValue.serverTimestamp(),
    actorUid: 'system',
    actorEmail: 'system',
    actorName: 'System',
    actorRole: 'system',
    context: '',
    dateKey: null,
    studentId: null,
    studentName: null,
    coachId: null,
    coachName: null,
    changes: [],
    via: 'function',
    ...entry,
  })
}

// ------------------------------------------------------------------- kiosk

/** Admin sets (or clears) an employee's kiosk PIN. PINs are unique per branch. */
export const setKioskPin = onCall(async (req) => {
  const { branchId, staffId, pin } = (req.data ?? {}) as { branchId?: string; staffId?: string; pin?: string | null }
  if (!branchId || !staffId) throw new HttpsError('invalid-argument', 'Missing academy or employee.')
  const caller = await requireAdmin(branchId, req.auth)
  const { settings } = await loadBranch(branchId)
  const staffRef = db.doc(`${ROOT.branches}/${branchId}/${COL.staff}/${staffId}`)
  const ownerRef = db.doc(`${ROOT.branches}/${branchId}/kioskPinOwners/${staffId}`)
  const len = settings.timeClock.kiosk.pinLength
  if (pin != null && !new RegExp(`^\\d{${len}}$`).test(pin)) throw new HttpsError('invalid-argument', `The PIN must be ${len} digits.`)
  await db.runTransaction(async (tx) => {
    const [staff, owner] = await Promise.all([tx.get(staffRef), tx.get(ownerRef)])
    if (!staff.exists) throw new HttpsError('not-found', 'Employee not found.')
    const oldHash = owner.data()?.pinHash as string | undefined
    if (pin != null) {
      const hash = pinHash(branchId, pin)
      const existing = await tx.get(db.doc(`${ROOT.branches}/${branchId}/${COL.kioskPins}/${hash}`))
      if (existing.exists && existing.data()?.staffId !== staffId) throw new HttpsError('already-exists', 'That PIN is already in use. Choose a different one.')
      if (oldHash && oldHash !== hash) tx.delete(db.doc(`${ROOT.branches}/${branchId}/${COL.kioskPins}/${oldHash}`))
      tx.set(db.doc(`${ROOT.branches}/${branchId}/${COL.kioskPins}/${hash}`), { staffId, updatedAt: FieldValue.serverTimestamp() })
      tx.set(ownerRef, { pinHash: hash, updatedAt: FieldValue.serverTimestamp(), updatedBy: caller.email })
      tx.update(staffRef, { hasKioskPin: true, updatedAt: FieldValue.serverTimestamp() })
    } else {
      if (oldHash) tx.delete(db.doc(`${ROOT.branches}/${branchId}/${COL.kioskPins}/${oldHash}`))
      tx.delete(ownerRef)
      tx.update(staffRef, { hasKioskPin: false, updatedAt: FieldValue.serverTimestamp() })
    }
  })
  await audit(branchId, {
    actorUid: caller.uid,
    actorEmail: caller.email,
    actorName: caller.name,
    actorRole: caller.role,
    via: 'web',
    action: pin != null ? 'kiosk.pin_set' : 'kiosk.pin_clear',
    category: 'pay',
    entityType: 'staff',
    entityId: staffId,
    coachId: staffId,
    summary: pin != null ? 'Set a kiosk PIN' : 'Removed a kiosk PIN',
  })
  return { ok: true }
})

async function staffForPin(branchId: string, pin: string) {
  if (!/^\d{3,8}$/.test(pin ?? '')) throw new HttpsError('invalid-argument', 'Enter your PIN.')
  const pinDoc = await db.doc(`${ROOT.branches}/${branchId}/${COL.kioskPins}/${pinHash(branchId, pin)}`).get()
  if (!pinDoc.exists) throw new HttpsError('not-found', 'PIN not found. Try again.')
  const staffId = pinDoc.data()!.staffId as string
  const staff = await db.doc(`${ROOT.branches}/${branchId}/${COL.staff}/${staffId}`).get()
  if (!staff.exists || staff.data()!.status === 'finished') throw new HttpsError('failed-precondition', 'This employee can’t clock in. Please see an admin.')
  return { staffId, name: staff.data()!.name as string }
}

/**
 * Kiosk step 1: who is this, and are they clocked in? When they aren't, and today's last shift was closed automatically
 * (at the end of their last class, K3), when: they may have come to clock out.
 */
export const kioskIdentify = onCall(async (req) => {
  const { branchId, pin } = (req.data ?? {}) as { branchId?: string; pin?: string }
  if (!branchId) throw new HttpsError('invalid-argument', 'Missing academy.')
  await requireAdmin(branchId, req.auth)
  const { staffId, name } = await staffForPin(branchId, pin ?? '')
  const open = await db.doc(`${ROOT.branches}/${branchId}/${COL.openShifts}/${staffId}`).get()
  if (open.exists) return { staffId, name, openSince: (open.data()!.clockInAt as Timestamp).toMillis(), autoOutAt: null }
  const { branch } = await loadBranch(branchId)
  const today = await db
    .collection(`${ROOT.branches}/${branchId}/${COL.clockShifts}`)
    .where('staffId', '==', staffId)
    .where('dateKey', '==', todayKey(branch.timezone))
    .get()
  const last = today.docs
    .map((d) => d.data())
    .filter((s) => s.status === 'closed' && s.clockOutAt)
    .sort((a, b) => (b.clockOutAt as Timestamp).toMillis() - (a.clockOutAt as Timestamp).toMillis())[0]
  return { staffId, name, openSince: null, autoOutAt: last?.autoClosed && !last.autoCorrected ? (last.clockOutAt as Timestamp).toMillis() : null }
})

/** Kiosk step 2: clock in, or clock out of the open shift. Server time only. */
export const kioskPunch = onCall(async (req) => {
  const { branchId, pin } = (req.data ?? {}) as { branchId?: string; pin?: string }
  if (!branchId) throw new HttpsError('invalid-argument', 'Missing academy.')
  const caller = await requireAdmin(branchId, req.auth)
  const { branch } = await loadBranch(branchId)
  const tz = branch.timezone
  const { staffId, name } = await staffForPin(branchId, pin ?? '')
  const openRef = db.doc(`${ROOT.branches}/${branchId}/${COL.openShifts}/${staffId}`)
  const now = Timestamp.now()
  const result = await db.runTransaction(async (tx) => {
    const open = await tx.get(openRef)
    if (open.exists) {
      const shiftId = open.data()!.shiftId as string
      const shiftRef = db.doc(`${ROOT.branches}/${branchId}/${COL.clockShifts}/${shiftId}`)
      const shift = await tx.get(shiftRef)
      const clockInAt = shift.data()?.clockInAt as Timestamp | undefined
      tx.update(shiftRef, {
        clockOutAt: now,
        outDateKey: dateKeyOf(now.toDate(), tz),
        outMin: minutesOf(now.toDate(), tz),
        status: 'closed',
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: `kiosk:${caller.email}`,
      })
      tx.delete(openRef)
      return { action: 'out' as const, clockInAt: clockInAt?.toMillis() ?? null, clockOutAt: now.toMillis(), shiftId }
    }
    const shiftRef = db.collection(`${ROOT.branches}/${branchId}/${COL.clockShifts}`).doc()
    tx.set(shiftRef, {
      staffId,
      staffName: name,
      dateKey: dateKeyOf(now.toDate(), tz),
      inMin: minutesOf(now.toDate(), tz),
      clockInAt: now,
      clockOutAt: null,
      outDateKey: null,
      outMin: null,
      status: 'open',
      source: 'kiosk',
      autoClosed: false,
      autoCorrected: false,
      forcedType: null,
      note: '',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: `kiosk:${caller.email}`,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: `kiosk:${caller.email}`,
    })
    tx.set(openRef, { shiftId: shiftRef.id, clockInAt: now })
    return { action: 'in' as const, clockInAt: now.toMillis(), clockOutAt: null, shiftId: shiftRef.id }
  })
  await audit(branchId, {
    action: result.action === 'in' ? 'shift.clock_in' : 'shift.clock_out',
    category: 'pay',
    entityType: 'shift',
    entityId: result.shiftId,
    coachId: staffId,
    coachName: name,
    dateKey: dateKeyOf(now.toDate(), tz),
    via: 'kiosk',
    summary: `${name} clocked ${result.action} at ${formatMinutes(minutesOf(now.toDate(), tz))}`,
  })
  return { ...result, name }
})

// ---------------------------------------------------------------- schedules

/** A day's classes and who's in, as the automatic clock-out reads them. */
async function payDay(branchId: string, dateKey: string): Promise<{ classes: PayClass[]; availability: Availability[] }> {
  const base = `${ROOT.branches}/${branchId}`
  const [classes, availability] = await Promise.all([
    db.collection(`${base}/${COL.classes}`).where('dateKey', '==', dateKey).get(),
    db.collection(`${base}/${COL.availability}`).where('dateKey', '==', dateKey).get(),
  ])
  return { classes: classes.docs.map((d) => d.data() as PayClass), availability: availability.docs.map((d) => d.data() as Availability) }
}

/**
 * Closes shifts still open once each academy's automatic clock-out comes (docs/DECISIONS.md §23, K3): at the end of the
 * person's last class that day (the last they're in for, else the day's last), or at the set time on a day without
 * classes (`autoClockOutAt`). The shift closes at that moment, marked as closed automatically and how.
 */
export const autoClockOut = onSchedule({ schedule: 'every 15 minutes', timeZone: 'UTC', ...LIGHT }, async () => {
  const branches = await db.collection(ROOT.branches).where('status', '==', 'active').get()
  const now = Date.now()
  for (const b of branches.docs) {
    const branch = b.data() as Branch
    const settings = resolveSettings(branch.settings)
    if (!settings.timeClock.autoClockOut.enabled) continue
    const open = await db.collection(`${ROOT.branches}/${b.id}/${COL.openShifts}`).get()
    const days = new Map<string, ReturnType<typeof payDay>>()
    for (const o of open.docs) {
      const shiftRef = db.doc(`${ROOT.branches}/${b.id}/${COL.clockShifts}/${o.data().shiftId}`)
      const shift = await shiftRef.get()
      if (!shift.exists) {
        await o.ref.delete()
        continue
      }
      const s = shift.data()!
      const dateKey = s.dateKey as string
      if (!days.has(dateKey)) days.set(dateKey, payDay(b.id, dateKey))
      const { classes, availability } = await days.get(dateKey)!
      const out = autoClockOutAt({
        shift: { staffId: s.staffId as string, dateKey, inMin: s.inMin as number, clockInMs: (s.clockInAt as Timestamp).toMillis() },
        classes,
        availability,
        settings,
        timeZone: branch.timezone,
      })
      if (!out || now < out.atMs) continue
      const at = new Date(out.atMs)
      const outMin = minutesOf(at, branch.timezone)
      const batch = db.batch()
      batch.update(shiftRef, {
        clockOutAt: Timestamp.fromDate(at),
        outDateKey: dateKeyOf(at, branch.timezone),
        outMin,
        status: 'closed',
        autoClosed: true,
        autoClosedBy: out.by,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: 'system',
      })
      batch.delete(o.ref)
      await batch.commit()
      await audit(b.id, {
        action: 'shift.auto_clock_out',
        category: 'pay',
        entityType: 'shift',
        entityId: shiftRef.id,
        coachId: s.staffId,
        coachName: s.staffName,
        dateKey,
        summary: `${s.staffName} was clocked out automatically at ${formatMinutes(outMin)}${out.by === 'last_class' ? ', at the end of the last class' : ''}`,
      })
    }
  }
})

/**
 * Whether a session may not happen as booked (the same check the schedules show). A seat in a class: day closed or
 * class outside hours, no coach in for it, more students than seats, student double-booked or inactive. A session
 * with its own coach, from before classes were taught together: coach unavailable or inactive, day closed, outside
 * hours, too many students, student double-booked or inactive.
 */
async function inConflict(branchId: string, id: string, data: FirebaseFirestore.DocumentData, settings: BranchSettings, branch: Branch | undefined) {
  if (data.classId) return seatInConflict(branchId, id, data, settings)
  // Neither a class nor a coach of its own: nobody teaches it.
  if (!data.coachId) return true
  const base = `${ROOT.branches}/${branchId}`
  const [cfg, avail, staff, student, day, members] = await Promise.all([
    db.doc(`${base}/${COL.dayConfigs}/${data.dateKey}`).get(),
    db.doc(`${base}/${COL.availability}/${availabilityDocId(data.coachId, data.dateKey)}`).get(),
    db.doc(`${base}/${COL.staff}/${data.coachId}`).get(),
    db.doc(`${base}/${COL.students}/${data.studentId}`).get(),
    db.collection(`${base}/${COL.sessions}`).where('dateKey', '==', data.dateKey).get(),
    db.collection(`${base}/${COL.members}`).where('staffId', '==', data.coachId).get(),
  ])
  const a = avail.data() as Availability | undefined
  const sessions = day.docs.map((d) => ({ id: d.id, ...(d.data() as Session) })).filter((s) => !s.isDeleted)
  const memberActive = members.empty ? null : members.docs.some((m) => (m.data() as Member).status === 'active')
  const conflicts = sessionConflicts({ id, ...data } as ConflictSession, {
    hours: dayHours(data.dateKey, settings, cfg.exists ? new Map([[data.dateKey as string, cfg.data() as DayConfig]]) : null),
    availability: a ? { ranges: a.ranges, unavailable: a.unavailable } : null,
    coachState: staffCoachState(staff.exists ? (staff.data()?.status as StaffStatus) : null, memberActive),
    studentStatus: student.exists ? ((student.data()?.status as StudentStatus) ?? null) : null,
    coachSessions: sessions.filter((s) => s.coachId === data.coachId),
    studentSessions: sessions.filter((s) => s.studentId === data.studentId),
    maxPerCoach: resolveBusinessRules(branch?.businessRules).maxStudentsPerCoach,
  })
  return conflicts.length > 0
}

/** A seat in a class: its class's time and seats, the coaches in at that time, and the student's other classes that day. */
async function seatInConflict(branchId: string, id: string, data: FirebaseFirestore.DocumentData, settings: BranchSettings) {
  const base = `${ROOT.branches}/${branchId}`
  const [cls, { hours, day }, teaching, student, sessions] = await Promise.all([
    db.doc(`${base}/${COL.classes}/${data.classId}`).get(),
    dayStaffing(branchId, data.dateKey, settings),
    teachingCoaches(branchId),
    data.studentId ? db.doc(`${base}/${COL.students}/${data.studentId}`).get() : null,
    db.collection(`${base}/${COL.sessions}`).where('dateKey', '==', data.dateKey).get(),
  ])
  const c = cls.data() as AcademyClass | undefined
  // Its class is gone or in the Trash: it waits for an admin.
  if (!c || c.isDeleted) return true
  const seats = sessions.docs.map((d) => ({ id: d.id, ...(d.data() as Session) })).filter((s) => !s.isDeleted)
  const conflicts = seatConflicts({ id, ...data } as ConflictSeat, {
    hours,
    class: c,
    coaches: coachesIn(c, day, hours, (staffId) => teaching.has(staffId)),
    classSeats: seats.filter((s) => s.classId === data.classId),
    studentStatus: student?.exists ? ((student.data()?.status as StudentStatus) ?? null) : null,
    studentSeats: seats.filter((s) => s.studentId === data.studentId),
  })
  return conflicts.length > 0
}

async function confirmIfDue(
  branchId: string,
  ref: FirebaseFirestore.DocumentReference,
  data: FirebaseFirestore.DocumentData,
  settings: BranchSettings,
  branch: Branch | undefined,
) {
  const ac = settings.schedule.autoConfirm
  if (!ac.enabled || data.status !== 'pending' || data.isDeleted) return false
  const start = (data.startAt as Timestamp).toMillis()
  const now = Date.now()
  if (start <= now || start > now + ac.hoursBefore * 3_600_000) return false
  // A session in conflict stays Pending until an admin sorts it out.
  if (await inConflict(branchId, ref.id, data, settings, branch)) return false
  await ref.update({ status: 'confirmed', confirmedAt: FieldValue.serverTimestamp(), confirmedBy: 'auto', updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system' })
  await audit(branchId, {
    action: 'session.status',
    category: 'schedule',
    entityType: 'session',
    entityId: ref.id,
    dateKey: data.dateKey,
    studentId: data.studentId,
    studentName: data.studentName,
    coachId: data.coachId || null,
    coachName: data.coachName || null,
    summary: `Confirmed ${data.studentName}’s class automatically`,
    changes: [{ field: 'status', label: 'Status', from: 'Pending', to: 'Confirmed' }],
  })
  return true
}

/** Pending sessions are confirmed automatically shortly before they start (default 24 h). */
export const autoConfirmSessions = onSchedule({ schedule: 'every 60 minutes', timeZone: 'UTC', ...LIGHT }, async () => {
  const now = Timestamp.now()
  const horizon = Timestamp.fromMillis(now.toMillis() + 7 * 24 * 3_600_000)
  const snap = await db.collectionGroup(COL.sessions).where('status', '==', 'pending').where('startAt', '>', now).where('startAt', '<=', horizon).get()
  const cache = new Map<string, { settings: BranchSettings; branch: Branch | undefined }>()
  for (const d of snap.docs) {
    const branchId = d.ref.parent.parent?.id
    if (!branchId) continue
    if (!cache.has(branchId)) {
      const b = await db.doc(`${ROOT.branches}/${branchId}`).get()
      const data = b.data() as Branch | undefined
      cache.set(branchId, { branch: data, settings: resolveSettings(data?.status === 'active' ? data.settings : { schedule: { autoConfirm: { enabled: false } } }) })
    }
    const { settings, branch } = cache.get(branchId)!
    await confirmIfDue(branchId, d.ref, d.data(), settings, branch)
  }
})

/**
 * A session created inside the auto-confirm window is confirmed right away;
 * if it is confirmed and starts inside the notification window, the coaches
 * who teach it (those in at its time) get "Session Confirmed" in their inbox.
 */
export const onSessionCreated = onDocumentCreated({ document: `${ROOT.branches}/{branchId}/${COL.sessions}/{sessionId}`, ...LIGHT }, async (event) => {
  const snap = event.data
  if (!snap) return
  const { branchId, sessionId } = event.params
  const { branch, settings } = await loadBranch(branchId)
  const data = snap.data()
  const confirmed = (await confirmIfDue(branchId, snap.ref, data, settings, branch)) || data.status === 'confirmed'
  if (branch.status !== 'active') return
  // A makeup or an extra class the office booked by hand: the family hears of it (one they asked for is told by the
  // request's answer instead, and copied weeks tell nobody).
  if (data.source === 'manual') {
    const booked = familyBookedNotice({ ...snapshotOf(data), note: String(data.note ?? '') }, Date.now())
    if (booked) {
      const family = await familyOf(branchId, String(data.studentId))
      await sendNotifications(branchId, noticesFor(family, booked, (p) => familyClassesLink(p, String(data.dateKey)), { sessionId, dateKey: String(data.dateKey) }), `sess-${sessionId}-booked`)
    }
  }
  if (!confirmed) return
  const notice = { now: Date.now(), today: todayKey(branch.timezone), windowHours: settings.notifications.sessionChangeWindowHours }
  const s: SessionSnapshot = { ...snapshotOf(data), status: 'confirmed' }
  // Most classes are added further ahead: who's in is read only for one that notifies.
  if (!inNoticeWindow(s, notice)) return
  const [seat] = await withCoachesIn(branchId, settings, [s])
  await deliverSessionNotices(branchId, sessionId, sessionCreatedNotices(seat, notice), `sess-${sessionId}-created`)
})

export { onAnnouncementComment, onAnnouncementRead, onAnnouncementWritten } from './announcements'
export { onSessionUpdated } from './sessionNotify'
export { purgeExpired, studentLifecycleDaily } from './jobs'
export { onMemberWritten, resendInvite } from './invites'
export { deleteMyAccount, sendAccountEmail } from './account'
export { purgeDriveTrash } from './drive'
export { onProgressReportWritten, onReportViewed } from './reports'
export { websiteMessage } from './website'
export { cancelClass, decideClassRequest, onClassWritten, onSeatWritten, requestClass, withdrawClassRequest } from './requests'
export { onScoreCreated } from './scores'
export { readResultsSheet } from './sheets'
