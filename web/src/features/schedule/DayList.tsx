import { LuArrowRightLeft, LuBan, LuCheck, LuChevronRight, LuEllipsis, LuPlus, LuRotateCcw, LuSquareArrowOutUpRight, LuTrash2, LuUserX } from 'react-icons/lu'
import { seatKind } from '@shared/schedule/classes'
import { levelColor } from '@shared/schedule/seatColors'
import { type DateKey, addDays, formatDateKey, formatMinutes, formatTimeRange } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { REFUSAL, cellsOf, freeSeats, useBoard, useDragSource, useDropTarget } from './board'
import { CoachBadge, KindTag, NowPill, SEAT_FILL, SeatCount, abbreviate, classRange, gradeLabel, seatVars, shortName } from './seatParts'
import type { ClassView } from './useClassData'

/** The sheets' label colours as a light wash behind a make-up, a practice or a trial. */
const WASH = {
  makeup: 'bg-red-50/50 border-red-100 dark:bg-red-950/25 dark:border-red-900/50',
  practice: 'bg-cyan-50/50 border-cyan-100 dark:bg-cyan-950/25 dark:border-cyan-900/50',
  trial: 'bg-green-50/50 border-green-100 dark:bg-green-950/25 dark:border-green-900/50',
  evaluation: 'bg-green-50/50 border-green-100 dark:bg-green-950/25 dark:border-green-900/50',
} as const

/** One day, larger: each class with its seats big enough to read and mark (who's in is on the panel). */
export function DayList({ dateKey }: { dateKey: DateKey }) {
  const b = useBoard()
  const classes = b.byDate.get(dateKey) ?? []
  const events = b.eventsOn(dateKey)
  if (!b.isOpen(dateKey) && !classes.length) {
    return <div className="hatch-off rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">Closed on {formatDateKey(dateKey, 'weekdayLong').split(',')[0]}.</div>
  }
  return (
    <div className="space-y-3" data-testid="day-list">
      {events.map((e) => (
        <div key={e.id} className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
          <span className="font-semibold">{e.title}</span>
          <span className="text-sky-800/80 dark:text-sky-300/80">{formatTimeRange(e.startMin, e.endMin)}</span>
        </div>
      ))}
      {classes.map((v) => (
        <DayClass key={v.c.id} v={v} />
      ))}
      {!classes.length ? <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">No classes on this day yet.</div> : null}
      {b.mode === 'admin' && b.canEdit(dateKey) ? (
        <Button variant="outline" size="sm" onClick={() => b.addClass(dateKey)}>
          <LuPlus /> Add a class
        </Button>
      ) : null}
    </div>
  )
}

function DayClass({ v }: { v: ClassView }) {
  const b = useBoard()
  const drop = useDropTarget(v)
  const { c } = v
  const { cells, open, overflow } = cellsOf(v.seats, c.seats)
  const now = c.dateKey === b.today && b.nowMin >= c.startMin && b.nowMin < c.endMin
  const editable = b.mode === 'admin' && b.canEdit(c.dateKey)
  const notMine = !!b.me && !v.coaches.some((k) => k.staffId === b.me)
  return (
    <div
      {...drop.props}
      className={cn(
        'relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card shadow-xs transition-[opacity,box-shadow,border-color] sm:flex-row',
        notMine && 'opacity-60',
        now && 'border-brand/40',
        drop.dragging && drop.refused && !drop.hovered && 'opacity-40',
        drop.hovered && drop.ok && 'border-brand ring-[3px] ring-brand/20',
      )}
      data-testid="class-block"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b bg-muted/40 p-3 sm:w-44 sm:flex-col sm:flex-nowrap sm:items-stretch sm:gap-2.5 sm:border-r sm:border-b-0">
        <div className="w-full sm:w-auto">
          <button type="button" data-class-time={c.id} onClick={() => b.openClass(c.id)} className="text-left text-[17px] leading-6 font-semibold tabular-nums hover:underline hover:underline-offset-4">
            {classRange(c.startMin, c.endMin)}
          </button>
          {now ? (
            <div className="mt-1.5 flex items-center gap-2">
              <NowPill />
              <span className="text-xs text-muted-foreground">{c.endMin - b.nowMin} min left</span>
            </div>
          ) : null}
        </div>
        <SeatCount used={v.taken} of={c.seats} className="text-xs" />
        <div className="flex flex-wrap gap-x-3 gap-y-1 sm:block sm:space-y-1">
          {v.coaches.length ? (
            v.coaches.map((k) => {
              const name = b.staffName(k.staffId, k.name)
              const r = k.ranges
              const part = k.partial ? (r[r.length - 1].endMin < c.endMin ? `until ${formatMinutes(r[r.length - 1].endMin)}` : `from ${formatMinutes(r[0].startMin)}`) : null
              return (
                <div key={k.staffId} className="flex min-w-0 items-center gap-1.5 text-[13px]">
                  <CoachBadge name={name} color={b.staffColor(k.staffId)} size="xs" />
                  <span className="truncate">{name.split(' ')[0]}</span>
                  {part ? <span className="shrink-0 text-[11px] font-medium text-amber-700 dark:text-amber-400">{part}</span> : null}
                </div>
              )
            })
          ) : (
            <div className="text-[13px] font-medium text-amber-700 dark:text-amber-400">No coach in</div>
          )}
        </div>
        {c.note ? <p className="line-clamp-3 text-xs text-muted-foreground sm:w-full">{c.note}</p> : null}
        <Button variant="ghost" size="xs" className="ml-auto text-muted-foreground sm:mt-auto sm:-ml-2 sm:self-start" onClick={() => b.openClass(c.id)}>
          Open class <LuChevronRight />
        </Button>
      </div>
      <div className="@container min-w-0 flex-1 p-1.5">
        <div className="grid gap-1.5 @min-[740px]:grid-cols-2">
          {cells.map((s) => (
            <DaySeat key={s.id} seat={s} v={v} />
          ))}
          {Array.from({ length: open }, (_, i) => (
            <button
              key={`open-${i}`}
              type="button"
              data-open-seat={c.id}
              disabled={!editable}
              onClick={() => b.addSeat(c.id)}
              className={cn(
                'hatch-empty flex h-[60px] items-center justify-center gap-1.5 rounded-lg border border-dashed border-foreground/15 text-[13px] text-muted-foreground transition-colors',
                editable && 'hover:border-foreground/35 hover:bg-muted/70 hover:text-foreground',
                drop.ok && 'border-brand/50 bg-brand/[0.04] text-brand-text',
                drop.ok && drop.hovered && i === 0 && 'border-solid border-brand bg-brand/10',
              )}
            >
              <span className="pointer-events-none flex items-center gap-1.5">
                {drop.ok && drop.hovered && i === 0 ? (
                  <span className="font-semibold">Move here</span>
                ) : editable ? (
                  <>
                    <LuPlus className="size-4" /> Add a student
                  </>
                ) : (
                  'Open seat'
                )}
              </span>
            </button>
          ))}
        </div>
        {overflow.length ? (
          <div className="px-1.5 pt-2 text-xs text-muted-foreground">
            Also canceled: <span className="line-through">{overflow.map((s) => shortName(s.studentName)).join(', ')}</span>
          </div>
        ) : null}
      </div>
      {drop.hovered && drop.refused ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60">
          <span className="rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow">{REFUSAL[drop.refused]}</span>
        </div>
      ) : null}
    </div>
  )
}

