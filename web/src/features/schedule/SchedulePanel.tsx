import type { ReactNode } from 'react'
import { LuBan, LuCheck, LuChevronLeft, LuChevronRight, LuPencil, LuUserX, LuX } from 'react-icons/lu'
import { KIND_COLORS, levelColor } from '@shared/schedule/seatColors'
import { type DateKey, type Weekday, WEEKDAY_SHORT, formatDateKey, formatMinutes, formatMinutesShort, weekDays, weekdayOf } from '@shared/time'
import { MonthScroller } from '@/components/app/MonthScroller'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useBoard } from './board'
import { CoachBadge, SEAT_FILL, seatVars } from './seatParts'

export type ClassViewMode = 'day' | 'week'

const clock = (min: number) => formatMinutesShort(min).replace(/\s?[AP]M$/i, '')
const hours = (min: number) => `${String(Math.round((min / 60) * 10) / 10).replace(/\.0$/, '')}h`

/**
 * The schedule's panel, floating on the right (the owner's pick, 2026-10-26): the day and the view, the scrolling
 * month calendar, who's in, and what the colours mean. It closes with the cross; the page's header opens it again.
 */
export function SchedulePanel(p: {
  view: ClassViewMode
  date: DateKey
  weekStartsOn: Weekday
  onView: (v: ClassViewMode) => void
  onDate: (d: DateKey) => void
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onClose: () => void
  className?: string
}) {
  const b = useBoard()
  const week = weekDays(p.date, p.weekStartsOn)
  const inWeek = new Set(week)
  const title = p.view === 'day' ? formatDateKey(p.date, 'weekdayLong').split(',')[0] : `${formatDateKey(week[0], 'monthDay')} – ${week[0].slice(0, 7) === week[6].slice(0, 7) ? Number(week[6].slice(8)) : formatDateKey(week[6], 'monthDay')}`
  const subtitle = p.view === 'day' ? formatDateKey(p.date, 'long') : week.includes(b.today) ? `${week[6].slice(0, 4)} · this week` : week[6].slice(0, 4)
  const active = (d: DateKey) => (p.view === 'day' ? d === p.date : inWeek.has(d) && b.isOpen(d))
  return (
    <aside aria-label="Schedule panel" className={cn('flex flex-col gap-4 overflow-y-auto rounded-2xl border bg-card p-3 shadow-lg [&>*]:shrink-0', p.className)} data-testid="schedule-panel">
      <div className="flex items-start gap-2 px-1 pt-0.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-2xl font-semibold tracking-tight">{title}</div>
          <div className="text-sm text-muted-foreground">{subtitle}</div>
        </div>
        <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Close the panel" title="Close the panel (Esc)" onClick={p.onClose}>
          <LuX />
        </Button>
      </div>
      <div className="flex items-center gap-1.5 px-1">
        <Button variant="outline" size="icon-sm" className="rounded-full" aria-label="Previous" title="Previous (←)" onClick={p.onPrev}>
          <LuChevronLeft />
        </Button>
        <Button variant="outline" size="sm" className="flex-1 rounded-full" onClick={p.onToday}>
          Today
        </Button>
        <Button variant="outline" size="icon-sm" className="rounded-full" aria-label="Next" title="Next (→)" onClick={p.onNext}>
          <LuChevronRight />
        </Button>
      </div>
      <ViewSwitch view={p.view} onView={p.onView} />
      <div className="overflow-hidden rounded-xl ring-1 ring-border" data-testid="mini-calendar">
        <MonthScroller
          variant="compact"
          anchor={p.date}
          focusDate={p.date}
          className="h-60"
          renderDay={(d) => {
            const on = active(d)
            return (
              <button
                type="button"
                onClick={() => p.onDate(d)}
                aria-label={formatDateKey(d, 'weekdayLong')}
                aria-pressed={on}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full text-xs tabular-nums transition-colors',
                  !b.isOpen(d) && 'text-muted-foreground/50',
                  on && 'bg-foreground font-semibold text-background',
                  !on && d === b.today && 'font-bold text-red-600 ring-1 ring-red-500 ring-inset',
                  !on && 'hover:bg-muted',
                )}
              >
                {Number(d.slice(8))}
              </button>
            )
          }}
        />
      </div>
      {p.view === 'day' ? <WhosIn date={p.date} /> : <CoachesThisWeek days={week} />}
      <Legend />
    </aside>
  )
}

