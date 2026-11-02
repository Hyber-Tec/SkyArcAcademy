import { type ReactNode, useMemo, useRef, useState } from 'react'
import { LuMessageSquareQuote, LuPencilLine } from 'react-icons/lu'
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, SOURCE_LABELS, evaluationPoints, per10, totalWithTens } from '@shared/shooting/evaluation'
import { matchResults } from '@shared/scores/match'
import { formatDateKey, formatMinutes } from '@shared/time'
import type { WithId } from '@shared/types'
import { Button } from '@/components/ui/button'
import { one } from '@/features/reports/model'
import { ResultKindChip } from '@/features/scores/kinds'
import { MatchCard } from '@/features/scores/MatchCard'
import { prefersReducedMotion } from '@/features/scores/playback'
import { BestBadge } from '@/features/scores/ResultParts'
import { MiniTarget } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'
import { FeaturedResult } from './FeaturedResult'

/** Rows shown before "Show all". */
const LIMIT = 8

/** The list's columns: fewer on a phone, every figure on a wide screen (container widths of the Scores card). */
const COLUMNS =
  'grid grid-cols-[2.5rem_minmax(0,1fr)_4.5rem] items-center gap-x-3 @xl:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5.5rem] @2xl:grid-cols-[2.5rem_minmax(0,1fr)_4.5rem_5.5rem_4.5rem_4.5rem]'

/**
 * A family's results, newest first (parents and students → Scores): the one picked shown large (FeaturedResult), above
 * a list where every result has a small picture of its target. Picking a result plays it back. A family only looks: no
 * menus, its personal bests marked, the coach's notes, and the originals opened in place. Staff see a student's results
 * as a list that opens in place instead (features/scores/ResultRow.tsx).
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
  /** The result shown large when the page keeps it (in the address; null: the newest). */
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Results that were a personal best when they were shot. */
  bests?: ReadonlySet<string>
  /** Opens a result's original in place. */
  onOriginal?: (e: WithId<Evaluation>) => void
  /** How the result shown large compares. */
  insight?: (e: WithId<Evaluation>) => ReactNode
}) {
  /** The result picked, and how many times (each pick plays it again). */
  const [picked, setPicked] = useState<{ id: string; times: number } | null>(null)
  const [showAll, setShowAll] = useState(false)
  const featured = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => [...evaluations].reverse(), [evaluations])
  const shownId = selectedId !== undefined ? selectedId : picked?.id
  const selected = rows.find((e) => e.id === shownId) ?? rows[0] ?? null

  const pick = (e: WithId<Evaluation>) => {
    setPicked((p) => ({ id: e.id, times: (p?.id === e.id ? p.times : 0) + 1 }))
    onSelect?.(e.id)
    // The picture sits above the list: bring it back into view when it has scrolled away.
    const el = featured.current
    if (!el) return
    const top = el.getBoundingClientRect().top
    if (top < 56 || top > window.innerHeight * 0.5) el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }

  if (!selected) return <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground">No scores yet. Results show here after classes.</p>

  const shown = showAll ? rows : rows.slice(0, LIMIT)
  const replays = picked?.id === selected.id ? picked.times : 0

  return (
    <>
      <div ref={featured} className="scroll-mt-16 border-t">
        <FeaturedResult
          key={`${selected.id}:${replays}`}
          e={selected}
          latest={selected.id === rows[0].id}
          autoPlay={replays > 0}
          best={bests?.has(selected.id) ?? false}
          onOriginal={onOriginal}
          insight={insight?.(selected)}
        />
        {/* A competition from its sheet: the whole match, series by series. */}
        {selected.source === 'sheet' ? <MatchCard evaluation={selected} results={matchResults(selected, rows)} /> : null}
      </div>

      <div className="border-t" data-testid="results-list">
        <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-2">
          <h3 className="text-sm font-semibold">All results</h3>
          <span className="text-xs text-muted-foreground">{rows.length === 1 ? '1 result' : `${rows.length} results`}</span>
        </div>
        <div className={cn(COLUMNS, 'hidden border-y bg-muted/30 py-2 pl-5 text-xs font-medium text-muted-foreground @xl:grid', 'pr-5')} aria-hidden>
          <span />
          <span>Result</span>
          <span className="text-right">Per 10</span>
          <span className="text-right">Total</span>
          <span className="hidden text-right @2xl:block">Inner tens</span>
          <span className="hidden text-right @2xl:block">Group</span>
        </div>
        <ul className="divide-y border-t @xl:border-t-0">
          {shown.map((e) => (
            <ResultRow key={e.id} e={e} selected={e.id === selected.id} onPick={() => pick(e)} best={bests?.has(e.id) ?? false} />
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
    </>
  )
}

/** One result in a family's list: its target in small, when, the position, and the figures. The row shows it large. */
function ResultRow({ e, selected, onPick, best = false }: { e: WithId<Evaluation>; selected: boolean; onPick: () => void; best?: boolean }) {
  const color = POSITION_COLORS[e.position]
  const whole = per10(e.wholeTotal, e.shots)
  const decimal = e.source === 'sius' ? per10(e.total, e.shots) : null
  const points = evaluationPoints(e)
  return (
    <li className={cn('relative flex items-center gap-1 transition-colors', 'pr-5', selected ? 'bg-muted/70' : 'hover:bg-muted/40')}>
      {selected ? <span className="absolute inset-y-0 left-0 w-0.5 bg-brand-solid" aria-hidden /> : null}
      <button
        type="button"
        onClick={onPick}
        aria-current={selected ? 'true' : undefined}
        aria-label={`${formatDateKey(e.dateKey, 'medium')}, ${POSITION_LABELS[e.position]}, ${SOURCE_LABELS[e.source]}: ${whole !== null ? one(whole) : 'no score'} per 10 shots${best ? ', a new personal best' : ''}${e.note ? ', with a coach’s note' : ''}. Show it above`}
        className={cn(COLUMNS, 'min-w-0 flex-1 rounded-md py-2 pl-5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset')}
      >
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
      </button>
    </li>
  )
}
