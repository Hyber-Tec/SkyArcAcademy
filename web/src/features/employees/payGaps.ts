import { useMemo } from 'react'
import { needsRate, rateMissing } from '@shared/pay/rates'
import type { Staff, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useStaffList } from '@/features/data/hooks'
import { useCompensationState } from '@/features/timeclock/hooks'

export interface PayGap {
  staff: WithId<Staff>
}

/** What a gap is: "No hourly rate" (everyone has one rate). */
export function gapLabel(_g?: PayGap): string {
  return 'No hourly rate'
}

/**
 * Active employees whose worked time would be priced at $0 because they have no hourly rate (only for people who can
 * see pay rates).
 */
export function usePayGaps(enabled = true): { gaps: PayGap[]; ready: boolean } {
  const { can } = useBranch()
  const on = enabled && can('payRates')
  const { data: staff, loading } = useStaffList(on)
  const paid = useMemo(() => (on ? staff.filter((s) => s.status === 'active' && needsRate(s.role)) : []), [on, staff])
  const { map, failed, ready } = useCompensationState(paid.map((s) => s.id))
  // A pay record that couldn't be read is unknown, not missing.
  const gaps = useMemo(
    () => (ready ? paid.filter((s) => !failed.has(s.id) && rateMissing(s.role, map.get(s.id)?.rates)).map((s) => ({ staff: s })) : []),
    [ready, paid, map, failed],
  )
  return { gaps, ready: on && !loading && ready }
}
