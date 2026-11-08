import { cn } from '@/lib/utils'
import { APP } from '@/site/kit/content'
import { useSite } from '@/site/kit/site'
import home from '../assets/app-home.webp'
import report from '../assets/app-report.webp'
import scores from '../assets/app-scores.webp'

const SHOTS = [home, scores, report]

/**
 * Three of the app's screens, as the stores show them (the practice copy's made-up family), in phones a little apart:
 * the middle one forward. `compact`: the homepage's band, two of them.
 */
export function PhoneShots({ compact, className }: { compact?: boolean; className?: string }) {
  const { t } = useSite()
  const shots = compact ? [SHOTS[0], SHOTS[1]] : SHOTS
  return (
    <div className={cn('flex items-end justify-center', compact ? 'gap-4 sm:gap-5' : '-space-x-6 sm:-space-x-8', className)} aria-hidden={compact ? true : undefined}>
      {shots.map((src, i) => {
        const middle = !compact && i === 1
        return (
          <figure
            key={src}
            className={cn(
              'relative shrink-0 rounded-[34px] bg-ink p-[7px] shadow-[0_30px_60px_-30px_rgb(10_10_10/0.55)] ring-1 ring-black/10',
              compact ? 'w-[148px] sm:w-[176px]' : middle ? 'z-10 w-[176px] sm:w-[220px]' : 'w-[150px] translate-y-6 sm:w-[188px]',
              !compact && !middle && (i === 0 ? '-rotate-[4deg]' : 'rotate-[4deg]'),
              compact && i === 1 && 'translate-y-5',
            )}
          >
            <img src={src} alt={compact ? '' : t(APP.shots[i])} width={600} height={1301} loading="lazy" decoding="async" className="block h-auto w-full rounded-[28px]" />
          </figure>
        )
      })}
    </div>
  )
}
