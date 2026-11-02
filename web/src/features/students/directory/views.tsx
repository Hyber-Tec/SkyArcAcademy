import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { gradeLabel, initials } from '@shared/people'
import { levelColor } from '@shared/schedule/seatColors'
import { type NextClass, type SortableStudent, type StudentSortKey, lastClassLabel, nextClassLabel } from '@shared/studentList'
import { type DateKey, formatDateKey, formatTimeRange } from '@shared/time'
import type { Student, WithId } from '@shared/types'
import { ItemMenuButton, type MenuEntry, ContextMenuFor } from '@/components/app/ItemMenu'
import { StudentStatusDot, StudentStatusWord } from '@/components/app/StatusBadge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SEAT_FILL, seatVars } from '@/features/schedule/seatParts'
import { cn } from '@/lib/utils'
import { LevelSwatch } from './controls'

/** A student as the page shows them: their next and last class worked out, and the other name a search found them by. */
export interface DirectoryRow extends SortableStudent {
  student: WithId<Student>
  also: string | null
}

export interface ViewProps {
  rows: DirectoryRow[]
  /** By level (`levelGroups`), or null for one list. */
  groups: { level: string | null; rows: DirectoryRow[] }[] | null
  ladder: readonly string[]
  today: DateKey
  sortKey: StudentSortKey
  query: string
  base: string
  menuOf: (s: WithId<Student>) => MenuEntry[]
  onOpen: (id: string, e: React.MouseEvent) => void
}

/**
 * The list's columns from where they show (a wide page): the student, the next class, the last class, and room for the
 * "⋯" (where the List/Grid switch sits on the headings' row). The headings above use the same.
 */
export const LIST_COLUMNS = '@3xl/students:grid-cols-[minmax(0,1fr)_12.5rem_8.5rem_4.5rem]'

/** Enrolled and signed-up students are meant to have a class booked; for anyone else no class is no news. */
const expectsClass = (s: Student) => s.status === 'enrolled' || s.status === 'signed_up'

/** The search's letters marked in a name. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase()
  const i = q ? text.toLowerCase().indexOf(q) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-[3px] bg-yellow-200/80 px-px text-inherit dark:bg-yellow-400/30">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

/** "Signed up Oct 31", with the year when it isn't this one. */
const signedUp = (dateKey: DateKey, today: DateKey) => `Signed up ${formatDateKey(dateKey, dateKey.slice(0, 4) === today.slice(0, 4) ? 'monthDay' : 'medium')}`

/** The next class in full, for its tooltip: "Thursday, November 5, 2026 · 6:00 PM – 7:00 PM". */
function fullWhen(next: NextClass): string {
  const day = formatDateKey(next.dateKey, 'weekdayLong')
  return next.startMin === null ? day : `${day} · ${formatTimeRange(next.startMin, next.endMin ?? next.startMin + 60)}`
}

/** The student's name, a link to their page (a click anywhere on the row or card opens it too). */
function NameLink({ row, base, query, className }: { row: DirectoryRow; base: string; query: string; className?: string }) {
  return (
    <Link
      to={`${base}/${row.student.id}`}
      // The row opens the page on a click; the link has its own (and a new tab with ⌘ or the middle button).
      onClick={(e) => e.stopPropagation()}
      onAuxClick={(e) => e.stopPropagation()}
      className={cn('truncate rounded-sm font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50', className)}
      data-testid="student-name"
    >
      <Highlight text={row.student.name} query={query} />
    </Link>
  )
}

/** "Grade 10 · ■ Marksman · C8 · Development · also Sarah Lim": the sorted-by part stands out. */
function MetaLine({
  row,
  ladder,
  today,
  sortKey,
  query,
  className,
}: {
  row: DirectoryRow
  ladder: readonly string[]
  today: DateKey
  sortKey: StudentSortKey
  query: string
  className?: string
}) {
  const s = row.student
  const em = 'font-medium text-foreground'
  const parts: { key: string; node: ReactNode; className?: string }[] = []
  if (sortKey === 'signUp' && s.signUpDate) parts.push({ key: 'signUp', node: <span className={em}>{signedUp(s.signUpDate, today)}</span> })
  if (s.grade) parts.push({ key: 'grade', node: <span className={cn(sortKey === 'grade' && em)}>{gradeLabel(s.grade)}</span> })
  parts.push({
    key: 'level',
    node: (
      <span className={cn(sortKey === 'level' && em)}>
        <LevelSwatch level={s.level} levels={ladder} className="mr-1.5 align-[0.5px]" />
        {s.level ?? 'No level yet'}
      </span>
    ),
  })
  if (s.rifle) parts.push({ key: 'rifle', node: s.rifle })
  // A phone has room for less.
  if (s.program) parts.push({ key: 'program', node: s.program, className: 'hidden @3xl/students:inline' })
  if (row.also)
    parts.push({
      key: 'also',
      node: (
        <>
          also <Highlight text={row.also} query={query} />
        </>
      ),
    })
  return (
    <div className={cn('text-[13px] text-muted-foreground', className)}>
      {/* On a phone the status leads the line; on a wide page it follows the name. */}
      {s.status !== 'enrolled' ? (
        <span className="@3xl/students:hidden">
          <StudentStatusWord status={s.status} />
          <Dot />
        </span>
      ) : null}
      {parts.map((p, i) => (
        <span key={p.key} className={cn('whitespace-nowrap', p.className)}>
          {i ? <Dot /> : null}
          {p.node}
        </span>
      ))}
    </div>
  )
}

