import { orderBy, query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import { type DateKey, nowMinutes, todayKey } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchCol, useQuery } from '@/lib/firestore'

export interface StudentActivity {
  /** Sessions (not deleted), oldest first. */
  sessions: WithId<Session>[]
  attendance: { attended: number; missed: number; percent: number | null }
  /** The next session that will happen (not canceled or a no-show). */
  next: WithId<Session> | null
  today: DateKey
  nowMin: number
  loading: boolean
}

/**
 * Everything the student page shows about a student's classes, loaded once for the profile column and the tabs.
 * Admins and coaches see them all: the coaches teach every class together.
 */
export function useStudentActivity(student: WithId<Student>): StudentActivity {
  const { branchId, timezone } = useBranch()
  const sessQ = useMemo(() => query(branchCol(branchId, COL.sessions), where('studentId', '==', student.id), orderBy('dateKey', 'desc')), [branchId, student.id])
  const sessState = useQuery<Session>(sessQ, `student-sessions-${student.id}`)

  const today = todayKey(timezone)
  const nowMin = nowMinutes(timezone)
  const sessions = useMemo(
    () => sessState.data.filter((s) => !s.isDeleted).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin),
    [sessState.data],
  )

  const derived = useMemo(() => {
    const happened = (s: Session) => s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin)
    const past = sessions.filter(happened)
    const attended = past.filter((s) => s.status === 'present').length
    const missed = past.filter((s) => s.status === 'no_show').length
    const next = sessions.find((s) => !happened(s) && s.status !== 'canceled' && s.status !== 'no_show') ?? null
    return {
      attendance: { attended, missed, percent: attended + missed ? Math.round((attended / (attended + missed)) * 100) : null },
      next,
    }
  }, [sessions, today, nowMin])

  return { sessions, ...derived, today, nowMin, loading: sessState.loading }
}
