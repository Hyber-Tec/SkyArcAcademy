import { doc, limit, orderBy, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuDownload } from 'react-icons/lu'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { COL, DOC } from '@shared/paths'
import { PAY_LINE_LABELS, payLineTotals, payLines } from '@shared/pay/lines'
import { describePay } from '@shared/pay/paidTime'
import { payPeriodLabel, periodId } from '@shared/pay/periods'
import { hourlyRate, rateMissing } from '@shared/pay/rates'
import { formatMoney } from '@shared/pay/segment'
import { effectiveRates } from '@shared/pay/shifts'
import { type DateKey, addDays, diffDays, formatDateKey, formatInstantTime, isDateKey, todayKey } from '@shared/time'
import type { Compensation, Staff } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RateMissingNotice } from '@/features/employees/PayGapNotice'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { type ClockShift, usePayDays, useShifts } from './api'
import { usePayPeriods } from './hooks'
import { DateSortHead, GenerateClear, PaidTime, PayFilters, PayPager, PayRangeFields, PayRate, PayRecordsHeading, PayTiles, PayTypeBadge } from './PayParts'
import { BROWSE_DAYS, BROWSE_PAGE, REPORT_PAGE, downloadCsv, payDateLabel, shadeByDate } from './payTable'

const money = formatMoney

/**
 * A coach's own pay in the office's Payroll layout, read-only: a pay period (or dates) to choose, the chosen dates'
 * summary (their rate and pay), and the records: the most recent 25 at a time, or the chosen dates'. The records are
 * the shared pay lines (`payLines`), exactly as the office's Payroll and the phone list them, and asked for as the rules
 * let a coach read them (their own time entries and days in; every class). The chosen dates live in the URL.
 */
