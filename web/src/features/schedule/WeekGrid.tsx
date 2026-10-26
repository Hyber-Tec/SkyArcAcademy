import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useState } from 'react'
import { LuPencil, LuPlus } from 'react-icons/lu'
import { seatKind } from '@shared/schedule/classes'
import { KIND_COLORS, levelColor } from '@shared/schedule/seatColors'
import { SESSION_STATUS_LABELS } from '@shared/schedule/status'
import { type DateKey, WEEKDAY_SHORT, formatDateKey, formatMinutesShort, weekdayOf } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useElementWidth } from '@/hooks/use-element-width'
import { cn } from '@/lib/utils'
import { REFUSAL, cellsOf, freeSeats, useBoard, useDragSource, useDropTarget } from './board'
import { CoachBadge, NowPill, SEAT_FILL, StatusDot, abbreviate, gradeLabel, seatVars, shortName } from './seatParts'
import type { ClassView } from './useClassData'

const GAP = 12
const MARKER = 28
/** The narrowest a day gets; below that the week scrolls sideways inside its own box. */
const MIN_DAY = 180
/** A day narrower than this puts the class time on top, so the seats keep room for a name. */
const SIDE_MIN = 220
/** A day this wide gets taller cells and larger names (the office's big screens). */
const ROOMY_MIN = 240

/** "4:30", "4–8": the academy's hours are all in the afternoon, so the sheets leave the PM off. */
const clock = (min: number) => formatMinutesShort(min).replace(/\s?[AP]M$/i, '')
const span = (a: number, b: number) => `${clock(a)}–${clock(b)}`

type Group = { kind: 'open'; dateKey: DateKey } | { kind: 'closed'; days: DateKey[] }

/**
 * The week as the academy's sheet lays it out: a column per open day with who's in at the top, then each class as a
 * block with its time on the left and its seats two across, coloured by level. Closed days fold into one slim marker.
 */
