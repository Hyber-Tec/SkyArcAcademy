import { useMemo, useState } from 'react'
import { LuCalendarDays, LuCircleAlert, LuEllipsis, LuExternalLink, LuGraduationCap, LuNotebookPen, LuUserPlus } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { gradeLabel, isInactiveStudent, nextGrade, STUDENT_STATUS_LABELS, STUDENT_STATUS_TONES, STUDENT_STATUSES } from '@shared/people'
import {
  type StudentSort,
  type StudentTab,
  STUDENT_TABS,
  compareStudents,
  findStudent,
  inStudentTab,
  lastClassOf,
  levelGroups,
  nextClassOf,
  pickStudentSort,
} from '@shared/studentList'
import { todayKey } from '@shared/time'
import type { Student, StudentStatus, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { type MenuEntry, menu } from '@/components/app/ItemMenu'
import { PageHeader } from '@/components/app/PageHeader'
import { StudentStatusDot, StudentStatusWord } from '@/components/app/StatusBadge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useStudentList } from '@/features/data/hooks'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import { advanceGrades, createStudent, setStudentStatus } from './api'
import { GroupSwitch, LayoutToggle, LevelFilter, NO_LEVEL, SearchBox, SortHeading, SortMenu, StatusTabs } from './directory/controls'
import { useClassesAhead } from './directory/useClassesAhead'
import { type DirectoryRow, LIST_COLUMNS, StudentGrid, StudentList } from './directory/views'

/** A Select can't hold an empty value, so "none" has its own. */
const NONE = '__none'

type Layout = 'list' | 'grid'

/** What this device remembers: the List or the Grid, and whether each groups by level. */
const LAYOUT_KEY = 'skyarc:students-layout'
const GROUP_KEYS: Record<Layout, string> = { list: 'skyarc:students-group-list', grid: 'skyarc:students-group-grid' }

function remembered<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return allowed.includes(v as T) ? (v as T) : fallback
  } catch {
    return fallback
  }
}

