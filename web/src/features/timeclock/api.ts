import { type DocumentData, type Query, doc, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { PayType } from '@shared/pay/segment'
import { type DateKey, addDays, formatDateKey, formatMinutes, minutesOf, toInstant } from '@shared/time'
import type { ClockShift, Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'

export type { ClockShift } from '@shared/types'

/** Live shifts in a date range (optionally one employee). */
export function useShifts(from: DateKey, to: DateKey, staffId: string | null, enabled = true, opts?: { keepPrevious?: boolean }) {
  const { branchId } = useBranch()
  const q = useMemo((): Query<DocumentData> | null => {
    if (!enabled) return null
    const base = branchCol(branchId, COL.clockShifts)
    return staffId
      ? query(base, where('staffId', '==', staffId), where('dateKey', '>=', from), where('dateKey', '<=', to))
      : query(base, where('dateKey', '>=', from), where('dateKey', '<=', to))
  }, [branchId, from, to, staffId, enabled])
  return useQuery<ClockShift>(q, `shifts-${branchId}-${from}-${to}-${staffId}-${enabled}`, opts)
}

/** Sessions (teaching windows) in a date range (optionally one coach). */
export function useSessionsRange(from: DateKey, to: DateKey, coachId: string | null, enabled = true, opts?: { keepPrevious?: boolean }) {
  const { branchId } = useBranch()
  const q = useMemo((): Query<DocumentData> | null => {
    if (!enabled) return null
    const base = branchCol(branchId, COL.sessions)
    return coachId
      ? query(base, where('coachId', '==', coachId), where('dateKey', '>=', from), where('dateKey', '<=', to))
      : query(base, where('dateKey', '>=', from), where('dateKey', '<=', to))
  }, [branchId, from, to, coachId, enabled])
  return useQuery<Session>(q, `pay-sessions-${branchId}-${from}-${to}-${coachId}-${enabled}`, opts)
}

// ---------------------------------------------------------------- writes

export interface ShiftInput {
  staffId: string
  staffName: string
  dateKey: DateKey
  inMin: number
  outMin: number
  forcedType: PayType | null
  note: string
}

function shiftTimes(input: ShiftInput, tz: string) {
  const clockInAt = toInstant(input.dateKey, input.inMin, tz)
  const clockOutAt = toInstant(input.dateKey, input.outMin, tz)
  return {
    clockInAt,
    clockOutAt,
    outDateKey: input.outMin >= 1440 ? addDays(input.dateKey, 1) : input.dateKey,
    outMin: minutesOf(clockOutAt, tz),
  }
}

export async function saveShift(branchId: string, actor: Actor, tz: string, input: ShiftInput, existing: WithId<ClockShift> | null) {
  const batch = writeBatch(db)
  const ref = existing ? branchDocRef(branchId, COL.clockShifts, existing.id) : doc(branchCol(branchId, COL.clockShifts))
  const times = shiftTimes(input, tz)
  const data = {
    staffId: input.staffId,
    staffName: input.staffName,
    dateKey: input.dateKey,
    inMin: input.inMin,
    ...times,
    status: 'closed',
    forcedType: input.forcedType,
    note: input.note.trim(),
    autoCorrected: existing?.autoClosed ? true : (existing?.autoCorrected ?? false),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  }
  if (existing) batch.update(ref, data)
  else batch.set(ref, { ...data, source: 'admin', autoClosed: false, createdAt: serverTimestamp(), createdBy: actor.email })
  if (existing?.status === 'open') batch.delete(branchDocRef(branchId, COL.openShifts, existing.staffId))
  addAudit(batch, branchId, actor, {
    action: existing ? 'shift.update' : 'shift.create',
    category: 'pay',
    entityType: 'shift',
    entityId: ref.id,
    coachId: input.staffId,
    coachName: input.staffName,
    dateKey: input.dateKey,
    summary: `${existing ? 'Changed' : 'Added'} a time entry for ${input.staffName}: ${formatDateKey(input.dateKey, 'weekdayMedium')} ${formatMinutes(input.inMin)} – ${formatMinutes(input.outMin)}`,
    changes: existing
      ? [
          {
            field: 'time',
            label: 'Time',
            from: `${formatMinutes(existing.inMin)} – ${existing.outMin != null ? formatMinutes(existing.outMin) : 'open'}`,
            to: `${formatMinutes(input.inMin)} – ${formatMinutes(input.outMin)}`,
          },
        ]
      : [],
  })
  await batch.commit()
}

export async function deleteShift(branchId: string, actor: Actor, shift: WithId<ClockShift>) {
  const batch = writeBatch(db)
  batch.delete(branchDocRef(branchId, COL.clockShifts, shift.id))
  if (shift.status === 'open') batch.delete(branchDocRef(branchId, COL.openShifts, shift.staffId))
  addAudit(batch, branchId, actor, {
    action: 'shift.delete',
    category: 'pay',
    entityType: 'shift',
    entityId: shift.id,
    coachId: shift.staffId,
    coachName: shift.staffName,
    dateKey: shift.dateKey,
    summary: `Deleted a time entry for ${shift.staffName} on ${formatDateKey(shift.dateKey, 'weekdayMedium')}`,
  })
  await batch.commit()
}
