import { deleteField, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import type { SavedDay } from '@shared/availability'
import {
  type DayWrite,
  type UncoveredClass,
  addedTimeSummary,
  availabilityRecord,
  availabilitySummary,
  classesLeftUncovered,
  describeRanges,
  shrinkingDays,
  undoKeepsRecord,
  undoOf,
  undoneSummary,
  withAddedTime,
} from '@shared/availabilityWrites'
import { COL, availabilityDocId } from '@shared/paths'
import type { DayHours } from '@shared/settings/defaults'
import type { DateKey } from '@shared/time'
import type { AcademyClass, Availability, AvailabilityRange, Session, StaffRole, WithId } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'

export type { DayWrite, UncoveredClass } from '@shared/availabilityWrites'
export { describeRanges, noCoachWarning, onlyAddsTime, UNDO_SECONDS } from '@shared/availabilityWrites'

/**
 * Classes still ahead, with students, that a change to a coach's hours would leave with no coach in for all or part of
 * them, though they were covered before (the shared `classesLeftUncovered`, from the classes, their students and
 * everyone's hours on the days that lose time). Days that only gain time can't leave anything uncovered, and someone
 * who doesn't teach (the manager) changes nothing.
 */
export async function classesLeftWithoutCoach(opts: {
  branchId: string
  staffId: string
  staffRole?: StaffRole
  days: DayWrite[]
  /** What counts today for each day (saved ranges inside that date's hours; none when marked not available). */
  currentRanges: (dateKey: DateKey) => AvailabilityRange[]
  hoursOf: (dateKey: DateKey) => DayHours
  /** Who teaches, when the caller knows it (admins); otherwise each day's records say. */
  isCoach?: (staffId: string) => boolean
  today: DateKey
  nowMin: number
}): Promise<UncoveredClass[]> {
  const { branchId, staffId, days, currentRanges, hoursOf } = opts
  if (opts.staffRole && opts.staffRole !== 'coach') return []
  const shrinking = shrinkingDays(days, currentRanges, hoursOf)
  const classes: WithId<AcademyClass>[] = []
  const seats: Session[] = []
  const records: Availability[] = []
  for (let i = 0; i < shrinking.length; i += 30) {
    const chunk = shrinking.slice(i, i + 30)
    const [c, s, r] = await Promise.all([
      getDocs(query(branchCol(branchId, COL.classes), where('dateKey', 'in', chunk))),
      getDocs(query(branchCol(branchId, COL.sessions), where('dateKey', 'in', chunk))),
      getDocs(query(branchCol(branchId, COL.availability), where('dateKey', 'in', chunk))),
    ])
    classes.push(...c.docs.map((d) => ({ ...(d.data() as AcademyClass), id: d.id })))
    seats.push(...s.docs.map((d) => d.data() as Session))
    records.push(...r.docs.map((d) => d.data() as Availability))
  }
  return classesLeftUncovered({ staffId, staffRole: opts.staffRole, days, classes, seats, records, hoursOf, isCoach: opts.isCoach, today: opts.today, nowMin: opts.nowMin })
}

/**
 * Writes availability for one employee on several days in one batch (with one audit entry): times, "not available",
 * or nothing (the day's record is removed). Each day keeps their name and role, so the other coaches see who's in with
 * them. Coaches' writes are checked against the lock window by the rules.
 */
export async function writeAvailability(opts: {
  branchId: string
  actor: Actor
  timezone: string
  staffId: string
  /** Their name in messages and the audit log. */
  staffName: string
  /** Their name as each day keeps it; left off while it isn't known. */
  recordName?: string
  /** Their role: the manager can be in without teaching (only coaches teach). */
  staffRole?: StaffRole
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
      const record = availabilityRecord(staffId, d, timezone, via, opts.recordName || undefined, opts.staffRole)
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

/**
 * A coach adds times to a day inside the lock (docs/DECISIONS.md §23, C2: they can add time there, not remove it). The
 * day keeps every time it had, as saved, with the new ones merged in, and keeps what it was (`undo`, stamped by the
 * server) so the add can be undone for a few seconds: the rules allow exactly that. Returns the undo.
 */
export async function addTimeInLock(opts: {
  branchId: string
  actor: Actor
  timezone: string
  staffId: string
  /** Their name in the audit log. */
  staffName: string
  recordName?: string
  staffRole?: StaffRole
  dateKey: DateKey
  /** The day's record as saved (null when it has none). */
  saved: SavedDay | null
  added: AvailabilityRange[]
}): Promise<() => Promise<void>> {
  const { branchId, actor, timezone, staffId, staffName, dateKey, saved } = opts
  const ref = branchDocRef(branchId, COL.availability, availabilityDocId(staffId, dateKey))
  const ranges = withAddedTime(saved, opts.added)
  const before = undoOf(saved)
  const record = availabilityRecord(staffId, { dateKey, ranges }, timezone, 'coach', opts.recordName || undefined, opts.staffRole)
  if (!record) throw new Error('Choose the times to add.')
  const audit = { category: 'availability' as const, entityType: 'availability', entityId: ref.id, coachId: staffId, coachName: staffName, dateKey }
  const batch = writeBatch(db)
  batch.set(ref, { ...record, undo: { ...before, at: serverTimestamp() }, updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, {
    ...audit,
    action: 'availability.add',
    summary: addedTimeSummary(staffName, dateKey, opts.added),
    changes: [{ field: 'ranges', label: 'Times', from: before.unavailable ? 'Not available' : describeRanges(before.ranges), to: describeRanges(ranges) }],
  })
  await batch.commit()
  return async () => {
    const undo = writeBatch(db)
    if (undoKeepsRecord(before)) undo.update(ref, { ranges: before.ranges, unavailable: before.unavailable, undo: deleteField(), updatedAt: serverTimestamp(), updatedBy: actor.email })
    else undo.delete(ref)
    addAudit(undo, branchId, actor, {
      ...audit,
      action: 'availability.undo',
      summary: undoneSummary(staffName, dateKey),
      changes: [{ field: 'ranges', label: 'Times', from: describeRanges(ranges), to: before.unavailable ? 'Not available' : describeRanges(before.ranges) }],
    })
    await undo.commit()
  }
}