function remember(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode: not kept */
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * Students: every student, for admins and coaches alike (coaches read and open them; admins also add them and change
 * them). The owner's pick of the design options (2026-11-02) puts two of them together: a quiet List, one row each, and
 * a Grid of small cards, by level; the page remembers which, and whether each groups by level (the list starts
 * without, the grid with). The status is a dot by the name, with a word for anyone not enrolled.
 */
export function StudentDirectoryPage({ mode = 'admin' }: { mode?: 'admin' | 'coach' }) {
  const { branchId, actor, settings } = useBranch()
  const navigate = useNavigate()
  const { data: students, loading } = useStudentList()
  const { byStudent, read, today, until } = useClassesAhead()
  const narrow = useIsMobile()
  const isAdmin = mode === 'admin'
  const base = `/${mode}/students`
  const ladder = settings.students.levels
  const grades = settings.students.gradeOptions

  const [layout, setLayoutState] = useState<Layout>(() => remembered(LAYOUT_KEY, ['list', 'grid'], 'list'))
  const [grouping, setGrouping] = useState<Record<Layout, boolean>>(() => ({
    list: remembered(GROUP_KEYS.list, ['on', 'off'], 'off') === 'on',
    grid: remembered(GROUP_KEYS.grid, ['on', 'off'], 'on') === 'on',
  }))
  const setLayout = (l: Layout) => {
    setLayoutState(l)
    remember(LAYOUT_KEY, l)
  }
  const grouped = grouping[layout]
  const setGrouped = (on: boolean) => {
    setGrouping((g) => ({ ...g, [layout]: on }))
    remember(GROUP_KEYS[layout], on ? 'on' : 'off')
  }

  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<StudentTab>('all')
  const [levels, setLevels] = useState<string[]>([])
  // People read A to Z.
  const [sort, setSort] = useState<StudentSort>({ key: 'name', dir: 'asc' })
  const [creating, setCreating] = useState(false)
  const [advancing, setAdvancing] = useState(false)

  /** A student's status, set by hand, with a few seconds to take it back. */
  const changeStatus = (s: WithId<Student>, status: StudentStatus) => {
    if (status === s.status) return
    const was = { status: s.status, source: s.statusSource ?? 'auto' }
    const fail = (what: string) => (err: unknown) => toast.error(what, { description: (err as Error).message })
    // The list shows it at once (the device has it); the server confirms in the background.
    void setStudentStatus(branchId, actor, s, status).catch(fail('Couldn’t change the status'))
    toast.success(`${s.name} is now ${STUDENT_STATUS_LABELS[status]}`, {
      description: `Was ${STUDENT_STATUS_LABELS[was.status]}`,
      duration: 8000,
      action: {
        label: 'Undo',
        onClick: () => {
          void setStudentStatus(branchId, actor, { ...s, status }, was.status, was.source).catch(fail('Couldn’t undo'))
          toast(`${s.name} is ${STUDENT_STATUS_LABELS[was.status]} again`)
        },
      },
    })
  }

  /** A student's actions: right-click (a long press on a phone), or the "⋯" button. */
  const menuOf = (s: WithId<Student>) => {
    const statuses: MenuEntry = {
      kind: 'radio',
      value: s.status,
      options: STUDENT_STATUSES.map((st) => ({ value: st, label: STUDENT_STATUS_LABELS[st], swatch: { bg: STUDENT_STATUS_TONES[st].dot, border: STUDENT_STATUS_TONES[st].dot } })),
      onChange: (v) => changeStatus(s, v as StudentStatus),
    }
    return menu(
      { kind: 'label', label: s.name },
      { label: 'Open student profile', icon: LuGraduationCap, onSelect: () => navigate(`${base}/${s.id}`) },
      { label: 'Open in new tab', icon: LuExternalLink, onSelect: () => window.open(`${base}/${s.id}`, '_blank') },
      { label: 'Classes', icon: LuNotebookPen, onSelect: () => navigate(`${base}/${s.id}/sessions`) },
      { label: 'Calendar', icon: LuCalendarDays, onSelect: () => navigate(`${base}/${s.id}/calendar`) },
      // A phone has no room for a menu beside the menu: the statuses come in it.
      isAdmin && !narrow && { kind: 'sub', label: 'Change status', separatorBefore: true, entries: [statuses] },
      isAdmin && narrow && { kind: 'label', label: 'Change status', separatorBefore: true },
      isAdmin && narrow && statuses,
    )
  }

  /** A click opens the student's page; with ⌘ or Ctrl, or the middle button, in a new tab. Selecting text doesn't. */
  const openStudent = (id: string, e: React.MouseEvent) => {
    if (window.getSelection()?.toString()) return
    const to = `${base}/${id}`
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) window.open(to, '_blank')
    else navigate(to)
  }

  // Each student as the page shows them, and whether the search finds them.
  const all = useMemo(
    () =>
      students.map((s) => {
        const ahead = byStudent.get(s.id)
        const match = findStudent(s, search)
        const row: DirectoryRow = {
          student: s,
          also: match.also,
          nameLower: s.nameLower || s.name.toLowerCase(),
          grade: s.grade ?? '',
          level: s.level || null,
          signUpDate: s.signUpDate ?? null,
          next: nextClassOf(s, ahead, read, today, until),
          last: lastClassOf(s, ahead, today),
        }
        return { row, found: match.found }
      }),
    [students, byStudent, read, today, until, search],
  )

  // The Level filter's choices: the academy's levels, any a student still has that it no longer lists, and none yet.
  const levelOptions = useMemo(() => {
    const other = [...new Set(students.map((s) => s.level).filter((l): l is string => !!l && !ladder.includes(l)))].sort()
    return [...ladder, ...other, NO_LEVEL]
  }, [students, ladder])

  const view = useMemo(() => {
    const found = all.filter((x) => x.found).map((x) => x.row)
    const levelOf = (r: DirectoryRow) => r.level ?? NO_LEVEL
    const inLevels = (r: DirectoryRow) => levels.length === 0 || levels.includes(levelOf(r))
    // Each tab counts within the levels picked, each level within the tab: what a click on it would show.
    const tabCounts = Object.fromEntries(STUDENT_TABS.map((t) => [t, found.filter((r) => inLevels(r) && inStudentTab(r.student.status, t)).length])) as Record<StudentTab, number>
    const levelCounts = new Map<string, number>()
    for (const r of found) if (inStudentTab(r.student.status, tab)) levelCounts.set(levelOf(r), (levelCounts.get(levelOf(r)) ?? 0) + 1)
    const rows = found.filter((r) => inStudentTab(r.student.status, tab) && inLevels(r)).sort((a, b) => compareStudents(a, b, sort, { levels: ladder, grades }))
    return { rows, tabCounts, levelCounts }
  }, [all, levels, tab, sort, ladder, grades])

  const groups = grouped ? levelGroups(view.rows, (r) => r.level, ladder, sort.key === 'level' && sort.dir === 'desc') : null
  const filtered = search.trim() !== '' || tab !== 'all' || levels.length > 0
  const clearFilters = () => {
    setSearch('')
    setTab('all')
    setLevels([])
  }
  const pickSort = (key: StudentSort['key']) => setSort((cur) => pickStudentSort(cur, key))
  const viewProps = { rows: view.rows, groups, ladder, today, sortKey: sort.key, query: search, base, menuOf, onOpen: openStudent }

  let body: React.ReactNode
  if (loading) body = <Loading layout={layout} />
  else if (students.length === 0)
    body = (
      <div className="py-16 text-center text-sm text-muted-foreground" data-testid="students-empty">
        <p className="text-base font-medium text-foreground">No students yet</p>
        {isAdmin ? (
          <Button className="mt-4" onClick={() => setCreating(true)}>
            <LuUserPlus /> Add student
          </Button>
        ) : (
          <p className="mt-1">The office adds them.</p>
        )}
      </div>
    )
  else if (view.rows.length === 0)
    body = (
      <div className="py-16 text-center text-sm text-muted-foreground" data-testid="students-empty">
        <p className="text-base font-medium text-foreground">No students match</p>
        <p className="mt-1">Try another name, or clear the filters.</p>
        <Button variant="outline" className="mt-4" onClick={clearFilters}>
          Clear filters
        </Button>
      </div>
    )
  else body = layout === 'list' ? <StudentList {...viewProps} /> : <StudentGrid {...viewProps} />

  return (
    <div className="@container/students" data-testid="students-page" data-layout={layout}>
      <PageHeader
        className="mb-4 flex-row items-end justify-between sm:items-end"
        title="Students"
        description={
          loading ? (
            '\u00a0'
          ) : filtered ? (
            <>
              {view.rows.length} of {plural(students.length, 'student')}
              <button type="button" className="ml-2 font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground" onClick={clearFilters}>
                Clear filters
              </button>
            </>
          ) : (
            plural(students.length, 'student')
          )
        }
        actions={
          isAdmin ? (
            <>
              <Button onClick={() => setCreating(true)} data-testid="student-add">
                <LuUserPlus />
                <span className="sm:hidden">Add</span>
                <span className="hidden sm:inline">Add student</span>
              </Button>
              {/* Advance grades is for once a year, so it waits in here. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="More" data-testid="students-more">
                    <LuEllipsis />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuItem onSelect={() => setAdvancing(true)}>
                    <LuGraduationCap />
                    Advance grades…
                    <span className="ml-auto pl-3 text-xs text-muted-foreground">Once a year</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null
        }
      />

      {/* The filters and the list's headings stay in view as it scrolls (a phone's screen is better kept for students). */}
      <div className="z-20 bg-background md:sticky md:top-0">
        <div className="flex flex-col gap-2 border-b @4xl/students:flex-row @4xl/students:items-center @4xl/students:gap-6">
          <div className="flex items-center gap-2 @4xl/students:order-2 @4xl/students:ml-auto">
            <SearchBox value={search} onChange={setSearch} className="min-w-0 flex-1 @4xl/students:w-64 @4xl/students:flex-none" />
            <LevelFilter options={levelOptions} selected={levels} counts={view.levelCounts} ladder={ladder} onChange={setLevels} />
          </div>
          <StatusTabs tab={tab} counts={view.tabCounts} onChange={setTab} className="@4xl/students:order-1" />
        </div>
        {/* Padded as the list's rows are, in both layouts, so nothing on it moves when they switch. */}
        <div className={cn('flex h-12 items-center gap-3 pr-0.5 pl-1.5 @3xl/students:px-3', layout === 'list' && cn('@3xl/students:grid @3xl/students:gap-x-4', LIST_COLUMNS))}>
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <SortMenu sort={sort} onPick={pickSort} columns={layout === 'list'} />
            <GroupSwitch checked={grouped} onChange={setGrouped} />
          </div>
          {layout === 'list' ? (
            <>
              <SortHeading sortKey="next" sort={sort} onPick={pickSort} className="hidden @3xl/students:inline-flex" />
              <SortHeading sortKey="last" sort={sort} onPick={pickSort} className="hidden @3xl/students:inline-flex" />
            </>
          ) : null}
          <div className="flex justify-end">
            <LayoutToggle layout={layout} onChange={setLayout} />
          </div>
        </div>
      </div>

      {body}

      {!loading && students.length ? (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t px-1 pt-4 text-xs text-muted-foreground" data-testid="status-legend">
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {STUDENT_STATUSES.map((st) => (
              <span key={st} className="inline-flex items-center gap-1.5">
                <StudentStatusDot status={st} tip={false} />
                {STUDENT_STATUS_LABELS[st]}
              </span>
            ))}
          </div>
          <span className="hidden pointer-fine:inline">Right-click a student for more</span>
        </div>
      ) : null}

      {isAdmin ? (
        <>
          <NewStudentDialog open={creating} onOpenChange={setCreating} onCreated={(id) => navigate(`${base}/${id}/info`)} />
          <GradeAdvanceDialog open={advancing} onOpenChange={setAdvancing} students={students} />
        </>
      ) : null}
    </div>
  )
}

/** Rows or cards to hold the page's place while the students load. */
function Loading({ layout }: { layout: Layout }) {
  if (layout === 'grid') {
    return (
      <div className="grid grid-cols-1 gap-3 pt-2 @xl/students:grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]" aria-busy>
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-[8.5rem] rounded-xl" />
        ))}
      </div>
    )
  }
  return (
    <div className="space-y-1 pt-2" aria-busy>
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex items-center gap-3.5 px-3 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function NewStudentDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const { branchId, actor, settings, timezone } = useBranch()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [grade, setGrade] = useState('')
  const [level, setLevel] = useState(NONE)
  const [program, setProgram] = useState(NONE)
  const [busy, setBusy] = useState(false)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!firstName.trim()) return toast.error('Enter the student’s first name.')
            setBusy(true)
            try {
              const id = await createStudent(branchId, actor, {
                firstName,
                lastName,
                grade,
                level: level === NONE ? null : level,
                program: program === NONE ? null : program,
                signUpDate: todayKey(timezone),
              })
              onOpenChange(false)
              setFirstName('')
              setLastName('')
              setGrade('')
              setLevel(NONE)
              setProgram(NONE)
              onCreated(id)
            } catch (err) {
              toast.error('Could not add the student', { description: (err as Error).message })
            } finally {
              setBusy(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Add student</DialogTitle>
            <DialogDescription>New students start as Signed Up and become Enrolled after their first class.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ns-first">First name</FieldLabel>
                <Input id="ns-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
              </Field>
              <Field>
                <FieldLabel htmlFor="ns-last">Last name</FieldLabel>
                <Input id="ns-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel>Grade</FieldLabel>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose a grade" />
                </SelectTrigger>
                <SelectContent>
                  {settings.students.gradeOptions.map((g) => (
                    <SelectItem key={g} value={g}>
                      {gradeLabel(g)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>Level</FieldLabel>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Not assessed yet</SelectItem>
                    {settings.students.levels.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Program</FieldLabel>
                <Select value={program} onValueChange={setProgram}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None yet</SelectItem>
                    {settings.students.programs.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : <LuUserPlus />} Add student
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function GradeAdvanceDialog({ open, onOpenChange, students }: { open: boolean; onOpenChange: (o: boolean) => void; students: WithId<Student>[] }) {
  const { branchId, actor } = useBranch()
  const numeric = useMemo(() => students.filter((s) => nextGrade(s.grade) !== null), [students])
  const skipped = students.length - numeric.length
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [busy, setBusy] = useState(false)
  const defaults = useMemo(() => new Set(numeric.filter((s) => !isInactiveStudent(s.status) && Number(s.grade) < 12).map((s) => s.id)), [numeric])
  const current = selected ?? defaults

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) setSelected(null)
      }}
    >
      <DialogContent className="max-h-[90svh] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Advance grades</DialogTitle>
          <DialogDescription>
            Moves the selected students up one grade, usually once a year.
            {skipped > 0 ? ` ${plural(skipped, 'student')} without a numeric grade ${skipped === 1 ? 'is' : 'are'} skipped.` : ''} Inactive students and those in grade 12
            start unselected.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {current.size} of {numeric.length} selected
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelected(current.size === numeric.length ? new Set() : new Set(numeric.map((s) => s.id)))}>
            {current.size === numeric.length ? 'Deselect all' : 'Select all'}
          </Button>
        </div>
        <div className="max-h-[50svh] divide-y overflow-y-auto rounded-lg border">
          {numeric.map((s) => (
            <label key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40">
              <Checkbox
                checked={current.has(s.id)}
                onCheckedChange={(v) => {
                  const next = new Set(current)
                  if (v === true) next.add(s.id)
                  else next.delete(s.id)
                  setSelected(next)
                }}
              />
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <StudentStatusDot status={s.status} tip={false} />
                <span className="truncate">{s.name}</span>
                <StudentStatusWord status={s.status} />
              </span>
              <span className="w-16 text-right text-muted-foreground tabular-nums">
                {s.grade} → {nextGrade(s.grade)}
              </span>
              {Number(s.grade) >= 12 ? <LuCircleAlert className="size-4 text-amber-500" aria-label="Beyond grade 12" /> : <span className="size-4" />}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || current.size === 0}
            onClick={async () => {
              setBusy(true)
              try {
                const list = numeric.filter((s) => current.has(s.id)).map((s) => ({ id: s.id, name: s.name, grade: s.grade, next: nextGrade(s.grade)! }))
                await advanceGrades(branchId, actor, list)
                toast.success(`${plural(list.length, 'student')} moved up one grade`)
                onOpenChange(false)
                setSelected(null)
              } catch (e) {
                toast.error('Could not advance grades', { description: (e as Error).message })
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? <Spinner /> : null} Advance {plural(current.size, 'student')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CoachStudentDirectoryPage() {
  return <StudentDirectoryPage mode="coach" />
}
