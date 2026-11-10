import { type ReactNode, useId, useMemo, useState } from 'react'
import { LuChevronDown, LuMessageSquareQuote, LuPencilLine } from 'react-icons/lu'
import { type Evaluation, POSITION_COLORS, evaluationPoints, isMatchSource, per10, totalWithTens, POSITION_LABELS, SOURCE_LABELS } from '@shared/shooting/evaluation'
import { matchResults } from '@shared/scores/match'
import type { WithId } from '@shared/types'
import { Button } from '@/components/ui/button'
import { one } from '@/features/reports/model'
import { ResultKindChip } from '@/features/scores/kinds'
import { MatchCard } from '@/features/scores/MatchCard'
import { BestBadge } from '@/features/scores/ResultParts'
import { Unfold } from '@/features/scores/ResultRow'
import { MiniTarget } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'
import { FeaturedResult } from './FeaturedResult'
import { formatDateKey, formatMinutes } from '@shared/time'

/** Rows shown before "Show all". */
const LIMIT = 8

/** The list's columns: fewer on a phone, every figure on a wide screen (container widths of the Scores card). */
const COLUMNS =
  'grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-3 @xl:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5.5rem] @2xl:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5.5rem_4.5rem_4.5rem]'

/**
 * A family's results, newest first (parents and students → Scores): a list where every result has a small picture of
 * its target, and each opens under its own row (FeaturedResult), as the staff's list does (Goo, 2026-11-07); the
 * newest is open to start with, or the one the address names. Opening a result plays it back. A family only looks: no
 * menus, its personal bests marked, the coach's notes, and the originals opened in place.
 */