export function WeekGrid({ days }: { days: DateKey[] }) {
  const b = useBoard()
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const [box, setBox] = useState<HTMLDivElement | null>(null)
  const setRefs = useCallback(
    (el: HTMLDivElement | null) => {
      ref(el)
      setBox(el)
    },
    [ref],
  )
  const [edges, setEdges] = useState({ left: false, right: false })
  const onScroll = useCallback(() => {
    if (!box) return
    const left = box.scrollLeft > 1
    const right = box.scrollLeft + box.clientWidth < box.scrollWidth - 1
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }))
  }, [box])
  useEffect(onScroll, [onScroll, width])

  const groups: Group[] = []
  for (const d of days) {
    const open = b.isOpen(d) || (b.byDate.get(d) ?? []).length > 0
    const last = groups[groups.length - 1]
    if (open) groups.push({ kind: 'open', dateKey: d })
    else if (last?.kind === 'closed') last.days.push(d)
    else groups.push({ kind: 'closed', days: [d] })
  }
  const open = groups.filter((g) => g.kind === 'open').length
  const closed = groups.length - open
  const columns = width >= 768
  const dayWidth = !width ? 0 : columns ? Math.max(MIN_DAY, (width - (groups.length - 1) * GAP - closed * MARKER) / Math.max(1, open)) : width
  const side = !dayWidth || dayWidth >= SIDE_MIN
  const roomy = !dayWidth || dayWidth >= ROOMY_MIN
  const template = groups.map((g) => (g.kind === 'open' ? `minmax(${MIN_DAY}px, 1fr)` : `${MARKER}px`)).join(' ')
  return (
    <div className="relative">
      <div ref={setRefs} onScroll={onScroll} className="md:overflow-x-auto" data-testid="week-grid">
        <div
          className="flex flex-col gap-6 md:grid md:grid-rows-[auto_1fr] md:gap-x-3 md:gap-y-2.5 md:[grid-template-columns:var(--days)]"
          style={{ '--days': template } as CSSProperties}
        >
          {groups.map((g) =>
            g.kind === 'open' ? <DayColumn key={g.dateKey} dateKey={g.dateKey} side={side} roomy={roomy} /> : <ClosedMarker key={g.days[0]} days={g.days} />,
          )}
        </div>
      </div>
      {edges.left ? <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-8 bg-linear-to-r from-background to-transparent md:block" /> : null}
      {edges.right ? <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-10 bg-linear-to-l from-background to-transparent md:block" /> : null}
    </div>
  )
}

function DayColumn({ dateKey, side, roomy }: { dateKey: DateKey; side: boolean; roomy: boolean }) {
  const b = useBoard()
  const classes = b.byDate.get(dateKey) ?? []
  return (
    <section aria-label={formatDateKey(dateKey, 'weekdayLong')} className="flex min-w-0 flex-col gap-2.5 md:row-span-2 md:grid md:grid-rows-subgrid" data-testid={`day-${dateKey}`}>
      <DayHeader dateKey={dateKey} />
      <div className="flex min-w-0 flex-col gap-2">
        {classes.map((v) => (
          <WeekClass key={v.c.id} v={v} side={side} roomy={roomy} />
        ))}
        {!classes.length ? <div className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">No classes</div> : null}
        {b.mode === 'admin' && b.canEdit(dateKey) ? (
          <button
            type="button"
            onClick={() => b.addClass(dateKey)}
            className="flex h-7 items-center justify-center gap-1 rounded-md border border-transparent text-[11px] font-medium text-muted-foreground/70 transition-colors hover:border-dashed hover:border-border hover:text-foreground"
          >
            <LuPlus className="size-3" /> Add class
          </button>
        ) : null}
      </div>
    </section>
  )
}

/** The day, its open seats, then who's in with their hours (the office clicks it to change them). */
function DayHeader({ dateKey }: { dateKey: DateKey }) {
  const b = useBoard()
  const classes = b.byDate.get(dateKey) ?? []
  const open = classes.reduce((n, v) => n + freeSeats(v), 0)
  const today = dateKey === b.today
  const inOn = b.inOn(dateKey)
  const editable = b.mode === 'admin' && b.canEdit(dateKey)
  const events = b.eventsOn(dateKey)
  const body = (
    <>
      <span className="mb-0.5 flex items-center justify-between text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        Who's in
        {editable ? (
          <span className="flex items-center gap-1 font-medium tracking-normal normal-case opacity-0 transition-opacity group-hover/duty:opacity-100">
            <LuPencil className="size-3" /> Edit
          </span>
        ) : null}
      </span>
      {inOn.length ? (
        inOn.map((a) => {
          const name = b.staffName(a.staffId, a.staffName)
          return (
            <span key={a.id} className="flex h-[22px] min-w-0 items-center gap-1.5 text-[12px]">
              <CoachBadge name={name} color={b.staffColor(a.staffId)} size="xs" />
              <span className="min-w-0 truncate font-medium">{name.split(' ')[0]}</span>
              {a.staffRole && a.staffRole !== 'coach' ? <span className="shrink-0 text-[10px] text-muted-foreground">{a.staffRole === 'owner' ? 'Owner' : 'Admin'}</span> : null}
              <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">{a.ranges.map((r) => span(r.startMin, r.endMin)).join(', ')}</span>
            </span>
          )
        })
      ) : (
        <span className="flex h-[22px] items-center text-[12px] font-medium text-amber-700 dark:text-amber-400">Nobody in yet</span>
      )}
    </>
  )
  return (
    <header className="flex min-w-0 flex-col gap-1.5">
      <div className="flex h-6 items-center gap-1.5 px-0.5">
        <button type="button" onClick={() => b.openDay(dateKey)} className="group/day flex min-w-0 items-baseline gap-1.5 text-left" title={`Open ${formatDateKey(dateKey, 'weekdayLong')}`}>
          <span className={cn('truncate text-[15px] font-semibold group-hover/day:underline group-hover/day:underline-offset-4', today && 'text-brand-text')}>
            {WEEKDAY_SHORT[weekdayOf(dateKey)]}
          </span>
          <span className="shrink-0 text-[13px] text-muted-foreground">{formatDateKey(dateKey, 'monthDay')}</span>
        </button>
        {today ? <span className="shrink-0 rounded-full bg-brand-solid px-1.5 text-[10px] leading-4 font-semibold text-white">Today</span> : null}
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground tabular-nums">{classes.length ? (open ? `${open} open` : 'Full') : ''}</span>
      </div>
      {events.length ? (
        <div className="space-y-0.5">
          {events.map((e) => (
            <div key={e.id} className="truncate rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950/40 dark:text-sky-300" title={e.title}>
              {e.title} · {span(e.startMin, e.endMin)}
            </div>
          ))}
        </div>
      ) : null}
      {editable ? (
        <button
          type="button"
          data-whos-in={dateKey}
          onClick={() => b.editWhosIn(dateKey)}
          className="group/duty flex flex-1 flex-col rounded-lg border bg-card px-2 pt-1.5 pb-1 text-left transition-colors hover:border-foreground/20 hover:bg-muted/50"
        >
          {body}
        </button>
      ) : (
        <div className="flex flex-1 flex-col rounded-lg border bg-card px-2 pt-1.5 pb-1">{body}</div>
      )}
    </header>
  )
}

/** Friday and Saturday: one slim, quiet marker instead of two empty columns. */
function ClosedMarker({ days }: { days: DateKey[] }) {
  const label = days.length > 1 ? `${WEEKDAY_SHORT[weekdayOf(days[0])]}–${WEEKDAY_SHORT[weekdayOf(days[days.length - 1])]}` : WEEKDAY_SHORT[weekdayOf(days[0])]
  return (
    <div className="hatch-off flex items-center justify-center rounded-lg border border-dashed px-3 py-2 text-[11px] font-medium text-muted-foreground md:row-span-2 md:px-0 md:py-4" title={`${label}: closed`}>
      <span className="tracking-wide whitespace-nowrap md:rotate-180 md:[writing-mode:vertical-rl]">{label} closed</span>
    </div>
  )
}

/** A class on the sheet: its time, then its seats (two across). Drop a student here to move them. */
function WeekClass({ v, side, roomy }: { v: ClassView; side: boolean; roomy: boolean }) {
  const b = useBoard()
  const drop = useDropTarget(v)
  const { c } = v
  const { cells, open, overflow } = cellsOf(v.seats, c.seats)
  const now = c.dateKey === b.today && b.nowMin >= c.startMin && b.nowMin < c.endMin
  const full = v.taken >= c.seats
  const notMine = !!b.me && !v.coaches.some((k) => k.staffId === b.me)
  return (
    <div
      {...drop.props}
      className={cn(
        'relative flex min-w-0 overflow-hidden rounded-lg border bg-card shadow-xs transition-[opacity,box-shadow,border-color]',
        !side && 'flex-col',
        notMine && 'opacity-60',
        now && 'border-brand/40',
        drop.dragging && drop.refused && !drop.hovered && 'opacity-40',
        drop.hovered && drop.ok && 'border-brand ring-[3px] ring-brand/20',
      )}
      data-testid="class-block"
    >
      <button
        type="button"
        data-class-time={c.id}
        onClick={() => b.openClass(c.id)}
        title="Open this class"
        className={cn(
          'group/time flex shrink-0 bg-muted/60 text-left transition-colors hover:bg-muted',
          side ? cn('flex-col items-start border-r px-1 pt-1.5 pb-1', roomy ? 'w-[52px] px-1.5' : 'w-12') : 'h-7 items-center gap-1 border-b px-2',
        )}
      >
        {side ? (
          <>
            <span className={cn('leading-4 font-semibold tabular-nums group-hover/time:underline group-hover/time:underline-offset-2', roomy ? 'text-[14px]' : 'text-[13px]')}>{clock(c.startMin)}</span>
            <span className="text-[11px] leading-4 text-muted-foreground tabular-nums">–{clock(c.endMin)}</span>
            {now ? <NowPill className="mt-1" /> : null}
            <span className={cn('mt-auto text-[11px] leading-4 font-medium tabular-nums', full ? 'text-foreground' : 'text-muted-foreground')}>
              {v.taken}/{c.seats}
            </span>
            <CoachStack v={v} grid className="mt-0.5" />
          </>
        ) : (
          <>
            <span className="text-[12px] font-semibold whitespace-nowrap tabular-nums group-hover/time:underline group-hover/time:underline-offset-2">{span(c.startMin, c.endMin)}</span>
            {now ? <NowPill compact /> : null}
            <span className={cn('ml-auto text-[11px] font-medium tabular-nums', full ? 'text-foreground' : 'text-muted-foreground')}>
              {v.taken}/{c.seats}
            </span>
            <CoachStack v={v} />
          </>
        )}
      </button>
      <div className="min-w-0 flex-1 p-[3px]">
        <div className="grid grid-cols-2 gap-[3px]">
          {cells.map((s) => (
            <WeekSeat key={s.id} seat={s} v={v} roomy={roomy} />
          ))}
          {Array.from({ length: open }, (_, i) => (
            <OpenSeat key={`open-${i}`} v={v} roomy={roomy} target={drop.ok} landing={drop.ok && drop.hovered && i === 0} />
          ))}
        </div>
        {overflow.length ? (
          <div className="truncate px-1 pt-1 text-[10px] text-muted-foreground">
            Canceled: <span className="line-through">{overflow.map((s) => shortName(s.studentName)).join(', ')}</span>
          </div>
        ) : null}
      </div>
      {drop.hovered && drop.refused ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60">
          <span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-semibold text-background shadow">{REFUSAL[drop.refused]}</span>
        </div>
      ) : null}
    </div>
  )
}

/** The coaches teaching a class, as small badges: two across in the narrow time column, or in a row. */
function CoachStack({ v, grid, className }: { v: ClassView; grid?: boolean; className?: string }) {
  const b = useBoard()
  if (!v.coaches.length) return <span className={cn('text-[10px] font-semibold text-amber-700 dark:text-amber-400', className)}>No coach</span>
  return (
    <span className={cn(grid ? 'grid w-fit grid-cols-2 gap-0.5' : 'flex shrink-0 items-center gap-px', className)}>
      {v.coaches.map((k) => {
        const name = b.staffName(k.staffId, k.name)
        return <CoachBadge key={k.staffId} name={name} color={b.staffColor(k.staffId)} size="xs" className={grid ? undefined : 'size-4 text-[7px]'} />
      })}
    </span>
  )
}

/** A seat as the sheet colours it: the level (or the label's colour for a make-up, practice or trial), then the name. */
function WeekSeat({ seat, v, roomy }: { seat: WithId<Session>; v: ClassView; roomy: boolean }) {
  const b = useBoard()
  const source = useDragSource(seat)
  const st = b.student(seat.studentId)
  const level = st?.level ?? null
  const kind = seatKind(seat.note)
  const special = kind !== 'regular'
  const color = special ? KIND_COLORS[kind] : levelColor(level, b.levels)
  const canceled = seat.status === 'canceled'
  const own = seat.startMin !== v.c.startMin || seat.endMin !== v.c.endMin ? span(seat.startMin, seat.endMin) : null
  const top = special ? (seat.note ?? '').trim() || KIND_COLORS[kind].name : level ? `${abbreviate(level)}${st?.rifle ? ` ${st.rifle}` : ''}` : 'New'
  const open = () => b.openClass(v.c.id)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          data-seat-id={seat.id}
          {...source}
          onClick={open}
          onKeyDown={(e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), open())}
          className={cn(
            'relative flex min-w-0 flex-col justify-center rounded-[5px] px-1.5 text-left outline-offset-1 select-none',
            SEAT_FILL,
            roomy ? 'h-[44px]' : 'h-[38px]',
            source.draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
            canceled && 'opacity-45',
            seat.status === 'no_show' && 'opacity-70',
            b.lifted === seat.id && 'opacity-30',
          )}
          style={{
            ...seatVars(color),
            boxShadow: `${special && level ? `inset 3px 0 0 ${levelColor(level, b.levels).dot}, ` : ''}inset 0 0 0 1px rgb(0 0 0 / 0.06)`,
          }}
        >
          <span className={cn('flex min-w-0 items-center gap-1', roomy ? 'text-[10.5px] leading-[14px]' : 'text-[10px] leading-[13px]')}>
            <span className={cn('min-w-0 truncate', special ? 'font-semibold' : 'font-medium opacity-80')}>{top}</span>
            {own ? <span className="ml-auto shrink-0 font-medium tabular-nums opacity-90">{own}</span> : null}
            <StatusDot status={seat.status} className={own ? undefined : 'ml-auto'} />
          </span>
          <span className={cn('truncate font-semibold', roomy ? 'text-[12.5px] leading-[17px]' : 'text-[11.5px] leading-[15px]', canceled && 'line-through decoration-[1.5px]')}>
            {shortName(seat.studentName)}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        <div className="space-y-0.5 py-0.5">
          <div className="font-semibold">
            {seat.studentName} <span className="font-normal opacity-70">· {gradeLabel(st?.grade ?? seat.studentGrade)}</span>
          </div>
          <div className="opacity-80">
            {level ?? 'No level yet'}
            {st?.rifle ? ` · ${st.rifle}` : level ? ' · own rifle' : ''}
          </div>
          {special || own ? <div className="opacity-80">{[special ? (seat.note ?? '').trim() : null, own].filter(Boolean).join(' · ')}</div> : null}
          {seat.status !== 'confirmed' ? <div className="opacity-80">{SESSION_STATUS_LABELS[seat.status]}</div> : null}
          <div className="pt-1 text-[10px] opacity-60">{source.draggable ? 'Drag to move · click to open the class' : 'Click to open the class'}</div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/** An unused seat, hatched as the sheets blacken them: the office clicks it to put a student in; while dragging, it's where they land. */
function OpenSeat({ v, roomy, target, landing }: { v: ClassView; roomy: boolean; target: boolean; landing: boolean }) {
  const b = useBoard()
  const editable = b.mode === 'admin' && b.canEdit(v.c.dateKey)
  return (
    <button
      type="button"
      data-open-seat={v.c.id}
      disabled={!editable}
      onClick={() => b.addSeat(v.c.id)}
      aria-label="Add a student to this seat"
      className={cn(
        'hatch-empty group/open flex items-center justify-center rounded-[5px] border border-dashed border-foreground/15 text-muted-foreground transition-colors',
        editable && 'hover:border-foreground/35 hover:bg-muted/70 hover:text-foreground',
        roomy ? 'h-[44px]' : 'h-[38px]',
        target && 'border-brand/50 bg-brand/[0.04] text-brand-text',
        landing && 'border-solid border-brand bg-brand/10',
      )}
    >
      {/* The content never takes the pointer: swapping it under a drag would make the browser drop the move. */}
      <span className="pointer-events-none flex items-center">
        {landing ? (
          <span className="text-[11px] font-semibold">Move here</span>
        ) : editable ? (
          <LuPlus className={cn('size-3.5 transition-opacity', target ? 'opacity-70' : 'opacity-0 group-hover/open:opacity-100 group-focus-visible/open:opacity-100')} />
        ) : null}
      </span>
    </button>
  )
}
