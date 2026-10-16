import { type DateKey, addDays, addMonths, endOfMonth, formatDateKey, parseDateKey, startOfMonth } from '../time'
import type { ReportPreset } from './types'

export const PRESET_LABELS: Record<ReportPreset, string> = {
  since_last: 'Since the last report',
  last_month: 'Last month',
  this_month: 'This month so far',
  last_30: 'Last 30 days',
  last_90: 'Last 90 days',
  custom: 'Custom dates',
}

/** "September 2026" for a whole month, else "Sep 2 – Oct 15, 2026" (the year once when it's the same). */
export function periodLabel(from: DateKey, to: DateKey): string {
  if (from === startOfMonth(from) && to === endOfMonth(from)) return formatDateKey(from, 'monthYear')
  const a = parseDateKey(from)
  const b = parseDateKey(to)
  if (a.year === b.year) return `${formatDateKey(from, 'monthDay')} – ${formatDateKey(to, 'monthDay')}, ${b.year}`
  return `${formatDateKey(from, 'medium')} – ${formatDateKey(to, 'medium')}`
}

/** The dates a preset covers, ending today at the latest. */
export function presetPeriod(preset: ReportPreset, today: DateKey, opts: { lastReportTo?: DateKey | null } = {}): { from: DateKey; to: DateKey } {
  switch (preset) {
    case 'since_last': {
      const from = opts.lastReportTo ? addDays(opts.lastReportTo, 1) : addDays(today, -29)
      return { from: from > today ? today : from, to: today }
    }
    case 'last_month': {
      const first = startOfMonth(addMonths(startOfMonth(today), -1))
      return { from: first, to: endOfMonth(first) }
    }
    case 'this_month':
      return { from: startOfMonth(today), to: today }
    case 'last_90':
      return { from: addDays(today, -89), to: today }
    case 'last_30':
    case 'custom':
    default:
      return { from: addDays(today, -29), to: today }
  }
}
