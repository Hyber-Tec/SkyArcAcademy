import { type CardReview, bullState } from '@shared/targets/review'
import { cn } from '@/lib/utils'
import { STATE_COLORS, scoreLabel } from './parts'

/** The ten record bulls as tiles: each one's score, edged in its state's colour when it's worth a look. A tile opens its bull. */
export function BullTiles({ review, selected, onBull }: { review: CardReview; selected: number | null; onBull: (n: number) => void }) {
  return (
    <div className="grid grid-cols-5 gap-2" role="group" aria-label="The bulls">
      {review.bulls.map((b) => {
        const state = bullState(b, review.shotsPerBull, review)
        const values = b.shots.map((s) => s.value)
        const label = scoreLabel(values)
        return (
          <button
            key={b.n}
            type="button"
            onClick={() => onBull(b.n)}
            aria-pressed={selected === b.n}
            aria-label={`Bull ${b.n}: ${values.length ? values.join(' and ') : 'no shot'}${state === 'ok' ? '' : ', worth a look'}`}
            data-testid={`bull-tile-${b.n}`}
            className={cn(
              'flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border-[1.5px] bg-card px-0.5 transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50',
              selected === b.n && 'bg-muted ring-2 ring-foreground/60',
            )}
            style={state === 'ok' ? undefined : { borderColor: STATE_COLORS[state] }}
          >
            <span className="text-[11px] leading-none text-muted-foreground">{b.n}</span>
            <span className={cn('max-w-full truncate leading-tight font-semibold tabular-nums', label.length > 4 ? 'text-sm' : 'text-lg')}>{label}</span>
            <span className="size-1.5 rounded-full" style={{ background: STATE_COLORS[state] }} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
