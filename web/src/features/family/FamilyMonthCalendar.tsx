import { useRef, useState } from 'react'
import { dayHours } from '@shared/availability'
import { familyStatusLabel } from '@shared/schedule/family'
import { type DateKey, formatDateKey, formatMinutesShort, formatTimeRange, todayKey as todayKeyOf } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { MonthScroller, type MonthScrollerHandle } from '@/components/app/MonthScroller'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDayConfigs } from '@/features/data/hooks'
import { timeRange } from '@/lib/calendar'
import { useLoadWindow } from '@/lib/useLoadWindow'
import { cn } from '@/lib/utils'
import { type Family, hasEnded, useFamilySessions } from './data'

/**
 * The family's classes on the app's vertically scrolling months (never ‹ › arrows). With several children each class
 * shows whose it is, in the child's tint; a class opens its details.
 */
export function FamilyMonthCalendar({ family, ids, now, onOpen }: { family: Family; ids: string[]; now: number; onOpen: (s: WithId<Session>) => void }) {
  const { settings, timezone } = useBranch()
  const today = todayKeyOf(timezone, now)
  const [anchor] = useState(today)
  const scroller = useRef<MonthScrollerHandle>(null)
  const [topMonth, setTopMonth] = useState(anchor)
  const { from, to, onVisibleRangeChange } = useLoadWindow(anchor)
  const { data, loading } = useFamilySessions(ids, from, to, { keepPrevious: true })
  const { map: dayConfigs } = useDayConfigs(from, to, { keepPrevious: true })
  const byDate = new Map<DateKey, WithId<Session>[]>()
  for (const s of data) byDate.set(s.dateKey, [...(byDate.get(s.dateKey) ?? []), s])
  const showKid = family.kids.length > 1 && ids.length > 1
  const maxChips = 3

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card" data-testid="family-month">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <div className="text-sm font-semibold">{formatDateKey(topMonth, 'monthYear')}</div>
        <Button variant="ghost" size="xs" onClick={() => scroller.current?.scrollToDate(today, { block: 'month' })}>
          Today
        </Button>
      </div>
      {/* The months open once the first classes are in, so their boxes don't push the month down after it's placed. */}
      {loading && !data.length ? (
        <Skeleton className="m-3 h-[min(68svh,720px)] rounded-lg" />
      ) : (
        <MonthScroller
          ref={scroller}
          anchor={anchor}
          weekStartsOn={settings.general.weekStartsOn}
          onVisibleRangeChange={onVisibleRangeChange}
          onTopMonthChange={setTopMonth}
          className="h-[min(72svh,760px)] px-2"
          renderDay={(d) => {
            const closed = !dayHours(d, settings, dayConfigs).isOpen
            const sessions = byDate.get(d) ?? []
            return (
              <div className={cn('flex h-full min-h-24 flex-col gap-1 p-0.5 sm:min-h-28 sm:p-1.5', closed && 'bg-muted/60')}>
                <div className="flex justify-end">
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                      d === today && 'bg-foreground font-semibold text-background',
                      closed && d !== today && 'text-muted-foreground',
                    )}
                  >
                    {Number(d.slice(8))}
                  </span>
                </div>
                {sessions.slice(0, maxChips).map((s) => {
                  const canceled = s.status === 'canceled'
                  const ended = hasEnded(s, now)
                  const kid = family.firstName(s.studentId)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onOpen(s)}
                      title={`${showKid ? `${kid} · ` : ''}${formatTimeRange(s.startMin, s.endMin)} · ${s.coachName} · ${familyStatusLabel(s.status, ended)}`}
                      aria-label={`${showKid ? `${kid}, ` : ''}${formatDateKey(d, 'weekdayMedium')}, ${formatTimeRange(s.startMin, s.endMin)}, ${familyStatusLabel(s.status, ended)}`}
                      className={cn(
                        // Each class is a box filling the day; several share the height.
                        'flex flex-1 flex-col items-center justify-center rounded-md px-0.5 py-1 text-center leading-tight transition-shadow hover:shadow-sm sm:rounded-lg sm:px-1 sm:py-1.5',
                        // A parent's children keep their tints when one is picked, as everywhere else.
                        family.kids.length > 1 ? family.tint(s.studentId) : 'bg-muted text-foreground',
                        canceled && 'line-through opacity-55',
                        ended && !canceled && 'opacity-70',
                      )}
                      data-testid="family-month-class"
                    >
                      <span className="text-[10.5px] font-semibold tabular-nums sm:hidden">{formatMinutesShort(s.startMin)}</span>
                      <span className="hidden text-xs font-semibold text-balance tabular-nums sm:block">{timeRange(s.startMin, s.endMin)}</span>
                      <span className="mt-0.5 hidden w-full truncate text-[11px] font-medium opacity-80 sm:block">{showKid ? kid : s.coachName.split(' ')[0]}</span>
                      {showKid ? <span className="w-full truncate text-[10px] font-medium opacity-80 sm:hidden">{kid}</span> : null}
                    </button>
                  )
                })}
                {sessions.length > maxChips ? <div className="text-center text-[10px] text-muted-foreground sm:text-[11px]">+{sessions.length - maxChips} more</div> : null}
              </div>
            )
          }}
        />
      )}
    </div>
  )
}
