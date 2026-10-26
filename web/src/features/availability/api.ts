import { getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'
import { normalizeRanges } from '@shared/availability'
import { type DayWrite, availabilityRecord, availabilitySummary, shrinkingDays } from '@shared/availabilityWrites'
import { COL, availabilityDocId } from '@shared/paths'
import { type ClassCoach, coachesIn, takesSeat, uncovered } from '@shared/schedule/classes'
import { isAhead } from '@shared/schedule/conflicts'
import type { DayHours } from '@shared/settings/defaults'
import { type DateKey, formatDateKey, formatTimeRange } from '@shared/time'
import type { AcademyClass, Availability, AvailabilityRange, Session, StaffRole } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'

export type { DayWrite } from '@shared/availabilityWrites'
export { describeRanges } from '@shared/availabilityWrites'

/** A class that a change to someone's hours would leave without a coach in, for all or part of it. */
export interface UncoveredClass {
  dateKey: DateKey
  startMin: number
  endMin: number
  /** Students in it (canceled ones left out). */
  students: number
}

/** Minutes of a class nobody covers. */
const gapMinutes = (c: Pick<AcademyClass, 'startMin' | 'endMin'>, coaches: readonly ClassCoach[]) =>
  uncovered(c, coaches.flatMap((k) => k.ranges)).reduce((m, g) => m + g.endMin - g.startMin, 0)

/**
 * Classes still ahead, with students, that a change to a coach's hours would leave with no coach in for all or part of
 * them, though they were covered before: classes are taught by every coach in, so only the other coaches' hours that
 * day count. Days that only gain time can't leave anything uncovered, and someone who doesn't teach (the manager)
 * changes nothing.
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
  const { branchId, staffId, days, currentRanges, hoursOf, isCoach } = opts
  if (opts.staffRole && opts.staffRole !== 'coach') return []
  const shrinking = shrinkingDays(days, currentRanges, hoursOf)
  const change = new Map(days.map((d) => [d.dateKey, d]))
  const out: UncoveredClass[] = []
  for (let i = 0; i < shrinking.length; i += 30) {
    const chunk = shrinking.slice(i, i + 30)
    const [classes, seats, records] = await Promise.all([
      getDocs(query(branchCol(branchId, COL.classes), where('dateKey', 'in', chunk))),
      getDocs(query(branchCol(branchId, COL.sessions), where('dateKey', 'in', chunk))),
      getDocs(query(branchCol(branchId, COL.availability), where('dateKey', 'in', chunk))),
    ])
    const students = new Map<string, number>()
    for (const d of seats.docs) {
      const s = d.data() as Session
      if (s.classId && takesSeat(s)) students.set(s.classId, (students.get(s.classId) ?? 0) + 1)
    }
    const everyone = records.docs.map((d) => d.data() as Availability)
    for (const d of classes.docs) {
      const c = d.data() as AcademyClass
      const n = students.get(d.id) ?? 0
      const day = change.get(c.dateKey)
      if (c.isDeleted || !n || !day || !isAhead(c, opts.today, opts.nowMin)) continue
      const others = everyone.filter((a) => a.dateKey === c.dateKey && a.staffId !== staffId)
      const mine = everyone.filter((a) => a.dateKey === c.dateKey && a.staffId === staffId)
      const after = { staffId, dateKey: c.dateKey, ranges: day.unavailable ? [] : normalizeRanges(day.ranges), unavailable: !!day.unavailable }
      const hours = hoursOf(c.dateKey)
      if (gapMinutes(c, coachesIn(c, [...others, after], hours, isCoach)) > gapMinutes(c, coachesIn(c, [...others, ...mine], hours, isCoach))) {
        out.push({ dateKey: c.dateKey, startMin: c.startMin, endMin: c.endMin, students: n })
      }
    }
  }
  return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin)
}

/** "Tue, Oct 27, 4:30 PM – 6:00 PM (5 students), … and 2 more" */
function describeClasses(list: readonly UncoveredClass[], max = 3): string {
  const shown = list.slice(0, max).map((c) => `${formatDateKey(c.dateKey, 'weekdayMedium')}, ${formatTimeRange(c.startMin, c.endMin)} (${c.students} student${c.students === 1 ? '' : 's'})`)
  const more = list.length - shown.length
  return more > 0 ? `${shown.join('; ')} and ${more} more` : shown.length > 1 ? `${shown.slice(0, -1).join('; ')} and ${shown.at(-1)}` : (shown[0] ?? '')
}

/** What someone is told before saving a change that leaves classes with no coach in. */
export function noCoachWarning(list: readonly UncoveredClass[], mode: 'coach' | 'admin'): { title: string; description: string } {
  const n = list.length
  const many = n > 1
  return {
    title: `${n} class${many ? 'es' : ''} would have no coach in`,
    description:
      mode === 'coach'
        ? `No other coach is in for all or part of ${describeClasses(list)}. If you save, ${many ? 'they stay' : 'it stays'} on the schedule without a coach until another coach is in. If it’s urgent, tell the admin too.`
        : `No other coach is in for all or part of ${describeClasses(list)}. If you save, ${many ? 'they show' : 'it shows'} on Home without a coach until another coach is in.`,
  }
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
