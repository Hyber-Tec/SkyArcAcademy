import { useState } from 'react'
import { LuCalendar, LuCheck, LuChevronDown } from 'react-icons/lu'
import { type FeedRange, RANGE_PRESETS, presetHint, rangeDates, rangeLabel, shortDay } from '@shared/scores/feed'
import { type DateKey, addMonths, formatDateKey } from '@shared/time'
import { MonthScroller } from '@/components/app/MonthScroller'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

/**
 * Which days the Scores page shows: a few presets (the last 30 days to start), or a custom range picked on the month
 * scroller (CLAUDE.md, "Month calendars"): the first day, then the last, then Apply. Days with results have a dot.
 */
export function DatesMenu({ range, onChange, today, hasResults, className }: { range: FeedRange; onChange: (r: FeedRange) => void; today: DateKey; hasResults: (d: DateKey) => boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const [pick, setPick] = useState<{ a: DateKey | null; b: DateKey | null }>({ a: null, b: null })
  const custom = range.preset === 'custom'
  const lo = pick.a && pick.b ? (pick.a < pick.b ? pick.a : pick.b) : pick.a
  const hi = pick.a && pick.b ? (pick.a < pick.b ? pick.b : pick.a) : pick.a

  const show = (o: boolean) => {
    setOpen(o)
    // Opened on a custom range: its days are picked already.
    if (o) setPick(custom ? { a: range.from, b: range.to } : { a: null, b: null })
  }
  const choose = (d: DateKey) => setPick((p) => (!p.a || p.b ? { a: d, b: null } : { a: p.a, b: d }))
  const apply = () => {
    if (!lo || !hi) return
    onChange({ preset: 'custom', from: lo, to: hi })
    setOpen(false)
  }
  const words = !pick.a ? 'Pick the first day' : !pick.b ? `${shortDay(pick.a, today)}: pick the last day` : lo === hi ? shortDay(lo!, today) : `${shortDay(lo!, today)} – ${shortDay(hi!, today)}`

  return (
    <Popover open={open} onOpenChange={show}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('h-9 gap-2 px-3 font-normal', range.preset !== '30d' && 'border-foreground/40', className)} data-testid="scores-dates">
          <LuCalendar className="text-muted-foreground" />
          <span className="tabular-nums">{rangeLabel(range, today)}</span>
          <LuChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[19rem] overflow-hidden p-0" data-testid="scores-dates-menu">
        <div className="p-1">
          {RANGE_PRESETS.map((p) => {
            const on = range.preset === p.key
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onChange({ preset: p.key })
                  setOpen(false)
                }}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-muted"
                aria-pressed={on}
              >
                <span className="flex size-4 items-center justify-center">{on ? <LuCheck className="size-4" /> : null}</span>
                <span className="flex-1">{p.label}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{presetHint(p.key, today)}</span>
              </button>
            )
          })}
        </div>
        <div className="border-t px-3 pt-2.5 pb-1 text-xs font-medium text-muted-foreground">Custom range</div>
        <MonthScroller
          variant="compact"
          // The days picked, or last month at the top with this one under it: ranges look back.
          anchor={pick.a ?? (custom ? rangeDates(range, today).to : addMonths(today, -1))}
          className="h-60"
          dayClassName={(d) => (lo && hi && d > lo && d < hi ? 'bg-muted' : undefined)}
          renderDay={(d) => {
            const future = d > today
            const end = d === lo || d === hi
            const dot = hasResults(d)
            return (
              <button
                type="button"
                disabled={future}
                onClick={() => choose(d)}
                aria-label={`${formatDateKey(d, 'weekdayLong')}${dot ? ', has results' : ''}`}
                aria-pressed={end}
                className={cn(
                  'relative flex size-8 items-center justify-center rounded-full text-xs tabular-nums transition-colors',
                  end ? 'bg-foreground font-semibold text-background' : d === today ? 'font-bold text-red-600 ring-1 ring-red-500 ring-inset' : 'hover:bg-muted',
                  future && 'pointer-events-none text-muted-foreground/40 ring-0',
                )}
              >
                {Number(d.slice(8))}
                {dot && !future ? <span className={cn('absolute bottom-1 size-1 rounded-full', end ? 'bg-background' : 'bg-muted-foreground/70')} aria-hidden /> : null}
              </button>
            )
          }}
        />
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <span className="min-w-0 truncate text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {words}
          </span>
          <Button size="sm" onClick={apply} disabled={!pick.a} data-testid="scores-dates-apply">
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
