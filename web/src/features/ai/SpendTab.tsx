import { Timestamp, collection, getAggregateFromServer, query, sum, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { LuCircleAlert, LuOctagonAlert } from 'react-icons/lu'
import type { ResolvedAiConfig } from '@shared/ai/config'
import { formatUsd } from '@shared/ai/cost'
import { AI_COL } from '@shared/ai/paths'
import type { AiUsageDoc } from '@shared/ai/types'
import { type UsageGroup, type UsageLine, usageBy, usageTotals } from '@shared/ai/usage'
import { startOfMonth, toInstant, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/lib/firebase'
import { cn } from '@/lib/utils'
import type { RangeState } from './AiSettings'
import { USAGE_MAX } from './api'
import { RangeBar } from './RangeBar'

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const whole = new Intl.NumberFormat('en-US')

/** AI → Spend: the range's requests added up (tokens and dollars), the month against its limit, and by feature, model and person. */
export function SpendTab({
  config,
  range,
  onRange,
  rows,
  loading,
}: {
  config: ResolvedAiConfig
  range: RangeState
  onRange: (next: RangeState) => void
  rows: WithId<AiUsageDoc>[]
  loading: boolean
}) {
  const totals = useMemo(() => usageTotals(rows), [rows])
  const groups = useMemo(() => ({ feature: usageBy(rows, 'feature'), model: usageBy(rows, 'model'), person: usageBy(rows, 'person') }), [rows])
  const month = useMonthSpend(range.range === 'this_month' ? totals.costUsd : null)

  return (
    <div className="max-w-6xl space-y-5" data-testid="ai-spend">
      <RangeBar range={range} onRange={onRange} />
      {rows.length >= USAGE_MAX ? (
        <Alert>
          <LuCircleAlert />
          <AlertDescription>These are the newest {whole.format(USAGE_MAX)} requests of the range: choose fewer days for all of them.</AlertDescription>
        </Alert>
      ) : null}
      <div className={cn('space-y-5 transition-opacity', loading && 'opacity-60')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" data-testid="ai-totals">
          <Stat label="Cost" value={formatUsd(totals.costUsd)} note="From the prices on Models" />
          <Stat label="Requests" value={whole.format(totals.requests)} note={totals.failed ? `${whole.format(totals.failed)} failed` : 'None failed'} />
          <Stat label="Input tokens" value={compact.format(totals.inputTokens)} note={whole.format(totals.inputTokens)} />
          <Stat label="Output tokens" value={compact.format(totals.outputTokens)} note={whole.format(totals.outputTokens)} />
          <Stat label="Thinking tokens" value={compact.format(totals.thinkingTokens)} note={`${whole.format(totals.thinkingTokens)}, billed as output`} />
        </div>
        <LimitMeter spent={month} limit={config.monthlyLimitUsd} />
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Breakdown title="By model" group="model" lines={groups.model} />
          </div>
          <Breakdown title="By feature" group="feature" lines={groups.feature} />
          <Breakdown title="By person" group="person" lines={groups.person} />
        </div>
      </div>
    </div>
  )
}

/** This month's logged cost, for the limit: the range's own total when it's this month, else asked of Firestore. */
function useMonthSpend(fromRange: number | null): number | null {
  const { timezone } = useBranch()
  const [asked, setAsked] = useState<number | null>(null)
  useEffect(() => {
    if (fromRange !== null) return
    let stale = false
    const start = toInstant(startOfMonth(todayKey(timezone)), 0, timezone)
    getAggregateFromServer(query(collection(db, AI_COL.aiUsage), where('at', '>=', Timestamp.fromDate(start))), { total: sum('costUsd') })
      .then((s) => !stale && setAsked(Number(s.data().total ?? 0)))
      .catch(() => !stale && setAsked(null))
    return () => {
      stale = true
    }
  }, [fromRange, timezone])
  return fromRange ?? asked
}

/** A stat tile: the label, the value (proportional figures), and a line under it. */
function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground" title={note}>
        {note}
      </div>
    </div>
  )
}

/**
 * This month against the limit: the fill turns amber from 80% and red at the limit, each with words and an icon, on a
 * lighter track of its own color.
 */
function LimitMeter({ spent, limit }: { spent: number | null; limit: number | null }) {
  if (limit === null) {
    return (
      <div className="rounded-xl border bg-card px-4 py-3 text-sm" data-testid="ai-limit">
        <span className="font-medium">No monthly limit.</span> <span className="text-muted-foreground">This month so far: {spent === null ? '…' : formatUsd(spent)}. Set one on Models.</span>
      </div>
    )
  }
  const value = spent ?? 0
  const pct = Math.min(100, (value / limit) * 100)
  const level = value >= limit ? 'reached' : pct >= 80 ? 'close' : 'ok'
  const fill = { ok: 'bg-foreground', close: 'bg-amber-500', reached: 'bg-destructive' }[level]
  const track = { ok: 'bg-foreground/10', close: 'bg-amber-500/20', reached: 'bg-destructive/20' }[level]
  return (
    <div className="rounded-xl border bg-card px-4 py-3" data-testid="ai-limit">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="text-sm">
          <span className="font-medium">This month:</span> {spent === null ? '…' : formatUsd(value)} of the {formatUsd(limit)} limit
          <span className="text-muted-foreground"> ({Math.round((value / limit) * 100)}%)</span>
        </div>
        {level !== 'ok' ? (
          <div className={cn('flex items-center gap-1.5 text-sm font-medium', level === 'close' ? 'text-amber-700 dark:text-amber-400' : 'text-destructive')}>
            {level === 'close' ? <LuCircleAlert className="size-4" aria-hidden /> : <LuOctagonAlert className="size-4" aria-hidden />}
            {level === 'close' ? 'Close to the limit' : 'Limit reached: new requests are refused until next month'}
          </div>
        ) : null}
      </div>
      <div
        className={cn('mt-2 h-2 w-full overflow-hidden rounded-full', track)}
        role="meter"
        aria-label="This month’s spend against the limit"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(value, limit)}
      >
        <div className={cn('h-full rounded-full transition-[width]', fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function Breakdown({ title, group, lines }: { title: string; group: UsageGroup; lines: UsageLine[] }) {
  return (
    <Card className="gap-0 py-0" data-testid={`ai-by-${group}`}>
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        {lines.length ? (
          <table className="w-full text-sm">
            <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-1.5 font-medium">{group === 'feature' ? 'Feature' : group === 'model' ? 'Model' : 'Person'}</th>
                <th className="px-2 py-1.5 text-right font-medium">Requests</th>
                <th className="hidden px-2 py-1.5 text-right font-medium sm:table-cell">Tokens</th>
                <th className="px-4 py-1.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => (
                <tr key={l.key}>
                  <td className="max-w-0 px-4 py-2">
                    <div className="truncate font-medium" title={l.label}>
                      {l.label}
                    </div>
                    {l.detail ? (
                      <div className="truncate text-xs text-muted-foreground" title={l.detail}>
                        {l.detail}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {whole.format(l.requests)}
                    {l.failed ? <div className="text-xs text-destructive">{whole.format(l.failed)} failed</div> : null}
                  </td>
                  <td className="hidden px-2 py-2 text-right tabular-nums sm:table-cell" title={`${whole.format(l.inputTokens)} in · ${whole.format(l.outputTokens)} out · ${whole.format(l.thinkingTokens)} thinking`}>
                    {compact.format(l.inputTokens + l.outputTokens + l.thinkingTokens)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{formatUsd(l.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="border-t px-4 py-6 text-center text-sm text-muted-foreground">No requests in these dates.</p>
        )}
      </CardContent>
    </Card>
  )
}
