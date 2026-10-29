import { useEffect, useRef } from 'react'
import { LuArrowRight, LuCheck, LuInbox, LuPencil, LuPlus, LuRotateCcw, LuSend, LuSquareArrowOutUpRight, LuTriangleAlert, LuUserX, LuUsers } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { seatKind } from '@shared/schedule/classes'
import { type ClassRequest, REQUEST_KIND_LABELS } from '@shared/schedule/requests'
import { KIND_COLORS, levelColor } from '@shared/schedule/seatColors'
import { NO_COACH_ROW, type Span, type TimelinePerson, classPieces, clockSpan, gridColumns, gridHeight, rowHeights, timelineRange, timelineRows } from '@shared/schedule/timeline'
import { type DateKey, WEEKDAY_SHORT, formatDateKey, formatMinutes, formatMinutesShort, weekdayOf } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { type Board, REFUSAL, cellsOf, useBoard, useDragSource, useDropTarget } from './board'
import { SeatMenu } from './DayList'
import { CoachBadge, NowPill, SEAT_FILL, SeatCount, StatusDot, abbreviate, classRange, gradeLabel, seatVars } from './seatParts'
import type { ClassView, EventDoc } from './useClassData'

/**
 * The schedule as a timeline (V2, the owner's pick of the second round of designs, 2026-10-28): a row for each person
 * in that day, with their hours (white), the time they aren't in (grey) and their clock-in to clock-out (green, its end
 * dashed while they're still in) behind it, as HyberCRM draws it; each class is one block across the rows of the coaches
 * who teach it, its students as cards big enough to read and mark. The week is the same, a day under the other. The
 * sums (row order, pieces, heights) are in shared/src/schedule/timeline.ts.
 */

/** The people column: narrower on a smaller page, so more of the day fits. */
const nameWidth = (width: number) => (width >= 1200 ? 184 : 166)
const AXIS_H = 34
/** A row with nothing on it: a name and a clock-in. */
const ROW_MIN = 64
/** The space a class block leaves above and below itself in its rows. */
const INSET = 6
/** Inside a block: its padding, its header, the student cards and the gap between them. */
const PAD = 8
const HEAD_H = 28
const CARD_H = 56
const OPEN_H = 34
/** Open seats sit two or three across, narrower than a student's card. */
const OPEN_MIN_W = 92
const REQUEST_H = 48
const GAP = 6
const OVERFLOW_H = 22
/** The narrowest a student card gets before a block puts one per row. */
const CARD_MIN_W = 188
const EVENT_H = 30
/** Pixels a minute: at least enough for a one-hour class to hold a student's card; wider fills the page. */
const MIN_PPM = 3.4
const MAX_PPM = 6.5
/** The timeline needs this much room; narrower (a phone), the schedule shows its list as before. */
export const TIMELINE_MIN_WIDTH = 720

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const hourMarks = (lo: number, hi: number) => {
  const out: number[] = []
  for (let t = Math.ceil(lo / 60) * 60; t <= hi; t += 60) out.push(t)
  return out
}

// ----------------------------------------------------------------------------------------------------- the day's sums

interface Person extends TimelinePerson {
  role?: string
}

/** Who's in that day, the classes, the rows' order and the time the day shows. */
interface Frame {
  dateKey: DateKey
  classes: ClassView[]
  people: Map<string, Person>
  rows: string[]
  lo: number
  hi: number
}

/** A class block, or a piece of one when its coaches can't all sit together. */
interface Piece {
  v: ClassView
  rows: [number, number]
  /** The first piece holds the students; any other says it's the same class. */
  index: number
  of: number
  left: number
  width: number
  cols: number
  openCols: number
  top: number
  height: number
}

interface DayModel extends Frame {
  ppm: number
  nameW: number
  width: number
  heights: number[]
  tops: number[]
  pieces: Piece[]
  events: { e: WithId<EventDoc>; lane: number }[]
  eventLanes: number
}

function frameOf(b: Board, d: DateKey): Frame {
  const classes = b.byDate.get(d) ?? []
  const avail = b.inOn(d)
  const shifts = b.shiftsOn(d)
  const people = new Map<string, Person>()
  for (const a of avail) {
    const teaches = a.staffRole ? a.staffRole === 'coach' && b.teaches(a.staffId) : b.teaches(a.staffId)
    people.set(a.staffId, { id: a.staffId, teaches, firstMin: a.ranges[0]?.startMin ?? 0, name: b.staffName(a.staffId, a.staffName), role: a.staffRole })
  }
  for (const s of shifts) if (!people.has(s.staffId)) people.set(s.staffId, { id: s.staffId, teaches: b.teaches(s.staffId), firstMin: s.inMin, name: b.staffName(s.staffId, s.staffName) })
  const rows = timelineRows([...people.values()], classes.map((v) => ({ id: v.c.id, coachIds: v.coaches.map((k) => k.staffId) })))
  const spans: Span[] = [
    ...avail.flatMap((a) => a.ranges),
    ...classes.map((v) => ({ startMin: v.c.startMin, endMin: v.c.endMin })),
    ...b.eventsOn(d).map((e) => ({ startMin: e.startMin, endMin: e.endMin })),
    // A clock-in counts; so does its clock-out, or now while still in today (not a shift left open from another day).
    ...shifts.flatMap((s) => {
      const c = clockSpan(s, d, b.today, b.nowMin)
      return c ? [{ startMin: c.startMin, endMin: c.open && d !== b.today ? c.startMin + 30 : c.endMin }] : []
    }),
  ]
  const hours = b.hoursOf(d)
  const range = timelineRange(spans, hours.isOpen ? { startMin: hours.openMin, endMin: hours.closeMin } : { startMin: 16 * 60, endMin: 20 * 60 })
  return { dateKey: d, classes, people, rows, lo: range.startMin, hi: range.endMin }
}

