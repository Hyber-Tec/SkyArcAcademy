import { type Conflict, isAhead, sessionConflicts, staffCoachState } from '@shared/schedule/conflicts'
import type { DayHours } from '@shared/settings/defaults'
import type { DateKey } from '@shared/time'
import type { Availability, Member, Session, Staff, Student, WithId } from '@shared/types'

export interface ConflictInput {
  sessions: readonly WithId<Session>[]
  /** Keyed `${staffId}|${dateKey}`. */
  availabilityByKey: ReadonlyMap<string, Availability>
  hoursOf: (dateKey: DateKey) => DayHours
  /** Null when the viewer can't see employees (the coach portal): coaches count as active. */
  staffById: ReadonlyMap<string, Staff> | null
  members?: readonly Member[] | null
  studentsById?: ReadonlyMap<string, Student> | null
  maxPerCoach: number
  today: DateKey
  nowMin: number
}

/** Conflicts of the sessions still ahead, by session ID (sessions without any are left out). */
export function computeConflicts(d: ConflictInput): Map<string, Conflict[]> {
  const byCoachDay = new Map<string, WithId<Session>[]>()
  const byStudentDay = new Map<string, WithId<Session>[]>()
  for (const s of d.sessions) {
    if (s.isDeleted) continue
    const t = `${s.coachId}|${s.dateKey}`
    byCoachDay.set(t, [...(byCoachDay.get(t) ?? []), s])
    const st = `${s.studentId}|${s.dateKey}`
    byStudentDay.set(st, [...(byStudentDay.get(st) ?? []), s])
  }
  // A member whose access is off makes their coach "paused"; coaches without an account count as active.
  const memberActive = new Map<string, boolean>()
  for (const m of d.members ?? []) {
    if (m.staffId) memberActive.set(m.staffId, (memberActive.get(m.staffId) ?? false) || m.status === 'active')
  }

  const out = new Map<string, Conflict[]>()
  for (const s of d.sessions) {
    if (!isAhead(s, d.today, d.nowMin)) continue
    const a = d.availabilityByKey.get(`${s.coachId}|${s.dateKey}`)
    const coachState = d.staffById ? staffCoachState(d.staffById.get(s.coachId)?.status ?? null, memberActive.get(s.coachId) ?? null) : 'active'
    const list = sessionConflicts(s, {
      hours: d.hoursOf(s.dateKey),
      availability: a ? { ranges: a.ranges, unavailable: a.unavailable } : null,
      coachState,
      studentStatus: d.studentsById?.get(s.studentId)?.status ?? null,
      coachSessions: byCoachDay.get(`${s.coachId}|${s.dateKey}`) ?? [],
      studentSessions: byStudentDay.get(`${s.studentId}|${s.dateKey}`) ?? [],
      maxPerCoach: d.maxPerCoach,
    })
    if (list.length) out.set(s.id, list)
  }
  return out
}
