import { type DocumentData, type Query, doc, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import { formatExtra } from '@shared/pay/segment'
import { type DateKey, addDays, formatDateKey, formatMinutes, minutesOf, toInstant } from '@shared/time'
import type { AcademyClass, Availability, AuditChange, ClockShift, WithId } from '@shared/types'
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

/** The classes in a date range: a coach's paid time starts before their first class and ends with their last. */
export function useClassesRange(from: DateKey, to: DateKey, enabled = true, opts?: { keepPrevious?: boolean }) {
  const { branchId } = useBranch()
  const q = useMemo(
    (): Query<DocumentData> | null => (enabled ? query(branchCol(branchId, COL.classes), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [branchId, from, to, enabled],
  )
  return useQuery<AcademyClass>(q, `pay-classes-${branchId}-${from}-${to}-${enabled}`, opts)
}

/**
 * Who's in on each day of a date range (availability; optionally one employee's, all a page about them needs): a
 * coach's classes, which set their paid time, are the ones they're in for.
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

/**
 * What a date range's pay reads besides the time entries (docs/DECISIONS.md §23, K2 and K3): its classes and who's in
 * (everyone's availability, or one employee's: all their own pay needs).
 */
export function usePayDays(from: DateKey, to: DateKey, staffId: string | null, enabled = true, opts?: { keepPrevious?: boolean }) {
  const classes = useClassesRange(from, to, enabled, opts)
  const availability = useAvailabilityRange(from, to, staffId, enabled, opts)
  return { classes: classes.data, availability: availability.data, loading: classes.loading || availability.loading }
}

// ---------------------------------------------------------------- writes

export interface ShiftInput {
  staffId: string
  staffName: string
  dateKey: DateKey
  inMin: number
  outMin: number
  note: string
  /** Extra paid minutes on the shift (K6: a coach's travel hour), so the clock times stay true. */
  extraMin: number
  /** Why the extra time was added (required with it). */
  extraNote: string
}

const extraText = (min: number | undefined) => (min ? formatExtra(min) : 'None')

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
  const extraMin = Math.max(0, Math.round(input.extraMin))
  const extraNote = extraMin > 0 ? input.extraNote.trim() : ''
  const data = {
    staffId: input.staffId,
    staffName: input.staffName,
    dateKey: input.dateKey,
    inMin: input.inMin,
    ...times,
    status: 'closed',
    note: input.note.trim(),
    extraMin,
    extraNote,
    autoCorrected: existing?.autoClosed ? true : (existing?.autoCorrected ?? false),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  }
  if (existing) batch.update(ref, data)
  else batch.set(ref, { ...data, source: 'admin', autoClosed: false, forcedType: null, createdAt: serverTimestamp(), createdBy: actor.email })
  if (existing?.status === 'open') batch.delete(branchDocRef(branchId, COL.openShifts, existing.staffId))
  const timeBefore = existing ? `${formatMinutes(existing.inMin)} – ${existing.outMin != null ? formatMinutes(existing.outMin) : 'open'}` : null
  const timeAfter = `${formatMinutes(input.inMin)} – ${formatMinutes(input.outMin)}`
  const changes: AuditChange[] = [
    ...(timeBefore && timeBefore !== timeAfter ? [{ field: 'time', label: 'Time', from: timeBefore, to: timeAfter }] : []),
    ...((existing?.extraMin ?? 0) !== extraMin ? [{ field: 'extraMin', label: 'Extra time', from: existing ? extraText(existing.extraMin) : null, to: extraText(extraMin) }] : []),
    ...((existing?.extraNote ?? '') !== extraNote ? [{ field: 'extraNote', label: 'Extra time note', from: existing?.extraNote || null, to: extraNote || null }] : []),
  ]
  addAudit(batch, branchId, actor, {
    action: existing ? 'shift.update' : 'shift.create',
    category: 'pay',
    entityType: 'shift',
    entityId: ref.id,
    coachId: input.staffId,
    coachName: input.staffName,
    dateKey: input.dateKey,
    summary: `${existing ? 'Changed' : 'Added'} a time entry for ${input.staffName}: ${formatDateKey(input.dateKey, 'weekdayMedium')} ${timeAfter}${extraMin ? `, ${formatExtra(extraMin)} extra (${extraNote})` : ''}`,
    changes,
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