/** How tall a class's students need its block to be: `cols` cards across, then its open seats `openCols` across. */
function blockNeed(b: Board, v: ClassView, cols: number, openCols: number): number {
  const { cells, open, overflow } = cellsOf(v.seats, v.c.seats)
  const cards = [...cells.map(() => CARD_H), ...b.requestsFor(v.c.id).map(() => REQUEST_H)]
  const seats = Array.from({ length: open }, () => OPEN_H)
  return (
    PAD +
    HEAD_H +
    (cards.length ? GAP + gridHeight(cards, cols, GAP) : 0) +
    (seats.length ? GAP + gridHeight(seats, openCols, GAP) : 0) +
    (overflow.length ? OVERFLOW_H : 0) +
    PAD
  )
}

function layoutDay(b: Board, f: Frame, ppm: number, nameW: number): DayModel {
  const x = (m: number) => (clamp(m, f.lo, f.hi) - f.lo) * ppm
  const width = Math.round((f.hi - f.lo) * ppm)
  const pieces: Omit<Piece, 'top' | 'height'>[] = []
  const needs: { rows: [number, number]; need: number }[] = []
  for (const v of f.classes) {
    const runs = classPieces(f.rows, v.coaches.map((k) => k.staffId))
    const left = Math.round(x(v.c.startMin)) + 2
    const w = Math.max(120, Math.round(x(v.c.endMin)) - left - 2)
    const cols = gridColumns(w - 2 * PAD, CARD_MIN_W, GAP)
    const openCols = Math.min(4, gridColumns(w - 2 * PAD, OPEN_MIN_W, GAP))
    runs.forEach((rows, index) => {
      pieces.push({ v, rows, index, of: runs.length, left, width: w, cols, openCols })
      needs.push({ rows, need: index === 0 ? blockNeed(b, v, cols, openCols) : PAD * 2 + HEAD_H + 22 })
    })
  }
  const heights = rowHeights(
    f.rows.map(() => ROW_MIN),
    needs,
    INSET,
  )
  const tops: number[] = []
  for (let i = 0; i < heights.length; i++) tops.push(i ? tops[i - 1] + heights[i - 1] : 0)
  const placed = pieces.map((p) => {
    const [a, z] = p.rows
    return { ...p, top: tops[a] + INSET, height: tops[z] + heights[z] - tops[a] - 2 * INSET }
  })
  // Events in lanes, so two at once both show.
  const ends: number[] = []
  const events = b.eventsOn(f.dateKey).map((e) => {
    let lane = ends.findIndex((end) => end <= e.startMin)
    if (lane < 0) lane = ends.push(e.endMin) - 1
    else ends[lane] = e.endMin
    return { e, lane }
  })
  return { ...f, ppm, nameW, width, heights, tops, pieces: placed, events, eventLanes: ends.length }
}

// ---------------------------------------------------------------------------------------------------------- the views

