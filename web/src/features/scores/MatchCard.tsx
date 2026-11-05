import { type ReactNode, useState } from 'react'
import { LuChevronDown, LuPencilLine, LuTrophy } from 'react-icons/lu'
import { type MatchResult, isWholeResult, matchTotal, seriesInnerTens, seriesLabel, seriesTotalText, shotLabel } from '@shared/scores/match'
import { dateText } from '@shared/i18n'
import { POSITION_COLORS, evaluationPoints } from '@shared/shooting/evaluation'
import { isInnerTen } from '@shared/shooting/target'
import { positionIn } from '@/features/family/familyText'
import { ShotReplay } from '@/features/scores/ShotReplay'
import { MiniTarget } from '@/features/scores/TargetPlot'
import { useLang, useT } from '@/lib/lang'
import { cn } from '@/lib/utils'

/**
 * A competition from its results sheet, as the match was (the owner, 2026-10-29: "in one competition we have six
 * sections: click one and see all its shots and the animation"): the match's total and inner tens, then each series of
 * ten as the sheet prints it ("K1–K10 · 71 - 1") with its shots on a small target when the sheet's pictures gave their
 * places. Opening a series shows its shots and plays them back. The phone shows the same (mobile/src/features/scores/
 * MatchCard.tsx); the sums are shared (shared/src/scores/match.ts). Staff open it under its row in a student's results,
 * with its menu beside the total (`aside`).
 */
export function MatchCard({ evaluation, results, aside, className = 'border-t px-5 py-4' }: { evaluation: MatchResult; results: MatchResult[]; aside?: ReactNode; className?: string }) {
  const lang = useLang()
  const t = useT()
  const [open, setOpen] = useState<string | null>(null)
  const { total, innerTens, whole } = matchTotal(results)
  const rows = results.flatMap((r) => r.series.map((s) => ({ key: `${r.id}-${s.n}`, r, s, points: evaluationPoints({ series: [s] }) })))
  const shown = rows.find((x) => x.key === open) ?? null
  return (
    <section className={className} aria-label={t('The match', '경기')} data-testid="match-card">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
          <LuTrophy className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{evaluation.match?.name?.trim() || t('Competition', '대회')}</h3>
          <p className="truncate text-xs text-muted-foreground">{[dateText(evaluation.dateKey, 'medium', lang), evaluation.match?.course?.trim()].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">
            {whole ? total : total.toFixed(1)}
            {innerTens !== null ? <span className="text-sm font-medium text-muted-foreground"> - {innerTens}</span> : null}
          </div>
          <div className="text-[11px] text-muted-foreground">{results.length > 1 ? t('the match', '경기 합계') : positionIn(evaluation.position, lang)}</div>
        </div>
        {aside}
      </div>

      {results.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {results.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
              <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[r.position] }} />
              {positionIn(r.position, lang)}
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
              {/* The position first, in words (the third meeting, CP3), then the shots as the sheet numbers them. */}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{positionIn(r.position, lang)}</span>
                <span className="block truncate text-xs text-muted-foreground tabular-nums">{seriesLabel(r.position, s)}</span>
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
        <p className="mt-3 text-sm text-muted-foreground">
          {t('Only the totals were saved for this match: its shots weren’t on the sheet, or were typed as totals.', '이 경기는 합계만 저장됐어요. 결과지에 발마다 점수가 없었거나, 합계로 입력했어요.')}
        </p>
      )}

      {shown ? (
        <div className="mt-3 flex flex-col items-center gap-3 rounded-xl border bg-card p-4" data-testid="match-series-open">
          <p className="text-sm font-semibold">
            {positionIn(shown.r.position, lang)} · {seriesLabel(shown.r.position, shown.s)}
          </p>
          {shown.points.length ? (
            <ShotReplay key={shown.key} evaluation={{ source: shown.r.source, series: [shown.s] }} color={POSITION_COLORS[shown.r.position]} size={300} autoPlay />
          ) : (
            <p className="text-center text-xs text-balance text-muted-foreground">
              {t('The sheet’s picture of this series couldn’t be read, so its shots have no places on the target.', '결과지에서 이 시리즈의 그림을 읽지 못해서 표적에 맞은 자리가 없어요.')}
            </p>
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
      <p className="mt-2 text-[11px] text-muted-foreground">{t('* an inner ten. A series’ score is its total, then its inner tens.', '* 이너 텐. 시리즈 점수는 합계 - 이너 텐 수예요.')}</p>
    </section>
  )
}
