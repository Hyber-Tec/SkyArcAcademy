import { type KeyboardEvent, useState } from 'react'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import type { ReplayShot } from '@shared/shooting/replay'
import { targetViewMm } from '@shared/shooting/target'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { DART_PX, placedShots, shotOffset } from './playback'
import { LAST_SHOT_FILL, MiniTarget, NewestShot, ShotMark, TargetFace } from './TargetPlot'

/** The shot dialog's target, in pixels (it shrinks on a phone). */
const BIG_PX = 320

/**
 * A SIUS series' shots as "darts", in firing order: each a small target at the replay's scale with that shot alone on
 * it in the position's color, and its score under it. Ten to a row where there's room, five on a phone. `active` rings
 * the shot a replay is showing; a dart opens its shot (`onOpen`). Needs a container (`@container`) around it.
 */
export function SeriesDarts({ shots, view, color, active, onOpen }: { shots: readonly ReplayShot[]; view: number; color: string; active: number | null; onOpen: (n: number) => void }) {
  return (
    <ol className="grid max-w-[22rem] grid-cols-5 gap-2 @[37rem]:max-w-[44.5rem] @[37rem]:grid-cols-10">
      {shots.map((s) => {
        const on = active === s.n
        return (
          <li key={s.n} className="min-w-0">
            <button
              type="button"
              onClick={() => onOpen(s.n)}
              aria-label={`Shot ${s.n}: ${s.value.toFixed(1)}${s.point ? '' : ', no place on the target'}. Open it`}
              aria-current={on ? 'step' : undefined}
              className={cn(
                'flex w-full flex-col items-center gap-1.5 rounded-xl p-1 pb-1.5 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                on && 'bg-[#e8b100]/15 ring-2 ring-[#e8b100] hover:bg-[#e8b100]/15',
              )}
            >
              <span className="block w-full max-w-16 rounded-lg bg-white p-0.5">
                <MiniTarget points={s.point ? [s.point] : []} view={view} size={DART_PX} color={on ? LAST_SHOT_FILL : color} className="block h-auto w-full" />
              </span>
              <span className={cn('text-xs leading-none tabular-nums', on ? 'font-semibold text-[#8a6400] dark:text-[#f2c94c]' : s.value >= 10 ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                {s.value.toFixed(1)}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * One shot of a result, large: the target with that shot in amber and its number (the replay's newest-shot look),
 * the other shots faint, its score, and how far and which way it sits from the centre. Previous and Next (and the
 * arrow keys) step through the result's shots in firing order.
 */
export function ShotDialog({
  shots,
  shot,
  onShot,
  color,
  description,
}: {
  shots: readonly ReplayShot[]
  /** The shot shown (1…n); null closes the dialog. */
  shot: number | null
  onShot: (n: number | null) => void
  color: string
  description: string
}) {
  // While the dialog closes, it keeps showing the last shot.
  const [shown, setShown] = useState<number | null>(shot)
  if (shot !== null && shot !== shown) setShown(shot)
  const n = shot ?? shown
  const current = n !== null ? (shots[n - 1] ?? null) : null
  const count = shots.length
  const placed = placedShots(shots)
  const view = targetViewMm(
    placed.map((s) => s.point),
    BIG_PX,
  )
  const offset = current?.point ? shotOffset(current.point) : null
  const go = (n: number) => {
    if (n >= 1 && n <= count) onShot(n)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!current) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(current.n - 1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(current.n + 1)
    }
  }
  const title = current ? [current.series !== null ? `Series ${current.series}` : null, `Shot ${current.n} of ${count}`].filter(Boolean).join(' · ') : ''

  return (
    <Dialog open={shot !== null && current !== null} onOpenChange={(o) => (o ? undefined : onShot(null))}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md" onKeyDown={onKeyDown} aria-keyshortcuts="ArrowLeft ArrowRight">
        {current ? (
          <>
            <DialogHeader>
              <DialogTitle className="tabular-nums">{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <div className="mx-auto w-full max-w-[328px] rounded-xl bg-white p-1">
              <TargetFace view={view} size={BIG_PX} label={`Shot ${current.n}: ${current.value.toFixed(1)}`} className="block h-auto w-full">
                {placed
                  .filter((s) => s.n !== current.n)
                  .map((s) => (
                    <ShotMark key={s.n} point={s.point} view={view} color={color} faint />
                  ))}
                {current.point ? <NewestShot key={current.n} point={current.point} number={current.n} view={view} size={BIG_PX} /> : null}
              </TargetFace>
            </div>
            <dl className="grid grid-cols-3 divide-x rounded-xl border text-center" aria-live="polite">
              <div className="px-2 py-2.5">
                <dt className="text-xs text-muted-foreground">Score</dt>
                <dd className="mt-0.5 text-2xl leading-tight font-semibold tabular-nums">{current.value.toFixed(1)}</dd>
              </div>
              <div className="px-2 py-2.5">
                <dt className="text-xs text-muted-foreground">From the centre</dt>
                <dd className="mt-1.5 text-sm font-medium tabular-nums">{offset ? `${offset.mm} mm` : '—'}</dd>
              </div>
              <div className="px-2 py-2.5">
                <dt className="text-xs text-muted-foreground">Direction</dt>
                <dd className="mt-1.5 text-sm font-medium first-letter:uppercase">{offset ? offset.words : '—'}</dd>
              </div>
            </dl>
            {current.point ? null : <p className="-mt-1 text-center text-xs text-muted-foreground">The result gave no direction for this shot, so it has no place on the target.</p>}
            <DialogFooter className="flex-row items-center justify-between sm:justify-between">
              <Button variant="outline" onClick={() => go(current.n - 1)} disabled={current.n <= 1}>
                <LuChevronLeft /> Previous
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {current.n} of {count}
              </span>
              <Button variant="outline" onClick={() => go(current.n + 1)} disabled={current.n >= count}>
                Next <LuChevronRight />
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
