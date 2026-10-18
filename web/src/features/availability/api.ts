import { getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { type DayWrite, availabilityRecord, availabilitySummary, sessionsLeftUncovered as uncoveredBy, shrinkingDays } from '@shared/availabilityWrites'
import type { DayHours } from '@shared/settings/defaults'
import { COL, availabilityDocId } from '@shared/paths'
import type { DateKey } from '@shared/time'
import type { AvailabilityRange, Session, WithId } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'

export type { DayWrite } from '@shared/availabilityWrites'
export { describeRanges, describeSessions, uncoveredWarning } from '@shared/availabilityWrites'

/**
 * Booked sessions (pending or confirmed, still ahead) that a change would leave
 * outside the coach's availability, though they were inside it before.
 */
export async function sessionsLeftUncovered(opts: {
  branchId: string
  staffId: string
  days: DayWrite[]
  /** What counts today for each day (saved ranges inside that date's hours; none when marked not available). */
  currentRanges: (dateKey: DateKey) => AvailabilityRange[]
  hoursOf: (dateKey: DateKey) => DayHours
  today: DateKey
  nowMin: number
}): Promise<WithId<Session>[]> {
  const { branchId, staffId, days, currentRanges, hoursOf } = opts
  // Days that only gain time can't leave anything uncovered.
  const shrinking = shrinkingDays(days, currentRanges, hoursOf)
  const sessions: WithId<Session>[] = []
  for (let i = 0; i < shrinking.length; i += 30) {
    const chunk = shrinking.slice(i, i + 30)
    const snap = await getDocs(query(branchCol(branchId, COL.sessions), where('coachId', '==', staffId), where('dateKey', 'in', chunk)))
    for (const d of snap.docs) sessions.push({ id: d.id, ...(d.data() as Session) })
  }
  return uncoveredBy({ ...opts, days, sessions })
}

/**
 * Writes availability for one employee on several days in one batch (with one
 * audit entry): times, "not available", or nothing (the day's record is
 * removed). Coaches' writes are checked against the lock window by the rules.
 */
export async function writeAvailability(opts: {
  branchId: string
  actor: Actor
  timezone: string
  staffId: string
  staffName: string
  via: 'coach' | 'admin'
  days: DayWrite[]
  summary?: string
}) {
  const { branchId, actor, timezone, staffId, staffName, via, days } = opts
  if (days.length === 0) return
  for (let i = 0; i < days.length; i += 300) {
    const batch = writeBatch(db)
    for (const d of days.slice(i, i + 300)) {
      const ref = branchDocRef(branchId, COL.availability, availabilityDocId(staffId, d.dateKey))
      const record = availabilityRecord(staffId, d, timezone, via)
      if (!record) batch.delete(ref)
      else batch.set(ref, { ...record, updatedAt: serverTimestamp(), updatedBy: actor.email })
    }
    if (i === 0) {
      const first = days[0]
      addAudit(batch, branchId, actor, {
        action: 'availability.update',
        category: 'availability',
        entityType: 'availability',
        entityId: availabilityDocId(staffId, first.dateKey),
        summary: opts.summary ?? availabilitySummary(staffName, days),
        coachId: staffId,
        coachName: staffName,
        dateKey: first.dateKey,
      })
    }
    await batch.commit()
  }
}