export function ResultsPanel({
  evaluations,
  selectedId,
  onSelect,
  bests,
  onOriginal,
  insight,
}: {
  evaluations: WithId<Evaluation>[]
  /** The result the address names (null: none, so the newest opens). */
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Results that were a personal best when they were shot. */
  bests?: ReadonlySet<string>
  /** Opens a result's original in place. */
  onOriginal?: (e: WithId<Evaluation>) => void
  /** How an opened result compares. */
  insight?: (e: WithId<Evaluation>) => ReactNode
}) {
  const rows = useMemo(() => [...evaluations].reverse(), [evaluations])
  const first = (selectedId && rows.some((e) => e.id === selectedId) ? selectedId : rows[0]?.id) ?? null
  /** The results open (any number), each with how many times it was opened (each opening plays it again). */
  const [open, setOpen] = useState<Record<string, number>>(() => (first ? { [first]: 0 } : {}))
  // A result the address names later (Home's latest scores, a shared link) opens too.
  const [named, setNamed] = useState(selectedId)
  if (selectedId !== named) {
    setNamed(selectedId)
    if (selectedId && rows.some((e) => e.id === selectedId) && !(selectedId in open)) setOpen({ ...open, [selectedId]: 0 })
  }
  const namedAt = selectedId ? rows.findIndex((e) => e.id === selectedId) : -1
  const [showAll, setShowAll] = useState(namedAt >= LIMIT)

  const toggle = (e: WithId<Evaluation>) => {
    if (e.id in open) {
      const next = { ...open }
      delete next[e.id]
      setOpen(next)
      return
    }
    setOpen({ ...open, [e.id]: (open[e.id] ?? 0) + 1 })
    onSelect?.(e.id)
  }

  if (!rows.length) return <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground">No scores yet. Results show here after classes.</p>

  const shown = showAll ? rows : rows.slice(0, LIMIT)

  return (
    <div className="border-t" data-testid="results-list">
      <div className={cn(COLUMNS, 'hidden border-b bg-muted/30 py-2 pl-5 text-xs font-medium text-muted-foreground @xl:grid', 'pr-12')} aria-hidden>
        <span />
        <span>Result</span>
        <span className="text-right">Per 10</span>
        <span className="text-right">Total</span>
        <span className="hidden text-right @2xl:block">Inner tens</span>
        <span className="hidden text-right @2xl:block">Group</span>
      </div>
      <ul className="divide-y">
        {shown.map((e) => (
          <ResultRow key={e.id} e={e} open={e.id in open} onToggle={() => toggle(e)} best={bests?.has(e.id) ?? false}>
            <FeaturedResult
              key={`${e.id}:${open[e.id] ?? 0}`}
              e={e}
              latest={e.id === rows[0].id}
              autoPlay={(open[e.id] ?? 0) > 0}
              best={bests?.has(e.id) ?? false}
              onOriginal={onOriginal}
              insight={insight?.(e)}
            />
            {/* A competition, from its sheet or the results site: the whole match, series by series. */}
            {isMatchSource(e.source) ? <MatchCard evaluation={e} results={matchResults(e, rows)} /> : null}
          </ResultRow>
        ))}
      </ul>
      {rows.length > LIMIT ? (
        <div className="border-t px-5 py-2.5 text-center">
          <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Show the latest only' : `Show all ${rows.length} results`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** One result in a family's list: its target in small, when, the position, and the figures; opened, the result under it. */
function ResultRow({ e, open, onToggle, best = false, children }: { e: WithId<Evaluation>; open: boolean; onToggle: () => void; best?: boolean; children: ReactNode }) {
  const detailId = useId()
  const color = POSITION_COLORS[e.position]
  const whole = per10(e.wholeTotal, e.shots)
  const decimal = e.source === 'sius' ? per10(e.total, e.shots) : null
  const points = evaluationPoints(e)
  return (
    <li className="relative" data-testid="family-result">
      {open ? <span className="absolute inset-y-0 left-0 z-10 w-0.5 bg-brand-solid" aria-hidden /> : null}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        aria-label={
          `${formatDateKey(e.dateKey, 'medium')}, ${POSITION_LABELS[e.position]}, ${SOURCE_LABELS[e.source]}: ${whole !== null ? one(whole) : 'no score'} per 10 shots${best ? ', a new personal best' : ''}${e.note ? ', with a coach’s note' : ''}. ${open ? 'Close it' : 'Open it here'}`
        }
        className={cn('flex w-full items-center gap-2 py-2 pr-5 pl-5 text-left text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', open ? 'bg-muted/50' : 'hover:bg-muted/40')}
      >
        <span className={cn(COLUMNS, 'min-w-0 flex-1')}>
        {points.length ? (
          <MiniTarget points={points} color={color} size={40} />
        ) : (
          <span className="flex size-10 items-center justify-center rounded-full border border-dashed text-muted-foreground" title="Typed in: no places on the target">
            <LuPencilLine className="size-4" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-medium">
            {formatDateKey(e.dateKey, 'medium')}
            {e.timeMin !== null ? <span className="ml-1.5 text-xs font-normal text-muted-foreground tabular-nums">{formatMinutes(e.timeMin)}</span> : null}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
            <span className="truncate">
              {POSITION_LABELS[e.position]} · {e.match?.name || SOURCE_LABELS[e.source]}
            </span>
            <ResultKindChip e={e} />
            {best ? <BestBadge position={e.position} size="sm" words="wide" /> : null}
            {e.note ? <LuMessageSquareQuote className="size-3.5 shrink-0" aria-hidden /> : null}
          </span>
        </span>
        <span className="text-right tabular-nums">
          <span className="font-semibold">{whole !== null ? one(whole) : '—'}</span>
          {decimal !== null ? <span className="ml-1.5 text-xs text-muted-foreground">{one(decimal)}</span> : null}
        </span>
        <span className="hidden text-right tabular-nums @xl:block">
          {totalWithTens(e)} <span className="text-xs text-muted-foreground">/ {e.shots}</span>
        </span>
        <span className="hidden text-right tabular-nums @2xl:block">{e.innerTens ?? '—'}</span>
        <span className="hidden text-right tabular-nums @2xl:block">{e.groupMm !== null ? `${one(e.groupMm)} mm` : '—'}</span>
        </span>
        <LuChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180 text-foreground')} aria-hidden />
      </button>
      <Unfold open={open} id={detailId}>
        <div className="scroll-mt-16 border-t bg-muted/20" data-testid="family-result-detail">
          {children}
        </div>
      </Unfold>
    </li>
  )
}
