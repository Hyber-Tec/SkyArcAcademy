import { LuMinus, LuTrendingDown, LuTrendingUp } from 'react-icons/lu'
import { POSITION_COLORS, POSITION_LABELS, type Position, RESULT_KIND_LABELS, type ResultKind } from '@shared/shooting/evaluation'
import type { PositionSummary, PositionTrend } from '@shared/shooting/summary'
import type { DateKey } from '@shared/time'
import { one } from '@/features/reports/model'
import { shortDate } from '@/features/scores/results'
import { cn } from '@/lib/utils'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

/** What the trend chip says when it's pointed at: the two halves it compares. */
function trendTitle(t: PositionTrend): string {
  return t.size === 1
    ? `The latest result is ${one(t.newer)} per 10; the first was ${one(t.older)}. Improving from +1, dipping from −1.5, as the progress reports say.`
    : `The latest ${t.size} results average ${one(t.newer)} per 10; the first ${t.size}, ${one(t.older)}. Improving from +1, dipping from −1.5, as the progress reports say.`
}

const TREND = {
  improving: { icon: LuTrendingUp, className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/50 dark:text-emerald-300 dark:ring-emerald-400/20' },
  steady: { icon: LuMinus, className: 'bg-muted text-muted-foreground ring-transparent' },
  dipping: { icon: LuTrendingDown, className: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-400/20' },
}

/** Which way a position is going: "+1.1 vs earlier", "Steady", "−2 vs earlier" (or "One result"). */
function TrendChip({ trend }: { trend: PositionTrend | null }) {
  if (!trend) return <span className="inline-flex h-[22px] items-center rounded-full bg-muted px-2 text-xs font-semibold whitespace-nowrap text-muted-foreground">One result</span>
  const s = TREND[trend.level]
  const change = Math.abs(trend.change)
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1 rounded-full px-2 text-xs font-semibold whitespace-nowrap tabular-nums ring-1 ring-inset', s.className)} title={trendTitle(trend)} data-testid="position-trend">
      <s.icon className="size-3.5" aria-hidden />
      {trend.level === 'steady' ? 'Steady' : `${trend.change > 0 ? '+' : '−'}${one(change)} vs earlier`}
    </span>
  )
}

/** The results in date order as a small line, ending on a dot (lighter in dark mode, so the position's color reads). */
function TileLine({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const W = 112
  const H = 34
  const lo = Math.min(...values) - 1
  const hi = Math.max(...values) + 1
  const x = (i: number) => 4 + (i / (values.length - 1)) * (W - 8)
  const y = (v: number) => 4 + (1 - (v - lo) / (hi - lo)) * (H - 8)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const last = values.length - 1
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block shrink-0 overflow-visible dark:brightness-150" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={3.5} fill={color} className="stroke-card" strokeWidth={2} />
    </svg>
  )
}

function Name({ position }: { position: Position }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
      <span className="size-2 shrink-0 rounded-full" style={{ background: POSITION_COLORS[position] }} />
      {POSITION_LABELS[position]}
    </span>
  )
}

/**
 * Each position at a glance, one tile per position the student has results in: the average per 10 shots, which way
 * it's going against earlier results (shared/src/shooting/summary.ts), a small line of the results in date order, the
 * best and how many. They follow the kind picked above (practice, competitions, evaluations): a position with none of
 * that kind says so. Three side by side; one above the other in a narrow column.
 */
export function PositionTiles({ positions, summaries, kind, today }: { positions: readonly Position[]; summaries: PositionSummary[]; kind: ResultKind | 'all'; today: DateKey }) {
  if (!positions.length) return null
  return (
    <div className="grid grid-cols-1 gap-2 @3xl:grid-cols-3 @3xl:gap-3" data-testid="position-tiles">
      {positions.map((position) => {
        const s = summaries.find((x) => x.position === position)
        if (!s || s.average === null)
          return (
            <section key={position} className="min-w-0 rounded-xl border bg-card px-4 py-3 @3xl:py-3.5" aria-label={POSITION_LABELS[position]}>
              <Name position={position} />
              <p className="mt-2 text-[13px] text-muted-foreground @3xl:mt-3.5">No {kind === 'all' ? '' : `${RESULT_KIND_LABELS[kind].toLowerCase()} `}results yet.</p>
            </section>
          )
        return (
          <section key={position} className="min-w-0 rounded-xl border bg-card px-3.5 py-2.5 @md:px-4 @md:py-3 @3xl:py-3.5" aria-label={POSITION_LABELS[position]} data-testid="position-tile">
            <div className="flex items-center justify-between gap-2">
              <Name position={position} />
              <TrendChip trend={s.trend} />
            </div>
            <div className="mt-1.5 flex items-end justify-between gap-3 @3xl:mt-2.5">
              <p className="min-w-0">
                <span className="block text-2xl leading-none font-semibold tracking-tight tabular-nums @3xl:text-[1.9rem]">{one(s.average)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">average per 10</span>
              </p>
              <TileLine values={s.line} color={POSITION_COLORS[position]} />
            </div>
            <div className="mt-1.5 flex justify-between gap-2 text-[12.5px] whitespace-nowrap text-muted-foreground @3xl:mt-3 @3xl:border-t @3xl:pt-2.5">
              <span className="min-w-0 truncate">
                {s.best ? (
                  <>
                    Best <span className="font-semibold text-foreground tabular-nums">{one(s.best.per10)}</span> · {shortDate(s.best.dateKey, today)}
                  </>
                ) : null}
              </span>
              <span>{plural(s.results, 'result')}</span>
            </div>
          </section>
        )
      })}
    </div>
  )
}
