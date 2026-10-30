import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { formatUsd } from '@shared/ai/cost'
import { AI_PROVIDER_INFO, findModel } from '@shared/ai/models'
import { type AiUsageDoc, THINKING_LABELS, aiFeatureLabel } from '@shared/ai/types'
import { formatInstant } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import type { RangeState } from './AiSettings'
import { RangeBar } from './RangeBar'

const PAGE = 50
const whole = new Intl.NumberFormat('en-US')

/** AI → Requests: every request of the range, newest first: what it was for, the model, its tokens, cost, time and outcome. */
export function RequestsTab({ range, onRange, rows, loading }: { range: RangeState; onRange: (next: RangeState) => void; rows: WithId<AiUsageDoc>[]; loading: boolean }) {
  const { timezone, branchId } = useBranch()
  const [shown, setShown] = useState(PAGE)
  const [only, setOnly] = useState<'all' | 'failed'>('all')
  const list = useMemo(() => (only === 'failed' ? rows.filter((r) => !r.ok) : rows), [rows, only])

  return (
    <div className="max-w-6xl space-y-5" data-testid="ai-requests">
      <RangeBar range={range} onRange={onRange} />
      <Card className={cn('gap-0 pb-0 transition-opacity', loading && 'opacity-60')}>
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-4">
          <div>
            <CardTitle>Requests</CardTitle>
            <CardDescription className="mt-1">
              {whole.format(list.length)} {list.length === 1 ? 'request' : 'requests'}
              {only === 'failed' ? ' that failed' : ''} in these dates, newest first. Thinking tokens are billed as output.
            </CardDescription>
          </div>
          <ToggleGroup type="single" variant="outline" size="sm" value={only} onValueChange={(v) => v && setOnly(v as 'all' | 'failed')} aria-label="Which requests">
            <ToggleGroupItem value="all" className="px-3 data-[state=on]:bg-foreground data-[state=on]:text-background">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="failed" className="px-3 data-[state=on]:bg-foreground data-[state=on]:text-background">
              Failed
            </ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {list.length ? (
            <table className="w-full min-w-[60rem] text-sm">
              <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-2 py-2 font-medium">For</th>
                  <th className="px-2 py-2 font-medium">Model</th>
                  <th className="px-2 py-2 font-medium">Thinking</th>
                  <th className="px-2 py-2 text-right font-medium">Input</th>
                  <th className="px-2 py-2 text-right font-medium">Output</th>
                  <th className="px-2 py-2 text-right font-medium">Thinking</th>
                  <th className="px-2 py-2 text-right font-medium">Cost</th>
                  <th className="px-2 py-2 text-right font-medium">Time</th>
                  <th className="px-2 py-2 font-medium">By</th>
                  <th className="px-4 py-2 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {list.slice(0, shown).map((r) => {
                  const at = (r.at as { toMillis?: () => number } | null)?.toMillis?.()
                  const model = findModel(r.provider, r.model)
                  return (
                    <Fragment key={r.id}>
                      <tr className={cn(!r.ok && 'bg-destructive/[0.03]')}>
                        <td className="px-4 py-2 whitespace-nowrap text-muted-foreground tabular-nums">{at ? formatInstant(at, timezone, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '…'}</td>
                        <td className="px-2 py-2">
                          <div>{aiFeatureLabel(r.feature)}</div>
                          {r.ref && r.feature === 'reportText' ? (
                            r.branchId === branchId ? (
                              <Link to={`/admin/reports/${r.ref}`} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
                                The report
                              </Link>
                            ) : (
                              <span className="text-xs text-muted-foreground">{r.branchId === 'demo' ? 'Demo academy' : r.branchId}</span>
                            )
                          ) : null}
                        </td>
                        <td className="px-2 py-2">
                          <div className="whitespace-nowrap">{model?.label ?? r.model}</div>
                          <div className="text-xs whitespace-nowrap text-muted-foreground">{AI_PROVIDER_INFO[r.provider]?.label ?? r.provider}</div>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">{r.thinking ? THINKING_LABELS[r.thinking] : 'Default'}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{whole.format(r.inputTokens ?? 0)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{whole.format(r.outputTokens ?? 0)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{whole.format(r.thinkingTokens ?? 0)}</td>
                        <td className="px-2 py-2 text-right tabular-nums" title={r.priced ? undefined : 'No price for this model: counted as $0'}>
                          {r.priced ? formatUsd(r.costUsd ?? 0) : '—'}
                        </td>
                        <td className="px-2 py-2 text-right whitespace-nowrap text-muted-foreground tabular-nums">{r.ms ? `${(r.ms / 1000).toFixed(1)} s` : '—'}</td>
                        <td className="max-w-40 px-2 py-2">
                          <div className="truncate" title={r.by?.email}>
                            {r.by?.name || r.by?.email}
                          </div>
                        </td>
                        <td className="px-4 py-2">{r.ok ? <Badge variant="secondary">OK</Badge> : <Badge variant="destructive">Failed</Badge>}</td>
                      </tr>
                      {!r.ok && r.error ? (
                        <tr className="bg-destructive/[0.03]">
                          <td />
                          <td colSpan={10} className="px-2 pb-2 text-xs break-words text-destructive">
                            {r.error}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          ) : (
            <p className="border-t px-6 py-10 text-center text-sm text-muted-foreground">{only === 'failed' ? 'No failed requests in these dates.' : 'No requests in these dates.'}</p>
          )}
          {list.length > shown ? (
            <div className="flex justify-center border-t p-4">
              <Button variant="outline" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, list.length - shown)} more
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
