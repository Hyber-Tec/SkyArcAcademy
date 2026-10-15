import { orderBy, query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import { type DateKey, nowMinutes, todayKey } from '@shared/time'
import type { Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchCol, useQuery } from '@/lib/firestore'

export interface StudentCoach {
  id: string
  name: string
  /** Sessions with this coach (canceled ones left out). */
  sessions: number
}

export interface StudentActivity {
  /** Sessions (not deleted), oldest first. */
  sessions: WithId<Session>[]
  attendance: { attended: number; missed: number; percent: number | null }
  /** The next session that will happen (not canceled or a no-show). */
  next: WithId<Session> | null
  coaches: StudentCoach[]
  today: DateKey
  nowMin: number
  loading: boolean
}

/**
 * Everything the student page shows about a student's sessions, loaded once for the profile column and the tabs.
 * Coaches see their own sessions with the student.
 */
export function useStudentActivity(student: WithId<Student>, mode: 'admin' | 'coach'): StudentActivity {
  const { branchId, staffId, timezone } = useBranch()
  const sessQ = useMemo(() => {
    const base = branchCol(branchId, COL.sessions)
    if (mode === 'coach') return staffId ? query(base, where('studentId', '==', student.id), where('coachId', '==', staffId), orderBy('dateKey', 'desc')) : null
    return query(base, where('studentId', '==', student.id), orderBy('dateKey', 'desc'))
  }, [branchId, student.id, mode, staffId])
  const sessState = useQuery<Session>(sessQ, `student-sessions-${student.id}-${mode}`)

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

    // Coaches on the student's sessions, the most frequent first.
    const byCoach = new Map<string, StudentCoach>()
    for (const s of sessions) {
      if (s.status === 'canceled') continue
      const t = byCoach.get(s.coachId) ?? { id: s.coachId, name: s.coachName, sessions: 0 }
      t.sessions++
      byCoach.set(s.coachId, t)
    }
    const coaches = [...byCoach.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
    return {
      attendance: { attended, missed, percent: attended + missed ? Math.round((attended / (attended + missed)) * 100) : null },
      next,
      coaches,
    }
  }, [sessions, today, nowMin])

  return { sessions, ...derived, today, nowMin, loading: sessState.loading }
}
