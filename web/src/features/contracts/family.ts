import { onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { type ContractGate, contractGate } from '@shared/contracts/gate'
import type { ContractLink, SignedContract } from '@shared/contracts/types'
import { COL } from '@shared/paths'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useFamily } from '@/features/family/data'
import { branchCol, branchDocRef } from '@/lib/firestore'

/**
 * What a family needs to sign before using the website (docs/DECISIONS.md §31, §33 and §34): the contracts the office
 * sent them, still waiting, and each of their students' signed one, read one student at a time as the rules allow
 * (shared/src/contracts/gate.ts decides).
 */

/** One live listener per student, each giving that student's item (or none); loading until each has answered once. */
function usePerStudent<T>(ids: readonly string[], listen: (id: string, set: (value: T | null) => void, done: () => void) => () => void) {
  const key = ids.join(',')
  const [state, setState] = useState<{ key: string; map: Map<string, T>; loading: boolean }>({ key: '', map: new Map(), loading: true })
  useEffect(() => {
    const list = key ? key.split(',') : []
    if (!list.length) return
    const map = new Map<string, T>()
    const seen = new Set<string>()
    const update = () => setState({ key, map: new Map(map), loading: seen.size < list.length })
    const unsubs = list.map((id) =>
      listen(
        id,
        (value) => {
          seen.add(id)
          if (value) map.set(id, value)
          else map.delete(id)
          update()
        },
        () => {
          seen.add(id)
          update()
        },
      ),
    )
    return () => unsubs.forEach((u) => u())
    // `listen` is the caller's, the same for every render of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!key) return { map: new Map<string, T>(), loading: false }
  if (state.key !== key) return { map: new Map<string, T>(), loading: true }
  return state
}

/** The students' signed contracts, live. */
export function useSignedFor(ids: readonly string[]) {
  const { branchId } = useBranch()
  return usePerStudent<WithId<SignedContract>>(ids, (id, set, done) =>
    onSnapshot(
      branchDocRef(branchId, COL.signedContracts, id),
      (snap) => set(snap.exists() ? { id, ...(snap.data() as SignedContract) } : null),
      done,
    ),
  )
}

/** The contract the office sent each student's family and nobody has signed yet, live (one at a time per student). */
export function useWaitingFor(ids: readonly string[]) {
  const { branchId } = useBranch()
  return usePerStudent<WithId<ContractLink>>(ids, (id, set, done) =>
    onSnapshot(
      query(branchCol(branchId, COL.contractLinks), where('studentId', '==', id), where('status', '==', 'sent')),
      (snap) => {
        const newest = snap.docs.map((d) => ({ id: d.id, ...(d.data() as ContractLink) })).sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))[0]
        set(newest ?? null)
      },
      done,
    ),
  )
}

export interface FamilyContract {
  loading: boolean
  gate: ContractGate
  /** The contract waiting for each student, by student ID. */
  waiting: Map<string, WithId<ContractLink>>
  signed: Map<string, WithId<SignedContract>>
}

/**
 * The family's contracts: whether they sign one before using the website, and for whom. One that can't be read (a
 * network problem) never locks anyone out: the office's list still shows who hasn't signed.
 */
export function useFamilyContract(): FamilyContract {
  const { role } = useBranch()
  const { kids, ids, loading: kidsLoading } = useFamily()
  const waiting = useWaitingFor(ids)
  const signed = useSignedFor(ids)
  const gate = useMemo(() => contractGate({ role, students: kids, waiting: new Set(waiting.map.keys()) }), [role, kids, waiting.map])
  return { loading: kidsLoading || waiting.loading || signed.loading, gate, waiting: waiting.map, signed: signed.map }
}
