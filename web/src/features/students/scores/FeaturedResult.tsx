import { type ReactNode, useMemo, useState } from 'react'
import { LuFileText, LuMessageSquareQuote, LuScanSearch } from 'react-icons/lu'
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, SOURCE_LABELS, per10 } from '@shared/shooting/evaluation'
import { replayShots } from '@shared/shooting/replay'
import { offsetWords } from '@shared/shooting/target'
import { formatDateKey, formatMinutes } from '@shared/time'
import type { WithId } from '@shared/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { one } from '@/features/reports/model'
import { ResultKindChip } from '@/features/scores/kinds'
import { dartView, placedShots } from '@/features/scores/playback'
import { BestBadge, UnplacedTarget } from '@/features/scores/ResultParts'
import { SeriesDarts, ShotDialog } from '@/features/scores/ShotDarts'
import { ShotReplay } from '@/features/scores/ShotReplay'

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2">
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-lg leading-tight font-semibold tabular-nums">{value}</dd>
      {sub ? <dd className="truncate text-xs text-muted-foreground">{sub}</dd> : null}
    </div>
  )
}

/**
 * The places of the panel's parts. On a phone: what it is, the target, the figures, then its shots. Wide: the target
 * on the left of what it is and the figures, and the shots across the bottom. A card with only its total has no shots.
 */
const AREAS = {
  withShots:
    "grid gap-x-8 gap-y-5 [grid-template-areas:'head'_'replay'_'facts'_'shots'] @2xl:grid-cols-[18.5rem_minmax(0,1fr)] @2xl:grid-rows-[auto_1fr_auto] @2xl:[grid-template-areas:'replay_head'_'replay_facts'_'shots_shots']",
  noShots:
    "grid gap-x-8 gap-y-5 [grid-template-areas:'head'_'replay'_'facts'] @2xl:grid-cols-[18.5rem_minmax(0,1fr)] @2xl:grid-rows-[auto_1fr] @2xl:[grid-template-areas:'replay_head'_'replay_facts']",
}

/**
 * The result picked in a family's list (the newest at first), large: its shots played back on the target, what it is
 * and its figures, and each SIUS series with one "dart" per shot (the dart of the shot being played is ringed in amber;
 * a dart opens its shot). Paper cards list their bulls. A family only looks: the coach's note under its name, a personal
 * best marked, and the original (the SIUS PDF, the card's picture) opened in place. Staff open a result under its own
 * row instead (features/scores/ResultDetail.tsx).
 */
