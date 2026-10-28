import { getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { FactsSession, PreviousReport } from '@shared/reports/facts'
import type { ProgressReportDoc } from '@shared/reports/types'
import type { Evaluation } from '@shared/shooting/evaluation'
import type { DateKey } from '@shared/time'
import type { Member, Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useMergedQueries } from '@/features/family/data'
import { branchCol, useQuery } from '@/lib/firestore'
import { type Report, toDate } from './model'

const newestFirst = (a: Report, b: Report) => (toDate(b.generatedAt)?.getTime() ?? Date.now()) - (toDate(a.generatedAt)?.getTime() ?? Date.now())

/** Every report, newest first (staff: admins and coaches read them all). */
export function useAllReports(enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.progressReports), orderBy('generatedAt', 'desc'), limit(400)) : null), [branchId, enabled])
  return useQuery<ProgressReportDoc>(q, `reports-all-${branchId}`)
}

/** One student's reports, newest first (staff). */
export function useStudentReports(studentId: string | null) {
  const { branchId } = useBranch()
  const q = useMemo(() => (studentId ? query(branchCol(branchId, COL.progressReports), where('studentId', '==', studentId)) : null), [branchId, studentId])
  const state = useQuery<ProgressReportDoc>(q, `reports-student-${studentId}`)
  const data = useMemo(() => [...state.data].sort(newestFirst), [state.data])
  return { ...state, data }
}

/** Shared reports of the given students, for their families (one query each, as the rules require). */
export function useFamilyReports(ids: string[]) {
  const { branchId } = useBranch()
  const queries = useMemo(
    () => ids.map((id) => query(branchCol(branchId, COL.progressReports), where('studentId', '==', id), where('sharedWithParents', '==', true))),
    [branchId, ids],
  )
  const res = useMergedQueries<ProgressReportDoc>(queries, `family-reports-${branchId}-${ids.join(',')}`)
  const data = useMemo(() => [...res.data].sort((a, b) => b.endDate.localeCompare(a.endDate) || newestFirst(a, b)), [res.data])
  return { data, loading: res.loading }
}

/** The parent and student accounts a shared report reaches (admins can read members). */
export function useReportAudience(studentId: string, enabled: boolean) {
  const { branchId } = useBranch()
  const parentsQ = useMemo(() => (enabled ? query(branchCol(branchId, COL.members), where('studentIds', 'array-contains', studentId)) : null), [branchId, studentId, enabled])
  const studentQ = useMemo(() => (enabled ? query(branchCol(branchId, COL.members), where('studentId', '==', studentId)) : null), [branchId, studentId, enabled])
  const parents = useQuery<Member>(parentsQ, `audience-parents-${studentId}`)
  const students = useQuery<Member>(studentQ, `audience-student-${studentId}`)
  const data = useMemo(
    () =>
      [...parents.data, ...students.data].filter(
        (m, i, all) => m.status === 'active' && (m.role === 'parent' || m.role === 'student') && all.findIndex((x) => x.email === m.email) === i,
      ),
    [parents.data, students.data],
  )
  return { data, loading: parents.loading || students.loading }
}

/** The student's classes in a period, as the report figures need them. */
export function factsSessions(sessions: readonly WithId<Session>[], now = Date.now()): FactsSession[] {
  return sessions
    .filter((s) => !s.isDeleted)
    .map((s) => ({ dateKey: s.dateKey, status: s.status, past: (s.endAt?.toMillis?.() ?? 0) <= now }))
}

/** The last report shared before a period starts, as the new report's point of comparison. */
export function previousReport(reports: readonly Report[], from: DateKey): PreviousReport | null {
  const prev = reports
    .filter((r) => r.status === 'shared' && r.endDate < from)
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0]
  return prev
    ? {
        reportId: prev.id,
        periodLabel: prev.period.label,
        average: prev.facts?.average ?? null,
        evaluations: prev.evaluationCount ?? 0,
        positions: prev.facts?.positions?.map((p) => ({ position: p.position, average: p.average })),
      }
    : null
}

/** Everything a report is composed from, read fresh (so a new or updated report never uses stale lists). */
export async function loadComposeInputs(branchId: string, studentId: string, from: DateKey, to: DateKey) {
  const [evalSnap, sessionSnap, reportSnap] = await Promise.all([
    getDocs(query(branchCol(branchId, COL.evaluations), where('studentId', '==', studentId))),
    getDocs(query(branchCol(branchId, COL.sessions), where('studentId', '==', studentId), where('dateKey', '>=', from), where('dateKey', '<=', to))),
    getDocs(query(branchCol(branchId, COL.progressReports), where('studentId', '==', studentId))),
  ])
  const evaluations = evalSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Evaluation) }))
    .filter((e) => e.dateKey >= from && e.dateKey <= to && e.shots > 0)
  const sessions = factsSessions(sessionSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Session) })))
  const reports = reportSnap.docs.map((d) => ({ id: d.id, ...(d.data() as ProgressReportDoc) }))
  return { evaluations, sessions, previous: previousReport(reports, from) }
}
