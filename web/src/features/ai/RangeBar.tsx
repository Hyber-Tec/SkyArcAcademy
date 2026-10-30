import { SPEND_RANGE_LABELS, type SpendRange, spendRange } from '@shared/ai/usage'
import { formatDateKey, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { RangeState } from './AiSettings'

const RANGES: SpendRange[] = ['this_month', 'last_month', 'last_30', 'custom']

/** The dates Spend and Requests cover: one row above everything it scopes. */
export function RangeBar({ range, onRange }: { range: RangeState; onRange: (next: RangeState) => void }) {
  const { timezone } = useBranch()
  const today = todayKey(timezone)
  const pick = (r: SpendRange) => onRange(r === 'custom' ? { ...range, range: 'custom' } : { range: r, ...spendRange(r, today) })

  return (
    <div className="flex flex-wrap items-center gap-3" data-testid="ai-range">
      <ToggleGroup type="single" variant="outline" value={range.range} onValueChange={(v) => v && pick(v as SpendRange)} className="flex-wrap justify-start" aria-label="Dates">
        {RANGES.map((r) => (
          <ToggleGroupItem key={r} value={r} className="px-3 data-[state=on]:bg-foreground data-[state=on]:text-background">
            {SPEND_RANGE_LABELS[r]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {range.range === 'custom' ? (
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker size="sm" className="w-40" value={range.from} max={range.to} onChange={(from) => onRange({ ...range, from })} aria-label="From" />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePicker size="sm" className="w-40" value={range.to} min={range.from} max={today} onChange={(to) => onRange({ ...range, to })} aria-label="To" />
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">
          {formatDateKey(range.from, 'medium')} – {formatDateKey(range.to, 'medium')}
        </span>
      )}
    </div>
  )
}
