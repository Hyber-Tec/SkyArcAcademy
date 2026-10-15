import { useMemo } from 'react'
import { COL } from '@shared/paths'
import type { Staff } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchDocRef, useDoc } from '@/lib/firestore'

/** The signed-in coach's own employee record (or the previewed coach's, for an owner or admin using View as). */
export function useMyStaff() {
  const { branchId, staffId } = useBranch()
  const ref = useMemo(() => (staffId ? branchDocRef(branchId, COL.staff, staffId) : null), [branchId, staffId])
  return useDoc<Staff>(ref)
}

/** Shown wherever a coach page needs an employee record that isn't linked to the account yet. */
export const NOT_LINKED = 'Your employee record isn’t linked yet. Ask an admin.'
