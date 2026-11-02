import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LuArrowRight, LuTarget, LuUpload } from 'react-icons/lu'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { FEED_SORTS, type FeedGroup, dayWords, feedGroups, lastScores, lastSevenDays, quietStudents, rangeDates, rangeLabel, recentBests, sortFeed } from '@shared/scores/feed'
import { type ResultRow as Row, resultRows } from '@shared/scores/match'
import { type Evaluation, POSITION_LABELS, RESULT_KIND_LABELS, inOrder, kindOf } from '@shared/shooting/evaluation'
import { personalBestIdsByStudent } from '@shared/shooting/progress'
import { findStudent } from '@shared/studentList'
import { addDays, formatMinutes, todayKey } from '@shared/time'
import type { Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useStudentList } from '@/features/data/hooks'
import { useFileDropZone, useWindowDropGuard } from '@/features/drive/dropzone'
import { LevelChip } from '@/features/schedule/seatParts'
import { prefersReducedMotion } from '@/features/scores/playback'
import { ResultRow } from '@/features/scores/ResultRow'
import { noTimeWords, rowOf, useOpenRows } from '@/features/scores/results'
import { useResultActions } from '@/features/scores/useResultActions'
import { cn } from '@/lib/utils'
import { type AddRequest, AddScoresDialog } from './add/AddScores'
import { type EarlierScore, scoreOf, useScoresData } from './data'
import { FRESH_FIND, type Find, NO_LEVEL, findFromParams, findParams, isFiltered, levelChoices } from './find'
import { FindBar } from './FindBar'
import { BestsCard, DropCard, LookCard, WeekCard } from './Rail'

type Result = WithId<Evaluation>

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

/** Rows shown at first, and each "Show more": a long range stays quick. */
const PAGE = 150

/** The rows each visit to the page left open, by its place in the browser's history: Back opens them again. */
const leftOpen = new Map<string, string[]>()