const Dot = () => <span className="mx-1.5 text-muted-foreground/50">·</span>

/** The initials, with the status dot on them. */
function Avatar({ student }: { student: Student }) {
  return (
    <span className="relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tracking-wide @3xl/students:mt-0 @3xl/students:size-[38px]">
      {initials(student.name)}
      <StudentStatusDot status={student.status} className="absolute -right-0.5 -bottom-0.5 size-3 ring-[2.5px] ring-(--row)" />
    </span>
  )
}

/** The next class: "Today, 6:00 PM" stands out; "in 3 days" and "first class" under it. */
function NextCell({ row, today, className }: { row: DirectoryRow; today: DateKey; className?: string }) {
  if (!row.next) return <div className={cn('text-[13px] text-muted-foreground/70', className)}>{expectsClass(row.student) ? 'Nothing booked' : '—'}</div>
  const l = nextClassLabel(row.next, today, !row.last)
  return (
    <div className={className}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="w-fit leading-snug">
            <div className={cn('text-sm', l.isToday ? 'font-semibold' : 'font-medium')}>{l.when}</div>
            {l.sub ? <div className="text-[12.5px] text-muted-foreground">{l.sub}</div> : null}
          </div>
        </TooltipTrigger>
        <TooltipContent>{fullWhen(row.next)}</TooltipContent>
      </Tooltip>
    </div>
  )
}

/** The last class, quieter: "Yesterday", "25 days ago", with its date on hover. */
function LastText({ row, today, prefix = '' }: { row: DirectoryRow; today: DateKey; prefix?: string }) {
  if (!row.last) return <>{expectsClass(row.student) ? 'No classes yet' : '—'}</>
  const label = lastClassLabel(row.last, today)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{prefix ? `${prefix} ${label.toLowerCase()}` : label}</span>
      </TooltipTrigger>
      <TooltipContent>{formatDateKey(row.last, 'weekdayLong')}</TooltipContent>
    </Tooltip>
  )
}

/** A phone's third line: "Tomorrow, 5:00 PM · last yesterday". */
function PhoneWhen({ row, today, className }: { row: DirectoryRow; today: DateKey; className?: string }) {
  const last = row.last ? ` · last ${lastClassLabel(row.last, today).toLowerCase()}` : ''
  if (!row.next) return <div className={cn('text-[13px] text-muted-foreground', className)}>{(expectsClass(row.student) ? 'Nothing booked' : 'No class booked') + last}</div>
  const l = nextClassLabel(row.next, today, !row.last)
  return (
    <div className={cn('text-[13px] text-muted-foreground', className)}>
      <span className={cn('text-foreground', l.isToday ? 'font-semibold' : 'font-medium')}>{l.when}</span>
      {l.sub ? ` · ${l.sub}` : ''}
      {last}
    </div>
  )
}

/** A level's heading in its colour, with how many students are under it. */
export function LevelHeading({ level, count, ladder, className }: { level: string | null; count: number; ladder: readonly string[]; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)} data-testid="level-heading">
      {level ? (
        <span className={cn('inline-flex h-7 items-center rounded-lg px-3 text-[13.5px] font-semibold whitespace-nowrap', SEAT_FILL)} style={seatVars(levelColor(level, ladder))}>
          {level}
        </span>
      ) : (
        <span className="inline-flex h-7 items-center rounded-lg px-3 text-[13.5px] font-medium whitespace-nowrap text-muted-foreground ring-1 ring-border ring-inset">No level yet</span>
      )}
      <span className="text-[13px] whitespace-nowrap text-muted-foreground">
        {count} {count === 1 ? 'student' : 'students'}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** The level in its colour with the rifle beside it ("Marksman · C8"), as a card shows it. */
