import type { ReactNode } from 'react'
import { LuArrowDown, LuArrowUp } from 'react-icons/lu'
import { PAY_LINE_LABELS, type PayLineType } from '@shared/pay/lines'
import { type PayTotals, type Rates, formatMoney } from '@shared/pay/segment'
import type { DateKey } from '@shared/time'
import { DatePicker } from '@/components/app/DatePicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/**
 * The pieces the office's Payroll and a coach's own share, so the two pages look and read the same: the filters card
 * with its dates and buttons, the summary's rates and pay tiles, the records' heading, date column, type badge and
 * pager.
 */

const money = formatMoney

/** The filters card: its fields side by side, wrapping on narrow screens. */
export function PayFilters({ children }: { children: ReactNode }) {
  return (
    <Card className="mb-4 px-4 py-4" data-testid="payroll-filters">
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </Card>
  )
}

/** From and Up to, applied with Generate. */
export function PayRangeFields({ from, to, onFrom, onTo }: { from: DateKey | null; to: DateKey | null; onFrom: (d: DateKey) => void; onTo: (d: DateKey) => void }) {
  return (
    <>
      <div className="grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-40">
        <Label htmlFor="pay-from" className="text-xs text-muted-foreground">
          From
        </Label>
        <DatePicker id="pay-from" value={from} onChange={onFrom} max={to} placeholder="Start date" />
      </div>
      <div className="grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-40">
        <Label htmlFor="pay-to" className="text-xs text-muted-foreground">
          Up to
        </Label>
        <DatePicker id="pay-to" value={to} onChange={onTo} min={from} placeholder="End date" />
      </div>
    </>
  )
}

export function GenerateClear({ onGenerate, onClear }: { onGenerate: () => void; onClear: () => void }) {
  return (
    <div className="flex w-full gap-2 sm:w-auto">
      <Button className="flex-1 sm:flex-none" onClick={onGenerate}>
        Generate
      </Button>
      <Button variant="ghost" className="flex-1 sm:flex-none" onClick={onClear}>
        Clear
      </Button>
    </div>
  )
}

/** The rates a summary's pay uses: owners' and admins' one hourly rate, or a coach's teaching (and admin) rate. */
export function PayRates({ rates, singleRate, paysAdmin }: { rates: Rates; singleRate: boolean; paysAdmin: boolean }) {
  return singleRate ? (
    <span>
      Hourly rate: <strong>{money(rates.admin)}/hr</strong>
    </span>
  ) : (
    <>
      {paysAdmin ? (
        <span>
          Admin rate: <strong>{money(rates.admin)}/hr</strong>
        </span>
      ) : null}
      <span>
        Teaching rate: <strong>{money(rates.teaching)}/hr</strong>
      </span>
    </>
  )
}

/** Pay and hours by type (admin time only where it's paid), then the total. */
export function PayTiles({ sum, singleRate, paysAdmin }: { sum: PayTotals; singleRate: boolean; paysAdmin: boolean }) {
  return (
    <div className={cn('grid gap-2 sm:gap-3', singleRate ? 'grid-cols-1' : paysAdmin ? 'grid-cols-3' : 'grid-cols-2')}>
      {[
        ...(!singleRate && paysAdmin ? [{ label: 'Admin', v: sum.admin }] : []),
        ...(!singleRate ? [{ label: 'Teaching', v: sum.teaching }] : []),
        { label: 'Total pay', v: sum.total, total: true },
      ].map((t) => (
        <div key={t.label} className={cn('min-w-0 rounded-lg border px-3 py-2.5 sm:px-4 sm:py-3', 'total' in t && 'bg-muted/40')}>
          <div className="truncate text-[11px] font-semibold text-muted-foreground uppercase sm:text-xs">{t.label}</div>
          <div className="truncate text-base font-semibold tabular-nums sm:text-2xl">{money(t.v.pay)}</div>
          <div className="text-xs text-muted-foreground tabular-nums sm:text-sm">{t.v.hours.toFixed(2)} h</div>
        </div>
      ))}
    </div>
  )
}

/** The records' title, with the page, the page size and (for a chosen range) how many there are. */
export function PayRecordsHeading({ title, page, size, total, loading }: { title: string; page: number; size: number; total: number | null; loading: boolean }) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="payroll-page-meta">
        {loading ? <Spinner className="size-3.5" /> : null}
        <span>
          Page <strong className="text-foreground">{page}</strong> · <strong className="text-foreground">{size}</strong> per page
          {total !== null ? (
            <>
              {' '}
              · <strong className="text-foreground">{total}</strong> total
            </>
          ) : null}
        </span>
      </div>
    </div>
  )
}

/** The Date column's head: newest first for recent records, a sort toggle for a chosen range. */
export function DateSortHead({ sortable, asc, onToggle }: { sortable: boolean; asc: boolean; onToggle: () => void }) {
  return sortable ? (
    <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={onToggle}>
      Date {asc ? <LuArrowUp className="size-3.5" /> : <LuArrowDown className="size-3.5" />}
    </button>
  ) : (
    <span className="inline-flex items-center gap-1">
      Date <LuArrowDown className="size-3.5" aria-label="Newest first" />
    </span>
  )
}

const TYPE_COLORS: Record<PayLineType, string> = {
  classes: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300',
  teaching: 'border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300',
  admin: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
}

/** A record's type (Classes, Teaching or Admin), with the students under a block of classes. */
export function PayTypeBadge({ type, students }: { type: PayLineType; students: number | null }) {
  return (
    <>
      <Badge variant="outline" className={TYPE_COLORS[type]}>
        {PAY_LINE_LABELS[type]}
      </Badge>
      {students !== null ? (
        <div className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">
          {students} student{students === 1 ? '' : 's'}
        </div>
      ) : null}
    </>
  )
}

/** Under the records: what they are (or how many pages), and Prev / Next. */
export function PayPager({ label, canPrev, canNext, onPrev, onNext }: { label: string; canPrev: boolean; canNext: boolean; onPrev: () => void; onNext: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-t px-4 py-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={!canPrev} onClick={onPrev}>
          Prev
        </Button>
        <Button variant="outline" size="sm" disabled={!canNext} onClick={onNext}>
          Next
        </Button>
      </div>
    </div>
  )
}
