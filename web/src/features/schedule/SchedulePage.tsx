import { query, where } from 'firebase/firestore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { LuCalendarCog, LuCalendarDays, LuChevronLeft, LuChevronRight, LuClock, LuCopyPlus, LuEllipsisVertical, LuPanelRightClose, LuPanelRightOpen, LuPlus, LuTrash2 } from 'react-icons/lu'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { MAKEUP_LOOKBACK_DAYS, makeupsOwed } from '@shared/schedule/classes'
import type { ClassRequest } from '@shared/schedule/requests'
import type { SessionStatus } from '@shared/settings/defaults'
import { type DateKey, addDays, formatDateKey, formatMinutesShort, isDateKey, nowMinutes, todayKey, weekDays } from '@shared/time'
import type { Availability, ClockShift, Session, Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useStaffList, useStudentList } from '@/features/data/hooks'
import { useOpenRequests } from '@/features/requests/hooks'
import { useShifts } from '@/features/timeclock/api'
import { useElementWidth } from '@/hooks/use-element-width'
import { useIsMobile } from '@/hooks/use-mobile'
import { branchCol, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { RequestsButton } from '@/features/requests/OfficeRequests'
import { AddClassDialog } from './AddClassDialog'
import { AddSeatDialog } from './AddSeatDialog'
import type { ScheduleCtx } from './api'
import { type Board, BoardContext } from './board'
import { addSeat, createClass, moveSeat, removeClass, removeSeat, saveWhosIn, setSeatLabel, setSeatStatus, updateClass } from './classApi'
import { ClassSheet } from './ClassSheet'
import { DayList } from './DayList'
import { DayHoursDialog } from './dialogs/DayHoursDialog'
import { DuplicateDialog } from './dialogs/DuplicateDialog'
import { EventDialog, type EventDialogState } from './dialogs/EventDialog'
import { TrashDialog } from './dialogs/TrashDialog'
import { type ClassViewMode, SchedulePanel, ViewSwitch } from './SchedulePanel'
import { coachColor } from './seatParts'
import { TIMELINE_MIN_WIDTH, TimelineDay, TimelineWeek } from './Timeline'
import { useClassData } from './useClassData'
import { useScheduleRoute } from './useScheduleRoute'
import { WeekGrid } from './WeekGrid'
import { WhosInDialog } from './WhosInDialog'

const PANEL_KEY = 'skyarc:schedule-panel'
/** The page is this wide or wider: the panel sits beside the classes; narrower, it floats over them. */
const DOCK_FROM = 1100

function readPanel(): boolean | null {
  try {
    const v = localStorage.getItem(PANEL_KEY)
    return v === 'open' ? true : v === 'closed' ? false : null
  } catch {
    return null
  }
}

/** The office's schedule (the owner's pick of the design options, 2026-10-26): the academy's classes as on its sheets. */
export function SchedulePage() {
  return <ClassSchedule mode="admin" basePath="/admin/schedule" />
}

/**
 * The schedule, as the academy's sheets lay it out (docs/DECISIONS.md §21): a week of classes, six seats each, every
 * student in their level's colour, or a day larger to mark who's here; a panel on the right with the calendar and
 * who's in. Coaches see the same, read-only.
 */
export function ClassSchedule({ mode, basePath }: { mode: 'admin' | 'coach'; basePath: string }) {
  const branch = useBranch()
  const { branchId, settings, timezone, actor, rules } = branch
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const isMobile = useIsMobile()
  const { confirm, dialog: confirmDialog } = useConfirm()
  const route = useScheduleRoute(basePath)
  const view: ClassViewMode = route.view === 'day' ? 'day' : 'week'
  const date = route.date
  const weekStartsOn = settings.general.weekStartsOn
  const week = useMemo(() => weekDays(date, weekStartsOn), [date, weekStartsOn])
  const [today, setToday] = useState(() => todayKey(timezone))
  const [nowMin, setNowMin] = useState(() => nowMinutes(timezone))
  useEffect(() => {
    const t = setInterval(() => {
      setToday(todayKey(timezone))
      setNowMin(nowMinutes(timezone))
    }, 15_000)
    return () => clearInterval(t)
  }, [timezone])

  const admin = mode === 'admin'
  const { data: staff } = useStaffList(admin)
  const { data: students } = useStudentList()
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  // The office knows everyone's role; a coach sees only availability, kept by coaches (the manager's too, who doesn't
  // teach: their record says so once the office has saved it).
  const isCoach = useCallback((id: string) => (admin ? staffById.get(id)?.role === 'coach' && staffById.get(id)?.status === 'active' : true), [admin, staffById])
  const data = useClassData(week[0], week[6], { isCoach, keepPrevious: true })
  // The week's clock-ins (the office only): the timeline draws them behind each person's row, as clocked.
  const { data: shifts } = useShifts(week[0], week[6], null, admin, { keepPrevious: true })
  const shiftsByDate = useMemo(() => {
    const m = new Map<DateKey, WithId<ClockShift>[]>()
    for (const s of shifts) m.set(s.dateKey, [...(m.get(s.dateKey) ?? []), s])
    return m
  }, [shifts])
  // Families' requests on the classes they're for: waiting on the office on the class asked for, waiting on the family
  // on the class suggested to them (its seat isn't held).
  const requests = useOpenRequests(admin)
  const requestsByClass = useMemo(() => {
    const m = new Map<string, WithId<ClassRequest>[]>()
    for (const r of requests.data) {
      const on = r.status === 'offered' && r.offer ? r.offer.classId : r.classId
      m.set(on, [...(m.get(on) ?? []), r])
    }
    return m
  }, [requests.data])

  // ---------------------------------------------------------------- dialogs
  const [classId, setClassId] = useState<string | null>(() => params.get('class'))
  const [seatFor, setSeatFor] = useState<string | null>(null)
  const [whosIn, setWhosIn] = useState<DateKey | null>(null)
  const [newClass, setNewClass] = useState<{ dateKey: DateKey; key: number } | null>(null)
  const [hoursDay, setHoursDay] = useState<DateKey | null>(null)
  const [trashOpen, setTrashOpen] = useState(false)
  const [dupOpen, setDupOpen] = useState(false)
  const [eventDialog, setEventDialog] = useState<EventDialogState>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // A class opened from elsewhere (Home, a student's page) arrives as ?class=…, a day (a notification's link) as ?date=…
  useEffect(() => {
    const id = params.get('class')
    const day = params.get('date')
    if (!id && !day) return
    if (id) setClassId(id)
    params.delete('class')
    params.delete('date')
    // The rest stays: a notice's `request=` opens its request on that day.
    if (day && isDateKey(day)) route.go({ view: 'day', date: day }, true, params.toString())
    else setParams(params, { replace: true })
  }, [params, setParams, route])

  const ctx: ScheduleCtx = useMemo(() => ({ branchId, actor, timezone, settings, maxStudentsPerCoach: rules.maxStudentsPerCoach }), [branchId, actor, timezone, settings, rules.maxStudentsPerCoach])
  const run = useCallback(async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      const m = (e as Error).message
      toast.error(m.includes('permission') ? 'This change isn’t allowed (a past day, or no access).' : m)
    }
  }, [])

  // ------------------------------------------------------------------ board
  const classById = useCallback((id: string) => {
    for (const list of data.byDate.values()) {
      const v = list.find((x) => x.c.id === id)
      if (v) return v
    }
    return undefined
  }, [data.byDate])
  const [drag, setDrag] = useState<Board['drag']>(null)
  const [lifted, setLifted] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const nextOrder = (v: { seats: { visualOrder?: number }[] } | undefined) => Math.max(-1, ...(v?.seats ?? []).map((s) => s.visualOrder ?? 0)) + 1

  const board: Board = {
    mode,
    me: admin ? null : (branch.staffId ?? null),
    today,
    nowMin,
    levels: settings.students.levels,
    byDate: data.byDate,
    classById,
    inOn: data.inOn,
    isOpen: (d) => data.hoursOf(d).isOpen,
    hoursOf: data.hoursOf,
    eventsOn: (d) => data.eventsByDate.get(d) ?? [],
    student: (id) => studentById.get(id),
    staffName: (id, fallback) => staffById.get(id)?.name ?? fallback ?? (admin ? 'Former staff' : 'A coach'),
    staffColor: (id) => coachColor(id, staffById.get(id)?.color),
    clockedIn: (id) => shifts.find((s) => s.staffId === id && s.status === 'open' && s.dateKey === today)?.inMin ?? null,
    shiftsOn: (d) => shiftsByDate.get(d) ?? [],
    teaches: isCoach,
    requestsFor: (id) => requestsByClass.get(id) ?? [],
    openRequest: (id) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p)
          next.set('request', id)
          return next
        },
        { replace: true },
      ),
    // Owners and admins change any day, a day that's over too, to put the record right (the owner, 2026-10-28).
    canEdit: () => admin,
    openClass: setClassId,
    openDay: (d) => route.go({ view: 'day', date: d }),
    addSeat: setSeatFor,
    addClass: (d) => setNewClass({ dateKey: d, key: Date.now() }),
    editWhosIn: setWhosIn,
    openEvent: admin ? (e) => setEventDialog({ mode: 'edit', event: e }) : undefined,
    setStatus: (s, status: SessionStatus) => void run(() => setSeatStatus(ctx, s, status)),
    setLabel: (s, l) => void run(() => setSeatLabel(ctx, s, l)),
    move: (s, to) => void run(() => moveSeat(ctx, s, to, nextOrder(classById(to.id))), `${s.studentName} moved to ${formatDateKey(to.dateKey, 'weekdayMedium')}, ${formatMinutesShort(to.startMin)}`),
    removeSeat: async (s) => {
      const ok = await confirm({ title: `Take ${s.studentName} out of this class?`, description: 'It goes to the Trash, from where it can come back. To mark an absence, use Canceled instead.', confirmLabel: 'Take out', destructive: true })
      if (ok) void run(() => removeSeat(ctx, s), `${s.studentName} taken out of the class`)
    },
    saveClass: (v, patch) => void run(() => updateClass(ctx, v.c, patch, v.seats), 'Class saved'),
    removeClass: async (v) => {
      const n = v.seats.length
      const ok = await confirm({
        title: 'Remove this class?',
        description: n ? `Its ${n} ${n === 1 ? 'student goes' : 'students go'} to the Trash with it, and come back together.` : 'It goes to the Trash.',
        confirmLabel: 'Remove',
        destructive: true,
      })
      if (ok) void run(() => removeClass(ctx, v.c, v.seats), 'Class removed')
    },
    drag,
    lifted,
    startDrag: (d) => {
      setDrag(d)
      requestAnimationFrame(() => setLifted(d.seatId))
    },
    endDrag: () => {
      setDrag(null)
      setLifted(null)
      setOver(null)
    },
    over,
    setOver,
  }

  // --------------------------------------------------------------- nav
  const step = useCallback(
    (dir: 1 | -1) => {
      if (view === 'week') return route.go({ date: addDays(date, 7 * dir) })
      let d = date
      for (let i = 0; i < 14; i++) {
        d = addDays(d, dir)
        if (data.hoursOf(d).isOpen) return route.go({ date: d })
      }
      route.go({ date: addDays(date, dir) })
    },
    [view, date, route, data],
  )
  const goToday = useCallback(() => {
    let d = today
    if (view === 'day') for (let i = 0; i < 7 && !data.hoursOf(d).isOpen; i++) d = addDays(d, 1)
    route.go({ date: d })
  }, [today, view, data, route])
  const onView = (v: ClassViewMode) => {
    if (v === 'day' && view !== 'day') {
      let d = week.includes(today) ? today : date
      for (let i = 0; i < 7 && !data.hoursOf(d).isOpen; i++) d = addDays(d, 1)
      route.go({ view: 'day', date: d })
    } else route.go({ view: v })
  }
  // A month view from an old link shows its week.
  useEffect(() => {
    if (route.view === 'month') route.go({ view: 'week' }, true)
  }, [route])

  // -------------------------------------------------------------- panel
  const [areaRef, areaWidth] = useElementWidth<HTMLDivElement>()
  const [contentRef, contentWidth] = useElementWidth<HTMLDivElement>()
  // Before the first measure, a guess from the window (the sidebar takes about 300 px), so the panel doesn't flash.
  const docked = (areaWidth || window.innerWidth - 300) >= DOCK_FROM
  const [shown, setShownState] = useState<boolean | null>(() => readPanel())
  const panelOpen = !isMobile && (shown ?? docked)
  // The timeline (the owner's pick, 2026-10-28) where there's room for it; on a phone, the list as before.
  const wide = !isMobile && (contentWidth || window.innerWidth - (panelOpen ? 620 : 320)) >= TIMELINE_MIN_WIDTH
  const setShown = useCallback((open: boolean) => {
    setShownState(open)
    try {
      localStorage.setItem(PANEL_KEY, open ? 'open' : 'closed')
    } catch {
      /* not kept */
    }
  }, [])

  // ←/→ step through days or weeks; Escape folds or opens the panel.
  const keys = useRef({ step, panelOpen, setShown })
  keys.current = { step, panelOpen, setShown }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea, select, [contenteditable], [role=dialog], [role=menu], [role=listbox]')) return
      if (document.querySelector('[role=dialog]')) return
      if (e.key === 'ArrowLeft') keys.current.step(-1)
      else if (e.key === 'ArrowRight') keys.current.step(1)
      else if (e.key === 'Escape') keys.current.setShown(!keys.current.panelOpen)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // --------------------------------------------------------- make-ups owed
  // Absences of the last six weeks still without a make-up, for "Add a student".
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS)
  const owedQ = useMemo(
    () => (admin && seatFor ? query(branchCol(branchId, COL.sessions), where('dateKey', '>=', since), where('dateKey', '<=', addDays(today, 28))) : null),
    [admin, seatFor, branchId, since, today],
  )
  const recent = useQuery<Session>(owedQ, `owed-${branchId}-${since}`)
  const owed = useMemo(() => makeupsOwed(recent.data, since), [recent.data, since])

  const title = view === 'day' ? formatDateKey(date, 'weekdayLong').replace(/, \d{4}$/, '') : `${formatDateKey(week[0], 'monthDay')} – ${formatDateKey(week[6], 'medium')}`
  const phoneTitle = view === 'day' ? formatDateKey(date, 'weekdayMedium') : `${formatDateKey(week[0], 'monthDay')} – ${week[0].slice(0, 7) === week[6].slice(0, 7) ? Number(week[6].slice(8)) : formatDateKey(week[6], 'monthDay')}`
  const seatClass = seatFor ? classById(seatFor) ?? null : null
  const dayClasses = (d: DateKey) => data.byDate.get(d) ?? []
  const savedOn = (d: DateKey) => new Map<string, Availability>(data.availability.filter((a) => a.dateKey === d).map((a) => [a.staffId, a]))
  const people = staff.filter((s) => s.status === 'active')

  const panel = (inSheet: boolean) => (
    <SchedulePanel
      view={view}
      date={date}
      weekStartsOn={weekStartsOn}
      onView={(v) => {
        onView(v)
        setSheetOpen(false)
      }}
      onDate={(d) => {
        route.go({ date: d })
        setSheetOpen(false)
      }}
      onPrev={() => step(-1)}
      onNext={() => step(1)}
      onToday={goToday}
      onClose={() => (inSheet ? setSheetOpen(false) : setShown(false))}
      timeline={wide && !inSheet}
      className={inSheet ? 'rounded-none border-0 shadow-none' : wide ? 'max-h-full' : 'max-h-[calc(100svh-7rem)]'}
    />
  )

  return (
    <BoardContext value={board}>
      <div className="-m-4 flex h-[calc(100svh-3rem)] min-h-0 flex-col sm:-m-6 md:h-svh" data-testid="schedule">
        <div className="flex items-center gap-2 border-b bg-background px-3 py-2.5 sm:px-4">
          {isMobile ? (
            <Button variant="ghost" size="icon" aria-label="Calendar and who's in" onClick={() => setSheetOpen(true)}>
              <LuCalendarDays className="size-5" />
            </Button>
          ) : null}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              <span className="sm:hidden">{phoneTitle}</span>
              <span className="hidden sm:inline">{title}</span>
            </h1>
            {view === 'day' && date === today ? <span className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">TODAY</span> : null}
            {view === 'day' && !data.hoursOf(date).isOpen ? <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">CLOSED</span> : null}
            {view === 'day' && date < today ? <span className="hidden text-xs text-muted-foreground sm:inline">Past · view only</span> : null}
          </div>
          {!panelOpen ? (
            <>
              <div className="hidden items-center gap-1 sm:flex">
                <Button variant="ghost" size="icon-sm" aria-label="Previous" title="Previous (←)" onClick={() => step(-1)}>
                  <LuChevronLeft />
                </Button>
                <Button variant="outline" size="sm" className="rounded-full" onClick={goToday}>
                  Today
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Next" title="Next (→)" onClick={() => step(1)}>
                  <LuChevronRight />
                </Button>
              </div>
              <ViewSwitch view={view} onView={onView} compact />
            </>
          ) : null}
          {!isMobile ? (
            <Button
              variant="outline"
              size="sm"
              aria-pressed={panelOpen}
              aria-label={panelOpen ? 'Hide the panel' : 'Show the panel'}
              title={`${panelOpen ? 'Hide' : 'Show'} the calendar panel (Esc)`}
              onClick={() => setShown(!panelOpen)}
              data-testid="panel-toggle"
            >
              {panelOpen ? <LuPanelRightClose /> : <LuPanelRightOpen />}
              <span className="hidden lg:inline">{panelOpen ? 'Hide panel' : 'Show panel'}</span>
            </Button>
          ) : null}
          {admin ? <RequestsButton /> : null}
          {admin ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Schedule tools">
                  <LuEllipsisVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {view === 'day' && date >= today ? (
                  <>
                    <DropdownMenuItem onSelect={() => setNewClass({ dateKey: date, key: Date.now() })}>
                      <LuPlus /> Add a class
                    </DropdownMenuItem>
                    {data.hoursOf(date).isOpen ? (
                      <DropdownMenuItem
                        onSelect={() => {
                          const h = data.hoursOf(date)
                          setEventDialog({ mode: 'create', dateKey: date, startMin: h.openMin, endMin: Math.min(h.openMin + settings.schedule.events.defaultMinutes, h.closeMin) })
                        }}
                      >
                        <LuPlus /> Add an event
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => setHoursDay(date)}>
                      <LuCalendarCog /> Opening hours this day
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                ) : null}
                <DropdownMenuItem onSelect={() => setDupOpen(true)}>
                  <LuCopyPlus /> Duplicate a week
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTrashOpen(true)}>
                  <LuTrash2 /> Trash
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/admin/settings/hours')}>
                  <LuClock /> Usual opening hours
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        <div ref={areaRef} className={cn('relative flex min-h-0 flex-1 items-start gap-5 px-3 pt-4 sm:px-5', wide ? 'overflow-hidden pb-4' : 'overflow-auto pb-16')} data-testid="schedule-area">
          <div
            ref={contentRef}
            data-timeline-scroller={wide ? '' : undefined}
            className={cn('min-w-0 flex-1', wide && 'h-full overflow-auto overscroll-contain', wide && view === 'day' && 'rounded-xl border bg-card shadow-xs')}
          >
            {wide ? (
              view === 'week' ? (
                <TimelineWeek days={week} width={contentWidth} />
              ) : (
                <TimelineDay dateKey={date} width={contentWidth} />
              )
            ) : view === 'week' ? (
              <WeekGrid days={week} />
            ) : (
              <DayList dateKey={date} />
            )}
          </div>
          {panelOpen ? (
            docked ? (
              <div className={cn('w-[280px] shrink-0', wide ? 'h-full' : 'sticky top-0')}>{panel(false)}</div>
            ) : (
              <div className="absolute top-4 right-4 z-30 w-[min(300px,calc(100%-2rem))]">{panel(false)}</div>
            )
          ) : null}
        </div>
      </div>
      {isMobile ? (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="right" className="w-[88%] max-w-80 gap-0 overflow-y-auto p-0" showCloseButton={false}>
            <SheetHeader className="sr-only">
              <SheetTitle>Calendar and who's in</SheetTitle>
            </SheetHeader>
            {panel(true)}
          </SheetContent>
        </Sheet>
      ) : null}

      <ClassSheet classId={classId} onClose={() => setClassId(null)} />
      {admin ? (
        <>
          <AddSeatDialog
            v={seatClass}
            open={!!seatClass}
            onOpenChange={(o) => !o && setSeatFor(null)}
            students={students}
            levels={settings.students.levels}
            owed={owed}
            onAdd={(st: WithId<Student>, l, part) => {
              const v = seatClass
              setSeatFor(null)
              if (v) void run(() => addSeat(ctx, v.c, { student: st, label: l, ...(part ?? {}) }, nextOrder(v)), `${st.name} added${l ? ` (${l})` : ''}`)
            }}
          />
          {newClass ? (
            <AddClassDialog
              key={newClass.key}
              dateKey={newClass.dateKey}
              open
              onOpenChange={(o) => !o && setNewClass(null)}
              hours={data.hoursOf(newClass.dateKey)}
              after={dayClasses(newClass.dateKey).reduce<number | null>((m, v) => Math.max(m ?? 0, v.c.endMin), null)}
              length={settings.schedule.defaultSessionMinutes}
              seats={rules.seatsPerClass}
              onCreate={(d) => {
                setNewClass(null)
                void run(() => createClass(ctx, d), 'Class added')
              }}
            />
          ) : null}
          <WhosInDialog
            dateKey={whosIn}
            open={!!whosIn}
            onOpenChange={(o) => !o && setWhosIn(null)}
            staff={people}
            saved={whosIn ? savedOn(whosIn) : new Map()}
            hours={whosIn ? data.hoursOf(whosIn) : { openMin: 960, closeMin: 1260 }}
            colorOf={board.staffColor}
            onSave={(rows) => {
              const d = whosIn
              setWhosIn(null)
              if (d) void run(() => saveWhosIn(ctx, d, rows, savedOn(d)), `Who's in saved for ${formatDateKey(d, 'weekdayMedium')}`)
            }}
          />
          <DayHoursDialog
            dateKey={hoursDay}
            onClose={() => setHoursDay(null)}
            ctx={ctx}
            dayConfigs={data.dayConfigs}
            classesOutside={(d, h) => dayClasses(d).filter((v) => !h.isOpen || v.c.startMin < h.openMin || v.c.endMin > h.closeMin).length}
            seatsOn={(d) => dayClasses(d).flatMap((v) => v.seats.map((s) => s.id))}
          />
          <TrashDialog open={trashOpen} onOpenChange={setTrashOpen} ctx={ctx} />
          <DuplicateDialog open={dupOpen} onOpenChange={setDupOpen} ctx={ctx} anchor={date} />
          <EventDialog state={eventDialog} onClose={() => setEventDialog(null)} ctx={ctx} />
        </>
      ) : null}
      {confirmDialog}
      {data.error ? <div className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-destructive px-3 py-2 text-sm text-white">{data.error.message}</div> : null}
    </BoardContext>
  )
}
