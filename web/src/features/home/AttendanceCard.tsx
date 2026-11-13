import { useMemo, useState } from 'react'
import type { IconType } from 'react-icons'
import { LuCalendarDays, LuCheck, LuCheckCheck, LuChevronDown, LuClipboardCheck, LuSquareArrowOutUpRight, LuUserX, LuX } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import type { ClassToMark } from '@shared/schedule/status'
import type { SessionStatus } from '@shared/settings/defaults'
import { type DateKey, addDays, formatDateKey, formatTimeRange } from '@shared/time'
import type { AcademyClass, Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, ItemMenuButton, MenuOnTap, menu } from '@/components/app/ItemMenu'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import type { ScheduleCtx } from '@/features/schedule/api'
import { classContext, markSeats } from '@/features/schedule/classApi'
import { KindTag } from '@/features/schedule/seatParts'
import { cn } from '@/lib/utils'
import { plural } from './parts'

type Seat = WithId<Session>
type ToMark = ClassToMark<WithId<AcademyClass>, Seat>

interface Day {
  dateKey: DateKey
  classes: ToMark[]
  students: number
}

/** Days shown before "N earlier days". */
const FIRST_DAYS = 3

interface Mark {
  status: SessionStatus
  /** The schedule's word for it (docs/DECISIONS.md §21). */
  label: string
  verb: string
  icon: IconType
}

/** A student's marks, as the schedule gives them on a day that's over. */
const MARKS: Mark[] = [
  { status: 'present', label: 'Here', verb: 'here', icon: LuCheck },
  { status: 'no_show', label: 'No-show', verb: 'a no-show', icon: LuUserX },
  { status: 'canceled', label: 'Canceled', verb: 'canceled', icon: LuX },
]

/** "Yesterday · Thu, Nov 12", or the date alone further back. */
function dayTitle(d: DateKey, today: DateKey): string {
  const date = formatDateKey(d, 'weekdayMedium')
  if (d === today) return `Today · ${date}`
  if (d === addDays(today, -1)) return `Yesterday · ${date}`
  return date
}

/**
 * Attendance to take (docs/DECISIONS.md §47): the classes that are over with students nobody marked, the newest day
 * first, so the office sees what it missed and marks it here: each student Here, No-show or Canceled, or the whole class
 * (or day) here, each with a few seconds to take it back. A student marked leaves the list, and the student's page, the
 * makeups owed and the reports count the mark at once. Home shows it only while something is left to mark.
 */
