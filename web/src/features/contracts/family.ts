import { limit, onSnapshot, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { type ContractGate, contractGate } from '@shared/contracts/gate'
import type { ContractTemplate, SignedContract } from '@shared/contracts/types'
import { COL } from '@shared/paths'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useFamily } from '@/features/family/data'
import { branchCol, branchDocRef, useQuery } from '@/lib/firestore'

/**
 * What a family needs to sign before using the website (docs/DECISIONS.md §31 and §33): the academy's published
 * contract, and each of their students' signed one, read one by one as the rules allow (shared/src/contracts/gate.ts
 * decides).
 */

/**
 * The academy's published contract (any member reads it), or null when there's none. One without text (an upload from
 * before the contract was written in Settings) is none: there's nothing to fill in.
 */
export function useCurrentContract() {
  const { branchId } = useBranch()
  const q = useMemo(() => query(branchCol(branchId, COL.contractTemplates), where('current', '==', true), limit(1)), [branchId])
  const state = useQuery<ContractTemplate>(q, `current-contract-${branchId}`)
  const template = state.data[0]
  return { template: template && typeof template.text === 'string' && template.text.trim() ? template : null, loading: state.loading, error: state.error }
}

/** The students' signed contracts, live, one listener each. */
export function useSignedFor(ids: readonly string[]) {
  const { branchId } = useBranch()
  const key = ids.join(',')
  const [state, setState] = useState<{ key: string; map: Map<string, WithId<SignedContract>>; loading: boolean }>({ key: '', map: new Map(), loading: true })
  useEffect(() => {
    const list = key ? key.split(',') : []
    if (!list.length) return
    const map = new Map<string, WithId<SignedContract>>()
    const seen = new Set<string>()
    const done = () => setState({ key, map: new Map(map), loading: seen.size < list.length })
    const unsubs = list.map((id) =>
      onSnapshot(
        branchDocRef(branchId, COL.signedContracts, id),
        (snap) => {
          seen.add(id)
          if (snap.exists()) map.set(id, { id, ...(snap.data() as SignedContract) })
          else map.delete(id)
          done()
        },
        () => {
          seen.add(id)
          done()
        },
      ),
    )
    return () => unsubs.forEach((u) => u())
  }, [branchId, key])
  if (!key) return { map: new Map<string, WithId<SignedContract>>(), loading: false }
  if (state.key !== key) return { map: new Map<string, WithId<SignedContract>>(), loading: true }
  return state
}

export interface FamilyContract {
  loading: boolean
  gate: ContractGate
  template: WithId<ContractTemplate> | null
  signed: Map<string, WithId<SignedContract>>
}

/**
 * The family's contract: whether they still sign before using the website, and for whom. A contract that can't be
 * read (a network problem) never locks anyone out: the office's list still shows who hasn't signed.
 */
export function useFamilyContract(): FamilyContract {
  const { role } = useBranch()
  const { kids, ids, loading: kidsLoading } = useFamily()
  const { template, loading: templateLoading } = useCurrentContract()
  const { map, loading: signedLoading } = useSignedFor(ids)
  const gate = useMemo(() => contractGate({ role, hasContract: !!template, students: kids, signed: new Set(map.keys()) }), [role, template, kids, map])
  return { loading: kidsLoading || templateLoading || signedLoading, gate, template, signed: map }
}
