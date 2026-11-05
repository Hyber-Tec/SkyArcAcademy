import { LuCircleAlert, LuMessageSquareQuote, LuPencilLine, LuScanSearch, LuTrophy } from 'react-icons/lu'
import { Link } from 'react-router'
import { type Evaluation, POSITION_LABELS, POSITION_LABELS_KO } from '@shared/shooting/evaluation'
import { wasScanned } from '@shared/targets/flat'
import type { WithId } from '@shared/types'
import { Button } from '@/components/ui/button'
import { useLang, useT } from '@/lib/lang'
import { cn } from '@/lib/utils'
import { cardPath } from './card/parts'
import { unplacedText } from './results'

/**
 * A result that was a personal best when it was shot (shared/src/shooting/progress.ts `personalBestIds`): higher per
 * 10 shots than every earlier result in its position. Staff and families see it alike.
 */
export function BestBadge({ position, size = 'md', words = 'always', className }: { position: Evaluation['position']; size?: 'sm' | 'md'; words?: 'always' | 'wide'; className?: string }) {
  const t = useT()
  return (
    <span
      title={t(`A new personal best: higher than every earlier ${POSITION_LABELS[position].toLowerCase()} result`, `개인 최고 기록이에요. 지금까지의 ${POSITION_LABELS_KO[position]} 기록 중 가장 높아요.`)}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 font-medium whitespace-nowrap text-amber-900 ring-1 ring-amber-300/70 ring-inset dark:bg-amber-950/60 dark:text-amber-200 dark:ring-amber-800',
        size === 'sm' ? 'h-4 px-1.5 text-[10px]' : 'h-5 px-2 text-xs',
        className,
      )}
      data-testid="best-badge"
    >
      <LuTrophy className={size === 'sm' ? 'size-2.5' : 'size-3'} aria-hidden />
      {/* `wide`: the words only where the list has room (its container's width), the trophy alone on a phone. */}
      <span className={words === 'wide' ? 'sr-only @md:not-sr-only' : undefined}>{t('New best', '최고 기록')}</span>
    </span>
  )
}

/**
 * What staff read under an opened result: what to check about it (with Check the card for a card read from a photo)
 * and the coach's note, which the family sees too. A match's results share their note when it's the same (the
 * competition form gives each the same one); different ones are named by position.
 */
export function ResultNotes({ results, mode }: { results: WithId<Evaluation>[]; mode: 'admin' | 'coach' }) {
  const problems = [...new Set(results.flatMap((r) => r.problems ?? []))]
  const noted = results.filter((r) => (r.note ?? '').trim())
  const same = new Set(noted.map((r) => r.note.trim())).size === 1
  const notes = same ? [{ key: 'one', who: null, text: noted[0].note }] : noted.map((r) => ({ key: r.id, who: POSITION_LABELS[r.position], text: r.note }))
  const card = results.length === 1 && wasScanned(results[0]) ? results[0] : null
  if (!problems.length && !noted.length) return null
  return (
    <>
      {problems.length ? (
        <div className="flex max-w-2xl items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" data-testid="result-check">
          <LuCircleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <ul className="min-w-0 flex-1 space-y-0.5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {card ? (
            <Button size="xs" variant="outline" className="shrink-0 bg-background" asChild>
              <Link to={cardPath(mode, card)}>
                <LuScanSearch /> Check the card
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
      {notes.map((n) => (
        <figure key={n.key} className="max-w-2xl rounded-lg border bg-card px-3 py-2.5" data-testid="coach-note">
          <figcaption className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <LuMessageSquareQuote className="size-3.5" aria-hidden /> Coach’s note{n.who ? ` · ${n.who}` : ''}
          </figcaption>
          <blockquote className="mt-1 text-sm break-words whitespace-pre-line">“{n.text.trim()}”</blockquote>
        </figure>
      ))}
    </>
  )
}

/** In place of the target, for a result whose shots have no places. */
export function UnplacedTarget({ e, className }: { e: Pick<Evaluation, 'source' | 'series'>; className?: string }) {
  const lang = useLang()
  return (
    <div className={cn('flex aspect-square w-full max-w-[16rem] flex-col items-center justify-center gap-2 rounded-full border border-dashed p-10 text-center text-sm text-balance text-muted-foreground', className)}>
      <LuPencilLine className="size-5" />
      {unplacedText(e, lang)}
    </div>
  )
}
