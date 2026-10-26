import { LuCalendarDays, LuSquareArrowOutUpRight } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router'
import { takesSeat } from '@shared/schedule/classes'
import { formatDateKey, formatMinutes, formatTimeRange } from '@shared/time'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { Skeleton } from '@/components/ui/skeleton'
import { StatePill, type Tone, nameList } from '@/features/home/parts'
import { SeatCount, shortName } from '@/features/schedule/seatParts'
import type { ClassView } from '@/features/schedule/useClassData'
import { cn } from '@/lib/utils'
import type { CoachDay } from './useCoachDay'

/** Today's classes in the coach's hours, in time order with a "now" line; a row opens the class on the schedule. */
export function TodaySessionsCard({ t }: { t: CoachDay }) {
  const navigate = useNavigate()
  const coach = `/coach`
  const rows = t.day.classes
  // The red line sits before the first class that hasn't started.
  const firstLater = rows.findIndex((v) => v.c.startMin > t.nowMin)
  const lineAt = rows.length === 0 ? -1 : firstLater === -1 ? rows.length : firstLater

  const stateOf = (v: ClassView): { label: string; tone: Tone; pulse?: boolean } => {
    if (v.c.endMin <= t.nowMin) return { label: 'Done', tone: 'muted' }
    if (v.c.startMin <= t.nowMin) return { label: 'In progress', tone: 'live', pulse: true }
    return v.taken ? { label: 'Upcoming', tone: 'muted' } : { label: 'No students', tone: 'muted' }
  }

  const row = (v: ClassView) => {
    const { c } = v
    const st = stateOf(v)
    const names = v.seats.filter(takesSeat).map((s) => shortName(s.studentName))
    const others = v.coaches.filter((k) => k.staffId !== t.staffId).map((k) => (k.name || 'Coach').split(' ')[0])
    const open = () => navigate(`${coach}/schedule/day/${c.dateKey}?class=${c.id}`)
    return (
      <ContextMenuFor
        key={c.id}
        entries={menu(
          { kind: 'label', label: `${formatTimeRange(c.startMin, c.endMin)} class` },
          { label: 'Open the class', icon: LuSquareArrowOutUpRight, onSelect: open },
          { label: 'Open the schedule on this day', icon: LuCalendarDays, onSelect: () => navigate(`${coach}/schedule/day/${c.dateKey}`) },
        )}
      >
        <li className={cn('group relative', c.endMin <= t.nowMin && 'opacity-60')}>
          <button
            type="button"
            onClick={open}
            data-testid="today-class"
            className="grid w-full grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
          >
            <div className="text-sm leading-tight tabular-nums">
              <div className="font-medium">{formatMinutes(c.startMin)}</div>
              <div className="text-xs text-muted-foreground">{formatMinutes(c.endMin)}</div>
            </div>
            <div className="min-w-0 leading-tight">
              <div className={cn('truncate text-sm', names.length ? 'font-medium' : 'text-muted-foreground')}>{names.length ? nameList(names, 3) : 'No students yet'}</div>
              <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                <SeatCount used={v.taken} of={c.seats} className="shrink-0" />
                <span aria-hidden className="text-muted-foreground/50">
                  ·
                </span>
                <span className="truncate">{others.length ? `With ${nameList(others, 3)}` : 'No other coach in'}</span>
              </div>
            </div>
            <StatePill tone={st.tone} pulse={st.pulse}>
              {st.label}
            </StatePill>
          </button>
        </li>
      </ContextMenuFor>
    )
  }

  const nowLine = (
    <li key="now" className="flex items-center gap-2 px-4 py-1" aria-label={`Now, ${formatMinutes(t.nowMin)}`} data-testid="today-now-line">
      <span className="text-[11px] font-semibold text-red-600 tabular-nums">{formatMinutes(t.nowMin)}</span>
      <span className="h-px flex-1 bg-red-400/70" />
    </li>
  )

  const next = t.day.next
  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="today-classes">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">
          Today’s classes <span className="ml-1 font-normal text-muted-foreground">{t.loading ? '' : rows.length}</span>
        </h2>
        <Link to={`${coach}/schedule/week/${t.today}`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
          Week view →
        </Link>
      </div>
      {t.loading ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
          <LuCalendarDays className="mb-1 size-6 text-muted-foreground/70" />
          <p className="text-sm font-medium">No classes today.</p>
          {next.kind === 'day' ? (
            <p className="text-sm text-muted-foreground">
              Your next {next.classes.length === 1 ? 'class is' : 'classes are'} on {formatDateKey(next.dateKey, 'weekdayMedium')}.
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((v, i) => [i === lineAt ? nowLine : null, row(v)])}
          {rows.length > 0 && lineAt === rows.length ? nowLine : null}
        </ul>
      )}
    </section>
  )
}