/** The rail sticks while the list scrolls; one taller than the window scrolls with it until its end is in view. */
function useStickyTop(enabled: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [top, setTop] = useState(24)
  useLayoutEffect(() => {
    const el = ref.current
    if (!enabled || !el) return
    const place = () => setTop(Math.min(24, window.innerHeight - el.offsetHeight - 24))
    place()
    const ro = new ResizeObserver(place)
    ro.observe(el)
    window.addEventListener('resize', place)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [enabled])
  return { ref, top }
}

/** An element's width as it changes (0 until it's laid out). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.offsetWidth)
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, width }
}

/**
 * Scores (Goo's pick, "Feed", docs/DECISIONS.md §29), for admins and coaches: every student's results, newest first,
 * by day (Today, Yesterday, each day of this week and last week, then by week), each a row that opens in place to play
 * its shots back (several at once; nothing jumps), with a way to the student's own Scores and the same menu as there.
 * Found by student (any of their names), position, kind, level and days (the last 30 to start), and sorted by when, by
 * score or by name; the find is kept in the address, so Back from a student's page comes back to it.
 *
 * Beside the list (under it on narrower screens): Add scores (files dropped anywhere on the page land there too), the
 * last seven days against the seven before, their new personal bests, and what needs a look (results marked Check,
 * enrolled students without a score for 30 days). A "New best" is set against the student's own earlier results, all
 * of them, not only the ones on screen. Results just added show at the top, marked New, until Done.
 */
export function ScoresPage({ mode = 'admin' }: { mode?: 'admin' | 'coach' }) {
  const { timezone, settings } = useBranch()
  const navigate = useNavigate()
  const location = useLocation()
  const today = todayKey(timezone)
  const ladder = settings.students.levels
  // The list and the rail side by side where there's room (the page's own width), the rail under the list otherwise.
  const page = useWidth<HTMLDivElement>()
  const twoColumns = page.width >= 1024
  const feed = useWidth<HTMLElement>()

  // ------------------------------------------------------------ the find, in the address
  const [params, setParams] = useSearchParams()
  const find = useMemo(() => findFromParams(params), [params])
  const setFind = (patch: Partial<Find>) => setParams(findParams({ ...find, ...patch }), { replace: true })
  // The search is typed here and reaches the address a moment later.
  const [q, setQ] = useState(find.q)
  useEffect(() => {
    if (q === find.q) return
    const t = setTimeout(() => setParams(findParams({ ...findFromParams(new URLSearchParams(window.location.search)), q }), { replace: true }), 250)
    return () => clearTimeout(t)
  }, [q, find.q, setParams])
  const shown: Find = { ...find, q }
  const clearFind = () => {
    setQ('')
    setParams(findParams({ ...FRESH_FIND, sort: find.sort }), { replace: true })
  }

  // ------------------------------------------------------------ the data
  const range = rangeDates(shown.range, today)
  // The rail needs the last 30 days whatever the list shows.
  const monthAgo = addDays(today, -29)
  const data = useScoresData(range.from < monthAgo ? range.from : monthAgo)
  const { data: students, loading: studentsLoading } = useStudentList()
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  const actions = useResultActions(mode)

  // Every result known, the live list over the older scores: personal bests and last scores are each student's own.
  const known = useMemo(() => {
    const all = new Map<string, EarlierScore>()
    for (const e of data.earlier ?? []) all.set(e.id, e)
    for (const e of data.results) all.set(e.id, scoreOf(e.id, e))
    return [...all.values()]
  }, [data.earlier, data.results])
  const ready = data.earlier !== null
  const bests = useMemo(() => (ready ? personalBestIdsByStudent(known) : new Set<string>()), [ready, known])

  const nameOf = (e: Pick<Evaluation, 'studentId' | 'studentName'>) => byId.get(e.studentId)?.name ?? e.studentName
  const firstOf = (e: Pick<Evaluation, 'studentId' | 'studentName'>) => {
    const s = byId.get(e.studentId)
    return s?.firstName || (s?.name ?? e.studentName).split(' ')[0]
  }
  const levelOf = (studentId: string): ReactNode => {
    const level = byId.get(studentId)?.level
    return level ? <LevelChip level={level} levels={ladder} /> : null
  }

  // ------------------------------------------------------------ adding scores
  const [adding, setAdding] = useState<AddRequest | null>(null)
  const asks = useRef(0)
  const add = (files: File[] | null) => setAdding({ id: ++asks.current, files })
  useWindowDropGuard()
  const drop = useFileDropZone({ canWrite: true, onFiles: (entries) => add(entries.map((e) => e.file)), disabled: !!adding })
  // Results just added, at the top until Done. The page shows its own copy until the live list has one (a result dated
  // before the list's first day never comes), and drops one the live list had and no longer has (deleted meanwhile).
  const [just, setJust] = useState<Result[]>([])
  const liveById = useMemo(() => new Map(data.results.map((e) => [e.id, e])), [data.results])
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set())
  const liveJust = just.filter((e) => liveById.has(e.id) && !seen.has(e.id))
  if (liveJust.length) setSeen(new Set([...seen, ...liveJust.map((e) => e.id)]))
  const justShown = useMemo(() => just.flatMap((e) => (liveById.has(e.id) ? [liveById.get(e.id)!] : seen.has(e.id) ? [] : [e])), [just, liveById, seen])
  const justRows = useMemo(() => resultRows(justShown), [justShown])
  const justIds = useMemo(() => new Set(just.map((e) => e.id)), [just])

  // ------------------------------------------------------------ the feed
  const { rows, also } = useMemo(() => {
    const also = new Map<string, string>()
    const query = q.trim()
    const keep = (e: Result) => {
      if (justIds.has(e.id) || e.dateKey < range.from || e.dateKey > range.to) return false
      if (shown.position !== 'all' && e.position !== shown.position) return false
      if (shown.kind !== 'all' && kindOf(e) !== shown.kind) return false
      const s: Pick<Student, 'name' | 'nameLower' | 'otherNames' | 'level'> | undefined = byId.get(e.studentId)
      if (shown.level !== 'all' && (s?.level || NO_LEVEL) !== shown.level) return false
      if (query) {
        const found = findStudent(s ?? { name: e.studentName, nameLower: e.studentName.toLowerCase(), otherNames: [] }, query)
        if (!found.found) return false
        if (found.also) also.set(e.studentId, found.also)
      }
      return true
    }
    const list = sortFeed(resultRows(data.results.filter(keep)), shown.sort, (r) => nameOf(r.results[0]))
    return { rows: list, also }
    // nameOf reads byId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.results, justIds, range.from, range.to, shown.position, shown.kind, shown.level, shown.sort, q, byId])

  const byDay = shown.sort === 'new' || shown.sort === 'old'
  const groups: FeedGroup<Row<Result>>[] = useMemo(() => {
    if (byDay) return feedGroups(rows, (r) => ({ dateKey: r.results[0].dateKey, match: r.match ? (r.results[0].match?.name ?? null) : null }), today, settings.general.weekStartsOn)
    return rows.length ? [{ key: 'sorted', title: FEED_SORTS.find((s) => s.key === shown.sort)?.label ?? '', sub: '', day: false, rows }] : []
  }, [rows, byDay, today, settings.general.weekStartsOn, shown.sort])

  // A long list a part at a time.
  const [limit, setLimit] = useState(PAGE)
  const findKey = `${range.from}|${range.to}|${shown.position}|${shown.kind}|${shown.level}|${shown.sort}|${q}`
  const [limitFor, setLimitFor] = useState(findKey)
  if (limitFor !== findKey) {
    setLimitFor(findKey)
    setLimit(PAGE)
  }

  // ------------------------------------------------------------ rows open
  const opened = useOpenRows(leftOpen.get(location.key))
  const openKeys = useRef(opened.open)
  openKeys.current = opened.open
  const historyKey = useRef(location.key)
  historyKey.current = location.key
  useEffect(
    () => () => {
      leftOpen.set(historyKey.current, [...openKeys.current])
    },
    [],
  )

  // A result picked in the rail: its row opens and comes into view, the filters cleared first when they hide it.
  const [toShow, setToShow] = useState<string | null>(null)
  const openResult = (id: string) => {
    if (!rowOf(rows, id) && !rowOf(justRows, id)) {
      setQ('')
      setParams(findParams({ ...FRESH_FIND, sort: byDay ? find.sort : 'new' }), { replace: true })
    }
    setToShow(id)
  }
  // Under "Just added", or in the list.
  const target = toShow ? (rowOf(justRows, toShow) ?? rowOf(rows, toShow)) : null
  const { show } = opened
  useEffect(() => {
    if (!target) return
    setToShow(null)
    const at = rows.indexOf(target)
    if (at >= limit) setLimit(Math.ceil((at + 1) / PAGE) * PAGE)
    show(target.key)
    // Once it has unfolded: the page is then long enough to bring a row near its end to the top.
    setTimeout(() => {
      const el = [...document.querySelectorAll<HTMLElement>('[data-row]')].find((x) => x.dataset.row === target.key)
      el?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    }, 320)
  }, [target, rows, limit, show])

  // ------------------------------------------------------------ the rail
  const recent = useMemo(() => data.results.filter((e) => e.dateKey >= monthAgo && e.dateKey <= today), [data.results, monthAgo, today])
  const week = useMemo(() => lastSevenDays(resultRows(recent), today), [recent, today])
  // Bests and who's been quiet need the older scores: nothing is said about them until those are read.
  const newBests = useMemo(() => (ready ? recentBests(recent, bests, today) : null), [ready, recent, bests, today])
  const checks = useMemo(() => inOrder(recent.filter((e) => e.problems?.length)).reverse(), [recent])
  const quiet = useMemo(() => (ready && !studentsLoading ? quietStudents(students, lastScores(known), today) : null), [ready, studentsLoading, students, known, today])
  const sticky = useStickyTop(twoColumns)

  const filtered = isFiltered(shown)
  const count = rows.length
  const loading = data.loading || studentsLoading
  const dayDates = useMemo(() => new Set(known.map((e) => e.dateKey)), [known])

  const rowFor = (row: Row<Result>, inDay: boolean, fresh = false) => {
    const e = row.results[0]
    const time = e.timeMin !== null && !row.match ? formatMinutes(e.timeMin) : null
    const when = inDay ? (time ?? noTimeWords(e)) : `${dayWords(e.dateKey, today)}${time ? `, ${time}` : ''}`
    return (
      <ResultRow
        key={row.key}
        row={row}
        mode={mode}
        open={opened.isOpen(row.key)}
        onToggle={() => opened.toggle(row.key)}
        entries={actions.entriesOf(row)}
        bests={bests}
        fresh={fresh}
        freshLabel="New"
        student={{ name: nameOf(e), level: levelOf(e.studentId), when, also: also.get(e.studentId) ?? null, highlight: q }}
        footer={
          <Button variant="ghost" size="sm" className="-ml-2.5 h-8 gap-1.5 px-2.5 text-[13px]" asChild>
            <Link to={`/${mode}/students/${e.studentId}/scores?score=${e.id}`} data-testid="go-to-student">
              <LuTarget /> Go to {firstOf(e)}’s scores <LuArrowRight />
            </Link>
          </Button>
        }
      />
    )
  }

  const justAdded = justRows.length ? (
    <section className="mt-5" aria-label="Just added" data-testid="scores-just-added">
      <div className="mx-0.5 mb-2 flex items-center gap-2">
        <h2 className="shrink-0 text-[15px] font-semibold">Just added</h2>
        <span className="min-w-0 truncate text-[13px] text-muted-foreground">
          {plural(justShown.length, 'result')}, filed in {new Set(justShown.map((e) => e.studentId)).size === 1 ? `${firstOf(justShown[0])}’s` : 'each student’s'} Drive folder
        </span>
        <Button variant="outline" size="xs" className="ml-auto" onClick={() => setJust([])} data-testid="scores-just-done">
          Done
        </Button>
      </div>
      <ul className="overflow-hidden rounded-xl border bg-card">{justRows.map((r) => rowFor(r, false, true))}</ul>
    </section>
  ) : null

  let body: ReactNode
  if (loading)
    body = (
      <div className="mt-6 space-y-2" aria-busy>
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  else if (!rows.length)
    body = (
      <div className="mt-6 rounded-xl border bg-card px-6 py-14 text-center" data-testid="scores-empty">
        <p className="font-medium">{filtered ? 'No results match' : 'No results in these days'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{filtered ? 'Try another name, or clear the filters.' : 'SIUS results, paper cards and competitions show here as they’re added.'}</p>
        {filtered ? (
          <Button variant="outline" size="sm" className="mt-4" onClick={clearFind}>
            Clear the filters
          </Button>
        ) : null}
      </div>
    )
  else {
    let left = limit
    body = (
      <>
        {groups.map((g) => {
          if (left <= 0) return null
          const part = g.rows.slice(0, left)
          left -= part.length
          return (
            <section key={g.key} className="mt-6 first:mt-5" aria-label={`${g.title}${g.sub ? `, ${g.sub}` : ''}`} data-testid="scores-group">
              <div className="mx-0.5 mb-2 flex items-baseline gap-2">
                <h2 className="shrink-0 text-[15px] font-semibold">{g.title}</h2>
                {g.sub ? <span className="min-w-0 truncate text-[13px] text-muted-foreground">{g.sub}</span> : null}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">{plural(g.rows.length, 'result')}</span>
              </div>
              <ul className="overflow-hidden rounded-xl border bg-card" data-testid="scores-list">
                {part.map((r) => rowFor(r, g.day))}
              </ul>
            </section>
          )
        })}
        {rows.length > limit ? (
          <div className="mt-4 text-center">
            <Button variant="outline" size="sm" onClick={() => setLimit(limit + PAGE)}>
              Show {Math.min(PAGE, rows.length - limit)} more of {rows.length}
            </Button>
          </div>
        ) : null}
      </>
    )
  }

  const rail = (
    <>
      <DropCard hot={drop.dragOver} onFiles={add} />
      <WeekCard week={week} today={today} />
      <BestsCard bests={newBests} today={today} nameOf={nameOf} onOpen={openResult} />
      <LookCard
        checks={checks}
        quiet={quiet}
        today={today}
        nameOf={nameOf}
        studentOf={(id) => {
          const s = byId.get(id)
          return s ? { name: s.name, signUpDate: s.signUpDate } : null
        }}
        levelOf={levelOf}
        onOpen={openResult}
        onStudent={(id) => navigate(`/${mode}/students/${id}/scores`)}
      />
    </>
  )

  return (
    <div ref={page.ref} {...drop.handlers} data-testid="scores-page">
      <PageHeader
        className="mb-5 flex-row items-end justify-between sm:items-end"
        title="Scores"
        description={<span className="hidden sm:inline">Every student’s latest results, newest first. Open one to see its shots.</span>}
        actions={
          <Button size="lg" onClick={() => add(null)} data-testid="add-scores">
            <LuUpload /> Add scores
          </Button>
        }
      />
      <div className={cn(twoColumns ? 'grid grid-cols-[minmax(0,1fr)_21rem] items-start gap-7' : 'block')}>
        <section ref={feed.ref} className="@container min-w-0" aria-label="Results">
          <FindBar
            find={shown}
            onChange={(patch) => ('q' in patch ? setQ(patch.q ?? '') : setFind(patch))}
            levels={levelChoices(ladder, students.map((s) => s.level))}
            today={today}
            hasResults={(d) => dayDates.has(d)}
            wide={feed.width >= 640}
          />
          {filtered && !loading ? (
            <p className="mt-3 flex flex-wrap items-baseline gap-x-2 text-[13px] text-muted-foreground" data-testid="scores-filter-line">
              <span>
                <span className="font-semibold text-foreground">{plural(count, 'result')}</span>
                {[
                  q.trim() ? `“${q.trim()}”` : null,
                  shown.position !== 'all' ? POSITION_LABELS[shown.position] : null,
                  shown.kind !== 'all' ? RESULT_KIND_LABELS[shown.kind] : null,
                  shown.level !== 'all' ? (shown.level === NO_LEVEL ? 'No level yet' : shown.level) : null,
                  shown.range.preset !== '30d' ? rangeLabel(shown.range, today) : null,
                ]
                  .filter(Boolean)
                  .map((b) => ` · ${b}`)}
              </span>
              <button type="button" className="underline decoration-foreground/25 underline-offset-4 hover:text-foreground hover:decoration-foreground" onClick={clearFind}>
                Clear filters
              </button>
            </p>
          ) : null}
          {justAdded}
          {body}
        </section>
        <aside
          ref={sticky.ref}
          className={cn('flex min-w-0 flex-col gap-3.5', twoColumns ? 'sticky self-start' : 'mt-8')}
          style={twoColumns ? { top: sticky.top } : undefined}
          aria-label="At a glance"
          data-testid="scores-rail"
        >
          {rail}
        </aside>
      </div>
      {actions.element}
      <AddScoresDialog
        request={adding}
        onClose={() => setAdding(null)}
        onSaved={(added) => {
          setJust((cur) => [...added, ...cur])
          window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
        }}
        students={students}
        known={known}
      />
      {/* Files dragged over the page: they'll be read as scores. */}
      {drop.dragOver ? (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/60 p-6" aria-hidden data-testid="scores-drop-veil">
          <div className="flex max-w-md flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-foreground/60 bg-card px-10 py-8 text-center shadow-lg">
            <LuUpload className="size-6" />
            <p className="text-base font-semibold">Drop to add scores</p>
            <p className="text-sm text-balance text-muted-foreground">SIUS PDFs, photos of paper cards, or a results sheet. You check what was read before it’s saved.</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function CoachScoresPage() {
  return <ScoresPage mode="coach" />
}