/** A seat, large: the level's colour with the rifle, the name and grade, the label and own time, and the marks. */
function DaySeat({ seat, v }: { seat: WithId<Session>; v: ClassView }) {
  const b = useBoard()
  const source = useDragSource(seat)
  const st = b.student(seat.studentId)
  const level = st?.level ?? null
  const kind = seatKind(seat.note)
  const canceled = seat.status === 'canceled'
  const present = seat.status === 'present'
  const noShow = seat.status === 'no_show'
  const own = seat.startMin !== v.c.startMin || seat.endMin !== v.c.endMin ? classRange(seat.startMin, seat.endMin) : null
  const label = (seat.note ?? '').trim()
  const editable = b.mode === 'admin' && b.canEdit(seat.dateKey)
  // Here / no-show belong to the day of the class: a class next week has nothing to mark yet.
  const markable = editable && seat.dateKey <= b.today
  return (
    <div
      data-seat-id={seat.id}
      {...source}
      className={cn(
        'group/seat @container flex h-[60px] min-w-0 items-stretch overflow-hidden rounded-lg border bg-card transition-opacity',
        kind !== 'regular' && WASH[kind],
        source.draggable && 'cursor-grab active:cursor-grabbing',
        b.lifted === seat.id && 'opacity-30',
      )}
    >
      <div className={cn('flex w-[72px] shrink-0 flex-col justify-center px-2.5 @min-[420px]:w-[100px]', SEAT_FILL, canceled && 'opacity-50')} style={seatVars(levelColor(level, b.levels))}>
        <span className="truncate text-[11px] leading-4 font-semibold">
          {level ? (
            <>
              <span className="@min-[420px]:hidden">{abbreviate(level)}</span>
              <span className="hidden @min-[420px]:inline">{level}</span>
            </>
          ) : (
            'New'
          )}
        </span>
        <span className={cn('truncate leading-4', st?.rifle ? 'text-[13px] font-bold tabular-nums' : 'text-[10px] font-medium opacity-75')}>{st?.rifle || (level ? 'Own rifle' : 'No rifle')}</span>
      </div>
      <button type="button" onClick={() => b.openClass(v.c.id)} className={cn('flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 text-left', canceled && 'opacity-55')} title="Open the class">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className={cn('truncate text-[14px] font-semibold', canceled && 'line-through', noShow && 'text-muted-foreground')}>{seat.studentName}</span>
          <span className="shrink-0 text-[12px] text-muted-foreground">{gradeLabel(st?.grade ?? seat.studentGrade)}</span>
        </span>
        {kind !== 'regular' || own || (label && kind === 'regular') ? (
          <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            <KindTag note={seat.note} />
            {own ? <span className="shrink-0 tabular-nums">{own}</span> : null}
            {label && kind === 'regular' ? <span className="min-w-0 truncate">{label}</span> : null}
          </span>
        ) : null}
      </button>
      <div className="flex shrink-0 items-center gap-1 pr-1.5">
        {canceled ? (
          <>
            <span className="hidden items-center gap-1 text-[12px] font-medium text-red-600 @min-[470px]:inline-flex dark:text-red-400">
              <LuBan className="size-3.5" /> Canceled
            </span>
            {editable ? (
              <Button variant="outline" size="xs" onClick={() => b.setStatus(seat, 'confirmed')}>
                <LuRotateCcw /> Restore
              </Button>
            ) : null}
          </>
        ) : markable ? (
          <div className="flex items-center rounded-md border bg-background p-0.5" role="group" aria-label="Mark">
            <button
              type="button"
              aria-pressed={present}
              aria-label="Here"
              title={present ? 'Here (click to undo)' : 'Mark here'}
              onClick={() => b.setStatus(seat, present ? 'confirmed' : 'present')}
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-[5px] px-2 text-[12px] font-medium transition-colors',
                present
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <LuCheck className="size-3.5" />
              <span className="hidden @min-[470px]:inline">Here</span>
            </button>
            <button
              type="button"
              aria-pressed={noShow}
              aria-label="No-show"
              title={noShow ? 'No-show (click to undo)' : 'Mark no-show'}
              onClick={() => b.setStatus(seat, noShow ? 'confirmed' : 'no_show')}
              className={cn(
                'inline-flex h-6 items-center gap-1 rounded-[5px] px-2 text-[12px] font-medium transition-colors',
                noShow ? 'bg-zinc-100 text-zinc-800 ring-1 ring-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <LuUserX className="size-3.5" />
              <span className="hidden @min-[470px]:inline">No-show</span>
            </button>
          </div>
        ) : seat.status === 'present' ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700 dark:text-emerald-400">
            <LuCheck className="size-3.5" /> Here
          </span>
        ) : seat.status === 'no_show' ? (
          <span className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
            <LuUserX className="size-3.5" /> No-show
          </span>
        ) : null}
        {editable ? <SeatMenu seat={seat} v={v} /> : null}
      </div>
    </div>
  )
}

/** A seat's other actions: open the class, cancel or restore, move to another class this week, take out. */
export function SeatMenu({ seat, v, inSheet }: { seat: WithId<Session>; v: ClassView; inSheet?: boolean }) {
  const b = useBoard()
  const canceled = seat.status === 'canceled'
  // The rest of the week, from the seat's day: the classes the office can move it to.
  const days: DateKey[] = []
  for (let i = 0; i < 7; i++) {
    const d = addDays(seat.dateKey, i)
    if ((b.byDate.get(d) ?? []).length && b.canEdit(d)) days.push(d)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`More for ${seat.studentName}`}>
          <LuEllipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {!inSheet ? (
          <DropdownMenuItem onSelect={() => b.openClass(v.c.id)}>
            <LuSquareArrowOutUpRight /> Open the class
          </DropdownMenuItem>
        ) : null}
        {canceled ? (
          <DropdownMenuItem onSelect={() => b.setStatus(seat, 'confirmed')}>
            <LuRotateCcw /> Restore the seat
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onSelect={() => b.setStatus(seat, 'canceled')}>
            <LuBan /> Mark canceled (absent)
          </DropdownMenuItem>
        )}
        {!canceled && days.length ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <LuArrowRightLeft /> Move to another class
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
              {days.map((d) => (
                <div key={d}>
                  <DropdownMenuLabel className="text-xs">{formatDateKey(d, 'weekdayLong').replace(/, \d{4}$/, '')}</DropdownMenuLabel>
                  {(b.byDate.get(d) ?? []).map((x) => {
                    const left = freeSeats(x)
                    const here = x.c.id === v.c.id
                    const already = !here && x.seats.some((s) => s.studentId === seat.studentId && s.status !== 'canceled')
                    return (
                      <DropdownMenuItem key={x.c.id} disabled={here || already || left <= 0} onSelect={() => b.move(seat, x.c)}>
                        {classRange(x.c.startMin, x.c.endMin)}
                        <span className="ml-auto text-xs text-muted-foreground">{here ? 'This class' : already ? 'In it' : left > 0 ? `${left} open` : 'Full'}</span>
                      </DropdownMenuItem>
                    )
                  })}
                </div>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={() => b.removeSeat(seat)}>
          <LuTrash2 /> Take out of this class
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
