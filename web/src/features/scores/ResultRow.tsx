import { type ReactNode, useEffect, useId, useState } from 'react'
import { LuChevronDown, LuMessageSquareQuote, LuPencilLine, LuTrophy } from 'react-icons/lu'
import { type MatchResult, POSITION_LETTER, type ResultRow as Row, matchTotal, rowPer10 } from '@shared/scores/match'
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, SOURCE_LABELS, evaluationPoints, per10, totalWithTens } from '@shared/shooting/evaluation'
import { formatDateKey, formatMinutes } from '@shared/time'
import type { WithId } from '@shared/types'
import { ContextMenuFor, ItemMenuButton, type MenuEntry } from '@/components/app/ItemMenu'
import { one } from '@/features/reports/model'
import { cn } from '@/lib/utils'
import { ResultKindChip } from './kinds'
import { MatchCard } from './MatchCard'
import { prefersReducedMotion } from './playback'
import { ResultDetail } from './ResultDetail'
import { BestBadge, ResultNotes } from './ResultParts'
import { FEED_COLUMNS, RESULT_COLUMNS, noTimeWords } from './results'
import { MiniTarget } from './TargetPlot'

type Result = WithId<Evaluation>

/** The list's column names, above its rows (from a tablet's width). */
export function ResultListHead({ className }: { className?: string }) {
  return (
    <div className={cn(RESULT_COLUMNS, 'hidden border-y bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground @xl:grid @xl:px-5', className)} aria-hidden>
      <span />
      <span>Result</span>
      <span className="text-right">Per 10</span>
      <span className="text-right">Total</span>
      <span />
    </div>
  )
}