export function AttendanceCard({ toMark, today }: { toMark: readonly ToMark[]; today: DateKey }) {
  const { branchId, actor, timezone, settings, rules } = useBranch()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const [showAll, setShowAll] = useState(false)
  const ctx: ScheduleCtx = useMemo(() => ({ branchId, actor, timezone, settings, maxStudentsPerCoach: rules.maxStudentsPerCoach }), [branchId, actor, timezone, settings, rules.maxStudentsPerCoach])

  // The classes come the newest day first, each day's in time order.
  const days = useMemo(() => {
    const out: Day[] = []
    for (const k of toMark) {
      const last = out[out.length - 1]
      if (last && last.dateKey === k.c.dateKey) {
        last.classes.push(k)
        last.students += k.seats.length
      } else out.push({ dateKey: k.c.dateKey, classes: [k], students: k.seats.length })
    }
    return out
  }, [toMark])
  const students = days.reduce((n, d) => n + d.students, 0)
  const shown = showAll ? days : days.slice(0, FIRST_DAYS)
  const hidden = days.slice(FIRST_DAYS)

  const openClass = (c: WithId<AcademyClass>) => navigate(`/admin/schedule/day/${c.dateKey}?class=${c.id}`)
  const openDay = (d: DateKey) => navigate(`/admin/schedule/day/${d}`)
  const fail = (what: string) => (e: unknown) => toast.error(what, { description: (e as Error).message })

  /** Gives the seats a mark, with a few seconds to take it back. The list drops them at once (the device has the mark). */
  const give = (seats: readonly Seat[], status: SessionStatus, message: string, description: string) => {
    void markSeats(ctx, seats.map((seat) => ({ seat, status }))).catch(fail('Couldn’t save the attendance'))
    toast.success(message, {
      description,
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => void markSeats(ctx, seats.map((seat) => ({ seat: { ...seat, status }, status: seat.status }))).catch(fail('Couldn’t undo')),
      },
    })
  }
  const mark = (s: Seat, m: Mark, k: ToMark) => give([s], m.status, `${s.studentName} marked ${m.verb}`, classContext(k.c))
  const allHere = (k: ToMark) => give(k.seats, 'present', `${plural(k.seats.length, 'student')} marked here`, classContext(k.c))
  const dayHere = async (d: Day) => {
    const seats = d.classes.flatMap((k) => k.seats)
    const day = formatDateKey(d.dateKey, 'weekdayMedium')
    const ok = await confirm({
      title: `Mark everyone on ${day} here?`,
      description: `${plural(seats.length, 'student')} not marked yet in ${plural(d.classes.length, 'class')} will be marked Here. Mark the no-shows and cancellations first: each one can still be changed after.`,
      confirmLabel: `Mark ${seats.length} here`,
    })
    if (ok) give(seats, 'present', `${plural(seats.length, 'student')} marked here`, day)
  }

  const dayMenu = (d: Day) =>
    menu(
      { kind: 'label', label: formatDateKey(d.dateKey, 'weekdayMedium') },
      { label: 'Mark everyone on this day here…', icon: LuCheckCheck, hint: String(d.students), onSelect: () => void dayHere(d) },
      { label: 'Open the schedule on this day', icon: LuCalendarDays, separatorBefore: true, onSelect: () => openDay(d.dateKey) },
    )
  const classMenu = (k: ToMark) =>
    menu(
      { kind: 'label', label: `${formatTimeRange(k.c.startMin, k.c.endMin)} class` },
      { label: 'Mark them all here', icon: LuCheckCheck, hint: String(k.seats.length), onSelect: () => allHere(k) },
      { label: 'Open the class', icon: LuSquareArrowOutUpRight, separatorBefore: true, onSelect: () => openClass(k.c) },
      { label: 'Open the schedule on this day', icon: LuCalendarDays, onSelect: () => openDay(k.c.dateKey) },
    )
  const seatMenu = (s: Seat, k: ToMark) =>
    menu(
      { kind: 'label', label: `Mark ${s.studentName}` },
      ...MARKS.map((m) => ({ label: m.label, icon: m.icon, onSelect: () => mark(s, m, k) })),
      { label: 'Open the class', icon: LuSquareArrowOutUpRight, separatorBefore: true, onSelect: () => openClass(k.c) },
    )

  return (
    <section id="home-attendance" className="@container scroll-mt-4 overflow-hidden rounded-xl border bg-card" data-testid="home-attendance">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex size-6 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
            <LuClipboardCheck className="size-3.5" />
          </span>
          Attendance to take
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {plural(students, 'student')} in {plural(toMark.length, 'class')} not marked
        </span>
      </div>

      <ul className="divide-y">
        {shown.map((d) => (
          <li key={d.dateKey} data-testid="attendance-day">
            <ContextMenuFor entries={dayMenu(d)}>
              <div className="flex items-center gap-2 bg-muted/40 py-1 pr-2 pl-4">
                <span className="text-xs font-semibold">{dayTitle(d.dateKey, today)}</span>
                <span className="text-xs text-muted-foreground tabular-nums">· {plural(d.students, 'student')}</span>
                <ItemMenuButton entries={dayMenu(d)} label={`${formatDateKey(d.dateKey, 'weekdayMedium')}: more actions`} className="ml-auto size-6" />
              </div>
            </ContextMenuFor>
            <ul className="divide-y divide-dashed">
              {d.classes.map((k) => (
                <ContextMenuFor key={k.c.id} entries={classMenu(k)}>
                  {/* The time, its students not marked (each opens its marks) and All here: one line, the students
                      under the time when the card is narrow. */}
                  <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 pr-2 pl-4" data-testid="attendance-class">
                    <button
                      type="button"
                      onClick={() => openClass(k.c)}
                      title="Open the class on the schedule"
                      className="shrink-0 text-left text-sm font-medium tabular-nums underline-offset-2 hover:underline @2xl:w-36"
                    >
                      {formatTimeRange(k.c.startMin, k.c.endMin)}
                    </button>
                    <div className="order-last flex min-w-0 basis-full flex-wrap gap-1.5 @2xl:order-none @2xl:flex-1 @2xl:basis-0">
                      {k.seats.map((s) => (
                        <MenuOnTap key={s.id} entries={seatMenu(s, k)}>
                          <ContextMenuFor entries={seatMenu(s, k)}>
                            <button
                              type="button"
                              title={`Mark ${s.studentName}: Here, No-show or Canceled`}
                              className="inline-flex max-w-full items-center gap-1 rounded-full border bg-background py-0.5 pr-1.5 pl-2.5 text-sm transition-colors hover:bg-muted data-[state=open]:bg-muted"
                              data-testid="attendance-student"
                            >
                              <span className="truncate">{s.studentName}</span>
                              <KindTag note={s.note} />
                              <LuChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                            </button>
                          </ContextMenuFor>
                        </MenuOnTap>
                      ))}
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <Button variant="outline" size="xs" onClick={() => allHere(k)} data-testid="attendance-all-here">
                        <LuCheckCheck /> All here
                      </Button>
                      <ItemMenuButton entries={classMenu(k)} label={`${formatTimeRange(k.c.startMin, k.c.endMin)} class: more actions`} className="size-6" />
                    </div>
                  </li>
                </ContextMenuFor>
              ))}
            </ul>
          </li>
        ))}
      </ul>

      {hidden.length ? (
        <button
          type="button"
          onClick={() => setShowAll(!showAll)}
          aria-expanded={showAll}
          className="flex w-full items-center gap-2 border-t px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-muted/50"
        >
          <LuChevronDown className={cn('size-4 transition-transform', !showAll && '-rotate-90')} />
          {showAll ? 'Show the latest days only' : `${plural(hidden.length, 'earlier day')} · ${plural(hidden.reduce((n, d) => n + d.students, 0), 'student')}`}
        </button>
      ) : null}
      {dialog}
    </section>
  )
}
