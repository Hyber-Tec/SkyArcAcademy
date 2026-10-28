import { useMemo, useState } from 'react'
import { LuCalendarClock, LuLock, LuPencil, LuPlus, LuTrash2, LuTriangleAlert, LuUserRound } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { extraMinutes } from '@shared/pay/lines'
import { describePay, payRule, shiftPaidTime } from '@shared/pay/paidTime'
import { formatExtra } from '@shared/pay/segment'
import { type DateKey, formatDateKey, formatDuration, formatInstantTime } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStaffList } from '@/features/data/hooks'
import { type ClockShift, deleteShift, usePayDays, useShifts } from './api'
import { usePayrollState } from './hooks'
import { PeriodPicker, type RangeValue, useDefaultRange } from './PeriodPicker'
import { ShiftDialog } from './ShiftDialog'

const SOURCE_LABEL: Record<ClockShift['source'], string> = { kiosk: 'Kiosk', admin: 'Admin entry', auto: 'Auto' }

/**
 * Worked times (TE "Log Hours" + the Payroll page's edit/delete): add, fix and remove shifts, and add extra time to one.
 * Each shift shows its clock times and, where they differ, the paid ones (docs/DECISIONS.md §23: a coach is paid from
 * shortly before their first class to the end of their last).
 */