/** Grows open under its row and folds away again; nothing above it moves. Its content leaves once it's folded. */
function Unfold({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const [grown, setGrown] = useState(false)
  if (open && !mounted) setMounted(true)
  if (!open && grown) setGrown(false)
  useEffect(() => {
    if (open) {
      // A frame folded first, then grown: so it unfolds rather than appearing.
      const frame = requestAnimationFrame(() => setGrown(true))
      return () => cancelAnimationFrame(frame)
    }
    const timer = setTimeout(() => setMounted(false), prefersReducedMotion() ? 0 : 280)
    return () => clearTimeout(timer)
  }, [open])
  if (!mounted) return null
  return (
    <div id={id} className={cn('grid transition-[grid-template-rows] duration-[260ms] ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none', grown ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}

const typedIn = (e: Result) => e.source === 'paper' && !evaluationPoints(e).length

/** The row's picture: the shots on a small target, a pencil for a typed card, a trophy for a match. */
function Thumb({ row, size = 40 }: { row: Row<Result>; size?: number }) {
  const box = { width: size, height: size }
  if (row.match)
    return (
      <span className="flex items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300" style={box} title="A competition, from its results sheet">
        <LuTrophy className="size-[18px]" />
      </span>
    )
  const e = row.results[0]
  const points = evaluationPoints(e)
  if (!points.length)
    return (
      <span className="flex items-center justify-center rounded-full border-[1.5px] border-dashed text-muted-foreground" style={box} title="Typed in: no places on the target">
        <LuPencilLine className="size-4" />
      </span>
    )
  return <MiniTarget points={points} color={POSITION_COLORS[e.position]} size={size} />
}

/** "Check": something about the result to look at (open it to see what). */
function CheckMark() {
  return (
    <span className="inline-flex h-4 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-400 ring-inset dark:text-amber-300 dark:ring-amber-700" title="Something to check: open it">
      Check
    </span>
  )
}


/** A match's figures: its total and inner tens over its positions, and every shot's average per 10. */
function matchFigures(results: readonly MatchResult[]) {
  const { total, innerTens, whole } = matchTotal(results)
  return {
    per10: rowPer10(results),
    total: `${whole ? total : total.toFixed(1)}${innerTens !== null ? `-${innerTens}` : ''}`,
    shots: results.reduce((n, r) => n + r.shots, 0),
  }
}

/** Whose a row is, in a list of every student's results (the Scores page). */
export interface RowStudent {
  name: string
  /** Their level's chip. */
  level?: ReactNode
  /** Under the name: the time, or the day and time where the list isn't by day. */
  when?: ReactNode
  /** The other name the search found them by ("also Chloe"). */
  also?: string | null
  /** What was searched: marked in the name. */
  highlight?: string
}

/** The searched-for part of a name, marked. */
function Marked({ text, part }: { text: string; part?: string }) {
  const q = part?.trim().toLowerCase() ?? ''
  const at = q ? text.toLowerCase().indexOf(q) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-amber-200/70 text-inherit dark:bg-amber-500/30">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  )
}

/**
 * One line of a student's results, which opens under itself and closes on a second click (any number can be open,
 * and opening one never scrolls the page): its small target (a pencil for a typed card, a trophy for a match), when,
 * the position and where it came from (the match's name, with each position's score per 10, for a results sheet), its
 * kind, the marks (a new personal best, Check, a coach's note, Just added), its score per 10 (with the decimal for
 * SIUS) and its total with inner tens and shots. Opened, a result shows itself (ResultDetail) and a match its sheet,
 * series by series (MatchCard). Its menu is a right-click away too.
 *
 * `student` makes it a line of every student's results (the Scores page, Goo's pick in docs/DECISIONS.md §29), in
 * columns of its own (FEED_COLUMNS): whose it is (the name, the level's chip, and the time under them), the position
 * and where it came from with its kind, the marks, the score per 10 and the total. On a phone they stack: the name, then
 * the position, where from and when, then the marks, with the score on the right.
 */
export function ResultRow({
  row,
  mode,
  open,
  onToggle,
  entries,
  bests,
  fresh = false,
  freshLabel = 'Just added',
  student,
  footer,
}: {
  row: Row<Result>
  mode: 'admin' | 'coach'
  open: boolean
  onToggle: () => void
  /** The row's actions (useResultActions). */
  entries: MenuEntry[]
  /** Results that were a personal best when they were shot. */
  bests: ReadonlySet<string>
  /** Just added: marked so for a moment. */
  fresh?: boolean
  /** The mark's word ("New" under the Scores page's "Just added"). */
  freshLabel?: string
  /** In a list of every student's results: whose it is, in place of the date. */
  student?: RowStudent
  /** Under the opened result's notes (a link to the student's scores, on the Scores page). */
  footer?: ReactNode
}) {
  const detailId = useId()
  const e = row.results[0]
  const best = row.results.some((r) => bests.has(r.id))
  const match = row.match ? matchFigures(row.results) : null
  const value = match ? match.per10 : per10(e.wholeTotal, e.shots)
  const decimal = !match && e.source === 'sius' ? per10(e.total, e.shots) : null
  const total = match ? match.total : totalWithTens(e)
  const shots = match ? match.shots : e.shots
  const problems = row.results.some((r) => r.problems?.length)
  const note = row.results.some((r) => r.note)
  const where = match ? `${e.match?.name?.trim() || 'Competition'} · ${SOURCE_LABELS.sheet}` : `${POSITION_LABELS[e.position]} · ${e.match?.name || SOURCE_LABELS[e.source]}${typedIn(e) ? ', typed in' : ''}`
  const label = `${student ? `${student.name}, ` : ''}${formatDateKey(e.dateKey, 'medium')}, ${match ? `${e.match?.name || 'a competition'}, from its results sheet` : `${POSITION_LABELS[e.position]}, ${SOURCE_LABELS[e.source]}`}: ${value !== null ? one(value) : 'no score'} per 10 shots${best ? ', a new personal best' : ''}${problems ? ', something to check' : ''}${note ? ', with a coach’s note' : ''}. ${open ? 'Close it' : 'Open it here'}`
  const official =
    e.official && !match ? (
      <span className="shrink-0 text-[10px] font-medium" title={`The written score is official; the app read ${e.official.appTotal}.`}>
        Official
      </span>
    ) : null
  const chevron = <LuChevronDown className={cn('size-4 justify-self-end text-muted-foreground transition-transform duration-200', open && 'rotate-180 text-foreground')} aria-hidden />

  let cells: ReactNode
  if (student) {
    // Every student's results: whose, what, the marks, the score and the total, each in its column.
    const time = e.timeMin !== null && !match ? formatMinutes(e.timeMin) : noTimeWords(e)
    const what = match ? e.match?.name?.trim() || 'Competition' : POSITION_LABELS[e.position]
    const from = match ? SOURCE_LABELS.sheet : e.match?.name?.trim() || SOURCE_LABELS[e.source]
    const dots = (
      <span className="flex shrink-0 items-center gap-0.5" title={(match ? row.results : [e]).map((r) => POSITION_LABELS[r.position]).join(', ')} aria-hidden>
        {(match ? row.results : [e]).map((r) => (
          <span key={r.id} className="size-2 rounded-full" style={{ background: POSITION_COLORS[r.position] }} />
        ))}
      </span>
    )
    cells = (
      <>
        <span className="@2xl:hidden">
          <Thumb row={row} size={36} />
        </span>
        <span className="hidden @2xl:block">
          <Thumb row={row} />
        </span>
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
            <span className="truncate font-semibold">
              <Marked text={student.name} part={student.highlight} />
            </span>
            {student.level ?? null}
          </span>
          {/* On a wide list: when (the day too, where the list isn't by day), and the other name the search found. */}
          <span className="mt-0.5 hidden min-w-0 truncate text-xs text-muted-foreground tabular-nums @2xl:block">
            {student.when ?? time}
            {student.also ? <span> · also {student.also}</span> : null}
          </span>
          {/* On a phone: the position, where it came from and when, under the name. */}
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground @2xl:hidden">
            {dots}
            <span className="min-w-0 truncate tabular-nums">
              {what} · {from} · {student.when ?? time}
              {student.also ? ` · also ${student.also}` : ''}
            </span>
          </span>
        </span>
        <span className="hidden min-w-0 items-center gap-1.5 text-[13px] whitespace-nowrap @2xl:flex">
          {dots}
          {/* A match is its name (its results sheet is said under the student's name); a result its position and source. */}
          {match ? (
            <span className="min-w-0 truncate">{what}</span>
          ) : (
            <>
              <span className="shrink-0">{what}</span>
              <span className="min-w-0 truncate text-muted-foreground">· {from}</span>
            </>
          )}
          <ResultKindChip e={e} />
        </span>
        {/* A column of its own on a wide list, even when empty (the columns after it stay put); a line under the name on a phone. */}
        <span className="col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 empty:hidden @2xl:col-auto @2xl:row-auto @2xl:empty:flex">
          {fresh ? <span className="inline-flex h-4 shrink-0 items-center rounded bg-brand-solid px-1.5 text-[10px] font-semibold text-white">{freshLabel}</span> : null}
          {best ? <BestBadge position={e.position} size="sm" /> : null}
          {problems ? <CheckMark /> : null}
          {official}
          {note ? <LuMessageSquareQuote className="size-3.5 shrink-0 text-muted-foreground" aria-hidden /> : null}
          <ResultKindChip e={e} className="@2xl:hidden" />
        </span>
        <span className="col-start-3 row-start-1 text-right whitespace-nowrap tabular-nums @2xl:col-auto @2xl:row-auto">
          <span className="text-[15px] font-semibold">{value !== null ? one(value) : '—'}</span>
          {decimal !== null ? <span className="ml-1.5 text-xs text-muted-foreground">{one(decimal)}</span> : null}
        </span>
        <span className="hidden text-right text-[13px] whitespace-nowrap tabular-nums @4xl:block">
          {total}
          <span className="text-xs text-muted-foreground"> / {shots}</span>
        </span>
        <span className="hidden @2xl:block">{chevron}</span>
      </>
    )
  } else {
    cells = (
      <>
        <Thumb row={row} />
        <span className="min-w-0">
          <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
            <span className="truncate font-semibold">{formatDateKey(e.dateKey, 'medium')}</span>
            {e.timeMin !== null && !match ? <span className="text-xs font-normal text-muted-foreground tabular-nums">{formatMinutes(e.timeMin)}</span> : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {match ? null : <span className="size-2 shrink-0 rounded-full" style={{ background: POSITION_COLORS[e.position] }} />}
            <span className="max-w-[7.5rem] min-w-16 truncate @xl:max-w-none">{where}</span>
            <ResultKindChip e={e} />
            {/* Each position by name (the third meeting, CP3: a match's positions weren't clear as dots alone). */}
            {match && row.results.length > 1
              ? row.results.map((r) => (
                  <span key={r.id} className="hidden shrink-0 items-center gap-1 tabular-nums @xl:inline-flex" title={`${POSITION_LABELS[r.position]}: ${one(per10(r.wholeTotal, r.shots) ?? 0)} per 10`} data-testid="match-position">
                    <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[r.position] }} />
                    <span className="@5xl:hidden">{POSITION_LETTER[r.position]}</span>
                    <span className="hidden @5xl:inline">{POSITION_LABELS[r.position]}</span> {one(per10(r.wholeTotal, r.shots) ?? 0)}
                  </span>
                ))
              : null}
            {best ? <BestBadge position={e.position} size="sm" words="wide" /> : null}
            {problems ? <CheckMark /> : null}
            {official}
            {note ? <LuMessageSquareQuote className="size-3.5 shrink-0" aria-hidden /> : null}
            {fresh ? <span className="inline-flex h-4 shrink-0 items-center rounded bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{freshLabel}</span> : null}
          </span>
        </span>
        <span className="text-right whitespace-nowrap tabular-nums">
          <span className="text-[15px] font-semibold">{value !== null ? one(value) : '—'}</span>
          {decimal !== null ? <span className="ml-1.5 hidden text-xs text-muted-foreground @xl:inline">{one(decimal)}</span> : null}
          <span className="block text-[11px] text-muted-foreground @xl:hidden">{total}</span>
        </span>
        <span className="hidden text-right text-[13px] whitespace-nowrap tabular-nums @xl:block">
          {total}
          <span className="ml-0.5 text-xs text-muted-foreground">/{shots}</span>
        </span>
        {chevron}
      </>
    )
  }

  return (
    <li className="relative scroll-mt-20 border-b last:border-b-0" data-row={row.key}>
      {open ? <span className="absolute inset-y-0 left-0 z-10 w-0.5 bg-brand-solid" aria-hidden /> : null}
      <ContextMenuFor entries={entries}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? detailId : undefined}
          aria-label={label}
          className={cn(
            student
              ? cn(FEED_COLUMNS, 'min-h-16 w-full px-3.5 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @2xl:px-4')
              : cn(RESULT_COLUMNS, 'min-h-[3.75rem] w-full px-4 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @xl:min-h-16 @xl:px-5'),
            open ? 'bg-muted/50' : 'hover:bg-muted/40',
          )}
          data-testid="result-row"
        >
          {cells}
        </button>
      </ContextMenuFor>
      <Unfold open={open} id={detailId}>
        {match ? (
          <div className="border-t bg-muted/30 pb-4" data-testid="match-detail">
            <MatchCard evaluation={e} results={row.results} className="px-4 pt-4 @xl:px-5" aside={<ItemMenuButton entries={entries} label="More: open the sheet, correct, delete" className="-mr-1" />} />
            <div className="mt-3 space-y-2.5 px-4 empty:hidden @xl:px-5">
              <ResultNotes results={row.results} mode={mode} />
              {footer}
            </div>
          </div>
        ) : (
          <ResultDetail e={e} mode={mode} entries={entries} footer={footer} />
        )}
      </Unfold>
    </li>
  )
}