export function CoachPayrollPage() {
  const { branchId, staffId, settings, timezone } = useBranch()
  const today = todayKey(timezone)
  const [params, setParams] = useSearchParams()
  const { current, recent } = usePayPeriods(12)

  // Applied state (URL). A coach opens on the current pay period, with its totals (as the phone does); Clear shows the
  // most recent records instead (`?recent`).
  const showRecent = params.has('recent')
  const fromParam = params.get('from') ?? (showRecent ? null : current.start)
  const toParam = params.get('to') ?? (showRecent ? null : current.end)
  const report = isDateKey(fromParam) && isDateKey(toParam) ? { from: fromParam, to: toParam } : null
  const isReport = !!report
  const sortAsc = report ? params.get('sort') !== 'desc' : false
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1)
  const update = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: true },
    )

  // Draft dates: a pay period applies at once, dates of their own with Generate.
  const [from, setFrom] = useState<DateKey | null>(report?.from ?? null)
  const [to, setTo] = useState<DateKey | null>(report?.to ?? null)
  const [custom, setCustom] = useState(false)
  const draftPeriod = recent.find((p) => p.start === from && p.end === to)
  const choice = custom ? 'custom' : draftPeriod ? periodId(draftPeriod) : from || to ? 'custom' : ''

  const meRef = useMemo(() => (staffId ? branchDocRef(branchId, COL.staff, staffId) : null), [branchId, staffId])
  const compRef = useMemo(() => (staffId ? doc(db, branchCol(branchId, COL.staff).path, staffId, 'private', DOC.compensation) : null), [branchId, staffId])
  const { data: me } = useDoc<Staff>(meRef)
  const { data: comp, loading: loadingComp } = useDoc<Compensation>(compRef)

  // Data: the chosen dates, or the recent window (which grows as pages need it).
  const [browseFrom, setBrowseFrom] = useState(() => addDays(today, -BROWSE_DAYS))
  const qFrom = report ? report.from : browseFrom
  const qTo = report ? report.to : today
  const { data: shifts, loading: loadingShifts } = useShifts(qFrom, qTo, staffId, !!staffId, { keepPrevious: true })
  // Every class, and their own days in: their paid time starts before their first class and ends with their last.
  const days = usePayDays(qFrom, qTo, staffId, !!staffId, { keepPrevious: true })
  // How far back the recent records can go: the coach's first time entry (their own, oldest first).
  const firstShiftQuery = useMemo(
    () => (isReport || !staffId ? null : query(branchCol(branchId, COL.clockShifts), where('staffId', '==', staffId), orderBy('dateKey'), limit(1))),
    [branchId, staffId, isReport],
  )
  const { data: firstShift, loading: loadingFirstShift } = useQuery<ClockShift>(firstShiftQuery, `pay-first-${branchId}-${staffId}`)
  const loading = loadingShifts || days.loading || loadingFirstShift
  const first = firstShift[0]?.dateKey ?? null
  const olderExists = !isReport && !!first && first < browseFrom

  // A coach's few weeks of records: worked out on each render. Only their own lines: `ratesFor` knows only their rate.
  const ratesFor = () => effectiveRates(me, comp)
  const dir = sortAsc ? 1 : -1
  // Newest dates first, unless chosen dates are sorted oldest first; each day in time order.
  const lines = payLines({ shifts, classes: days.classes, availability: days.availability, settings, ratesFor, from: qFrom, to: qTo })
    .filter((l) => l.staffId === staffId)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey) * dir || a.startMs - b.startMs)

  const size = report ? REPORT_PAGE : BROWSE_PAGE
  const pageCount = Math.max(1, Math.ceil(lines.length / size))
  const pageLines = lines.slice((page - 1) * size, page * size)

  // The recent records reach further back (twice as far each time, never before the first record) until the page is
  // full. The wider dates load at once (`loading`), so this asks once per step.
  if (!isReport && !loading && olderExists && first && lines.length < page * BROWSE_PAGE) {
    const further = addDays(today, -2 * diffDays(browseFrom, today))
    setBrowseFrom(further < first ? first : further)
  }

  const canPrev = page > 1
  const canNext = report ? page < pageCount : lines.length > page * size || olderExists

  function choose(value: string) {
    if (value === 'custom') return setCustom(true)
    const p = recent.find((x) => periodId(x) === value)
    if (!p) return
    setCustom(false)
    setFrom(p.start)
    setTo(p.end)
    update({ from: p.start, to: p.end, recent: null, sort: null, page: null })
  }

  function generate() {
    if (!from || !to) return toast.error('Choose the dates (From and Up to).')
    if (from > to) return toast.error('“From” must be on or before “Up to”.')
    update({ from, to, recent: null, sort: null, page: null })
  }

  function clear() {
    setFrom(null)
    setTo(null)
    setCustom(false)
    setBrowseFrom(addDays(today, -BROWSE_DAYS))
    setParams({ recent: '' }, { replace: true })
  }

  // The chosen dates' summary.
  const sum = payLineTotals(lines)
  const missing = !!report && !!me && !loadingComp && rateMissing(me.role, comp?.rates)
  const timeOf = (ms: number) => formatInstantTime(ms, timezone)

  function exportCsv() {
    const out = [['Date', 'Type', 'Paid from', 'Paid to', 'Clocked in', 'Clocked out', 'Hours', 'Rate', 'Total', 'Note']]
    for (const l of lines) {
      if (l.open || !l.shift) continue
      const worked = l.type !== 'extra'
      const clockOut = l.shift.clockOutAt?.toMillis()
      out.push([
        l.dateKey,
        PAY_LINE_LABELS[l.type],
        worked ? timeOf(l.segment.startMs) : '',
        worked ? timeOf(l.segment.endMs) : '',
        timeOf(l.shift.clockInAt.toMillis()),
        clockOut !== undefined ? timeOf(clockOut) : '',
        l.segment.hours.toFixed(2),
        l.segment.rate.toFixed(2),
        l.segment.pay.toFixed(2),
        l.note ?? '',
      ])
    }
    downloadCsv(report ? `payroll_${(me?.name ?? 'coach').replace(/\W+/g, '_')}_${report.from}_${report.to}.csv` : `payroll_recent_${today}.csv`, out)
  }

  const shaded = shadeByDate(pageLines)
  if (!staffId) return <p className="text-sm text-muted-foreground">Your employee record isn’t linked yet. Ask an admin.</p>

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Payroll"
        description="Your pay: the time you’re clocked in at the kiosk, and extra time an admin added, at your hourly rate."
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!lines.some((l) => !l.open)}>
            <LuDownload /> CSV
          </Button>
        }
      />

      <PayFilters>
        <div className="grid w-full gap-1.5 sm:w-auto sm:min-w-64 sm:flex-1">
          <Label className="text-xs text-muted-foreground">Pay period</Label>
          <Select value={choice} onValueChange={choose}>
            <SelectTrigger className="w-full" aria-label="Pay period">
              <SelectValue placeholder="Choose a pay period…" />
            </SelectTrigger>
            <SelectContent>
              {recent.map((p) => (
                <SelectItem key={periodId(p)} value={periodId(p)}>
                  {payPeriodLabel(p)}
                  {periodId(p) === periodId(current) ? ' (current)' : ''}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <PayRangeFields
          from={from}
          to={to}
          onFrom={(d) => {
            setFrom(d)
            setCustom(true)
          }}
          onTo={(d) => {
            setTo(d)
            setCustom(true)
          }}
        />
        <GenerateClear onGenerate={generate} onClear={clear} />
      </PayFilters>

      {report ? (
        <Card className="mb-4 gap-3 px-4 py-4" data-testid="payroll-summary">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <span className="font-semibold">{me?.name ?? 'Your pay'}</span>
            <span className="text-muted-foreground">
              {formatDateKey(report.from, 'medium')} – {formatDateKey(report.to, 'medium')}
            </span>
            {!loadingComp ? <PayRate rate={hourlyRate(comp?.rates)} /> : null}
          </div>
          <PayTiles sum={sum} />
          {missing ? <RateMissingNotice>Your hourly rate isn’t set yet, so this time is priced at $0. Ask an admin to set it.</RateMissingNotice> : null}
        </Card>
      ) : null}

      <PayRecordsHeading title={report ? 'Generated payroll records' : 'Recent payroll records'} page={page} size={size} total={report ? lines.length : null} loading={loading} />

      <Card className="gap-0 overflow-hidden py-0">
        <Table data-testid="payroll-table">
          <TableHeader>
            <TableRow>
              <TableHead>
                <DateSortHead sortable={isReport} asc={sortAsc} onToggle={() => update({ sort: sortAsc ? 'desc' : null, page: null })} />
              </TableHead>
              <TableHead>Type</TableHead>
              {/* Narrow screens: the times go under the type, and the rate (the same on every line) is left out. */}
              <TableHead className="hidden sm:table-cell">Paid from</TableHead>
              <TableHead className="hidden sm:table-cell">Paid to</TableHead>
              <TableHead className="text-right">Hrs</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Rate</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageLines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  {loading ? 'Loading records…' : report ? 'No records for these dates.' : 'No payroll records yet.'}
                </TableCell>
              </TableRow>
            ) : (
              pageLines.map((l, i) => (
                <TableRow key={l.key} className={cn(shaded[i] && 'bg-muted/80 hover:bg-muted')} data-testid="payroll-row">
                  <TableCell className="whitespace-nowrap">{payDateLabel(l.dateKey, today)}</TableCell>
                  {l.open ? (
                    <>
                      <TableCell>
                        <Badge variant="outline">Clocked in</Badge>
                        <div className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">Paid once you clock out</div>
                        <div className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:hidden">Since {timeOf(l.startMs)}</div>
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap tabular-nums sm:table-cell">{timeOf(l.startMs)}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">Open</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                      <TableCell className="hidden text-right text-muted-foreground sm:table-cell">—</TableCell>
                      <TableCell className="text-right text-muted-foreground">—</TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>
                        <PayTypeBadge type={l.type} note={l.note} />
                        {l.type !== 'extra' ? (
                          <div className="mt-0.5 text-xs text-muted-foreground tabular-nums sm:hidden">
                            <div className="whitespace-nowrap">
                              {timeOf(l.segment.startMs)} – {timeOf(l.segment.endMs)}
                            </div>
                            {l.clocked ? (
                              <div>
                                Clocked{' '}
                                {[
                                  l.clocked.inMs !== l.segment.startMs ? `in ${timeOf(l.clocked.inMs)}` : null,
                                  l.clocked.outMs !== l.segment.endMs ? `out ${timeOf(l.clocked.outMs)}` : null,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <PaidTime ms={l.type !== 'extra' ? l.segment.startMs : null} clockMs={l.clocked?.inMs} edge="in" timezone={timezone} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <PaidTime ms={l.type !== 'extra' ? l.segment.endMs : null} clockMs={l.clocked?.outMs} edge="out" timezone={timezone} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{l.segment.hours.toFixed(2)}</TableCell>
                      <TableCell className="hidden text-right tabular-nums sm:table-cell">{money(l.segment.rate)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(l.segment.pay)}</TableCell>
                    </>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PayPager
          label={report ? `${pageCount} page${pageCount > 1 ? 's' : ''}` : 'Newest first'}
          canPrev={canPrev}
          canNext={canNext}
          onPrev={() => update({ page: page - 1 > 1 ? String(page - 1) : null })}
          onNext={() => update({ page: String(page + 1) })}
        />
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">
        {describePay(settings)} Hours are rounded to 0.01 h; pay is computed from the rounded hours. If something looks wrong, ask an admin.
      </p>
    </div>
  )
}
