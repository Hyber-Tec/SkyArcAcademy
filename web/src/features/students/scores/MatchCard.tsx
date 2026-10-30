import { useState } from 'react'
import { LuChevronDown, LuPencilLine, LuTrophy } from 'react-icons/lu'
import { type MatchResult, isWholeResult, matchTotal, seriesInnerTens, seriesLabel, seriesTotalText, shotLabel } from '@shared/scores/match'
import { POSITION_COLORS, POSITION_LABELS, evaluationPoints } from '@shared/shooting/evaluation'
import { isInnerTen } from '@shared/shooting/target'
import { formatDateKey } from '@shared/time'
import { ShotReplay } from '@/features/scores/ShotReplay'
import { MiniTarget } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'

/**
 * A competition from its results sheet, as the match was (the owner, 2026-10-29: "in one competition we have six
 * sections: click one and see all its shots and the animation"): the match's total and inner tens, then each series of
 * ten as the sheet prints it ("K1–K10 · 71 - 1") with its shots on a small target when the sheet's pictures gave their
 * places. Opening a series shows its shots and plays them back. The phone shows the same (mobile/src/features/scores/
 * MatchCard.tsx); the sums are shared (shared/src/scores/match.ts).
 */
export function MatchCard({ evaluation, results }: { evaluation: MatchResult; results: MatchResult[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const { total, innerTens, whole } = matchTotal(results)
  const rows = results.flatMap((r) => r.series.map((s) => ({ key: `${r.id}-${s.n}`, r, s, points: evaluationPoints({ series: [s] }) })))
  const shown = rows.find((x) => x.key === open) ?? null
  return (
    <section className="border-t px-5 py-4" aria-label="The match" data-testid="match-card">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <LuTrophy className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{evaluation.match?.name?.trim() || 'Competition'}</h3>
          <p className="truncate text-xs text-muted-foreground">{[formatDateKey(evaluation.dateKey, 'medium'), evaluation.match?.course?.trim()].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            {whole ? total : total.toFixed(1)}
            {innerTens !== null ? <span className="text-sm font-medium text-muted-foreground"> - {innerTens}</span> : null}
          </div>
          <div className="text-[11px] text-muted-foreground">{results.length > 1 ? 'the match' : POSITION_LABELS[evaluation.position]}</div>
        </div>
      </div>

      {results.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {results.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
              <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[r.position] }} />
              {POSITION_LABELS[r.position]}
              <span className="font-semibold tabular-nums">
                {isWholeResult(r) ? r.total : r.total.toFixed(1)}
                {r.innerTens !== null ? ` - ${r.innerTens}` : ''}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {rows.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2 @xl:grid-cols-3">
          {rows.map(({ key, r, s, points }) => (
            <button
              key={key}
              type="button"
              onClick={() => setOpen(open === key ? null : key)}
              aria-expanded={open === key}
              className={cn('flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors hover:bg-muted/50', open === key && 'border-foreground/40 bg-muted/60')}
              data-testid={`match-series-${key}`}
            >
              {points.length ? (
                <MiniTarget points={points} color={POSITION_COLORS[r.position]} size={36} />
              ) : (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground">
                  <LuPencilLine className="size-3.5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs text-muted-foreground">{POSITION_LABELS[r.position]}</span>
                <span className="block truncate text-sm font-medium">{seriesLabel(r.position, s)}</span>
              </span>
              <span className="text-sm font-semibold tabular-nums">
                {seriesTotalText(s, whole)}
                <span className="font-normal text-muted-foreground"> - {seriesInnerTens(s)}</span>
              </span>
              <LuChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open === key && 'rotate-180')} />
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Only the totals were saved for this match: its shots weren’t on the sheet, or were typed as totals.</p>
      )}

      {shown ? (
        <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border bg-card p-4" data-testid="match-series-open">
          <p className="text-sm font-semibold">
            {POSITION_LABELS[shown.r.position]} · {seriesLabel(shown.r.position, shown.s)}
          </p>
          {shown.points.length ? (
            <ShotReplay key={shown.key} evaluation={{ source: shown.r.source, series: [shown.s] }} color={POSITION_COLORS[shown.r.position]} size={300} autoPlay />
          ) : (
            <p className="text-center text-xs text-balance text-muted-foreground">The sheet’s picture of this series couldn’t be read, so its shots have no places on the target.</p>
          )}
          <div className="flex flex-wrap justify-center gap-1.5">
            {shown.s.shots.map((t, k) => {
              const x = isInnerTen(t.v)
              return (
                <span key={k} className={cn('flex min-w-14 flex-col items-center rounded-md px-1.5 py-1', x ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200' : 'bg-muted')}>
                  <span className="text-[10px] text-muted-foreground">{shotLabel(shown.r.position, shown.s.n, k)}</span>
                  <span className="text-sm font-semibold tabular-nums">
                    {whole && Number.isInteger(t.v) ? t.v : t.v.toFixed(1)}
                    {x ? '*' : ''}
                  </span>
                </span>
              )
            })}
          </div>
        </div>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-foreground">* an inner ten. A series’ score is its total, then its inner tens.</p>
    </section>
  )
}
