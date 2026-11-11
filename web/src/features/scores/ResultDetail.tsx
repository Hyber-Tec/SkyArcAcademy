import { type ReactNode, useMemo, useState } from 'react'
import { LuCrosshair, LuExternalLink, LuTrophy } from 'react-icons/lu'
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, per10, totalWithTens } from '@shared/shooting/evaluation'
import { replayShots, showsTenths } from '@shared/shooting/replay'
import { formatDateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { ItemMenuButton, type MenuEntry } from '@/components/app/ItemMenu'
import { one } from '@/features/reports/model'
import { dartView, placedShots } from './playback'
import { ResultNotes, UnplacedTarget } from './ResultParts'
import { averagePointWords } from './results'
import { SeriesDarts, ShotDialog } from './ShotDarts'
import { ShotReplay } from './ShotReplay'

/**
 * Where the parts go, by the opened part's own width: one above the other on a phone; the target on the left of the
 * figures and notes, the shots across the bottom; and on a wide screen the shots beside the target too.
 */
const AREAS =
  "grid gap-x-7 gap-y-4 [grid-template-areas:'replay'_'head'_'facts'_'shots'] @[35rem]:grid-cols-[15.5rem_minmax(0,1fr)] @[35rem]:grid-rows-[auto_1fr_auto] @[35rem]:[grid-template-areas:'replay_head'_'replay_facts'_'shots_shots'] @[54rem]:grid-cols-[17.5rem_minmax(0,1fr)] @[54rem]:grid-rows-[auto_auto_1fr] @[54rem]:[grid-template-areas:'replay_head'_'replay_facts'_'replay_shots']"

/** One of an opened result's figures (a SCATT session's too): its label over its value. */
export function Figure({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-px text-lg leading-tight font-semibold tracking-tight whitespace-nowrap tabular-nums @[35rem]:text-[1.2rem]">
        {value}
        {unit ? <span className="ml-1 text-xs font-medium tracking-normal text-muted-foreground">{unit}</span> : null}
      </dd>
    </div>
  )
}

/**
 * A result opened under its row in a list (a student's Scores tab; the Scores page): its shots played back on the
 * target from the moment it opens (play and pause, step, again, the speed), its figures, where the shots' average
 * point is, the coach's note, what to check, and the shots: a SIUS result's series as "darts" (each shot alone on a
 * small target, the one being played ringed), a scanned card's bulls the same way, a typed card's scores in boxes.
 * A dart opens its shot. The ⋯ menu holds the result's actions (useResultActions). `footer` adds what a page needs
 * below the notes (a link to the student, say).
 */
export function ResultDetail({ e, mode, entries, footer }: { e: WithId<Evaluation>; mode: 'admin' | 'coach'; entries: MenuEntry[]; footer?: ReactNode }) {
  const color = POSITION_COLORS[e.position]
  const sius = e.source === 'sius'
  // SIUS's and the results site's: series by series, every shot in its firing order; tenths when the match counts them.
  const bySeries = sius || e.source === 'online'
  const tenths = showsTenths(e)
  const shots = useMemo(() => replayShots(e), [e])
  const placed = placedShots(shots)
  const [step, setStep] = useState<number | null>(null)
  const [open, setOpen] = useState<number | null>(null)
  const view = dartView(shots)
  const whole = per10(e.wholeTotal, e.shots)
  const decimal = tenths ? per10(e.total, e.shots) : null
  const facts = [
    e.mpi ? { icon: LuCrosshair, text: `Average point ${averagePointWords(e.mpi)}` } : null,
    e.sighters ? { icon: null, text: `${e.sighters} ${e.sighters === 1 ? 'sighter' : 'sighters'}, not counted` } : null,
    e.match?.name ? { icon: LuTrophy, text: [e.match.name, e.match.course].filter(Boolean).join(', ') } : null,
    e.official ? { icon: null, text: `The score written on the card is the official one; the app read ${e.official.appTotal}` } : null,
    sius && e.sius?.clockFixMin ? { icon: null, text: 'Time corrected for the SIUS computer’s clock' } : null,
  ].filter((x) => x !== null)

  return (
    <div className="@container border-t bg-muted/30 px-4 pt-4 pb-5 @[35rem]:px-5 @[35rem]:pt-5" data-testid="result-detail">
      <div className={AREAS}>
        <div className="flex min-w-0 justify-center [grid-area:replay]">
          {placed.length ? <ShotReplay evaluation={e} color={color} size={280} highlightLast={bySeries} autoPlay onStep={setStep} /> : <UnplacedTarget e={e} className="max-w-[13rem] p-8 text-[13px]" />}
        </div>

        <div className="flex min-w-0 items-start gap-3 [grid-area:head]">
          <dl className="grid min-w-0 flex-1 grid-cols-3 gap-x-3 gap-y-2.5 @[35rem]:flex @[35rem]:flex-wrap @[35rem]:gap-x-6 @[35rem]:gap-y-3">
            <Figure label="Per 10 shots" value={whole !== null ? one(whole) : '—'} />
            {decimal !== null ? <Figure label="Decimal" value={one(decimal)} unit="per 10" /> : null}
            <Figure label="Total" value={totalWithTens(e)} unit={`/ ${e.shots}`} />
            {e.innerTens !== null ? <Figure label="Inner tens" value={String(e.innerTens)} unit="10.2+" /> : null}
            {e.groupMm !== null ? <Figure label="Group" value={one(e.groupMm)} unit="mm" /> : null}
          </dl>
          <ItemMenuButton entries={entries} label="More: open the file, correct, delete" className="-mt-1 -mr-1" />
        </div>

        <div className="min-w-0 space-y-2.5 [grid-area:facts]">
          {facts.length ? (
            <p className="flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-muted-foreground">
              {facts.map((f) => (
                <span key={f.text} className="inline-flex items-center gap-1.5">
                  {f.icon ? <f.icon className="size-3.5 shrink-0" aria-hidden /> : null}
                  {f.text}
                </span>
              ))}
            </p>
          ) : null}
          {e.online?.url ? (
            <a className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" href={e.online.url} target="_blank" rel="noreferrer">
              <LuExternalLink className="size-3.5" aria-hidden /> On the results site{e.online.team ? `, shot for ${e.online.team}` : ''}
            </a>
          ) : null}
          <ResultNotes results={[e]} mode={mode} />
          {footer}
        </div>

        {e.series.length ? (
          <div className="@container min-w-0 space-y-3 [grid-area:shots]">
            {placed.length ? (
              e.series.map((s) => (
                <section key={s.n} aria-label={bySeries ? `Series ${s.n}` : 'The bulls'}>
                  <div className="mb-1.5 flex items-baseline gap-2">
                    <h4 className="text-xs text-muted-foreground">{bySeries ? `Series ${s.n}` : 'Bulls'}</h4>
                    <span className="text-sm font-semibold tabular-nums">{tenths ? s.total.toFixed(1) : one(s.total)}</span>
                  </div>
                  <SeriesDarts shots={shots.filter((t) => (bySeries ? t.series === s.n : true))} view={view} color={color} active={step} onOpen={setOpen} whole={!tenths} />
                </section>
              ))
            ) : (
              // Typed in: each bull's score, without a place.
              <section aria-label="The bulls">
                <div className="mb-1.5 flex items-baseline gap-2">
                  <h4 className="text-xs text-muted-foreground">{e.source === 'sheet' || e.source === 'online' ? 'Shots' : 'Bulls'}</h4>
                  <span className="text-sm font-semibold tabular-nums">{totalWithTens(e)}</span>
                </div>
                <ol className="flex flex-wrap gap-1.5">
                  {e.series
                    .flatMap((s) => s.shots)
                    .map((t, i) => (
                      <li key={i} className="flex h-11 min-w-10 flex-col items-center justify-center rounded-lg border bg-card px-1 tabular-nums">
                        <span className="text-[10px] leading-none text-muted-foreground">{i + 1}</span>
                        <span className="mt-0.5 text-sm leading-none font-semibold">{one(t.v)}</span>
                      </li>
                    ))}
                </ol>
              </section>
            )}
            {shots.some((t) => t.swapWith.length) ? (
              <p className="text-xs text-pretty text-muted-foreground" data-testid="swap-legend">
                <span className="font-semibold text-amber-700 dark:text-amber-400">≈</span> The same score as another shot in its series: the results sheet
                prints each score in order but not which hole is which, so those shots’ places may be swapped.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {placed.length ? <ShotDialog shots={shots} shot={open} onShot={setOpen} color={color} whole={!tenths} description={`${POSITION_LABELS[e.position]} · ${formatDateKey(e.dateKey, 'medium')}`} /> : null}
    </div>
  )
}