export function FeaturedResult({
  e,
  latest,
  autoPlay,
  best = false,
  onOriginal,
  insight,
}: {
  e: WithId<Evaluation>
  latest: boolean
  autoPlay: boolean
  /** It was a personal best when it was shot. */
  best?: boolean
  /** Opens the result's original in place (the SIUS PDF or the card's picture). */
  onOriginal?: (e: WithId<Evaluation>) => void
  /** How it compares, under its figures. */
  insight?: ReactNode
}) {
  const color = POSITION_COLORS[e.position]
  const sius = e.source === 'sius'
  const shots = useMemo(() => replayShots(e), [e])
  const placed = placedShots(shots)
  const [step, setStep] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const view = dartView(shots)
  const whole = per10(e.wholeTotal, e.shots)
  const decimal = sius ? per10(e.total, e.shots) : null
  const where = offsetWords(e.mpi)
  const notes = sius
    ? [e.mpi ? `Average point ${where ? `${where}, ` : ''}X ${one(e.mpi.x)} mm, Y ${one(e.mpi.y)} mm` : '', e.sighters ? `${e.sighters} sighters (not counted)` : ''].filter(Boolean)
    : []

  return (
    <div className={`${e.series.length ? AREAS.withShots : AREAS.noShots} p-5`} data-testid="featured-result">
      <div className="flex min-w-0 items-start justify-between gap-3 [grid-area:head]">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{latest ? 'Latest result' : 'Result'}</p>
          <h3 className="mt-0.5 text-lg leading-tight font-semibold">
            {formatDateKey(e.dateKey, 'medium')}
            {e.timeMin !== null ? <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{formatMinutes(e.timeMin)}</span> : null}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="gap-1.5">
              <span className="size-2 rounded-full" style={{ background: color }} />
              {POSITION_LABELS[e.position]}
            </Badge>
            <Badge variant="outline">{e.match?.name || SOURCE_LABELS[e.source]}</Badge>
            <ResultKindChip e={e} className="h-5 px-2 text-[11px]" />
            {best ? <BestBadge position={e.position} /> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* The original, read-only: the SIUS printout, or the card (scanned: its picture with the bulls' scores on it). */}
          {e.fileId && onOriginal ? (
            <Button variant="outline" size="sm" onClick={() => onOriginal(e)} data-testid="view-original">
              {sius ? <LuFileText /> : <LuScanSearch />} {sius ? 'View the PDF' : 'View the card'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex justify-center [grid-area:replay] @2xl:block">
        {placed.length ? <ShotReplay evaluation={e} color={color} size={340} highlightLast={sius} autoPlay={autoPlay} onStep={setStep} /> : <UnplacedTarget e={e} />}
      </div>

      <div className="@container min-w-0 space-y-4 [grid-area:facts]">
        <dl className="grid grid-cols-2 gap-2 @md:grid-cols-4">
          <Stat label="Per 10 shots" value={whole !== null ? one(whole) : '—'} sub={decimal !== null ? `${one(decimal)} decimal` : 'whole numbers'} />
          <Stat label="Total" value={sius ? e.total.toFixed(1) : String(e.total)} sub={`${e.shots} shots`} />
          <Stat label="Inner tens" value={e.innerTens !== null ? String(e.innerTens) : '—'} sub={sius ? '10.2 or better' : null} />
          <Stat label="Group" value={e.groupMm !== null ? `${one(e.groupMm)} mm` : '—'} sub={e.groupMm !== null ? 'smaller is tighter' : null} />
        </dl>
        {insight}
        {notes.length ? <p className="text-xs text-muted-foreground">{notes.join(' · ')}</p> : null}
        {e.note ? (
          <figure className="rounded-lg border bg-muted/40 px-3 py-2.5" data-testid="coach-note">
            <figcaption className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <LuMessageSquareQuote className="size-3.5" aria-hidden /> Coach’s note
            </figcaption>
            <blockquote className="mt-1 text-sm break-words whitespace-pre-line">{e.note}</blockquote>
          </figure>
        ) : null}
      </div>

      {e.series.length ? (
        <div className="@container min-w-0 space-y-4 [grid-area:shots]">
          {sius ? (
            e.series.map((s) => (
              <section key={s.n} aria-label={`Series ${s.n}`}>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <h4 className="text-xs font-medium text-muted-foreground">Series {s.n}</h4>
                  <span className="text-sm font-semibold tabular-nums">{s.total.toFixed(1)}</span>
                </div>
                <SeriesDarts shots={shots.filter((t) => t.series === s.n)} view={view} color={color} active={step} onOpen={setOpen} />
              </section>
            ))
          ) : (
            <ul className="space-y-1 text-sm">
              {e.series.map((s) => (
                <li key={s.n} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="w-16 shrink-0 text-xs text-muted-foreground">{e.source === 'sheet' ? `Series ${s.n}` : 'Bulls'}</span>
                  <span className="font-medium tabular-nums">{one(s.total)}</span>
                  <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                    {s.shots.map((t, i) => (
                      <span key={i}>{one(t.v)}</span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {sius ? <ShotDialog shots={shots} shot={open} onShot={setOpen} color={color} description={`${POSITION_LABELS[e.position]} · ${formatDateKey(e.dateKey, 'medium')}`} /> : null}
    </div>
  )
}
