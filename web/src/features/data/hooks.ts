import { orderBy, query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { Availability, DayConfig, Member, Staff, Student } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchCol, useQuery } from '@/lib/firestore'

/** Live academy-wide lists shared by many pages (Firestore de-duplicates identical listeners). */

export function useStaffList(enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.staff), orderBy('nameLower')) : null), [branchId, enabled])
  return useQuery<Staff>(q, `staff-${branchId}`)
}

export function useStudentList(enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.students), orderBy('nameLower')) : null), [branchId, enabled])
  return useQuery<Student>(q, `students-${branchId}`)
}

export function useMembers(enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.members), orderBy('email')) : null), [branchId, enabled])
  return useQuery<Member>(q, `members-${branchId}`)
}

/** Day configs (opening-hour overrides) between two dates, as a map by dateKey. */
export function useDayConfigs(from: string, to: string, opts?: { keepPrevious?: boolean; enabled?: boolean }) {
  const { branchId } = useBranch()
  const enabled = opts?.enabled ?? true
  const q = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.dayConfigs), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [branchId, from, to, enabled],
  )
  const { data, loading } = useQuery<DayConfig>(q, `dayconfigs-${branchId}-${from}-${to}`, opts)
  const map = useMemo(() => new Map(data.map((d) => [d.dateKey, d])), [data])
  return { map, loading }
}

/** One employee's availability between two dates, as a map by dateKey. */
export function useAvailability(staffId: string | null, from: string, to: string, opts?: { keepPrevious?: boolean }) {
  const { branchId } = useBranch()
  const q = useMemo(
    () =>
      staffId
        ? query(branchCol(branchId, COL.availability), where('staffId', '==', staffId), where('dateKey', '>=', from), where('dateKey', '<=', to))
        : null,
    [branchId, staffId, from, to],
  )
  const { data, loading, error } = useQuery<Availability>(q, `availability-${staffId}-${from}-${to}`, opts)
  const map = useMemo(() => new Map(data.map((d) => [d.dateKey, d])), [data])
  return { map, loading, error }
}
