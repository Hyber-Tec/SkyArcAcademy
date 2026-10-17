import { useMemo, useState } from 'react'
import { COL, DOC } from '@shared/paths'
import { priceClassBlocks } from '@shared/pay/classes'
import { type PricedSegment, formatMoney, totals } from '@shared/pay/segment'
import { payModelOn } from '@shared/settings/businessRules'
import { type DateKey, addDays, formatDateKey, formatInstantTime, todayKey } from '@shared/time'
import type { Compensation, Staff } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { branchCol, branchDocRef, useDoc } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { doc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { effectiveRates, priceShifts, useSessionsRange, useShifts } from './api'
import { PeriodPicker, type RangeValue, useDefaultRange } from './PeriodPicker'

const money = formatMoney

/** A line of the coach's pay: a paid part of a time entry, a block of classes taught, or a shift still clocked in. */
type Line =
  | { key: string; dateKey: DateKey; startMs: number; open: true }
  | { key: string; dateKey: DateKey; startMs: number; open: false; seg: PricedSegment; label: string; students: number | null }

/** A coach's own worked time and pay for a pay period or range (read-only). */
export function CoachPayrollPage() {
  const { branchId, staffId, settings, rules, timezone } = useBranch()
  const [range, setRange] = useState<RangeValue>(useDefaultRange())
  const meRef = useMemo(() => (staffId ? branchDocRef(branchId, COL.staff, staffId) : null), [branchId, staffId])
  const compRef = useMemo(() => (staffId ? doc(db, branchCol(branchId, COL.staff).path, staffId, 'private', DOC.compensation) : null), [branchId, staffId])
  const { data: me } = useDoc<Staff>(meRef)
  const { data: comp } = useDoc<Compensation>(compRef)
  const { data: shifts } = useShifts(range.from, range.to, staffId, !!staffId)
  const { data: sessions } = useSessionsRange(addDays(range.from, -1), addDays(range.to, 1), staffId, !!staffId)

  const lines = useMemo(() => {
    const ratesFor = () => effectiveRates(me ?? undefined, comp)
    const out: Line[] = []
    for (const p of priceShifts({ shifts, sessions, settings, rules, timezone, ratesFor })) {
      if (p.open) out.push({ key: p.shift.id, dateKey: p.shift.dateKey, startMs: p.shift.clockInAt.toMillis(), open: true })
      // Unpaid time (Teaching only's gaps, and every clock-in under Classes taught) isn't pay.
      p.segments
        .filter((s) => !s.unpaid)
        .forEach((seg, i) =>
          out.push({ key: `${p.shift.id}-${i}`, dateKey: p.shift.dateKey, startMs: seg.startMs, open: false, seg, label: seg.type === 'teaching' ? 'Teaching' : 'Admin', students: null }),
        )
    }
    for (const b of priceClassBlocks({ sessions, settings, rules, ratesFor })) {
      if (b.dateKey < range.from || b.dateKey > range.to) continue
      out.push({ key: `class-${b.segment.startMs}`, dateKey: b.dateKey, startMs: b.segment.startMs, open: false, seg: b.segment, label: 'Classes', students: b.students })
    }
    return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMs - b.startMs)
  }, [shifts, sessions, settings, rules, timezone, me, comp, range.from, range.to])
  const t = totals(lines.flatMap((l) => (l.open ? [] : [l.seg])))
  if (!staffId) return <p className="text-sm text-muted-foreground">Your employee record isn’t linked yet. Ask an admin.</p>
  const byClasses = payModelOn(rules, todayKey(timezone)) === 'classes'

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Payroll"
        description={
          byClasses
            ? 'Your pay for the classes you taught, from the schedule. Clocking in and out is kept as a log and doesn’t change your pay.'
            : 'Your recorded hours and pay, worked out with the academy’s pay model.'
        }
      />
      <div className="mb-4">
        <PeriodPicker value={range} onChange={setRange} />
      </div>
      <div className={t.admin.hours > 0 ? 'mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3' : 'mb-4 grid grid-cols-2 gap-3'}>
        {[...(t.admin.hours > 0 ? [{ label: 'Admin', v: t.admin }] : []), { label: 'Teaching', v: t.teaching }, { label: 'Total pay', v: t.total }].map((x, i, all) => (
          <Card key={x.label} className={cn('gap-1 px-4 py-3', all.length === 3 && i === 2 && 'col-span-2 sm:col-span-1')}>
            <div className="text-xs font-semibold text-muted-foreground uppercase">{x.label}</div>
            <div className="text-2xl font-semibold tabular-nums">{money(x.v.pay)}</div>
            <div className="text-sm text-muted-foreground tabular-nums">{x.v.hours.toFixed(2)}h</div>
          </Card>
        ))}
      </div>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              {/* Phones: the time goes under the type, and the rate (the same on every line) is left out. */}
              <TableHead className="hidden sm:table-cell">Start</TableHead>
              <TableHead className="hidden sm:table-cell">End</TableHead>
              <TableHead className="text-right">Hrs</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Rate</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((l, i) => {
              const date = i === 0 || lines[i - 1].dateKey !== l.dateKey ? formatDateKey(l.dateKey, 'weekdayMedium') : ''
              return l.open ? (
                <TableRow key={l.key}>
                  <TableCell className="whitespace-nowrap">{date}</TableCell>
                  <TableCell colSpan={6} className="text-muted-foreground">
                    Clocked in at {formatInstantTime(l.startMs, timezone)}
                  </TableCell>
                </TableRow>
              ) : (
                <TableRow key={l.key}>
                  <TableCell className="whitespace-nowrap">{date}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={l.seg.type === 'teaching' ? 'border-green-200 bg-green-50 text-green-700' : 'border-sky-200 bg-sky-50 text-sky-700'}>
                      {l.label}
                    </Badge>
                    {l.students !== null ? (
                      <div className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground">
                        {l.students} student{l.students === 1 ? '' : 's'}
                      </div>
                    ) : null}
                    <div className="mt-0.5 text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:hidden">
                      {formatInstantTime(l.seg.startMs, timezone)} – {formatInstantTime(l.seg.endMs, timezone)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">{formatInstantTime(l.seg.startMs, timezone)}</TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell">{formatInstantTime(l.seg.endMs, timezone)}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.seg.hours.toFixed(2)}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{money(l.seg.rate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(l.seg.pay)}</TableCell>
                </TableRow>
              )
            })}
            {lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No records found for this range.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
