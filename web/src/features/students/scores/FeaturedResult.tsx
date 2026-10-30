import { type ReactNode, useMemo, useState } from 'react'
import { LuFileText, LuMessageSquareQuote, LuPencilLine, LuScanSearch, LuTrophy } from 'react-icons/lu'
import { Link } from 'react-router'
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, SOURCE_LABELS, per10 } from '@shared/shooting/evaluation'
import { replayShots } from '@shared/shooting/replay'
import { offsetWords } from '@shared/shooting/target'
import { wasScanned } from '@shared/targets/flat'
import { formatDateKey, formatMinutes } from '@shared/time'
import type { WithId } from '@shared/types'
import { ItemMenuButton, type MenuEntry } from '@/components/app/ItemMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { one } from '@/features/reports/model'
import { cardPath } from '@/features/scores/card/parts'
import { dartView, placedShots } from '@/features/scores/playback'
import { SeriesDarts, ShotDialog } from '@/features/scores/ShotDarts'
import { ShotReplay } from '@/features/scores/ShotReplay'
import { cn } from '@/lib/utils'
import { ResultKindChip } from '@/features/scores/kinds'

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
 * A result that was a personal best when it was shot (shared/src/shooting/progress.ts `personalBestIds`): higher per
 * 10 shots than every earlier result in its position. Staff and families see it alike.
 */
export function BestBadge({ position, size = 'md', words = 'always', className }: { position: Evaluation['position']; size?: 'sm' | 'md'; words?: 'always' | 'wide'; className?: string }) {
  return (
    <span
      title={`A new personal best: higher than every earlier ${POSITION_LABELS[position].toLowerCase()} result`}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 font-medium whitespace-nowrap text-amber-900 ring-1 ring-amber-300/70 ring-inset dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800',
        size === 'sm' ? 'h-4 px-1.5 text-[10px]' : 'h-5 px-2 text-xs',
        className,
      )}
      data-testid="best-badge"
    >
      <LuTrophy className={size === 'sm' ? 'size-2.5' : 'size-3'} aria-hidden />
      {/* `wide`: the words only where the list has room (its container's width), the trophy alone on a phone. */}
      <span className={words === 'wide' ? 'sr-only @md:not-sr-only' : undefined}>New best</span>
    </span>
  )
}

/**
 * The result picked in the student's list (the newest at first), large: its shots played back on the target, what it
 * is and its figures, and each SIUS series with one "dart" per shot (the dart of the shot being played is ringed in
 * amber; a dart opens its shot). Paper cards list their bulls; one scanned with the phone opens on its picture, to
 * check and correct (Check the card). A family (`mode="family"`) only looks: no menu and no Drive, the coach's note
 * under its name, a personal best marked, and the original (the SIUS PDF, the card's picture) opened in place.
 */
export function FeaturedResult({
  e,
  mode,
  entries,
  latest,
  autoPlay,
  best = false,
  onOriginal,
  insight,
}: {
  e: WithId<Evaluation>
  mode: 'admin' | 'coach' | 'family'
  /** Its actions (edit, delete), besides opening the file. */
  entries: MenuEntry[]
  latest: boolean
  autoPlay: boolean
  /** It was a personal best when it was shot. */
  best?: boolean
  /** Opens the result's original in place (families: the SIUS PDF or the card's picture). */
  onOriginal?: (e: WithId<Evaluation>) => void
  /** How it compares, under its figures (families). */
  insight?: ReactNode
}) {
  const color = POSITION_COLORS[e.position]
  const staff = mode !== 'family'
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
    ? [
        e.mpi ? `Average point ${where ? `${where}, ` : ''}X ${one(e.mpi.x)} mm, Y ${one(e.mpi.y)} mm` : '',
        e.sighters ? `${e.sighters} sighters (not counted)` : '',
        staff && e.sius?.clockFixMin ? 'time corrected for the SIUS computer’s clock' : '',
      ].filter(Boolean)
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
            {staff && e.problems?.length ? (
              <Badge variant="outline" className="border-amber-300 text-amber-800 dark:text-amber-300">
                Check
              </Badge>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {mode === 'family' ? (
            // The original, read-only: the SIUS printout, or the card (scanned: its picture with the bulls' scores on it).
            e.fileId && onOriginal ? (
              <Button variant="outline" size="sm" onClick={() => onOriginal(e)} data-testid="view-original">
                {sius ? <LuFileText /> : <LuScanSearch />} {sius ? 'View the PDF' : 'View the card'}
              </Button>
            ) : null
          ) : wasScanned(e) ? (
            // A scanned card's picture opens here, with its shots on it (the menu still opens the file in the Drive).
            <Button size="sm" asChild>
              <Link to={cardPath(mode, e)} title="Check the card on its picture" data-testid="check-the-card">
                <LuScanSearch /> Check the card
              </Link>
            </Button>
          ) : e.fileId ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/${mode}/drive/file/${e.fileId}`} aria-label="Open the file in the Drive" title="Open the file in the Drive">
                <LuFileText /> <span className="hidden sm:inline">Open the file</span>
              </Link>
            </Button>
          ) : null}
          <ItemMenuButton entries={entries} />
        </div>
      </div>

      <div className="flex justify-center [grid-area:replay] @2xl:block">
        {placed.length ? (
          <ShotReplay evaluation={e} color={color} size={340} highlightLast={sius} autoPlay={autoPlay} onStep={setStep} />
        ) : (
          <div className="flex aspect-square w-full max-w-[16rem] flex-col items-center justify-center gap-2 rounded-full border border-dashed p-10 text-center text-sm text-balance text-muted-foreground">
            <LuPencilLine className="size-5" />
            {e.source === 'sheet'
              ? e.series.length
                ? 'From the results sheet: every shot’s score, but not where it landed.'
                : 'From the results sheet: its total only.'
              : e.series.length
                ? 'Typed in from the paper card, so where the shots landed isn’t recorded.'
                : 'Only the card’s total was typed in.'}
          </div>
        )}
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
        {e.note && staff ? <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">“{e.note}”</p> : null}
        {e.note && !staff ? (
          <figure className="rounded-lg border bg-muted/40 px-3 py-2.5" data-testid="coach-note">
            <figcaption className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <LuMessageSquareQuote className="size-3.5" aria-hidden /> Coach’s note
            </figcaption>
            <blockquote className="mt-1 text-sm break-words whitespace-pre-line">{e.note}</blockquote>
          </figure>
        ) : null}
        {staff && e.problems?.length ? (
          <ul className="space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {e.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
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
