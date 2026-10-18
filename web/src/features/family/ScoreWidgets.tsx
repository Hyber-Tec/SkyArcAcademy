import { useMemo, useState } from 'react'
import { LuArrowDownRight, LuArrowRight, LuArrowUpRight, LuChartLine, LuCrosshair, LuTrophy } from 'react-icons/lu'
import { toPoint } from '@shared/reports/facts'
import { type Evaluation, POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, pointOf, wholePer10 } from '@shared/shooting/evaluation'
import type { PositionProgress } from '@shared/shooting/progress'
import { type ShotPoint, meanPoint, offsetWords, targetViewMm, wholeScore } from '@shared/shooting/target'
import { type DateKey, formatDateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { plural } from '@/features/home/parts'
import { DistributionBar, Sparkline, TrendChart } from '@/features/reports/charts'
import { one, trendSeries } from '@/features/reports/model'
import { INK } from '@/features/reports/paper'
import { ShotMark, TargetFace } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'

/**
 * The families' Scores page, beyond the results themselves (ScoresPage.tsx): each position at a glance, the scores over
 * time, and where the shots land. Charts sit on light paper in every theme, as on the staff's Scores tab and in the
 * reports, so the position colors always read.
 */

const round1 = (n: number) => Math.round(n * 10) / 10

/** A position's color and name, as every list shows them. */
function PositionName({ position, className }: { position: Position; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: POSITION_COLORS[position] }} aria-hidden />
      {POSITION_LABELS[position]}
    </span>
  )
}

/** Two choices or more in a row of small tabs (a position). */
function PositionSwitch({ positions, value, onChange }: { positions: readonly Position[]; value: Position; onChange: (p: Position) => void }) {
  if (positions.length < 2) return null
  return (
    <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label="Position">
      {positions.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={value === p}
          onClick={() => onChange(p)}
          className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium', value === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
        >
          <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[p] }} />
          {POSITION_LABELS[p]}
        </button>
      ))}
    </div>
  )
}

