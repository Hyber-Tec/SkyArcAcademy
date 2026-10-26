import { type WriteBatch, deleteDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { COL } from '@shared/paths'
import { fitsCapacity } from '@shared/schedule/lanes'
import type { BranchSettings } from '@shared/settings/defaults'
import { type DateKey, dayEndInstant, formatDateKey, formatTimeRange, toInstant, weekdayOf } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { type Actor, type AuditInput, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'

export interface ScheduleCtx {
  branchId: string
  actor: Actor
  timezone: string
  settings: BranchSettings
  /** Students one coach taught at once, for sessions from before classes were taught together (the Trash). */
  maxStudentsPerCoach: number
}

export function timeFields(dateKey: DateKey, startMin: number, endMin: number, tz: string) {
  return {
    dateKey,
    weekday: weekdayOf(dateKey),
    startMin,
    endMin,
    startAt: toInstant(dateKey, startMin, tz),
    endAt: toInstant(dateKey, endMin, tz),
    dayEndAt: dayEndInstant(dateKey, tz),
  }
}

/** "Wednesday, 9/30/2026 (4:00 PM - 5:50 PM)": a session from before classes were taught together, in the audit log. */
function sessionContext(s: Pick<Session, 'dateKey' | 'startMin' | 'endMin'>): string {
  return `${formatDateKey(s.dateKey, 'weekdayLong').split(',')[0]}, ${formatDateKey(s.dateKey, 'short')} (${formatTimeRange(s.startMin, s.endMin)})`
}

function audit(batch: WriteBatch, ctx: ScheduleCtx, s: Pick<Session, 'dateKey' | 'startMin' | 'endMin' | 'studentId' | 'studentName' | 'coachId' | 'coachName'>, input: Omit<AuditInput, 'category' | 'entityType' | 'context' | 'dateKey' | 'studentId' | 'studentName' | 'coachId' | 'coachName'>) {
  addAudit(batch, ctx.branchId, ctx.actor, {
    category: 'schedule',
    entityType: 'session',
    context: sessionContext(s),
    dateKey: s.dateKey,
    studentId: s.studentId,
    studentName: s.studentName,
    coachId: s.coachId || null,
    coachName: s.coachName || null,
    ...input,
  })
}

/**
 * Brings a session from before classes were taught together (it has its own coach and no class) back from the Trash,
 * if that coach still has a seat at its time.
 */
export async function restoreSession(ctx: ScheduleCtx, s: WithId<Session>) {
  // Coming back must not put the coach over the students-per-coach limit.
  if (s.status !== 'canceled') {
    const snap = await getDocs(query(branchCol(ctx.branchId, COL.sessions), where('coachId', '==', s.coachId), where('dateKey', '==', s.dateKey)))
    const others = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Session) }))
      .filter((x) => x.id !== s.id && !x.isDeleted && x.status !== 'canceled')
    if (!fitsCapacity(others, s.startMin, s.endMin, ctx.maxStudentsPerCoach)) {
      throw new Error(`${s.coachName} already has ${ctx.maxStudentsPerCoach} ${ctx.maxStudentsPerCoach === 1 ? 'student' : 'students'} at that time. Move a class first.`)
    }
  }
  const batch = writeBatch(db)
  batch.update(branchDocRef(ctx.branchId, COL.sessions, s.id), {
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    updatedAt: serverTimestamp(),
    updatedBy: ctx.actor.email,
  })
  audit(batch, ctx, s, { action: 'session.restore', entityId: s.id, summary: `Restored ${s.studentName}’s class from Trash` })
  await batch.commit()
}

export async function purgeSessions(ctx: ScheduleCtx, sessions: WithId<Session>[]) {
  for (let i = 0; i < sessions.length; i += 200) {
    const batch = writeBatch(db)
    for (const s of sessions.slice(i, i + 200)) batch.delete(branchDocRef(ctx.branchId, COL.sessions, s.id))
    if (i === 0) {
      addAudit(batch, ctx.branchId, ctx.actor, {
        action: 'session.purge',
        category: 'schedule',
        entityType: 'session',
        entityId: sessions.length === 1 ? sessions[0].id : 'many',
        summary: sessions.length === 1 ? `Permanently deleted ${sessions[0].studentName}’s class` : `Emptied Trash (${sessions.length} classes)`,
      })
    }
    await batch.commit()
  }
}

// ---------------------------------------------------------------- day setup

export async function saveDayConfig(ctx: ScheduleCtx, dateKey: DateKey, cfg: { isOpen: boolean; openMin: number; closeMin: number }, batch?: WriteBatch) {
  const b = batch ?? writeBatch(db)
  b.set(branchDocRef(ctx.branchId, COL.dayConfigs, dateKey), { dateKey, ...cfg, updatedAt: serverTimestamp(), updatedBy: ctx.actor.email })
  addAudit(b, ctx.branchId, ctx.actor, {
    action: 'dayConfig.update',
    category: 'schedule',
    entityType: 'dayConfig',
    entityId: dateKey,
    dateKey,
    summary: `${cfg.isOpen ? `Set opening hours to ${formatTimeRange(cfg.openMin, cfg.closeMin)}` : 'Closed the day'} on ${formatDateKey(dateKey, 'weekdayMedium')}`,
  })
  if (!batch) await b.commit()
}

export async function clearDayConfig(ctx: ScheduleCtx, dateKey: DateKey) {
  await deleteDoc(branchDocRef(ctx.branchId, COL.dayConfigs, dateKey))
}