function LevelTag({ level, rifle, ladder }: { level: string | null; rifle?: string | null; ladder: readonly string[] }) {
  if (!level) {
    return (
      <span className="inline-flex h-[22px] items-center rounded-md px-2 text-xs font-medium whitespace-nowrap text-muted-foreground ring-1 ring-border ring-inset">
        No level yet{rifle ? ` · ${rifle}` : ''}
      </span>
    )
  }
  return (
    <span className={cn('inline-flex h-[22px] max-w-full items-center gap-1 rounded-md px-2 text-xs font-semibold whitespace-nowrap', SEAT_FILL)} style={seatVars(levelColor(level, ladder))}>
      <span className="truncate">{level}</span>
      {rifle ? <span className="font-medium opacity-70">· {rifle}</span> : null}
    </span>
  )
}

/** The "⋯" of a row or a card: shown on hover (always, a little, on a touch screen) and while its menu is open. */
const MENU_BUTTON = 'opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-75'

/** One list, or each level's under its heading. */
function Sections({ props, render, gap, heading }: { props: ViewProps; render: (rows: DirectoryRow[]) => ReactNode; gap: string; heading?: string }) {
  if (!props.groups) return <>{render(props.rows)}</>
  return (
    <div className={gap}>
      {props.groups.map((g) => (
        <section key={g.level ?? ''} aria-label={g.level ?? 'No level yet'}>
          <LevelHeading level={g.level} count={g.rows.length} ladder={props.ladder} className={cn('mb-2', heading)} />
          {render(g.rows)}
        </section>
      ))}
    </div>
  )
}

/**
 * The list (the owner's option 1): one quiet row per student, their initials with the status dot, the name (and the
 * status's word when not enrolled), one line of what they are, and their next and last class. A phone stacks it.
 */
export function StudentList(props: ViewProps) {
  const { ladder, today, sortKey, query, base, menuOf, onOpen } = props
  const row = (r: DirectoryRow) => {
    const s = r.student
    return (
      <ContextMenuFor key={s.id} entries={menuOf(s)}>
        <div
          role="listitem"
          className={cn(
            'group/item relative grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2 rounded-xl py-2.5 pr-0.5 pl-1.5',
            // The row's colour, which the status dot's ring takes too; it lights up under the pointer and with its menu.
            'bg-(--row) [--row:var(--background)] hover:[--row:color-mix(in_oklab,var(--muted)_75%,var(--background))] has-[[aria-expanded=true]]:[--row:color-mix(in_oklab,var(--muted)_75%,var(--background))] data-[state=open]:[--row:color-mix(in_oklab,var(--muted)_75%,var(--background))]',
            // A hairline between rows, from the name on, gone beside a lit row.
            'before:absolute before:right-2 before:bottom-0 before:left-[3.4rem] before:h-px before:bg-border last:before:hidden hover:before:opacity-0 data-[state=open]:before:opacity-0 [&:has(+*:hover)]:before:opacity-0',
            '@3xl/students:items-center @3xl/students:gap-x-4 @3xl/students:px-3 @3xl/students:py-3 @3xl/students:before:left-[4.1rem]',
            LIST_COLUMNS,
          )}
          onClick={(e) => onOpen(s.id, e)}
          onAuxClick={(e) => e.button === 1 && onOpen(s.id, e)}
          data-testid={`student-row-${s.id}`}
        >
          <div className="flex min-w-0 items-start gap-3 @3xl/students:items-center @3xl/students:gap-3.5">
            <Avatar student={s} />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-baseline gap-2">
                <NameLink row={r} base={base} query={query} className="text-[15px] leading-6" />
                <StudentStatusWord status={s.status} className="hidden @3xl/students:inline" />
              </div>
              <MetaLine row={r} ladder={ladder} today={today} sortKey={sortKey} query={query} className="@3xl/students:truncate" />
              <PhoneWhen row={r} today={today} className="mt-0.5 @3xl/students:hidden" />
            </div>
          </div>
          <NextCell row={r} today={today} className="hidden @3xl/students:block" />
          <div className="hidden text-[13px] text-muted-foreground @3xl/students:block">
            <LastText row={r} today={today} />
          </div>
          <div className="flex justify-end">
            <ItemMenuButton entries={menuOf(s)} label={`Actions for ${s.name}`} className={MENU_BUTTON} />
          </div>
        </div>
      </ContextMenuFor>
    )
  }
  return (
    <div data-testid="student-list">
      <Sections
        props={props}
        gap="space-y-6 pt-2"
        // In line with the rows' initials.
        heading="pl-1.5 pr-0.5 @3xl/students:px-3"
        render={(rows) => (
          <div role="list" className="pb-1">
            {rows.map(row)}
          </div>
        )}
      />
    </div>
  )
}

