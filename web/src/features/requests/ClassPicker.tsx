import { useMemo } from 'react'
import { LuCheck } from 'react-icons/lu'
import type { ClassSeats } from '@shared/schedule/requests'
import { type DateKey, formatDateKey, formatTimeRange } from '@shared/time'
import type { WithId } from '@shared/types'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * Classes with seats open, by day, to pick one (a family asking, the office suggesting another): each says how many of
 * its seats are open, never who's in it. `marked` tags a day ("Asked for").
 */
export function ClassPicker({
  choices,
  value,
  onChange,
  loading,
  empty,
  marked,
  label = 'When',
}: {
  choices: readonly WithId<ClassSeats>[]
  value: string | null
  onChange: (classId: string) => void
  loading?: boolean
  empty: string
  marked?: { dateKey: DateKey; label: string } | null
  label?: string
}) {
  const byDay = useMemo(() => {
    const m = new Map<DateKey, WithId<ClassSeats>[]>()
    for (const c of choices) m.set(c.dateKey, [...(m.get(c.dateKey) ?? []), c])
    return [...m.entries()]
  }, [choices])
  if (loading) return <Skeleton className="h-40 w-full rounded-lg" />
  if (!byDay.length) return <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="space-y-3" role="radiogroup" aria-label={label}>
      {byDay.map(([day, list]) => (
        <div key={day}>
          <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            {formatDateKey(day, 'weekdayMedium')}
            {marked?.dateKey === day ? <span className="rounded-full bg-muted px-1.5 py-px text-[11px] font-medium">{marked.label}</span> : null}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {list.map((c) => {
              const on = c.id === value
              const open = c.seats - c.taken
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => onChange(c.id)}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                    on ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted/60',
                  )}
                >
                  <span className="tabular-nums">{formatTimeRange(c.startMin, c.endMin)}</span>
                  <span className={cn('flex items-center gap-1 text-xs whitespace-nowrap', on ? 'text-background/80' : 'text-muted-foreground')}>
                    {on ? <LuCheck className="size-3.5" /> : null}
                    {open} {open === 1 ? 'seat' : 'seats'} open
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
