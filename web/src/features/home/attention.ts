import { query, where } from 'firebase/firestore'
import { useCallback, useMemo } from 'react'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { isInactiveStudent } from '@shared/people'
import { classesToMark } from '@shared/schedule/status'
import type { DayHours } from '@shared/settings/defaults'
import { type DateKey, addDays, dateKeyOf, nowMinutes, todayKey } from '@shared/time'
import type { ContractRequest } from '@shared/contracts/types'
import type { AcademyClass, Availability, Session, SignupRequest, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useDayConfigs, useStaffList, useStudentList } from '@/features/data/hooks'
import { usePayGaps } from '@/features/employees/payGaps'
import { type ClassConflict, classConflicts, classViews } from '@/features/schedule/conflicts'
import { type ClockShift, useShifts } from '@/features/timeclock/api'
import { branchCol, useQuery } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'

/** How far ahead Home looks for classes in conflict (four weeks). */
const CONFLICT_DAYS = 28

export type AttentionItem =
  | { kind: 'conflict'; id: string; at: number; conflict: ClassConflict }
  | { kind: 'autoClockOut'; id: string; at: number; shift: WithId<ClockShift> }
  | { kind: 'signup'; id: string; at: number; request: WithId<SignupRequest> }
  | { kind: 'contractRequest'; id: string; at: number; request: WithId<ContractRequest> }

export interface NewStudent {
  student: WithId<Student>
  /** Sign-up date (or creation date), if known. */
  since: string | null
}

/**
 * What needs an admin's attention (the Home badge): classes in the next four weeks that may not happen as booked
 * (listed first: no coach in, too many students, a student in two classes at once…), classes that are over with
 * students nobody marked (docs/DECISIONS.md §47), automatic clock-outs at the set time not fixed yet, pending sign-up
 * requests, families waiting for a contract they asked for from the academy's sign (docs/DECISIONS.md §39), new students
 * nobody has opened yet, and employees without an hourly rate. It also hands Home those weeks' classes and who's in. The
 * sidebar badge and the Home page run the same queries, so Firestore shares the listeners.
 */
