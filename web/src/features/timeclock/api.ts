import { type DocumentData, type Query, doc, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { PayType } from '@shared/pay/segment'
import { type DateKey, addDays, formatDateKey, formatMinutes, minutesOf, toInstant } from '@shared/time'
import type { Availability, ClockShift, Session, WithId } from '@shared/types'
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

/**
 * Every student's sessions (the teaching windows) in a date range: classes are taught together, so anyone's pay can
 * come from any class.
 */
export function useSessionsRange(from: DateKey, to: DateKey, enabled = true, opts?: { keepPrevious?: boolean }) {
  const { branchId } = useBranch()
  const q = useMemo(
    (): Query<DocumentData> | null => (enabled ? query(branchCol(branchId, COL.sessions), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [branchId, from, to, enabled],
  )
  return useQuery<Session>(q, `pay-sessions-${branchId}-${from}-${to}-${enabled}`, opts)
}

/**
 * Who's in on each day of a date range (availability; optionally one employee's, all a page about them needs): a class
 * counts for every coach in at its time.
 */
export function useAvailabilityRange(from: DateKey, to: DateKey, staffId: string | null, enabled = true, opts?: { keepPrevious?: boolean }) {
  const { branchId } = useBranch()
  const q = useMemo((): Query<DocumentData> | null => {
    if (!enabled) return null
    const base = branchCol(branchId, COL.availability)
    return staffId
      ? query(base, where('staffId', '==', staffId), where('dateKey', '>=', from), where('dateKey', '<=', to))
      : query(base, where('dateKey', '>=', from), where('dateKey', '<=', to))
  }, [branchId, from, to, staffId, enabled])
  return useQuery<Availability>(q, `pay-availability-${branchId}-${from}-${to}-${staffId}-${enabled}`, opts)
}

/** Names of the people in pay lines, for someone no longer on the staff list: from who's in, or a session's coach. */
export function namesFrom(availability: readonly Pick<Availability, 'staffId' | 'staffName'>[], sessions: readonly Pick<Session, 'coachId' | 'coachName'>[]) {
  const names = new Map<string, string>()
  for (const s of sessions) if (s.coachId && s.coachName) names.set(s.coachId, s.coachName)
  for (const a of availability) if (a.staffId && a.staffName) names.set(a.staffId, a.staffName)
  return names
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