/** "+1.5 above average", "2 below average", "at the average": calm words, never red. */
function VersusAverage({ diff }: { diff: number }) {
  const Icon = diff > 0 ? LuArrowUpRight : diff < 0 ? LuArrowDownRight : LuArrowRight
  return (
    <span className={cn('inline-flex items-start gap-0.5 text-xs font-medium', diff > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {diff === 0 ? 'at the average' : `${one(Math.abs(diff))} ${diff > 0 ? 'above' : 'below'} average`}
    </span>
  )
}

/**
 * Each position at a glance: the average per 10 shots, its results as a small line, the best (with its date) and the
 * latest against the average; the best and the latest open their result. Where they'd be narrow (a phone, a tablet
 * beside the menu) the positions sit side by side as tiles of the average and the best, so the results start on the
 * first screen.
 */
export function PositionCards({ evaluations, progress, onPick }: { evaluations: WithId<Evaluation>[]; progress: PositionProgress[]; onPick: (id: string) => void }) {
  if (!progress.length) return null
  const cols = progress.length === 1 ? 'grid-cols-1' : progress.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
  return (
    // The cards' own width decides between tiles and full cards (the menu beside them takes its share).
    <div className="@container">
      <div className={cn('grid gap-2 @lg:gap-3', cols)} data-testid="position-cards">
        {progress.map((p) => (
          <PositionCard
            key={p.position}
            p={p}
            values={evaluations.filter((e) => e.position === p.position && e.shots > 0).map(wholePer10)}
            onPick={onPick}
            wide={progress.length === 1}
          />
        ))}
      </div>
    </div>
  )
}

/** One of a position's results (its best, its latest), opening it: what it is, the score and the day. */
function ResultLink({ label, mark, onPick, aria, children }: { label: React.ReactNode; mark: { id: string; per10: number; dateKey: DateKey }; onPick: (id: string) => void; aria: string; children?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => onPick(mark.id)}
      aria-label={`${aria}: ${one(mark.per10)} on ${formatDateKey(mark.dateKey, 'medium')}. Show it`}
      className="flex min-w-0 flex-col items-start rounded-lg px-2 py-1.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-1 text-xs text-muted-foreground">{label}</span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-base font-semibold tabular-nums">{one(mark.per10)}</span>
        <span className="text-xs text-muted-foreground">{formatDateKey(mark.dateKey, 'monthDay')}</span>
      </span>
      {children}
    </button>
  )
}

const trophy = <LuTrophy className="size-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />

function PositionCard({ p, values, onPick, wide }: { p: PositionProgress; values: (number | null)[]; onPick: (id: string) => void; wide: boolean }) {
  const color = POSITION_COLORS[p.position]
  const name = POSITION_LABELS[p.position].toLowerCase()
  const diff = p.latest && p.average !== null && p.results > 1 ? round1(p.latest.per10 - p.average) : null
  const only = p.results === 1 ? p.latest : null
  // A phone's line under the average: the best, or the only result.
  const phone = only ?? p.best
  return (
    <section className="flex min-w-0 flex-col rounded-xl border bg-card p-3 @4xl:p-4" aria-label={POSITION_LABELS[p.position]} data-testid="position-card">
      <div className="flex items-center justify-between gap-2">
        <h3 className="min-w-0 truncate text-xs font-semibold @lg:text-sm">
          <PositionName position={p.position} />
        </h3>
        <span className="hidden text-xs text-muted-foreground @4xl:inline">{plural(p.results, 'result')}</span>
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-4 @4xl:mt-2">
        <p className="min-w-0">
          <span className="text-2xl leading-none font-semibold tracking-tight tabular-nums @4xl:text-3xl">{p.average !== null ? one(p.average) : '—'}</span>
          <span className="mt-1 block text-[11px] text-muted-foreground @4xl:text-xs">
            average<span className="hidden @lg:inline"> per 10 shots</span>
          </span>
        </p>
        {values.filter((v) => v !== null).length >= 2 ? (
          // The results in order, as a small line (lighter in dark mode, so the position's color reads on the card).
          <div className={cn('hidden shrink-0 pb-1 @4xl:block dark:brightness-150', wide ? 'w-40' : 'w-24')} aria-hidden>
            <Sparkline values={values} color={color} height={28} />
          </div>
        ) : null}
      </div>
      {phone ? (
        <button
          type="button"
          onClick={() => onPick(phone.id)}
          aria-label={`${only ? `The only ${name} result so far` : `The best ${name} result`}: ${one(phone.per10)} on ${formatDateKey(phone.dateKey, 'medium')}. Show it`}
          className="-mx-1 mt-2 flex min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left text-xs outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring @4xl:hidden"
        >
          {only ? <span className="text-muted-foreground">1 result ·</span> : trophy}
          {only ? null : <span className="font-semibold tabular-nums">{one(phone.per10)}</span>}
          <span className="truncate text-muted-foreground">{formatDateKey(phone.dateKey, 'monthDay')}</span>
        </button>
      ) : null}
      <div className="-mx-2 mt-3 hidden grid-cols-2 gap-1 border-t pt-2 @4xl:grid">
        {only ? (
          <ResultLink label="One result so far" mark={only} onPick={onPick} aria={`The only ${name} result so far`} />
        ) : (
          <>
            {p.best ? (
              <ResultLink
                label={
                  <>
                    {trophy} Best
                  </>
                }
                mark={p.best}
                onPick={onPick}
                aria={`The best ${name} result`}
              />
            ) : (
              <span />
            )}
            {p.latest ? (
              <ResultLink label="Latest" mark={p.latest} onPick={onPick} aria={`The latest ${name} result`}>
                {diff !== null ? <VersusAverage diff={diff} /> : null}
              </ResultLink>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

/** A card with a title bar, as the Compare card has. */
function Card({ icon: Icon, title, aside, children, testId }: { icon: typeof LuChartLine; title: string; aside?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid={testId}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-4 text-muted-foreground" /> {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Every result's score per 10 shots over time, one line per position (the report's chart). */
export function ScoresOverTime({ evaluations, today, label }: { evaluations: WithId<Evaluation>[]; today: DateKey; label: string }) {
  const points = useMemo(() => evaluations.filter((e) => e.shots > 0).map(toPoint), [evaluations])
  if (points.length < 2) return null
  const last = points[points.length - 1].dateKey
  return (
    <Card icon={LuChartLine} title="Scores over time" aside={<span className="text-xs text-muted-foreground">per 10 shots</span>} testId="scores-over-time">
      <div className="p-3 sm:p-5">
        <div className="rounded-xl border bg-white p-3 text-[#0b0b0b] sm:p-4">
          <TrendChart series={trendSeries(points)} from={points[0].dateKey} to={today > last ? today : last} label={label} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Point at a dot to see that day’s scores. Higher is better; 100 is every shot a 10.</p>
      </div>
    </Card>
  )
}

/** How many of the latest results of a position the pattern gathers. */
const PATTERN_RESULTS = 5
const PATTERN_PX = 240

/** The shots' average point: a blue cross (the replay's), edged in white so it reads over the shots and the black. */
function AverageCross({ point, view }: { point: ShotPoint; view: number }) {
  const arm = view / 9
  const lines = (
    <>
      <line x1={point.x - arm} x2={point.x + arm} y1={-point.y} y2={-point.y} />
      <line x1={point.x} x2={point.x} y1={-point.y - arm} y2={-point.y + arm} />
    </>
  )
  return (
    <g strokeLinecap="round" data-testid="average-cross">
      <g stroke="#ffffff" strokeWidth={view / 28}>{lines}</g>
      <g stroke="#2f80ed" strokeWidth={view / 60}>{lines}</g>
    </g>
  )
}

/**
 * Where the shots land: every shot of a position's latest results on one target, with their average point (the blue
 * cross) in words, how the shots scored (10s, 9s, 8s, 7 or less), and the group size against the earlier results. Typed
 * paper cards add their scores but have no places on the target.
 */
export function ShotPattern({ evaluations }: { evaluations: WithId<Evaluation>[] }) {
  const withShots = useMemo(() => evaluations.filter((e) => e.series.some((s) => s.shots.length)), [evaluations])
  const positions = POSITIONS.filter((p) => withShots.some((e) => e.position === p))
  const latestPosition = [...withShots].reverse()[0]?.position ?? null
  const [chosen, setChosen] = useState<Position | null>(null)
  const position = chosen && positions.includes(chosen) ? chosen : latestPosition
  if (!position) return null

  const list = withShots.filter((e) => e.position === position)
  const recent = list.slice(-PATTERN_RESULTS)
  const shots = recent.flatMap((e) => e.series.flatMap((s) => s.shots))
  const points = shots.map(pointOf).filter((p): p is ShotPoint => p !== null)
  const mpi = points.length >= 2 ? meanPoint(points) : null
  const where = mpi ? offsetWords(mpi) : null
  const whole = shots.map((t) => wholeScore(t.v))
  const groups = (l: WithId<Evaluation>[]) => l.map((e) => e.groupMm).filter((g): g is number => typeof g === 'number' && g > 0)
  const avg = (v: number[]) => (v.length ? round1(v.reduce((n, x) => n + x, 0) / v.length) : null)
  const group = avg(groups(recent))
  const before = avg(groups(list.slice(0, -PATTERN_RESULTS)))
  const name = POSITION_LABELS[position].toLowerCase()
  const color = POSITION_COLORS[position]
  const day = (e: WithId<Evaluation>) => formatDateKey(e.dateKey, 'monthDay')
  const from =
    recent.length === 1
      ? `the ${name} result of ${day(recent[0])}`
      : recent.length === 2
        ? `2 ${name} results (${day(recent[0])} and ${day(recent[1])})`
        : `${recent.length < list.length ? 'the last ' : ''}${recent.length} ${name} results (${day(recent[0])} to ${day(recent[recent.length - 1])})`
  const unplaced = shots.length - points.length
  const view = targetViewMm(points, PATTERN_PX)

  return (
    <Card icon={LuCrosshair} title="Where the shots land" aside={<PositionSwitch positions={positions} value={position} onChange={setChosen} />} testId="shot-pattern">
      <div className="p-3 sm:p-5">
        <div className="grid items-center gap-5 rounded-xl border bg-white p-4 text-[#0b0b0b] sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8 sm:p-5">
          {points.length ? (
            <div className="mx-auto w-full max-w-[15rem] sm:w-60">
              <TargetFace view={view} size={PATTERN_PX} label={`${points.length} ${name} shots on one target${mpi ? ', with their average point' : ''}`} className="block h-auto w-full">
                {points.map((pt, i) => (
                  <ShotMark key={i} point={pt} view={view} color={color} />
                ))}
                {mpi ? <AverageCross point={mpi} view={view} /> : null}
              </TargetFace>
            </div>
          ) : (
            <div className="mx-auto flex aspect-square w-full max-w-[12rem] items-center justify-center rounded-full border border-dashed p-6 text-center text-xs leading-snug" style={{ borderColor: INK.hairline, color: INK.muted }}>
              Typed-in paper cards: where the shots landed isn’t recorded
            </div>
          )}
          <div className="min-w-0 space-y-4 text-sm">
            <div>
              <p className="font-medium">
                {plural(shots.length, 'shot')} from {from}
                {unplaced && points.length ? <span className="font-normal" style={{ color: INK.muted }}>{` (${unplaced} typed in, without a place on the target)`}</span> : null}
              </p>
              <p className="mt-1" style={{ color: INK.secondary }}>
                {mpi
                  ? where
                    ? `On average they land ${where} of the centre (the blue cross), ${one(round1(Math.hypot(mpi.x, mpi.y)))} mm away.`
                    : 'On average they land right on the centre (the blue cross).'
                  : points.length
                    ? 'One shot on the target.'
                    : 'Only their scores were typed in, so the target stays empty.'}
              </p>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium" style={{ color: INK.secondary }}>
                Each shot’s score
              </p>
              <DistributionBar tens={whole.filter((v) => v >= 10).length} nines={whole.filter((v) => v === 9).length} eights={whole.filter((v) => v === 8).length} lower={whole.filter((v) => v <= 7).length} />
            </div>
            {group !== null ? (
              <p style={{ color: INK.secondary }}>
                Group size <span className="font-semibold text-[#0b0b0b] tabular-nums">{one(group)} mm</span> on average
                {before !== null ? (
                  <>
                    {', '}
                    {group < before ? 'tighter than' : group > before ? 'wider than' : 'the same as'} the{' '}
                    <span className="tabular-nums">{one(before)} mm</span> of the results before
                  </>
                ) : null}
                . Smaller is tighter.
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  )
}
