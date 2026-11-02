import { type ReactNode, useEffect, useId, useState } from 'react'
import { LuChevronDown, LuMessageSquareQuote, LuPencilLine, LuTrophy } from 'react-icons/lu'
import { type MatchResult, type ResultRow as Row, matchTotal } from '@shared/scores/match'
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
import { RESULT_COLUMNS } from './results'
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
function Thumb({ row }: { row: Row<Result> }) {
  if (row.match)
    return (
      <span className="flex size-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950/70 dark:text-violet-300" title="A competition, from its results sheet">
        <LuTrophy className="size-[18px]" />
      </span>
    )
  const e = row.results[0]
  const points = evaluationPoints(e)
  if (!points.length)
    return (
      <span className="flex size-10 items-center justify-center rounded-full border-[1.5px] border-dashed text-muted-foreground" title="Typed in: no places on the target">
        <LuPencilLine className="size-4" />
      </span>
    )
  return <MiniTarget points={points} color={POSITION_COLORS[e.position]} size={40} />
}

/** A match's figures: its total and inner tens over its positions, and every shot's average per 10. */
function matchFigures(results: readonly MatchResult[]) {
  const { total, innerTens, whole } = matchTotal(results)
  const shots = results.reduce((n, r) => n + r.shots, 0)
  return {
    per10: per10(
      results.reduce((n, r) => n + r.wholeTotal, 0),
      shots,
    ),
    total: `${whole ? total : total.toFixed(1)}${innerTens !== null ? `-${innerTens}` : ''}`,
    shots,
  }
}

/**
 * One line of a student's results, which opens under itself and closes on a second click (any number can be open,
 * and opening one never scrolls the page): its small target (a pencil for a typed card, a trophy for a match), when,
 * the position and where it came from (the match's name, with each position's score per 10, for a results sheet), its
 * kind, the marks (a new personal best, Check, a coach's note, Just added), its score per 10 (with the decimal for
 * SIUS) and its total with inner tens and shots. Opened, a result shows itself (ResultDetail) and a match its sheet,
 * series by series (MatchCard). Its menu is a right-click away too. `student` puts the student's name and level in place
 * of the date, for a list of every student's results grouped by day (the Scores page).
 */
export function ResultRow({
  row,
  mode,
  open,
  onToggle,
  entries,
  bests,
  fresh = false,
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
  /** In a list of every student's results: whose it is (their name and level chip), in place of the date. */
  student?: { name: string; level?: ReactNode }
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
            RESULT_COLUMNS,
            'min-h-[3.75rem] w-full px-4 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset @xl:min-h-16 @xl:px-5',
            open ? 'bg-muted/50' : 'hover:bg-muted/40',
          )}
          data-testid="result-row"
        >
          <Thumb row={row} />
          <span className="min-w-0">
            <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap">
              {student ? (
                <>
                  <span className="truncate font-semibold">{student.name}</span>
                  {student.level ?? null}
                </>
              ) : (
                <span className="truncate font-semibold">{formatDateKey(e.dateKey, 'medium')}</span>
              )}
              {e.timeMin !== null && !match ? <span className="text-xs font-normal text-muted-foreground tabular-nums">{formatMinutes(e.timeMin)}</span> : null}
            </span>
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              {match ? null : <span className="size-2 shrink-0 rounded-full" style={{ background: POSITION_COLORS[e.position] }} />}
              <span className="max-w-[7.5rem] min-w-0 truncate @xl:max-w-none">{where}</span>
              <ResultKindChip e={e} />
              {match && row.results.length > 1
                ? row.results.map((r) => (
                    <span key={r.id} className="hidden shrink-0 items-center gap-1 tabular-nums @2xl:inline-flex" title={`${POSITION_LABELS[r.position]}: ${one(per10(r.wholeTotal, r.shots) ?? 0)} per 10`}>
                      <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[r.position] }} />
                      {one(per10(r.wholeTotal, r.shots) ?? 0)}
                    </span>
                  ))
                : null}
              {best ? <BestBadge position={e.position} size="sm" words="wide" /> : null}
              {problems ? (
                <span className="inline-flex h-4 shrink-0 items-center rounded px-1.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-400 ring-inset dark:text-amber-300 dark:ring-amber-700" title="Something to check: open it">
                  Check
                </span>
              ) : null}
              {e.official && !match ? (
                <span className="shrink-0 text-[10px] font-medium" title={`The written score is official; the app read ${e.official.appTotal}.`}>
                  Official
                </span>
              ) : null}
              {note ? <LuMessageSquareQuote className="size-3.5 shrink-0" aria-hidden /> : null}
              {fresh ? <span className="inline-flex h-4 shrink-0 items-center rounded bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">Just added</span> : null}
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
          <LuChevronDown className={cn('size-4 justify-self-end text-muted-foreground transition-transform duration-200', open && 'rotate-180 text-foreground')} aria-hidden />
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
