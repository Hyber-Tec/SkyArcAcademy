import { useMemo, useState } from 'react'
import { LuCalendarDays, LuChevronDown, LuSquareArrowOutUpRight } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { takesSeat } from '@shared/schedule/classes'
import { CONFLICT_LABELS, type Conflict } from '@shared/schedule/conflicts'
import type { DayHours } from '@shared/settings/defaults'
import { type DateKey, formatMinutes, formatTimeRange } from '@shared/time'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CoachBadge, SeatCount, shortName } from '@/features/schedule/seatParts'
import type { ClassView } from '@/features/schedule/useClassData'
import { cn } from '@/lib/utils'
import { StatePill, type Tone, nameList, plural } from './parts'

/** Classes shown before "Show N more". */
const FIRST_ROWS = 12

type Filter = 'all' | 'now' | 'later'

/** Today's classes in order, with a red "now" line: each with its students, its seats and the coaches in (Home option 1). */
export function TodayCard({
  classes,
  loading,
  today,
  nowMin,
  hours,
  conflictsOf,
  staffName,
  staffColor,
  onOpen,
}: {
  classes: readonly ClassView[]
  loading: boolean
  today: DateKey
  nowMin: number
  hours: DayHours
  conflictsOf: (classId: string) => Conflict[] | undefined
  staffName: (staffId: string, fallback: string) => string
  staffColor: (staffId: string) => string
  /** Opens a class (on the schedule). */
  onOpen: (classId: string) => void
}) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<Filter>('all')
  const [showEarlier, setShowEarlier] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const day = useMemo(() => {
    const earlier = classes.filter((v) => v.c.endMin <= nowMin)
    const current = classes.filter((v) => v.c.startMin <= nowMin && v.c.endMin > nowMin)
    const later = classes.filter((v) => v.c.startMin > nowMin)
    return { earlier, current, later }
  }, [classes, nowMin])

  const byTime = (a: ClassView, b: ClassView) => a.c.startMin - b.c.startMin || a.c.endMin - b.c.endMin
  // All: what's on now, the red line, then what's later (ended ones drop off).
  const currentRows = filter === 'later' ? [] : [...day.current].sort(byTime)
  const laterRows = filter === 'now' ? [] : [...day.later].sort(byTime)
  const list = [...currentRows, ...laterRows]
  const visible = showAll ? list : list.slice(0, FIRST_ROWS)
  const hidden = list.length - visible.length
  const lineIndex = filter === 'all' && classes.length > 0 ? currentRows.length : -1

  const stateOf = (v: ClassView): { label: string; tone: Tone; pulse?: boolean; title?: string } => {
    const { c } = v
    if (c.endMin <= nowMin) return { label: 'Done', tone: 'muted' }
    const conflicts = conflictsOf(c.id)
    if (conflicts?.length) return { label: CONFLICT_LABELS[conflicts[0].kind], tone: 'danger', title: conflicts.map((k) => k.message).join(' ') }
    if (c.startMin <= nowMin) return { label: 'In progress', tone: 'live', pulse: true }
    if (!v.taken) return { label: 'No students', tone: 'muted' }
    return v.taken >= c.seats ? { label: 'Full', tone: 'muted' } : { label: `${plural(c.seats - v.taken, 'seat')} open`, tone: 'muted' }
  }

  const classRow = (v: ClassView, muted = false) => {
    const { c } = v
    const st = stateOf(v)
    const names = v.seats.filter(takesSeat).map((s) => shortName(s.studentName))
    return (
      <ContextMenuFor
        key={c.id}
        entries={menu(
          { kind: 'label', label: `${formatTimeRange(c.startMin, c.endMin)} class` },
          { label: 'Open the class', icon: LuSquareArrowOutUpRight, onSelect: () => onOpen(c.id) },
          { label: 'Open the schedule on this day', icon: LuCalendarDays, separatorBefore: true, onSelect: () => navigate(`/admin/schedule/day/${today}`) },
        )}
      >
        <li>
          <button
            type="button"
            onClick={() => onOpen(c.id)}
            data-testid="home-class"
            className={cn('grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50', muted && 'opacity-70')}
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
                {v.coaches.length ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="flex shrink-0 -space-x-1">
                      {v.coaches.map((k) => (
                        <CoachBadge key={k.staffId} name={staffName(k.staffId, k.name)} color={staffColor(k.staffId)} size="xs" className="ring-2 ring-card" />
                      ))}
                    </span>
                    {/* Phones: the initials only. */}
                    <span className="hidden truncate sm:inline">{v.coaches.map((k) => staffName(k.staffId, k.name).split(' ')[0]).join(', ')}</span>
                  </span>
                ) : (
                  <span className="font-medium text-amber-700 dark:text-amber-400">No coach in</span>
                )}
              </div>
            </div>
            <StatePill tone={st.tone} pulse={st.pulse} title={st.title}>
              {st.label}
            </StatePill>
          </button>
        </li>
      </ContextMenuFor>
    )
  }

  const nowLine = (
    <li key="now-line" className="flex items-center gap-2 px-4 py-1" aria-label={`Now, ${formatMinutes(nowMin)}`} data-testid="home-now-line">
      <span className="text-[11px] font-semibold text-red-600 tabular-nums">{formatMinutes(nowMin)}</span>
      <span className="h-px flex-1 bg-red-400/70" />
    </li>
  )

  const segments: [Filter, string][] = [
    ['all', 'All'],
    ['now', `Now · ${day.current.length}`],
    ['later', `Later · ${day.later.length}`],
  ]

  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="home-today">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">
          Today’s classes <span className="ml-1 font-normal text-muted-foreground">{loading ? '' : classes.length}</span>
        </h2>
        <div role="tablist" aria-label="Show" className="flex rounded-lg bg-muted p-0.5 text-xs font-medium">
          {segments.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              disabled={key === 'now' ? !day.current.length : key === 'later' ? !day.later.length : false}
              onClick={() => {
                setFilter(key)
                setShowAll(false)
              }}
              className={cn('rounded-md px-2.5 py-1 transition-colors disabled:opacity-50', filter === key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      ) : classes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <LuCalendarDays className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{hours.isOpen ? 'No classes today.' : 'The academy is closed today.'}</p>
          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/schedule/day/${today}`)}>
            Open schedule
          </Button>
        </div>
      ) : (
        <ul className="divide-y">
          {filter === 'all' && day.earlier.length ? (
            <li>
              <button
                type="button"
                onClick={() => setShowEarlier(!showEarlier)}
                aria-expanded={showEarlier}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/50"
              >
                <LuChevronDown className={cn('size-4 transition-transform', !showEarlier && '-rotate-90')} />
                {plural(day.earlier.length, 'earlier class')}
              </button>
            </li>
          ) : null}
          {filter === 'all' && showEarlier ? day.earlier.map((v) => classRow(v, true)) : null}
          {visible.map((v, i) => [i === lineIndex ? nowLine : null, classRow(v)])}
          {lineIndex >= 0 && lineIndex >= visible.length ? nowLine : null}
          {list.length === 0 && filter === 'all' ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing else on the schedule today.</li>
          ) : null}
        </ul>
      )}

      {!loading && hidden > 0 ? (
        <div className="border-t p-2">
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setShowAll(true)}>
            Show {plural(hidden, 'more class')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
