import { query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import { type Evaluation, inOrder } from '@shared/shooting/evaluation'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchCol, useQuery } from '@/lib/firestore'

/** A student's evaluations, oldest first (staff only). Pass null to wait. */
export function useStudentEvaluations(studentId: string | null) {
  const { branchId } = useBranch()
  const q = useMemo(() => (studentId ? query(branchCol(branchId, COL.evaluations), where('studentId', '==', studentId)) : null), [branchId, studentId])
  const state = useQuery<Evaluation>(q, `evaluations-${studentId}`)
  const data = useMemo(() => inOrder(state.data) as WithId<Evaluation>[], [state.data])
  return { ...state, data }
}