/** Day / Week (no month: the academy plans a week at a time). */
export function ViewSwitch({ view, onView, compact }: { view: ClassViewMode; onView: (v: ClassViewMode) => void; compact?: boolean }) {
  return (
    <div className={cn('grid grid-cols-2 rounded-xl bg-muted p-1', compact && 'w-32 shrink-0')} role="group" aria-label="View">
      {(['day', 'week'] as const).map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onView(v)}
          className={cn(
            'rounded-lg font-medium capitalize transition',
            compact ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
            view === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex h-6 items-center justify-between px-2">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</span>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The day's people and their hours; a green dot on whoever has clocked in. */
function WhosIn({ date }: { date: DateKey }) {
  const b = useBoard()
  const people = b.inOn(date)
  const editable = b.mode === 'admin' && b.canEdit(date)
  if (!b.isOpen(date)) {
    return (
      <Section title="Who's in">
        <p className="px-2 text-sm text-muted-foreground">Closed on {formatDateKey(date, 'weekdayLong').split(',')[0]}.</p>
      </Section>
    )
  }
  return (
    <Section
      title="Who's in"
      action={
        editable ? (
          <Button variant="ghost" size="xs" className="-mr-1.5 text-muted-foreground" onClick={() => b.editWhosIn(date)}>
            <LuPencil /> Edit
          </Button>
        ) : null
      }
    >
      {people.length ? (
        <div className="space-y-0.5">
          {people.map((a) => (
            <CoachRow
              key={a.id}
              staffId={a.staffId}
              name={b.staffName(a.staffId, a.staffName)}
              sub={a.staffRole && a.staffRole !== 'coach' ? (a.staffRole === 'owner' ? 'Owner' : 'Admin') : undefined}
              clocked={date === b.today ? b.clockedIn(a.staffId) : null}
              right={a.ranges.map((r) => `${clock(r.startMin)}–${clock(r.endMin)}`).join(', ')}
              onClick={editable ? () => b.editWhosIn(date) : undefined}
            />
          ))}
        </div>
      ) : editable ? (
        <button type="button" onClick={() => b.editWhosIn(date)} className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-amber-700 hover:bg-muted/70 dark:text-amber-400">
          Nobody is in yet: set who's in
        </button>
      ) : (
        <p className="px-2 text-sm text-muted-foreground">Nobody is in yet.</p>
      )}
    </Section>
  )
}

/** Each person's days and hours this week (Hourly pay counts the hours they clock). */
function CoachesThisWeek({ days }: { days: DateKey[] }) {
  const b = useBoard()
  const rows = new Map<string, { name: string; role?: string; days: DateKey[]; minutes: number }>()
  for (const d of days) {
    for (const a of b.inOn(d)) {
      const row = rows.get(a.staffId) ?? { name: b.staffName(a.staffId, a.staffName), role: a.staffRole, days: [], minutes: 0 }
      row.days.push(d)
      row.minutes += a.ranges.reduce((n, r) => n + r.endMin - r.startMin, 0)
      rows.set(a.staffId, row)
    }
  }
  const list = [...rows.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name))
  return (
    <Section title="Who's in this week">
      {list.length ? (
        <div className="space-y-0.5">
          {list.map(([id, r]) => (
            <CoachRow
              key={id}
              staffId={id}
              name={r.name}
              sub={[r.role && r.role !== 'coach' ? (r.role === 'owner' ? 'Owner' : 'Admin') : null, ...r.days.map((d) => WEEKDAY_SHORT[weekdayOf(d)])].filter(Boolean).join(' · ')}
              right={hours(r.minutes)}
              onClick={() => b.openDay(r.days[0])}
            />
          ))}
        </div>
      ) : (
        <p className="px-2 text-sm text-muted-foreground">Nobody's hours are set this week.</p>
      )}
    </Section>
  )
}

function CoachRow({ staffId, name, clocked, sub, right, onClick }: { staffId: string; name: string; clocked?: number | null; sub?: string; right: ReactNode; onClick?: () => void }) {
  const b = useBoard()
  const body = (
    <>
      <span className="relative shrink-0">
        <CoachBadge name={name} color={b.staffColor(staffId)} size="sm" />
        {clocked != null ? <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-emerald-500" title={`Clocked in at ${formatMinutes(clocked)}`} /> : null}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate">{name}</span>
        {sub ? <span className="block truncate text-[11px] text-muted-foreground">{sub}</span> : null}
      </span>
      {right ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{right}</span> : null}
    </>
  )
  const cls = 'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm'
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'transition hover:bg-muted/70')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  )
}

/** What the colours and marks mean. */
function Legend() {
  const b = useBoard()
  return (
    <Section title="Legend">
      <div className="space-y-2.5 px-2 pb-1 text-xs text-muted-foreground">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {b.levels.map((l) => (
            <span key={l} className="inline-flex min-w-0 items-center gap-1.5">
              <span className={cn('size-3 shrink-0 rounded-[4px] ring-1 ring-foreground/10 ring-inset', SEAT_FILL)} style={seatVars(levelColor(l, b.levels))} />
              <span className="truncate">{l}</span>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(['makeup', 'practice', 'trial'] as const).map((k) => (
            <span key={k} className={cn('rounded-md px-1.5 py-px text-[11px] font-semibold', SEAT_FILL)} style={seatVars(KIND_COLORS[k])}>
              {k === 'makeup' ? 'MU · Make-up' : KIND_COLORS[k].name}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          <span className="inline-flex items-center gap-1.5">
            <LuCheck className="size-3.5 text-emerald-600" /> Here
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LuUserX className="size-3.5" /> No-show
          </span>
          <span className="inline-flex items-center gap-1.5">
            <LuBan className="size-3.5 text-red-500" /> Canceled
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="hatch-empty size-3 rounded-[4px] border border-dashed border-foreground/30" /> Open seat
          </span>
        </div>
      </div>
    </Section>
  )
}