export function TimeEntriesPage() {
  const { confirm, dialog: confirmDialog } = useConfirm()
  const removeShift = async (s: Parameters<typeof deleteShift>[2]) => {
    if (await confirm({ title: 'Delete this time entry?', description: `${s.staffName}’s entry of ${formatDateKey(s.dateKey, 'weekdayMedium')}.`, confirmLabel: 'Delete', destructive: true }))
      void deleteShift(branchId, actor, s).then(() => toast.success('Deleted'))
  }
  const { branchId, actor, timezone, settings } = useBranch()
  const navigate = useNavigate()
  const { data: staff } = useStaffList()
  const [staffId, setStaffId] = useState<string | null>(null)
  const [range, setRange] = useState<RangeValue>(useDefaultRange())
  const { lockedThrough } = usePayrollState()
  const { data: shifts, loading } = useShifts(range.from, range.to, staffId)
  const days = usePayDays(range.from, range.to, staffId)
  const [dialog, setDialog] = useState<WithId<ClockShift> | 'new' | null>(null)

  const roleOf = useMemo(() => new Map(staff.map((s) => [s.id, s.role])), [staff])
  const rows = useMemo(() => {
    const rule = payRule(settings)
    return [...shifts]
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.staffName.localeCompare(b.staffName) || a.inMin - b.inMin)
      .map((s) => {
        // A shift still open: its time so far, for when its paid time starts.
        const p = shiftPaidTime(s, { role: roleOf.get(s.staffId), classes: days.classes, availability: days.availability, rule })
        const paid = s.clockOutAt ? p : null
        const inMs = s.clockInAt.toMillis()
        const paidFrom = p.startMs > inMs && (!paid || paid.endMs > paid.startMs) ? p.startMs : null
        return { s, paid, paidFrom }
      })
  }, [shifts, days.classes, days.availability, settings, roleOf])
  const locked = (d: DateKey) => !!lockedThrough && d <= lockedThrough
  const time = (ms: number) => formatInstantTime(ms, timezone)

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Time Entries"
        description="Clock-ins from the kiosk and time added by admins, with the time each one pays and any extra time."
        actions={
          <Button onClick={() => setDialog('new')}>
            <LuPlus /> Add time entry
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <OptionPicker
          className="lg:w-64"
          value={staffId ?? 'all'}
          onChange={(v) => setStaffId(v === 'all' ? null : v)}
          options={[{ value: 'all', label: 'All employees' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]}
        />
        <PeriodPicker value={range} onChange={setRange} lockedThrough={lockedThrough} />
      </div>
      {lockedThrough ? (
        <Alert className="mb-4">
          <LuLock />
          <AlertDescription>Pay periods through {formatDateKey(lockedThrough, 'medium')} are locked; their entries can’t be changed.</AlertDescription>
        </Alert>
      ) : null}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>In</TableHead>
              <TableHead>Out</TableHead>
              <TableHead>Paid</TableHead>
              <TableHead className="hidden md:table-cell">Source</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ s, paid, paidFrom }) => {
              const extra = extraMinutes(s)
              const inMs = s.clockInAt.toMillis()
              const outMs = s.clockOutAt?.toMillis() ?? null
              // An automatic clock-out at the end of the last class is the academy's rule; one at the set time may need a look.
              const autoToFix = s.autoClosed && !s.autoCorrected && s.autoClosedBy !== 'last_class'
              return (
                <ContextMenuFor
                  key={s.id}
                  entries={menu(
                    { kind: 'label', label: `${s.staffName} · ${formatDateKey(s.dateKey, 'weekdayMedium')}` },
                    locked(s.dateKey) && { kind: 'label', label: 'In a locked pay period' },
                    { label: 'Edit time entry…', icon: LuPencil, disabled: locked(s.dateKey), onSelect: () => setDialog(s) },
                    {
                      label: 'Delete time entry',
                      icon: LuTrash2,
                      destructive: true,
                      disabled: locked(s.dateKey),
                      onSelect: () => void removeShift(s),
                    },
                    { label: 'Open employee profile', icon: LuUserRound, separatorBefore: true, onSelect: () => navigate(`/admin/employees/directory/${s.staffId}`) },
                    { label: 'Clock in/out calendar', icon: LuCalendarClock, onSelect: () => navigate(`/admin/employees/calendar?staff=${s.staffId}&mode=clock`) },
                  )}
                >
                  <TableRow data-testid="time-entry">
                    <TableCell className="whitespace-nowrap">{formatDateKey(s.dateKey, 'weekdayMedium')}</TableCell>
                    <TableCell className="font-medium">{s.staffName}</TableCell>
                    <TableCell className="tabular-nums">
                      <span className="whitespace-nowrap">{time(inMs)}</span>
                      {paidFrom !== null ? (
                        <div className="text-xs whitespace-nowrap text-muted-foreground" data-testid="paid-from">
                          paid from {time(paidFrom)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {outMs !== null ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                            {time(outMs)}
                            {autoToFix ? (
                              <Badge variant="destructive" className="gap-1">
                                <LuTriangleAlert /> Auto
                              </Badge>
                            ) : null}
                          </span>
                          {paid && paid.endMs > paid.startMs && paid.endMs !== outMs ? (
                            <div className="text-xs whitespace-nowrap text-muted-foreground" data-testid="paid-to">
                              paid to {time(paid.endMs)}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <Badge className="bg-emerald-600">Clocked in</Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {paid ? <span className="whitespace-nowrap">{formatDuration((paid.endMs - paid.startMs) / 60_000)}</span> : '—'}
                      {paid && paid.endMs <= paid.startMs ? <div className="text-xs whitespace-nowrap text-muted-foreground">Outside paid hours</div> : null}
                      {extra ? (
                        <div className="text-xs whitespace-nowrap text-violet-700 dark:text-violet-300" title={s.extraNote} data-testid="extra-time">
                          {formatExtra(extra)} extra{s.extraNote ? ` · ${s.extraNote}` : ''}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant="outline">{SOURCE_LABEL[s.source] ?? s.source}</Badge>
                        {s.autoClosed && s.autoClosedBy === 'last_class' ? <Badge variant="secondary">Out at class end</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {locked(s.dateKey) ? (
                        <LuLock className="text-muted-foreground" aria-label="Locked" />
                      ) : (
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => setDialog(s)}>
                            <LuPencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label="Delete" onClick={() => void removeShift(s)}>
                            <LuTrash2 />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                </ContextMenuFor>
              )
            })}
            {!loading && rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  No time entries in this range.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <p className="mt-2 text-xs text-muted-foreground">{describePay(settings)}</p>
      <ShiftDialog state={dialog} onClose={() => setDialog(null)} staff={staff.map((s) => ({ id: s.id, name: s.name }))} isLocked={locked} defaultStaff={staffId} />
      {confirmDialog}
    </div>
  )
}
