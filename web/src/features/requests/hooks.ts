import { query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { ClassRequest, ClassSeats } from '@shared/schedule/requests'
import type { DateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useMergedQueries } from '@/features/family/data'
import { branchCol, useQuery } from '@/lib/firestore'

const millis = (t: unknown) => (t && typeof t === 'object' && 'toMillis' in t ? (t as { toMillis: () => number }).toMillis() : 0)

/** Classes between two dates with how many seats are taken (no names: what families may see), by time. */
export function useClassSeats(from: DateKey, to: DateKey, enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.classSeats), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [branchId, from, to, enabled],
  )
  const res = useQuery<ClassSeats>(q, `class-seats-${branchId}-${from}-${to}`)
  const data = useMemo(() => res.data.filter((c) => !c.isDeleted).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin), [res.data])
  return { data, loading: res.loading }
}

/** A family's requests (one query per child, as the rules require), newest first. */
export function useFamilyRequests(ids: string[]) {
  const { branchId } = useBranch()
  const queries = useMemo(() => ids.map((id) => query(branchCol(branchId, COL.classRequests), where('studentId', '==', id))), [branchId, ids])
  const res = useMergedQueries<ClassRequest>(queries, `family-requests-${branchId}-${ids.join(',')}`)
  const data = useMemo(() => [...res.data].sort((a, b) => millis(b.createdAt) - millis(a.createdAt)), [res.data])
  return { data, loading: res.loading }
}

/** Requests still waiting for the office, soonest class first. */
export function usePendingRequests(enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.classRequests), where('status', '==', 'pending')) : null), [branchId, enabled])
  const res = useQuery<ClassRequest>(q, `pending-requests-${branchId}`)
  const data = useMemo(() => [...res.data].sort((a, b) => millis(a.startAt) - millis(b.startAt) || millis(a.createdAt) - millis(b.createdAt)), [res.data])
  return { data, loading: res.loading } as { data: WithId<ClassRequest>[]; loading: boolean }
}
