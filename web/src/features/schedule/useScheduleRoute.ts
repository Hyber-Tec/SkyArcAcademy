import { useCallback, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { type DateKey, isDateKey, todayKey } from '@shared/time'
import type { ScheduleView } from '@shared/settings/defaults'
import { useBranch } from '@/branch/BranchProvider'

/** `/schedule/{day|week|month}/{YYYY-MM-DD}`. */
export function useScheduleRoute(basePath: string) {
  const params = useParams()
  const navigate = useNavigate()
  const { settings, timezone } = useBranch()
  const rest = (params['*'] ?? '').split('/').filter(Boolean)
  const viewParam = rest[0] as ScheduleView | undefined
  const dateParam = rest[1]

  const view: ScheduleView = viewParam === 'day' || viewParam === 'week' || viewParam === 'month' ? viewParam : settings.schedule.defaultView
  const date: DateKey = dateParam && isDateKey(dateParam) ? dateParam : todayKey(timezone)
  const explicit = !!viewParam && !!dateParam && isDateKey(dateParam)

  /** Opens a view and date; `search` (without its "?") keeps parameters such as a request to open. */
  const go = useCallback(
    (next: { view?: ScheduleView; date?: DateKey }, replace = false, search = '') => {
      navigate(`${basePath}/${next.view ?? view}/${next.date ?? date}${search ? `?${search}` : ''}`, { replace })
    },
    [navigate, basePath, view, date],
  )

  return useMemo(() => ({ view, date, explicit, go }), [view, date, explicit, go])
}
