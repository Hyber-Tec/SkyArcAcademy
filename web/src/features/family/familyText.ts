import { type Lang, dateText } from '@shared/i18n'
import type { ReportPeriod } from '@shared/reports/types'
import { type EvaluationSource, POSITION_LABELS, POSITION_LABELS_KO, type Position, SOURCE_LABELS } from '@shared/shooting/evaluation'
import { endOfMonth, startOfMonth } from '@shared/time'
import { untilText } from '@/features/coach/sessionUi'

/**
 * The family's words that shared tables give in English only, in their language (docs/DECISIONS.md §36,
 * .claude/skills/korean-ux-writing): the English exactly as before.
 */

const SOURCE_LABELS_KO: Record<EvaluationSource, string> = { sius: 'SIUS', paper: '종이 표적지', sheet: '결과지' }

export const positionIn = (p: Position, lang: Lang): string => (lang === 'ko' ? POSITION_LABELS_KO[p] : POSITION_LABELS[p])

export const sourceIn = (s: EvaluationSource, lang: Lang): string => (lang === 'ko' ? SOURCE_LABELS_KO[s] : SOURCE_LABELS[s])

/** A report's period: "September 2026" or "Sep 2 – Oct 15, 2026" as stored; "2026년 9월", "2026년 9월 2일~10월 15일". */
export function periodIn(period: Pick<ReportPeriod, 'from' | 'to' | 'label'>, lang: Lang): string {
  if (lang !== 'ko' || !period.from || !period.to) return period.label
  if (period.from === startOfMonth(period.from) && period.to === endOfMonth(period.from)) return dateText(period.from, 'monthYear', 'ko')
  const sameYear = period.from.slice(0, 4) === period.to.slice(0, 4)
  return `${dateText(period.from, 'long', 'ko')}~${sameYear ? dateText(period.to, 'monthDay', 'ko') : dateText(period.to, 'long', 'ko')}`
}

/** "in 35 min", "35분 후". */
export function untilIn(minutes: number, lang: Lang): string {
  if (lang !== 'ko') return untilText(minutes)
  const m = Math.max(0, Math.round(minutes))
  if (m < 1) return '곧 시작'
  if (m < 60) return `${m}분 후`
  const [h, r] = [Math.floor(m / 60), m % 60]
  return r ? `${h}시간 ${r}분 후` : `${h}시간 후`
}
