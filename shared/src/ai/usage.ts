import { type DateKey, addDays, addMonths, endOfMonth, startOfMonth } from '../time'
import { AI_PROVIDER_INFO, findModel } from './models'
import { type AiProvider, type AiUsageDoc, aiFeatureLabel } from './types'

/** The AI page's Spend and Requests: the dates they cover, and the logged requests added up. */

export type SpendRange = 'this_month' | 'last_month' | 'last_30' | 'custom'

export const SPEND_RANGE_LABELS: Record<SpendRange, string> = {
  this_month: 'This month',
  last_month: 'Last month',
  last_30: 'Last 30 days',
  custom: 'Custom',
}

/** The first and last day a range covers (in the academy's time zone), ending today at the latest. */
export function spendRange(range: Exclude<SpendRange, 'custom'>, today: DateKey): { from: DateKey; to: DateKey } {
  switch (range) {
    case 'last_month': {
      const first = startOfMonth(addMonths(startOfMonth(today), -1))
      return { from: first, to: endOfMonth(first) }
    }
    case 'last_30':
      return { from: addDays(today, -29), to: today }
    case 'this_month':
    default:
      return { from: startOfMonth(today), to: today }
  }
}

export type UsageRow = Pick<AiUsageDoc, 'feature' | 'provider' | 'model' | 'inputTokens' | 'outputTokens' | 'thinkingTokens' | 'costUsd' | 'ok' | 'by'>

export interface UsageTotals {
  requests: number
  failed: number
  inputTokens: number
  outputTokens: number
  thinkingTokens: number
  costUsd: number
}

const zero = (): UsageTotals => ({ requests: 0, failed: 0, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, costUsd: 0 })
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function add(t: UsageTotals, r: UsageRow) {
  t.requests += 1
  if (!r.ok) t.failed += 1
  t.inputTokens += n(r.inputTokens)
  t.outputTokens += n(r.outputTokens)
  t.thinkingTokens += n(r.thinkingTokens)
  t.costUsd += n(r.costUsd)
}

const tidy = (t: UsageTotals): UsageTotals => ({ ...t, costUsd: Math.round(t.costUsd * 1_000_000) / 1_000_000 })

export function usageTotals(rows: readonly UsageRow[]): UsageTotals {
  const t = zero()
  for (const r of rows) add(t, r)
  return tidy(t)
}

export type UsageGroup = 'feature' | 'model' | 'person'

export interface UsageLine extends UsageTotals {
  key: string
  label: string
  detail: string
}

/** The requests by feature, by model or by person, the costliest first. */
export function usageBy(rows: readonly UsageRow[], group: UsageGroup): UsageLine[] {
  const lines = new Map<string, UsageLine>()
  for (const r of rows) {
    const key = group === 'feature' ? r.feature : group === 'model' ? `${r.provider}:${r.model}` : r.by?.email || r.by?.uid || 'unknown'
    let line = lines.get(key)
    if (!line) {
      const provider = r.provider as AiProvider
      line = {
        key,
        label: group === 'feature' ? aiFeatureLabel(r.feature) : group === 'model' ? (findModel(provider, r.model)?.label ?? r.model) : r.by?.name || r.by?.email || 'Unknown',
        detail: group === 'feature' ? '' : group === 'model' ? `${AI_PROVIDER_INFO[provider]?.label ?? r.provider} · ${r.model}` : (r.by?.email ?? ''),
        ...zero(),
      }
      lines.set(key, line)
    }
    add(line, r)
  }
  return [...lines.values()].map((l) => ({ ...l, ...tidy(l) })).sort((a, b) => b.costUsd - a.costUsd || b.requests - a.requests || a.label.localeCompare(b.label))
}
