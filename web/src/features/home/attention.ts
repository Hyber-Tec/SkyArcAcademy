import { query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { isInactiveStudent } from '@shared/people'
import type { Conflict } from '@shared/schedule/conflicts'
import { addDays, dateKeyOf, nowMinutes, todayKey } from '@shared/time'
import type { Availability, Session, SignupRequest, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useDayConfigs, useMembers, useStaffList, useStudentList } from '@/features/data/hooks'
import { usePayGaps } from '@/features/employees/payGaps'
import { computeConflicts } from '@/features/schedule/conflicts'
import { type ClockShift, useShifts } from '@/features/timeclock/api'
import { branchCol, useQuery } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'

/** How far ahead Home looks for sessions in conflict (four weeks). */
const CONFLICT_DAYS = 28

export type AttentionItem =
  | { kind: 'conflict'; id: string; at: number; session: WithId<Session>; conflicts: Conflict[] }
  | { kind: 'autoClockOut'; id: string; at: number; shift: WithId<ClockShift> }
  | { kind: 'signup'; id: string; at: number; request: WithId<SignupRequest> }

export interface NewStudent {
  student: WithId<Student>
  /** Sign-up date (or creation date), if known. */
  since: string | null
}

/**
 * What needs an admin's attention (the Home badge): classes in the next four weeks that are in conflict (listed
 * first), unfixed automatic clock-outs, pending sign-up requests, new students nobody has opened yet, and employees
 * without a pay rate. The sidebar badge and the Home page run the same queries, so Firestore shares the listeners.
 */
export function useAttention(enabled = true) {
  const { branchId, timezone, settings, rules } = useBranch()
  const now = useNow(60_000)
  const today = todayKey(timezone, now)
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

  // Sessions in conflict over the next four weeks.
  const until = addDays(today, CONFLICT_DAYS - 1)
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
  const members = useMembers(enabled)
  const studentList = useStudentList(enabled)
  const conflicts = useMemo(() => {
    if (!enabled) return []
    const live = ahead.data.filter((s) => !s.isDeleted)
    const byId = computeConflicts({
      sessions: live,
      availabilityByKey: new Map(avail.data.map((a) => [`${a.staffId}|${a.dateKey}`, a])),
      hoursOf: (d) => dayHours(d, settings, dayConfigs),
      staffById: new Map(staff.data.map((s) => [s.id, s])),
      members: members.data,
      studentsById: new Map(studentList.data.map((s) => [s.id, s])),
      maxPerCoach: rules.maxStudentsPerCoach,
      today,
      nowMin: nowMinutes(timezone, new Date(now)),
    })
    return live
      .filter((s) => byId.has(s.id))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.endMin - b.endMin || a.studentName.localeCompare(b.studentName))
      .map((session) => ({ session, conflicts: byId.get(session.id) ?? [] }))
  }, [enabled, ahead.data, avail.data, dayConfigs, settings, staff.data, members.data, studentList.data, rules.maxStudentsPerCoach, today, timezone, now])

  // Active employees without the hourly rate their pay needs (their time would be paid $0).
  const { gaps: payGaps } = usePayGaps(enabled)

  return useMemo(() => {
    const autoClockOuts = shifts.data
      .filter((s) => s.autoClosed && !s.autoCorrected && s.status === 'closed')
      .sort((a, b) => b.clockInAt.toMillis() - a.clockInAt.toMillis())
    const pendingRequests = requests.data.slice().sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))

    const recentFrom = addDays(today, -14)
    const newStudents: NewStudent[] = students.data
      .map((student) => ({
        student,
        since: student.signUpDate ?? (student.createdAt ? dateKeyOf(student.createdAt.toDate(), timezone) : null),
      }))
      .filter(({ student, since }) => !isInactiveStudent(student.status) && (student.status === 'signed_up' || (since !== null && since >= recentFrom)))
      .sort((a, b) => (b.since ?? '').localeCompare(a.since ?? '') || a.student.name.localeCompare(b.student.name))

    // Conflicts come first, soonest first: they decide whether a session happens at all.
    const items: AttentionItem[] = [
      ...conflicts.map(({ session, conflicts }) => ({ kind: 'conflict' as const, id: `conflict-${session.id}`, at: session.startAt.toMillis(), session, conflicts })),
      ...[
        ...autoClockOuts.map((shift) => ({ kind: 'autoClockOut' as const, id: `clock-${shift.id}`, at: shift.clockInAt.toMillis(), shift })),
        ...pendingRequests.map((request) => ({ kind: 'signup' as const, id: `signup-${request.id}`, at: request.createdAt?.toMillis() ?? now, request })),
      ].sort((a, b) => b.at - a.at),
    ]

    return {
      items,
      conflicts,
      autoClockOuts,
      pendingRequests,
      newStudents,
      payGaps,
      shifts: shifts.data,
      total: items.length + newStudents.length + payGaps.length,
      loading: shifts.loading || students.loading || requests.loading,
      now,
      today,
    }
  }, [shifts, students, requests, now, today, timezone, conflicts, payGaps])
}
