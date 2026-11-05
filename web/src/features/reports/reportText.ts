import type { Lang } from '@shared/i18n'
import { reportName } from '@shared/reports/compose'
import type { ProgressReportDoc } from '@shared/reports/types'
import { periodIn } from '@/features/family/familyText'

/**
 * A family's report in their language (docs/DECISIONS.md §36): the report's own words stay as the academy wrote them;
 * its labels are the app's.
 */

/** The comparison's names for its two sides ("First", "Latest"…: shared/src/reports/compare.ts). */
const COMPARE_LABELS_KO: Record<string, string> = { Earlier: '이전', Later: '이후', Previous: '직전', First: '처음', Lowest: '최저', Latest: '최근', 'This result': '이 기록' }

export const compareLabelIn = (label: string, lang: Lang): string => (lang === 'ko' ? (COMPARE_LABELS_KO[label] ?? label) : label)

/** "September 2026 progress report", "2026년 9월 성장 리포트"; a name staff gave it stays theirs. */
export const reportNameIn = (r: Pick<ProgressReportDoc, 'customName' | 'period'>, lang: Lang): string =>
  lang === 'ko' && !r.customName ? `${periodIn(r.period, 'ko')} 성장 리포트` : reportName(r)