export function useAttention(enabled = true) {
  const { branchId, timezone, settings } = useBranch()
  const now = useNow(60_000)
  const today = todayKey(timezone, now)
  const nowMin = nowMinutes(timezone, new Date(now))
  const clockFrom = addDays(today, -settings.home.clockLookbackDays)

  const shifts = useShifts(clockFrom, today, null, enabled)
  const studentsQ = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.students), where('followUpReviewedAt', '==', null)) : null),
    [branchId, enabled],
  )
  const students = useQuery<Student>(studentsQ, `attn-students-${branchId}`)
  const requestsQ = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.signupRequests), where('status', '==', 'pending')) : null),
    [branchId, enabled],
  )
  const requests = useQuery<SignupRequest>(requestsQ, `attn-requests-${branchId}`)
  const contractQ = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.contractRequests), where('status', '==', 'waiting')) : null),
    [branchId, enabled],
  )
  const contractRequests = useQuery<ContractRequest>(contractQ, `attn-contract-requests-${branchId}`)

  // Attendance not taken (docs/DECISIONS.md §47): the students nobody marked in the last weeks (Settings → Classes &
  // families, "Home lists classes not marked from the last"), then the classes of those days, for their times and to
  // leave out what's in the Trash. Only the unmarked seats are read (the index on status and day).
  const markFrom = addDays(today, -settings.home.attendanceLookbackDays)
  const unmarkedQ = useMemo(
    () =>
      enabled
        ? query(branchCol(branchId, COL.sessions), where('status', 'in', ['pending', 'confirmed']), where('dateKey', '>=', markFrom), where('dateKey', '<=', today))
        : null,
    [branchId, markFrom, today, enabled],
  )
  const unmarked = useQuery<Session>(unmarkedQ, `attn-unmarked-${branchId}-${markFrom}-${today}`, { keepPrevious: true })
  const oldestUnmarked = useMemo(
    () => unmarked.data.reduce<DateKey | null>((m, s) => (s.isDeleted || !s.classId || (m !== null && m <= s.dateKey) ? m : s.dateKey), null),
    [unmarked.data],
  )
  const markClassesQ = useMemo(
    () => (enabled && oldestUnmarked ? query(branchCol(branchId, COL.classes), where('dateKey', '>=', oldestUnmarked), where('dateKey', '<=', today)) : null),
    [branchId, oldestUnmarked, today, enabled],
  )
  const markClasses = useQuery<AcademyClass>(markClassesQ, `attn-mark-classes-${branchId}-${oldestUnmarked}-${today}`, { keepPrevious: true })
  const toMark = useMemo(() => classesToMark(markClasses.data, unmarked.data, today, nowMin), [markClasses.data, unmarked.data, today, nowMin])

  // The next four weeks' classes, their students and who's in.
  const until = addDays(today, CONFLICT_DAYS - 1)
  const classesQ = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.classes), where('dateKey', '>=', today), where('dateKey', '<=', until)) : null),
    [branchId, today, until, enabled],
  )
  const classes = useQuery<AcademyClass>(classesQ, `attn-classes-${branchId}-${today}`)
  const aheadQ = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.sessions), where('dateKey', '>=', today), where('dateKey', '<=', until)) : null),
    [branchId, today, until, enabled],
  )
  const ahead = useQuery<Session>(aheadQ, `attn-ahead-${branchId}-${today}`)
  const availQ = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.availability), where('dateKey', '>=', today), where('dateKey', '<=', until)) : null),
    [branchId, today, until, enabled],
  )
  const avail = useQuery<Availability>(availQ, `attn-avail-${branchId}-${today}`)
  const { map: dayConfigs } = useDayConfigs(today, until, { enabled })
  const staff = useStaffList(enabled)
  const studentList = useStudentList(enabled)
  const hoursOf = useCallback((d: DateKey): DayHours => dayHours(d, settings, dayConfigs), [settings, dayConfigs])
  // Who teaches: the active coaches (the manager can be in without teaching; someone on hold or gone doesn't come).
  const isCoach = useMemo(() => {
    const ids = new Set(staff.data.filter((s) => s.role === 'coach' && s.status === 'active').map((s) => s.id))
    return (id: string) => ids.has(id)
  }, [staff.data])
  const byDate = useMemo(() => classViews(classes.data, ahead.data, avail.data, hoursOf, isCoach), [classes.data, ahead.data, avail.data, hoursOf, isCoach])
  const conflicts = useMemo(() => {
    // Until the staff list is in, nobody would count as a coach.
    if (!enabled || staff.loading) return []
    const studentsById = new Map(studentList.data.map((s) => [s.id, s]))
    return classConflicts(byDate, { hoursOf, studentsById, today, nowMin })
  }, [enabled, staff.loading, studentList.data, byDate, hoursOf, today, nowMin])

  // Active employees without the hourly rate their pay needs (their time would be paid $0).
  const { gaps: payGaps } = usePayGaps(enabled)

  return useMemo(() => {
    // An automatic clock-out at the end of the last class is the academy's rule (docs/DECISIONS.md §23, K3); one at the
    // set time (a day without classes, or a shift started after them) may need the real time.
    const autoClockOuts = shifts.data
      .filter((s) => s.autoClosed && !s.autoCorrected && s.status === 'closed' && s.autoClosedBy !== 'last_class')
      .sort((a, b) => b.clockInAt.toMillis() - a.clockInAt.toMillis())
    const pendingRequests = requests.data.slice().sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
    const waitingContracts = contractRequests.data.slice().sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))

    const recentFrom = addDays(today, -14)
    const newStudents: NewStudent[] = students.data
      .map((student) => ({
        student,
        since: student.signUpDate ?? (student.createdAt ? dateKeyOf(student.createdAt.toDate(), timezone) : null),
      }))
      .filter(({ student, since }) => !isInactiveStudent(student.status) && (student.status === 'signed_up' || (since !== null && since >= recentFrom)))
      .sort((a, b) => (b.since ?? '').localeCompare(a.since ?? '') || a.student.name.localeCompare(b.student.name))

    // Conflicts come first, soonest first: they decide whether a class happens as booked.
    const items: AttentionItem[] = [
      ...conflicts.map((conflict) => ({ kind: 'conflict' as const, id: `conflict-${conflict.v.c.id}`, at: conflict.v.c.startAt.toMillis(), conflict })),
      ...[
        ...autoClockOuts.map((shift) => ({ kind: 'autoClockOut' as const, id: `clock-${shift.id}`, at: shift.clockInAt.toMillis(), shift })),
        ...pendingRequests.map((request) => ({ kind: 'signup' as const, id: `signup-${request.id}`, at: request.createdAt?.toMillis() ?? now, request })),
        ...waitingContracts.map((request) => ({ kind: 'contractRequest' as const, id: `contract-${request.id}`, at: request.createdAt?.toMillis() ?? now, request })),
      ].sort((a, b) => b.at - a.at),
    ]

    return {
      items,
      conflicts,
      autoClockOuts,
      pendingRequests,
      waitingContracts,
      newStudents,
      payGaps,
      /** Classes that are over with students nobody marked, the newest day first. */
      toMark,
      shifts: shifts.data,
      /** The next four weeks' classes (from today), with their students and the coaches in. */
      byDate,
      /** Who's in over those weeks: everyone's hours (availability). */
      availability: avail.data,
      hoursOf,
      classesLoading: classes.loading || ahead.loading || avail.loading || staff.loading,
      total: items.length + toMark.length + newStudents.length + payGaps.length,
      loading: shifts.loading || students.loading || requests.loading || contractRequests.loading,
      now,
      today,
    }
  }, [shifts, students, requests, contractRequests, now, today, timezone, conflicts, toMark, payGaps, byDate, avail.data, hoursOf, classes.loading, ahead.loading, avail.loading, staff.loading])
}