/**
 * The grid (the owner's option 2): a small card per student, the status dot by the name, what they are, their level in
 * its colour, and their next and last class along the bottom. One column on a phone.
 */
export function StudentGrid(props: ViewProps) {
  const { ladder, today, sortKey, query, base, menuOf, onOpen } = props
  const card = (r: DirectoryRow) => {
    const s = r.student
    const l = r.next ? nextClassLabel(r.next, today, !r.last) : null
    // "Grade 6 · Launchpad · Signed Up · also Jay": the sorted-by part stands out (the level has its own tag).
    const meta: { key: string; node: ReactNode }[] = []
    if (sortKey === 'signUp' && s.signUpDate) meta.push({ key: 'signUp', node: <span className="font-medium text-foreground">{signedUp(s.signUpDate, today)}</span> })
    if (s.grade) meta.push({ key: 'grade', node: <span className={cn(sortKey === 'grade' && 'font-medium text-foreground')}>{gradeLabel(s.grade)}</span> })
    if (s.program && sortKey !== 'signUp') meta.push({ key: 'program', node: s.program })
    if (s.status !== 'enrolled') meta.push({ key: 'status', node: <StudentStatusWord status={s.status} /> })
    if (r.also)
      meta.push({
        key: 'also',
        node: (
          <>
            also <Highlight text={r.also} query={query} />
          </>
        ),
      })
    return (
      <ContextMenuFor key={s.id} entries={menuOf(s)}>
        <div
          role="listitem"
          className="group/item flex min-w-0 cursor-pointer flex-col rounded-xl border bg-card shadow-xs transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-md has-[[aria-expanded=true]]:border-foreground/20 has-[[aria-expanded=true]]:shadow-md data-[state=open]:border-foreground/20 data-[state=open]:shadow-md dark:hover:border-foreground/25"
          onClick={(e) => onOpen(s.id, e)}
          onAuxClick={(e) => e.button === 1 && onOpen(s.id, e)}
          data-testid={`student-card-${s.id}`}
        >
          <div className="flex min-w-0 items-center gap-2 pt-2.5 pr-1.5 pl-3.5">
            <StudentStatusDot status={s.status} className="size-2.5" />
            <NameLink row={r} base={base} query={query} className="min-w-0 flex-1 text-[14.5px] leading-6" />
            <ItemMenuButton entries={menuOf(s)} label={`Actions for ${s.name}`} className={cn('size-7', MENU_BUTTON)} />
          </div>
          <div className="truncate pr-3 pl-8 text-[12.5px] text-muted-foreground">
            {meta.length
              ? meta.map((m, i) => (
                  <span key={m.key}>
                    {i ? <Dot /> : null}
                    {m.node}
                  </span>
                ))
              : '\u00a0'}
          </div>
          <div className="min-w-0 pt-2.5 pr-3 pl-8">
            <LevelTag level={s.level} rifle={s.rifle} ladder={ladder} />
          </div>
          <div className="mt-3 flex min-h-10 items-center justify-between gap-3 border-t px-3.5 py-2 text-[13px]">
            {l && r.next ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn('whitespace-nowrap', l.isToday ? 'font-semibold' : 'font-medium')}>{l.when}</span>
                </TooltipTrigger>
                <TooltipContent>{fullWhen(r.next)}</TooltipContent>
              </Tooltip>
            ) : (
              <span className="whitespace-nowrap text-muted-foreground/70">{expectsClass(s) ? 'Nothing booked' : '—'}</span>
            )}
            <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
              {r.last ? <LastText row={r} today={today} prefix="Last" /> : r.next ? 'First class' : expectsClass(s) ? 'No classes yet' : ''}
            </span>
          </div>
        </div>
      </ContextMenuFor>
    )
  }
  return (
    <div data-testid="student-grid" className="pt-2">
      <Sections
        props={props}
        gap="space-y-7"
        render={(rows) => (
          <div role="list" className="grid grid-cols-1 gap-3 @xl/students:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
            {rows.map(card)}
          </div>
        )}
      />
    </div>
  )
}