/** One day: its people's rows and the classes across them. Narrow pages show the list instead (DayList). */
export function TimelineDay({ dateKey, width }: { dateKey: DateKey; width: number }) {
  const b = useBoard()
  const ref = useRef<HTMLDivElement>(null)
  const f = frameOf(b, dateKey)
  const nameW = nameWidth(width)
  const m = layoutDay(b, f, clamp((width - nameW - 2) / (f.hi - f.lo), MIN_PPM, MAX_PPM), nameW)
  const editable = b.mode === 'admin' && b.canEdit(dateKey)
  // Today, on a page narrower than the day: start where it's happening (an hour before now).
  const startAt = dateKey === b.today && m.width + nameW > width ? Math.max(0, (b.nowMin - 60 - m.lo) * m.ppm) : 0
  useEffect(() => {
    const scroller = ref.current?.closest('[data-timeline-scroller]')
    if (scroller) scroller.scrollLeft = startAt
    // Only when the day changes: the office's own scrolling stays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey])

  if (!b.isOpen(dateKey) && !f.classes.length) {
    return <div className="hatch-off m-4 rounded-xl border border-dashed py-16 text-center text-sm text-muted-foreground">Closed on {formatDateKey(dateKey, 'weekdayLong').split(',')[0]}.</div>
  }
  return (
    <div ref={ref} className="min-w-full" style={{ width: nameW + m.width }} data-testid="timeline-day">
      {m.rows.length ? (
        <DayTimeline m={m} stickyAxis />
      ) : (
        <div className="sticky left-0 px-4 py-14 text-center text-sm text-muted-foreground" style={{ width: Math.min(width, nameW + m.width) }}>
          Nobody is in yet, and there are no classes.
        </div>
      )}
      {editable ? (
        <div className="sticky left-0 flex flex-wrap items-center gap-2 border-t px-3 py-3" style={{ width: Math.min(width - 2, nameW + m.width) }}>
          <Button variant="outline" size="sm" onClick={() => b.addClass(dateKey)}>
            <LuPlus /> Add a class
          </Button>
          <Button variant="ghost" size="sm" onClick={() => b.editWhosIn(dateKey)}>
            <LuUsers /> Who's in
          </Button>
        </div>
      ) : null}
    </div>
  )
}

type Group = { kind: 'open'; dateKey: DateKey } | { kind: 'closed'; days: DateKey[] }

/** The week: each day's timeline under the other (closed days folded into a line), with the days on a strip above. */
export function TimelineWeek({ days, width }: { days: DateKey[]; width: number }) {
  const b = useBoard()
  const groups: Group[] = []
  for (const d of days) {
    const open = b.isOpen(d) || (b.byDate.get(d) ?? []).length > 0
    const last = groups[groups.length - 1]
    if (open) groups.push({ kind: 'open', dateKey: d })
    else if (last?.kind === 'closed') last.days.push(d)
    else groups.push({ kind: 'closed', days: [d] })
  }
  const frames = new Map(groups.flatMap((g) => (g.kind === 'open' ? [[g.dateKey, frameOf(b, g.dateKey)] as const] : [])))
  // One scale for the whole week, so an hour is as wide on every day.
  const longest = Math.max(60, ...[...frames.values()].map((f) => f.hi - f.lo))
  const nameW = nameWidth(width)
  const ppm = clamp((width - nameW - 4) / longest, MIN_PPM, MAX_PPM)
  return (
    <div className="min-w-full pb-6" data-testid="timeline-week">
      <WeekStrip days={days} width={width} />
      {groups.map((g) =>
        g.kind === 'open' ? (
          <WeekDay key={g.dateKey} m={layoutDay(b, frames.get(g.dateKey) as Frame, ppm, nameW)} width={width} />
        ) : (
          <div key={g.days[0]} className="hatch-off sticky left-0 mt-5 flex h-10 items-center gap-2 rounded-xl border border-dashed px-4 text-sm text-muted-foreground" style={{ width: width - 2 }}>
            <span className="font-medium text-foreground">{g.days.map((d) => formatDateKey(d, 'weekdayLong').split(',')[0]).join(' and ')}</span> closed
          </div>
        ),
      )}
    </div>
  )
}

/** The week's days on a strip that stays on top: each with its classes, open seats and requests; click to go there. */
function WeekStrip({ days, width }: { days: DateKey[]; width: number }) {
  const b = useBoard()
  return (
    <div className="sticky top-0 left-0 z-40 grid grid-cols-7 border-b bg-background/95 backdrop-blur-sm" style={{ width }} data-testid="week-strip">
      {days.map((d) => {
        const classes = b.byDate.get(d) ?? []
        const open = b.isOpen(d) || classes.length > 0
        const seats = classes.reduce((n, v) => n + Math.max(0, v.c.seats - v.taken), 0)
        const requests = classes.reduce((n, v) => n + b.requestsFor(v.c.id).filter((r) => r.status === 'pending').length, 0)
        const noCoach = classes.some((v) => !v.coaches.length)
        const today = d === b.today
        return (
          <button
            key={d}
            type="button"
            disabled={!open}
            onClick={() => document.getElementById(`timeline-${d}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={cn('min-w-0 border-r px-3 py-2 text-left last:border-r-0 enabled:hover:bg-muted/60', !open && 'hatch-off')}
          >
            <div className={cn('text-[11px] font-semibold tracking-wide text-muted-foreground uppercase', today && 'text-brand-text')}>{WEEKDAY_SHORT[weekdayOf(d)]}</div>
            <div className={cn('text-lg leading-6 font-semibold tabular-nums', today && 'text-brand-text')}>{Number(d.slice(8))}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {!open ? 'Closed' : classes.length ? `${classes.length} classes · ${seats ? `${seats} open` : 'full'}` : 'No classes'}
              {requests ? <span className="font-semibold text-amber-700 dark:text-amber-400"> · {requests} request{requests > 1 ? 's' : ''}</span> : null}
              {noCoach ? <span className="font-semibold text-amber-700 dark:text-amber-400"> · no coach</span> : null}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function WeekDay({ m, width }: { m: DayModel; width: number }) {
  const b = useBoard()
  const d = m.dateKey
  const filled = m.classes.reduce((n, v) => n + v.taken, 0)
  const seats = m.classes.reduce((n, v) => n + v.c.seats, 0)
  const editable = b.mode === 'admin' && b.canEdit(d)
  const today = d === b.today
  return (
    <section id={`timeline-${d}`} aria-label={formatDateKey(d, 'weekdayLong')} className="scroll-mt-20 pt-5" data-testid={`timeline-${d}`}>
      <div className="sticky left-0 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-1" style={{ width: width - 2 }}>
        <h2 className={cn('text-base font-semibold tracking-tight', today && 'text-brand-text')}>{formatDateKey(d, 'weekdayLong').replace(/, \d{4}$/, '')}</h2>
        {today ? <span className="rounded-full bg-brand-solid px-2 py-0.5 text-[10px] font-semibold text-white">TODAY</span> : d < b.today ? <span className="text-xs text-muted-foreground">Past</span> : null}
        <span className="text-sm text-muted-foreground">
          {m.classes.length ? `${m.classes.length} classes · ${filled} of ${seats} seats` : 'No classes yet'}
        </span>
        <span className="ml-auto flex items-center gap-1">
          {editable ? (
            <>
              <Button variant="ghost" size="xs" onClick={() => b.editWhosIn(d)}>
                <LuUsers /> Who's in
              </Button>
              <Button variant="ghost" size="xs" onClick={() => b.addClass(d)}>
                <LuPlus /> Add a class
              </Button>
            </>
          ) : null}
          <Button variant="outline" size="xs" onClick={() => b.openDay(d)}>
            Open the day <LuArrowRight />
          </Button>
        </span>
      </div>
      {m.rows.length ? (
        <div className="overflow-clip rounded-xl border bg-card shadow-xs" style={{ width: m.nameW + m.width + 2 }}>
          <DayTimeline m={m} />
        </div>
      ) : (
        <div className="sticky left-0 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground" style={{ width: width - 2 }}>
          Nobody is in yet, and there are no classes.
        </div>
      )}
    </section>
  )
}

// ------------------------------------------------------------------------------------------------------- a day's rows

function DayTimeline({ m, stickyAxis }: { m: DayModel; stickyAxis?: boolean }) {
  const b = useBoard()
  const x = (min: number) => (clamp(min, m.lo, m.hi) - m.lo) * m.ppm
  const nowX = m.dateKey === b.today && b.nowMin >= m.lo && b.nowMin <= m.hi ? x(b.nowMin) : null
  const total = m.heights.reduce((n, h) => n + h, 0)
  const marks = hourMarks(m.lo, m.hi)
  // An hour's label, kept inside the axis; it gives way to the "now" pill.
  const labelAt = (t: number) => clamp(x(t), 20, m.width - 24)
  return (
    <div className="relative bg-card" style={{ width: m.nameW + m.width }}>
      <div className={cn('z-30 flex border-b bg-card', stickyAxis && 'sticky top-0')} style={{ height: AXIS_H }}>
        <div className="sticky left-0 z-10 flex shrink-0 items-center border-r bg-card px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase" style={{ width: m.nameW }}>
          Who's in
        </div>
        <div className="relative shrink-0" style={{ width: m.width }}>
          {marks
            .filter((t) => nowX === null || Math.abs(labelAt(t) - nowX) > 48)
            .map((t) => (
              <span key={t} className="absolute top-2.5 -translate-x-1/2 text-[11px] font-medium whitespace-nowrap text-muted-foreground" style={{ left: labelAt(t) }}>
                {formatMinutesShort(t)}
              </span>
            ))}
          {nowX !== null ? (
            <span className="absolute top-1.5 z-10 -translate-x-1/2 rounded-md bg-brand-solid px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap text-white tabular-nums" style={{ left: nowX }}>
              {formatMinutes(b.nowMin)}
            </span>
          ) : null}
        </div>
      </div>
      {m.events.length ? <EventsRow m={m} /> : null}
      <div className="relative" style={{ height: total }}>
        {m.rows.map((id, i) => (
          <PersonRow key={id} m={m} id={id} height={m.heights[i]} marks={marks} />
        ))}
        {nowX !== null ? <div className="pointer-events-none absolute top-0 bottom-0 z-[5] w-0.5 bg-brand-solid/80" style={{ left: m.nameW + nowX - 1 }} /> : null}
        {m.pieces.map((p) => (
          <ClassBlock key={`${p.v.c.id}-${p.index}`} p={p} nameW={m.nameW} />
        ))}
      </div>
    </div>
  )
}

/** The day's events, above the people (the office opens one to change it). */
function EventsRow({ m }: { m: DayModel }) {
  const b = useBoard()
  const x = (min: number) => (clamp(min, m.lo, m.hi) - m.lo) * m.ppm
  const height = 8 + m.eventLanes * (EVENT_H + 4)
  return (
    <div className="flex border-b" style={{ height }}>
      <div className="sticky left-0 z-20 flex shrink-0 items-center border-r bg-card px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase" style={{ width: m.nameW }}>
        Events
      </div>
      <div className="relative shrink-0 bg-sky-50/60 dark:bg-sky-950/20" style={{ width: m.width }}>
        {m.events.map(({ e, lane }) => {
          const left = x(e.startMin) + 2
          const w = Math.max(64, x(e.endMin) - left - 2)
          const body = (
            <>
              <span className="truncate text-xs font-semibold">{e.title}</span>
              {w > 150 ? <span className="shrink-0 text-[11px] text-sky-700 tabular-nums dark:text-sky-300">{classRange(e.startMin, e.endMin)}</span> : null}
            </>
          )
          const cls = 'absolute flex items-center gap-1.5 overflow-hidden rounded-lg bg-sky-100 px-2 text-sky-900 ring-1 ring-sky-200 dark:bg-sky-900/60 dark:text-sky-100 dark:ring-sky-800'
          const style = { left, width: w, top: 4 + lane * (EVENT_H + 4), height: EVENT_H }
          return b.openEvent ? (
            <button key={`${e.id}-${lane}`} type="button" className={cn(cls, 'text-left hover:bg-sky-200/70')} style={style} onClick={() => b.openEvent?.(e)} title={`${e.title}: open to change`}>
              {body}
            </button>
          ) : (
            <div key={`${e.id}-${lane}`} className={cls} style={style} title={e.title}>
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** A person's row: their name and clock-in on the left; behind the classes, their hours and their clocked-in stretch. */
function PersonRow({ m, id, height, marks }: { m: DayModel; id: string; height: number; marks: number[] }) {
  const b = useBoard()
  const x = (min: number) => (clamp(min, m.lo, m.hi) - m.lo) * m.ppm
  const hours = b.hoursOf(m.dateKey)
  const closed: [number, number][] = hours.isOpen
    ? ([
        [m.lo, Math.min(hours.openMin, m.hi)],
        [Math.max(hours.closeMin, m.lo), m.hi],
      ] as [number, number][]).filter(([a, z]) => z > a)
    : [[m.lo, m.hi]]
  const ranges = id === NO_COACH_ROW ? [] : (b.inOn(m.dateKey).find((a) => a.staffId === id)?.ranges ?? [])
  const clocks = id === NO_COACH_ROW ? [] : b.shiftsOn(m.dateKey).filter((s) => s.staffId === id)
  return (
    <div className="flex border-b" style={{ height }} data-testid={id === NO_COACH_ROW ? 'timeline-no-coach' : 'timeline-row'}>
      <WhoCell m={m} id={id} />
      <div className={cn('relative shrink-0', id === NO_COACH_ROW ? 'tl-none' : 'tl-off')} style={{ width: m.width }}>
        {ranges.map((r) => (
          <div key={`${r.startMin}-${r.endMin}`} className="absolute inset-y-1 rounded-lg bg-background ring-1 ring-border" style={{ left: x(r.startMin), width: Math.max(2, x(r.endMin) - x(r.startMin)) }} />
        ))}
        {marks.map((t) => (
          <span key={t} className="pointer-events-none absolute inset-y-0 w-px bg-border/70" style={{ left: x(t) }} />
        ))}
        {closed.map(([a, z]) => (
          <div key={a} className="tl-closed pointer-events-none absolute inset-y-0" style={{ left: x(a), width: x(z) - x(a) }} title="Closed" />
        ))}
        {clocks.map((s) => {
          const c = clockSpan(s, m.dateKey, b.today, b.nowMin)
          if (!c) return null
          const left = x(c.startMin)
          const w = Math.max(3, x(c.endMin) - left)
          return (
            <div
              key={s.id}
              className="tl-clock pointer-events-none absolute inset-y-0 z-[1]"
              style={{ left, width: w }}
              title={c.open ? `Clocked in at ${formatMinutes(s.inMin)}, still in` : `Clocked in ${formatMinutes(s.inMin)}, out ${formatMinutes(s.outMin ?? c.endMin)}`}
            >
              <span className={cn('absolute inset-y-0 -right-px w-[3px]', c.open ? 'tl-clock-live' : 'tl-clock-end')} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

const roleLabel = (role: string | undefined) => (role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : 'In, not teaching')

/** The left of a row: who, their role when they don't teach, and their clock-in as it happened. */
function WhoCell({ m, id }: { m: DayModel; id: string }) {
  const b = useBoard()
  const navigate = useNavigate()
  const editable = b.mode === 'admin' && b.canEdit(m.dateKey)
  const cell = 'sticky left-0 z-20 flex shrink-0 flex-col justify-center gap-1.5 border-r bg-card px-3 py-2 text-left'
  if (id === NO_COACH_ROW) {
    return (
      <div className={cell} style={{ width: m.nameW }}>
        <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
          <LuTriangleAlert className="size-4 shrink-0" /> No coach in
        </span>
        {editable ? (
          <button type="button" onClick={() => b.editWhosIn(m.dateKey)} className="w-fit text-xs text-muted-foreground hover:text-foreground hover:underline">
            Set who's in
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">Nobody is in for these classes</span>
        )}
      </div>
    )
  }
  const p = m.people.get(id)
  const name = p?.name ?? b.staffName(id)
  const shifts = b.shiftsOn(m.dateKey).filter((s) => s.staffId === id)
  const live = m.dateKey === b.today && shifts.some((s) => s.status === 'open')
  const hasHours = b.inOn(m.dateKey).some((a) => a.staffId === id)
  const body = (
    <>
      <span className="flex min-w-0 items-center gap-2">
        <span className="relative shrink-0">
          <CoachBadge name={name} color={b.staffColor(id)} />
          {live ? <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-emerald-500" title="Clocked in" /> : null}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold">{name}</span>
          {p && !p.teaches ? <span className="block truncate text-[11px] text-muted-foreground">{roleLabel(p.role)}</span> : null}
        </span>
      </span>
      {shifts.length ? (
        <span className="flex flex-wrap gap-1">
          {shifts.map((s) =>
            s.status === 'open' && m.dateKey === b.today ? (
              <span key={s.id} className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-px text-[11px] font-medium whitespace-nowrap text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-900">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                In {formatMinutes(s.inMin)}
              </span>
            ) : (
              <span key={s.id} className="inline-flex w-fit rounded-full bg-muted px-1.5 py-px text-[11px] font-medium whitespace-nowrap text-muted-foreground tabular-nums">
                {s.outMin == null ? `In ${formatMinutes(s.inMin)}` : `${formatMinutes(s.inMin)} – ${formatMinutes(s.outMin)}`}
              </span>
            ),
          )}
        </span>
      ) : b.mode === 'admin' && hasHours && m.dateKey < b.today ? (
        <span className="text-[11px] text-muted-foreground">No clock-in</span>
      ) : null}
    </>
  )
  if (b.mode !== 'admin') return <div className={cell} style={{ width: m.nameW }}>{body}</div>
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn(cell, 'transition-colors hover:bg-muted/60')} style={{ width: m.nameW }} title={name}>
          {body}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        {editable ? (
          <DropdownMenuItem onSelect={() => b.editWhosIn(m.dateKey)}>
            <LuPencil /> Edit who's in this day
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(`/admin/employees/directory/${id}`)}>
          <LuSquareArrowOutUpRight /> Open {name.split(' ')[0]}'s page
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ------------------------------------------------------------------------------------------------------ a class block

/** A class across its coaches' rows: its time and seats on top, then its students. Drop a student here to move them. */
function ClassBlock({ p, nameW }: { p: Piece; nameW: number }) {
  const b = useBoard()
  const { v } = p
  const { c } = v
  const drop = useDropTarget(v)
  const now = c.dateKey === b.today && b.nowMin >= c.startMin && b.nowMin < c.endMin
  const notMine = !!b.me && !v.coaches.some((k) => k.staffId === b.me)
  const requests = b.requestsFor(c.id)
  // Those waiting on the office (a class suggested to a family shows too, but waits on them).
  const waiting = requests.filter((r) => r.status === 'pending').length
  const { cells, open, overflow } = cellsOf(v.seats, c.seats)
  return (
    <div
      {...drop.props}
      className={cn(
        'absolute z-10 flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-[opacity,box-shadow,border-color]',
        p.of > 1 && 'border-dashed border-foreground/30',
        !v.coaches.length && 'border-amber-300 dark:border-amber-800',
        now && 'border-brand/50 ring-1 ring-brand/25',
        notMine && 'opacity-60',
        drop.dragging && drop.refused && !drop.hovered && 'opacity-40',
        drop.hovered && drop.ok && 'border-brand ring-[3px] ring-brand/20',
      )}
      style={{ left: nameW + p.left, top: p.top, width: p.width, height: p.height }}
      data-testid="class-block"
    >
      <button
        type="button"
        data-class-time={c.id}
        onClick={() => b.openClass(c.id)}
        className="group/head mx-1 mt-1 flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg px-1.5 text-left transition-colors hover:bg-muted/70"
        title="Open the class"
      >
        <span className="text-[15px] font-semibold whitespace-nowrap tabular-nums group-hover/head:underline group-hover/head:underline-offset-4">{classRange(c.startMin, c.endMin)}</span>
        {now ? <NowPill /> : null}
        {waiting ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-50 px-1.5 text-[11px] leading-5 font-semibold text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-900" title={`${waiting} request${waiting > 1 ? 's' : ''} waiting`}>
            <LuInbox className="size-3" />
            {waiting}
          </span>
        ) : null}
        <SeatCount used={v.taken} of={c.seats} className="ml-auto shrink-0" />
      </button>
      {p.index === 0 ? (
        <div className="min-h-0 flex-1 px-2 pt-1.5 pb-2">
          {cells.length || requests.length ? (
            <div className="grid items-start gap-1.5" style={{ gridTemplateColumns: `repeat(${p.cols}, minmax(0, 1fr))` }}>
              {cells.map((s) => (
                <StudentCard key={s.id} seat={s} v={v} />
              ))}
              {requests.map((r) => (
                <RequestCard key={r.id} r={r} />
              ))}
            </div>
          ) : null}
          {open ? (
            <div className={cn('grid gap-1.5', (cells.length || requests.length) && 'mt-1.5')} style={{ gridTemplateColumns: `repeat(${p.openCols}, minmax(0, 1fr))` }}>
              {Array.from({ length: open }, (_, i) => (
                <OpenSeatCard key={`open-${i}`} v={v} target={drop.ok} landing={drop.ok && drop.hovered && i === 0} />
              ))}
            </div>
          ) : null}
          {overflow.length ? (
            <div className="truncate px-1 pt-1.5 text-xs text-muted-foreground">
              Also canceled: <span className="line-through">{overflow.map((s) => s.studentName).join(', ')}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="px-2.5 pt-1 text-xs text-muted-foreground">The same class: its coaches aren’t next to each other, so it shows in {p.of} parts. Its students are in the first.</p>
      )}
      {drop.hovered && drop.refused ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/60">
          <span className="rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background shadow">{REFUSAL[drop.refused]}</span>
        </div>
      ) : null}
    </div>
  )
}

/**
 * A student in a class, as a card: their name, their level in its colour (or the label's colour for a make-up, practice
 * or trial), their rifle and grade, how they're marked, and their actions (⋯). Drag it to another class to move them.
 */
function StudentCard({ seat, v }: { seat: WithId<Session>; v: ClassView }) {
  const b = useBoard()
  const source = useDragSource(seat)
  const st = b.student(seat.studentId)
  const level = st?.level ?? null
  const kind = seatKind(seat.note)
  const special = kind !== 'regular'
  const canceled = seat.status === 'canceled'
  const present = seat.status === 'present'
  const noShow = seat.status === 'no_show'
  const own = seat.startMin !== v.c.startMin || seat.endMin !== v.c.endMin ? classRange(seat.startMin, seat.endMin) : null
  const label = (seat.note ?? '').trim()
  const editable = b.mode === 'admin' && b.canEdit(seat.dateKey)
  // Here and no-show belong to the class's day: a class next week has nothing to mark yet.
  const markable = editable && seat.dateKey <= b.today && !canceled
  const grade = gradeLabel(st?.grade ?? seat.studentGrade)
  const color = special ? KIND_COLORS[kind] : levelColor(level, b.levels)
  const open = () => b.openClass(v.c.id)
  return (
    <div
      data-seat-id={seat.id}
      {...source}
      className={cn(
        '@container flex h-[56px] min-w-0 flex-col justify-center gap-1 overflow-hidden rounded-lg pr-1 ring-1 ring-black/[0.07] ring-inset dark:ring-white/[0.07]',
        canceled ? 'bg-muted/70 text-muted-foreground' : SEAT_FILL,
        special && level && !canceled ? 'pl-3' : 'pl-2.5',
        source.draggable && 'cursor-grab active:cursor-grabbing',
        b.lifted === seat.id && 'opacity-30',
      )}
      style={{ ...(canceled ? {} : seatVars(color)), boxShadow: special && level && !canceled ? `inset 4px 0 0 ${levelColor(level, b.levels).dot}` : undefined }}
      data-testid="student-card"
    >
      <div className="flex h-6 min-w-0 items-center gap-1">
        <button
          type="button"
          onClick={open}
          className={cn('min-w-0 truncate text-left text-[14px] leading-5 font-semibold hover:underline hover:underline-offset-2', canceled && 'line-through decoration-[1.5px]', noShow && 'opacity-60')}
          title={`${seat.studentName}: open the class`}
        >
          {seat.studentName}
        </button>
        {!markable ? <StatusDot status={seat.status} /> : null}
        <span className="min-w-0 flex-1" />
        {editable ? <SeatMenu seat={seat} v={v} compact /> : null}
      </div>
      <div className="flex h-6 min-w-0 items-center gap-1">
        <button type="button" onClick={open} className="min-w-0 flex-1 truncate text-left text-[12px] leading-4 opacity-85" tabIndex={-1}>
          {special ? <span className="font-semibold">{label || KIND_COLORS[kind].name} · </span> : null}
          {level ? (
            <>
              <span className="@min-[270px]:hidden">{abbreviate(level)}</span>
              <span className="hidden @min-[270px]:inline">{level}</span>
            </>
          ) : (
            'New'
          )}
          {st?.rifle ? <span className="font-semibold"> · {st.rifle}</span> : null}
          {grade ? ` · ${grade}` : ''}
          {own ? ` · ${own}` : ''}
          {label && !special ? ` · ${label}` : ''}
        </button>
        {markable ? (
          <span className="flex shrink-0 items-center gap-px overflow-hidden rounded-md bg-background/85 ring-1 ring-black/5 dark:bg-background/45 dark:ring-white/10" role="group" aria-label="Mark">
            <button
              type="button"
              aria-pressed={present}
              aria-label={`${seat.studentName}: here`}
              title={present ? 'Here (click to undo)' : 'Mark here'}
              onClick={() => b.setStatus(seat, present ? 'confirmed' : 'present')}
              className={cn('inline-flex size-6 items-center justify-center transition-colors', present ? 'bg-emerald-600 text-white' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
            >
              <LuCheck className="size-3.5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              aria-pressed={noShow}
              aria-label={`${seat.studentName}: no-show`}
              title={noShow ? 'No-show (click to undo)' : 'Mark no-show'}
              onClick={() => b.setStatus(seat, noShow ? 'confirmed' : 'no_show')}
              className={cn('inline-flex size-6 items-center justify-center transition-colors', noShow ? 'bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}
            >
              <LuUserX className="size-3.5" />
            </button>
          </span>
        ) : canceled && editable ? (
          <Button variant="ghost" size="icon-xs" aria-label={`Restore ${seat.studentName}`} title="Restore the seat" onClick={() => b.setStatus(seat, 'confirmed')}>
            <LuRotateCcw />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

/** "Makeup for Oct 26", "Move from Nov 2", "Extra class". */
function requestWhat(r: Pick<ClassRequest, 'kind' | 'forDateKey'>): string {
  if (r.kind === 'makeup' && r.forDateKey) return `Makeup for ${formatDateKey(r.forDateKey, 'monthDay')}`
  if (r.kind === 'reschedule' && r.forDateKey) return `Move from ${formatDateKey(r.forDateKey, 'monthDay')}`
  return REQUEST_KIND_LABELS[r.kind]
}

/**
 * A family's request for this class, waiting for the office: open it to approve, decline or suggest another class. Or
 * this class suggested to a family, waiting for their answer (its seat isn't held for them).
 */
function RequestCard({ r }: { r: WithId<ClassRequest> }) {
  const b = useBoard()
  const offered = r.status === 'offered'
  return (
    <button
      type="button"
      onClick={() => b.openRequest(r.id)}
      className={cn(
        'flex h-[48px] min-w-0 items-center gap-2 rounded-lg border border-dashed px-2.5 text-left transition-colors',
        offered
          ? 'border-sky-300 bg-sky-50/70 text-sky-900 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/70'
          : 'border-amber-400 bg-amber-50/80 text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70',
      )}
      title={offered ? 'Suggested to this family: waiting for their answer' : 'A family’s request: open it to approve, decline or suggest another class'}
      data-testid="request-card"
    >
      {offered ? <LuSend className="size-4 shrink-0" /> : <LuInbox className="size-4 shrink-0" />}
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[13px] font-semibold">{r.studentName}</span>
        <span className="block truncate text-[11.5px] opacity-80">{offered ? 'Suggested · waiting on the family' : `${requestWhat(r)} · waiting`}</span>
      </span>
    </button>
  )
}

/** An unused seat, hatched as the sheets blacken them: the office clicks it to add a student; while dragging, it's where they land. */
function OpenSeatCard({ v, target, landing }: { v: ClassView; target: boolean; landing: boolean }) {
  const b = useBoard()
  const editable = b.mode === 'admin' && b.canEdit(v.c.dateKey)
  return (
    <button
      type="button"
      data-open-seat={v.c.id}
      disabled={!editable}
      onClick={() => b.addSeat(v.c.id)}
      aria-label={editable ? 'Add a student to this seat' : 'Open seat'}
      title={editable ? 'Add a student to this seat' : 'Open seat'}
      className={cn(
        'hatch-empty flex h-[34px] min-w-0 items-center justify-center gap-1 rounded-lg border border-dashed border-foreground/15 text-[12.5px] text-muted-foreground transition-colors',
        editable && 'hover:border-foreground/35 hover:bg-muted/70 hover:text-foreground',
        target && 'border-brand/50 bg-brand/[0.04] text-brand-text',
        landing && 'border-solid border-brand bg-brand/10',
      )}
    >
      {/* The content never takes the pointer: swapping it under a drag would make the browser drop the move. */}
      <span className="pointer-events-none flex items-center gap-1.5">
        {landing ? (
          <span className="font-semibold">Move here</span>
        ) : editable ? (
          <>
            <LuPlus className="size-3.5" /> Add
          </>
        ) : (
          'Open'
        )}
      </span>
    </button>
  )
}
