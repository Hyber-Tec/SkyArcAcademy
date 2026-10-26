import { doc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore'
import { COL, DOC } from '@shared/paths'
import { STAFF_STATUS_LABELS } from '@shared/people'
import { type ClassCoach, coachesIn, takesSeat, uncovered } from '@shared/schedule/classes'
import { isAhead } from '@shared/schedule/conflicts'
import type { DayHours } from '@shared/settings/defaults'
import { nowMinutes, todayKey } from '@shared/time'
import type { AcademyClass, Availability, Compensation, Session, Staff, StaffStatus, WithId } from '@shared/types'
import { type Actor, addAudit, diffChanges } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { newStaffData } from '@/features/access/api'
import { compensationRef, writeCompensation } from './compensation'

export { compensationRef, writeCompensation }

/** Whole days: a class's time is checked against everyone's hours as saved. */
const ALL_DAY: DayHours = { isOpen: true, openMin: 0, closeMin: 24 * 60 }

/**
 * Upcoming classes with students that only this coach covers, for all or part of them: if they stopped teaching, no
 * coach would be in then. Who's in is each day's availability (a record saved for someone who doesn't teach says so).
 */
export async function classesOnlyThem(branchId: string, staffId: string, timezone: string): Promise<number> {
  const today = todayKey(timezone)
  const nowMin = nowMinutes(timezone)
  const mine = await getDocs(query(branchCol(branchId, COL.availability), where('staffId', '==', staffId), where('dateKey', '>=', today)))
  const dates = [...new Set(mine.docs.map((d) => d.data() as Availability).filter((a) => !a.unavailable && (a.ranges ?? []).length > 0).map((a) => a.dateKey))]
  const gap = (c: AcademyClass, coaches: readonly ClassCoach[]) => uncovered(c, coaches.flatMap((k) => k.ranges)).reduce((m, g) => m + g.endMin - g.startMin, 0)
  let count = 0
  for (let i = 0; i < dates.length; i += 30) {
    const chunk = dates.slice(i, i + 30)
    const [classes, seats, days] = await Promise.all([
      getDocs(query(branchCol(branchId, COL.classes), where('dateKey', 'in', chunk))),
      getDocs(query(branchCol(branchId, COL.sessions), where('dateKey', 'in', chunk))),
      getDocs(query(branchCol(branchId, COL.availability), where('dateKey', 'in', chunk))),
    ])
    const withStudents = new Set(seats.docs.map((d) => d.data() as Session).filter((s) => s.classId && takesSeat(s)).map((s) => s.classId))
    const records = days.docs.map((d) => d.data() as Availability)
    for (const d of classes.docs) {
      const c = d.data() as AcademyClass
      if (c.isDeleted || !withStudents.has(d.id) || !isAhead(c, today, nowMin)) continue
      const all = coachesIn(c, records, ALL_DAY)
      if (!all.some((k) => k.staffId === staffId)) continue
      if (gap(c, all.filter((k) => k.staffId !== staffId)) > gap(c, all)) count++
    }
  }
  return count
}

/** The question to ask before a coach stops teaching while classes ahead need them; null when there is nothing to ask. */
export function stopTeachingQuestion(name: string, count: number, what: string) {
  if (count === 0) return null
  return {
    title: `${name} is the only coach in for ${count} upcoming class${count > 1 ? 'es' : ''}`,
    description: `If you ${what}, make sure another coach is in at ${count > 1 ? 'those times' : 'that time'}: until then, the class${count > 1 ? 'es have' : ' has'} no coach for all or part of ${count > 1 ? 'them' : 'it'}.`,
    confirmLabel: 'Continue',
  }
}

export function staffNotesRef(branchId: string, staffId: string) {
  return doc(db, branchCol(branchId, COL.staff).path, staffId, 'private', DOC.staffNotes)
}

export async function createEmployee(
  branchId: string,
  actor: Actor,
  input: { firstName: string; lastName: string; email: string; role: Staff['role'] },
  /** Hourly rates, from the day it's created (left out when the person can't set pay). */
  pay?: { rates: Compensation['rates']; effectiveFrom: string } | null,
): Promise<string> {
  const ref = doc(branchCol(branchId, COL.staff))
  const name = `${input.firstName} ${input.lastName}`.trim()
  const batch = writeBatch(db)
  batch.set(ref, {
    ...newStaffData({ ...input, email: input.email.trim().toLowerCase(), createdBy: actor.email }),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  addAudit(batch, branchId, actor, {
    action: 'staff.create',
    category: 'people',
    entityType: 'staff',
    entityId: ref.id,
    summary: `Added the employee ${name}`,
    coachId: ref.id,
    coachName: name,
  })
  if (pay) writeCompensation(batch, branchId, actor, { id: ref.id, name, role: input.role }, null, pay.rates, pay.effectiveFrom)
  await batch.commit()
  return ref.id
}

export async function setEmployeeStatus(branchId: string, actor: Actor, staff: WithId<Staff>, status: StaffStatus) {
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.staff, staff.id), { status, updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, {
    action: 'staff.status',
    category: 'people',
    entityType: 'staff',
    entityId: staff.id,
    summary: `Set ${staff.name} to ${STAFF_STATUS_LABELS[status]}`,
    coachId: staff.id,
    coachName: staff.name,
    changes: [{ field: 'status', label: 'Status', from: STAFF_STATUS_LABELS[staff.status], to: STAFF_STATUS_LABELS[status] }],
  })
  await batch.commit()
}

const PROFILE_LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  phone: 'Phone',
  dob: 'Date of birth',
  address: 'Address',
  startDate: 'Start date',
  endDate: 'End date',
  status: 'Status',
  role: 'Role',
  color: 'Color',
}

export async function saveEmployeeProfile(
  branchId: string,
  actor: Actor,
  before: WithId<Staff>,
  patch: Partial<Staff>,
) {
  const next = { ...before, ...patch }
  const name = `${next.firstName} ${next.lastName}`.trim()
  const batch = writeBatch(db)
  batch.update(branchDocRef(branchId, COL.staff, before.id), {
    ...patch,
    name,
    nameLower: name.toLowerCase(),
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  })
  addAudit(batch, branchId, actor, {
    action: 'staff.update',
    category: 'people',
    entityType: 'staff',
    entityId: before.id,
    summary: `Updated ${name}’s profile`,
    coachId: before.id,
    coachName: name,
    changes: diffChanges(before as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, PROFILE_LABELS),
  })
  await batch.commit()
}

export async function saveCompensation(
  branchId: string,
  actor: Actor,
  staff: WithId<Staff>,
  before: Compensation | null,
  next: Pick<Compensation, 'rates'>,
  effectiveFrom: string,
) {
  const changed = !before || before.rates.teaching !== next.rates.teaching || before.rates.admin !== next.rates.admin
  if (!changed) return
  const batch = writeBatch(db)
  writeCompensation(batch, branchId, actor, staff, before, next.rates, effectiveFrom)
  await batch.commit()
}

export async function saveStaffNotes(branchId: string, actor: Actor, staffId: string, adminNote: string) {
  await setDoc(staffNotesRef(branchId, staffId), { adminNote, updatedAt: serverTimestamp(), updatedBy: actor.email })
}
