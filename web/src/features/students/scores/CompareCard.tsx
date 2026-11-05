import { useMemo, useState } from 'react'
import { LuGitCompareArrows } from 'react-icons/lu'
import { type CompareMode, comparablePositions, comparePair, latestComparablePosition, positionPoints } from '@shared/reports/compare'
import type { EvaluationPoint } from '@shared/reports/types'
import { type Lang, dateText } from '@shared/i18n'
import { type Evaluation, POSITION_COLORS, type Position } from '@shared/shooting/evaluation'
import type { WithId } from '@shared/types'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { positionIn } from '@/features/family/familyText'
import { Comparison } from '@/features/reports/ReportParts'
import { compareLabelIn } from '@/features/reports/reportText'
import { one } from '@/features/reports/model'
import { useLang, useT } from '@/lib/lang'
import { cn } from '@/lib/utils'

const MODES: [CompareMode, string, string][] = [
  ['lowest', 'Lowest vs latest', '최저 vs 최근'],
  ['previous', 'Previous vs latest', '직전 vs 최근'],
  ['first', 'First vs latest', '처음 vs 최근'],
  ['choose', 'Choose two', '두 개 고르기'],
]

const pointLabel = (p: EvaluationPoint, lang: Lang) => `${dateText(p.dateKey, 'medium', lang)} · ${one(p.wholePer10)}${p.source === 'sius' ? ` (${one(p.per10)})` : ''}`

/**
 * Two evaluations of one position side by side, picked the way families ask ("how far has she come?"). `bare`: without
 * its own card and title, inside a section that has them (a student's Scores tab, where it folds away).
 */
export function CompareCard({ evaluations, bare = false }: { evaluations: WithId<Evaluation>[]; bare?: boolean }) {
  const lang = useLang()
  const t = useT()
  // The modes and the pairs they compare: shared/src/reports/compare.ts (the phone app compares the same way).
  const positions = useMemo(() => comparablePositions(evaluations), [evaluations])
  const latestPosition = useMemo(() => latestComparablePosition(evaluations), [evaluations])
  const [chosenPosition, setPosition] = useState<Position | null>(null)
  const position = chosenPosition && positions.includes(chosenPosition) ? chosenPosition : latestPosition
  const [mode, setMode] = useState<CompareMode>('first')
  const list = useMemo(() => (position ? positionPoints(evaluations, position) : []), [evaluations, position])
  const [pickA, setPickA] = useState<string | null>(null)
  const [pickB, setPickB] = useState<string | null>(null)
  const pair = comparePair(list, mode, { picks: [pickA, pickB] })

  const switcher =
    positions.length > 1 ? (
      <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label={t('Position', '자세')}>
        {positions.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={position === p}
            onClick={() => setPosition(p)}
            className={cn('inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 font-medium', position === p ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
          >
            <span className="size-2 rounded-full" style={{ background: POSITION_COLORS[p] }} />
            {positionIn(p, lang)}
          </button>
        ))}
      </div>
    ) : null

  return (
    <section className={bare ? undefined : 'overflow-hidden rounded-xl border bg-card'} data-testid="compare-card">
      {bare ? (
        switcher ? <div className="pb-3">{switcher}</div> : null
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <LuGitCompareArrows className="size-4 text-muted-foreground" /> {t('Compare', '비교')}
          </h2>
          {switcher}
        </div>
      )}
      {list.length < 2 ? (
        <p className={cn('text-center text-sm text-muted-foreground', bare ? 'py-6' : 'px-5 py-8')}>
          {t('Two evaluations in the same position are needed to compare.', '같은 자세의 기록이 두 개 있어야 비교할 수 있어요.')}
        </p>
      ) : (
        <div className={cn('space-y-4', bare ? undefined : 'p-5')}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Compare', '비교')}>
            {MODES.map(([m, en, ko]) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium transition', mode === m ? 'border-[#2f68c4]/40 bg-[#2f68c4]/10 text-[#24539e] dark:text-[#93b4e6]' : 'text-muted-foreground hover:text-foreground')}
              >
                {lang === 'ko' ? ko : en}
              </button>
            ))}
          </div>
          {mode === 'choose' ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
              <Select value={pickA && list.some((p) => p.id === pickA) ? pickA : list[0].id} onValueChange={setPickA}>
                <SelectTrigger className="w-full" aria-label={t('First result to compare', '비교할 첫 번째 기록')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {list.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {pointLabel(p, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-center text-xs text-muted-foreground">vs</span>
              <Select value={pickB && list.some((p) => p.id === pickB) ? pickB : list[list.length - 1].id} onValueChange={setPickB}>
                <SelectTrigger className="w-full" aria-label={t('Second result to compare', '비교할 두 번째 기록')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {list.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {pointLabel(p, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {pair ? (
            <div className="rounded-xl bg-white p-1 text-[#0b0b0b]">
              <Comparison a={pair.a} b={pair.b} labelA={compareLabelIn(pair.labels[0], lang)} labelB={compareLabelIn(pair.labels[1], lang)} />
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">{t('Choose two different results to compare.', '비교할 기록을 서로 다르게 두 개 골라 주세요.')}</p>
          )}
        </div>
      )}
    </section>
  )
}
