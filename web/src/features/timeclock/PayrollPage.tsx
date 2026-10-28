import { limit, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { LuCalendarCheck, LuCalendarClock, LuDownload, LuLock, LuPencil, LuTrash2, LuUserRound } from 'react-icons/lu'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { PAY_LINE_LABELS, type PaidLine, payLineTotals, payLines } from '@shared/pay/lines'
import { describePay } from '@shared/pay/paidTime'
import { hourlyRate, rateMissing } from '@shared/pay/rates'
import { formatMoney } from '@shared/pay/segment'
import { effectiveRates } from '@shared/pay/shifts'
import { STAFF_STATUSES, STAFF_STATUS_LABELS } from '@shared/people'
import { type DateKey, addDays, formatDateKey, formatInstantTime, todayKey } from '@shared/time'
import type { Staff, StaffStatus, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useStaffList } from '@/features/data/hooks'
import { PayGapNotice, RateMissingNotice } from '@/features/employees/PayGapNotice'
import { usePayGaps } from '@/features/employees/payGaps'
import { branchCol, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { type ClockShift, deleteShift, usePayDays, useShifts } from './api'
import { useCompensationMap, usePayrollState } from './hooks'
import { DateSortHead, GenerateClear, PaidTime, PayFilters, PayPager, PayRangeFields, PayRate, PayRecordsHeading, PayTiles, PayTypeBadge } from './PayParts'
import { PayPeriodsDialog } from './PayPeriodsDialog'
import { ShiftDialog } from './ShiftDialog'
import { BROWSE_DAYS, BROWSE_PAGE, REPORT_PAGE, downloadCsv, payDateLabel, shadeByDate } from './payTable'

type RoleFilter = 'all' | 'coach' | 'admin'

/** A row: a pay line (`payLines`) of a time entry, with the person's name. */
type PayRow = PaidLine<WithId<ClockShift>> & { name: string; shift: WithId<ClockShift> }

const money = formatMoney

/** Owners and admins are filtered as admins. */
const roleGroup = (s: Pick<Staff, 'role'> | undefined): 'coach' | 'admin' => (s?.role === 'owner' || s?.role === 'admin' ? 'admin' : 'coach')

/**
 * Payroll in True Education's layout: filters (role, status, employee, dates),
 * the most recent payroll records 25 at a time, and a generated report for one
 * employee and date range with pay totals. Rows are the paid parts of time
 * entries (shifts) and their extra time, at each person's one rate: a coach's
 * paid time starts before their first class and ends with their last
 * (docs/DECISIONS.md §23). Edit and Delete act on the time entry a row comes
 * from. The rows are the shared pay lines (`payLines`), as a coach's own
 * Payroll and the phone list them. The applied filters live in the URL.
 */
export function PayrollPage() {
  const { branchId, actor, settings, timezone } = useBranch()
  const navigate = useNavigate()
  const today = todayKey(timezone)
  const [params, setParams] = useSearchParams()
  const { data: staff } = useStaffList()
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const { lockedThrough } = usePayrollState()

  // Applied state (URL).
  const role: RoleFilter = params.get('role') === 'coach' || params.get('role') === 'admin' ? (params.get('role') as RoleFilter) : 'all'
  const statusParam = params.get('status')
  const status: StaffStatus | 'all' = statusParam === 'all' || STAFF_STATUSES.includes(statusParam as StaffStatus) ? (statusParam as StaffStatus | 'all') : 'active'
  const report = params.get('employee') && params.get('from') && params.get('to') ? { staffId: params.get('employee')!, from: params.get('from')!, to: params.get('to')! } : null
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

  // Draft fields (applied with Generate).
  const [employee, setEmployee] = useState<string | null>(report?.staffId ?? null)
  const [from, setFrom] = useState<DateKey | null>(report?.from ?? null)
  const [to, setTo] = useState<DateKey | null>(report?.to ?? null)
  const matches = (s: WithId<Staff> | undefined) => !!s && (role === 'all' || roleGroup(s) === role) && (status === 'all' || s.status === status)
  const choices = staff.filter(matches)
  // An employee the role or status filter hides is no longer chosen.
  const chosen = employee && choices.some((c) => c.id === employee) ? employee : null

  // Data: the report's range, or the recent window (which grows as pages need it).
  const [browseFrom, setBrowseFrom] = useState(() => addDays(today, -BROWSE_DAYS))
  const qFrom = report ? report.from : browseFrom
  const qTo = report ? report.to : today
  const who = report?.staffId ?? null
  const { data: shifts, loading: loadingShifts } = useShifts(qFrom, qTo, who, true, { keepPrevious: true })
  // The classes and who's in: a coach's paid time starts before their first class and ends with their last.
  const days = usePayDays(qFrom, qTo, who, true, { keepPrevious: true })
  const olderQuery = useMemo(
    () => (isReport ? null : query(branchCol(branchId, COL.clockShifts), where('dateKey', '<', browseFrom), orderBy('dateKey', 'desc'), limit(1))),
    [branchId, browseFrom, isReport],
  )
  const { data: older, loading: loadingOlder } = useQuery<ClockShift>(olderQuery, `pay-older-${branchId}-${browseFrom}-${isReport}`, { keepPrevious: true })
  const loading = loadingShifts || days.loading || loadingOlder
  const comps = useCompensationMap(staff.map((s) => s.id))

  const rows = useMemo(() => {
    const ratesFor = (id: string) => effectiveRates(staffById.get(id), comps.get(id))
    const shown = (staffId: string, fallbackName: string) => {
      const person = staffById.get(staffId)
      return isReport || matches(person) || (!person && role === 'all' && status === 'all') ? (person?.name ?? fallbackName) : null
    }
    const out: PayRow[] = []
    for (const l of payLines({ shifts, classes: days.classes, availability: days.availability, settings, ratesFor, from: qFrom, to: qTo })) {
      // A time entry still clocked in has no pay yet; a report is one employee's.
      if (l.open || !l.shift || (report && l.staffId !== report.staffId)) continue
      const name = shown(l.staffId, l.shift.staffName)
      if (name === null) continue
      out.push({ ...l, shift: l.shift, name })
    }
    const dir = sortAsc ? 1 : -1
    return out.sort((a, b) => a.dateKey.localeCompare(b.dateKey) * dir || a.name.localeCompare(b.name) || a.startMs - b.startMs || Number(a.type === 'extra') - Number(b.type === 'extra'))
    // `matches` reads role and status; `report` is the employee and the dates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shifts, days.classes, days.availability, settings, staffById, comps, isReport, who, role, status, sortAsc, qFrom, qTo])

  const size = report ? REPORT_PAGE : BROWSE_PAGE
  const pageCount = Math.max(1, Math.ceil(rows.length / size))
  const pageRows = rows.slice((page - 1) * size, page * size)
  const olderDate = older[0]?.dateKey ?? null

  // The recent list reaches further back until the page is full or nothing older exists.
  useEffect(() => {
    if (isReport || loading || !olderDate || rows.length >= page * BROWSE_PAGE) return
    setBrowseFrom(addDays(olderDate, -BROWSE_DAYS))
  }, [isReport, loading, olderDate, rows.length, page])

  const canPrev = page > 1
  const canNext = report ? page < pageCount : rows.length > page * size || !!olderDate

  function generate() {
    if (!chosen) return toast.error('Choose an employee.')
    if (!from || !to) return toast.error('Choose the dates (From and Up to).')
    if (from > to) return toast.error('“From” must be on or before “Up to”.')
    update({ employee: chosen, from, to, sort: null, page: null })
  }

  function clear() {
    setEmployee(null)
    setFrom(null)
    setTo(null)
    setBrowseFrom(addDays(today, -BROWSE_DAYS))
    setParams({}, { replace: true })
  }

  // Report summary.
  const person = report ? staffById.get(report.staffId) : undefined
  const comp = report ? comps.get(report.staffId) : undefined
  const sum = payLineTotals(rows)
  // The report's employee has no rate (their time is priced at $0), and anyone missing one.
  const reportMissing = !!report && !!person && rateMissing(person.role, comp?.rates)
  const { gaps } = usePayGaps(!report)

  const [editing, setEditing] = useState<PayRow | null>(null)
  const [deleting, setDeleting] = useState<PayRow | null>(null)
  const [periodsOpen, setPeriodsOpen] = useState(false)
  const isLocked = (d: DateKey) => !!lockedThrough && d <= lockedThrough
  const timeOf = (ms: number) => formatInstantTime(ms, timezone)
  const entryLabel = (r: PayRow) =>
    `${r.name}’s time entry on ${formatDateKey(r.shift.dateKey, 'weekdayMedium')}, ${timeOf(r.shift.clockInAt.toMillis())} – ${r.shift.clockOutAt ? timeOf(r.shift.clockOutAt.toMillis()) : 'open'}`

  function exportCsv() {
    const lines = [['Date', 'Name', 'Type', 'Start time', 'End time', 'Clocked in', 'Clocked out', 'Hours', 'Rate', 'Total', 'Note']]
    for (const r of rows) {
      const worked = r.type !== 'extra'
      const out = r.shift.clockOutAt?.toMillis()
      lines.push([
        r.dateKey,
        r.name,
        PAY_LINE_LABELS[r.type],
        worked ? timeOf(r.segment.startMs) : '',
        worked ? timeOf(r.segment.endMs) : '',
        timeOf(r.shift.clockInAt.toMillis()),
        out !== undefined ? timeOf(out) : '',
        r.segment.hours.toFixed(2),
        r.segment.rate.toFixed(2),
        r.segment.pay.toFixed(2),
        r.note ?? '',
      ])
    }
    downloadCsv(report ? `payroll_${(person?.name ?? 'employee').replace(/\W+/g, '_')}_${report.from}_${report.to}.csv` : `payroll_recent_${today}.csv`, lines)
  }

  // Rows are shaded by date, not one by one (TE).
  const shaded = shadeByDate(pageRows)

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Payroll"
        description="Each employee’s pay: their time clocked in at the kiosk, and extra time an admin added, at their hourly rate."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <LuDownload /> CSV
            </Button>
            <Button variant="outline" onClick={() => setPeriodsOpen(true)}>
              <LuCalendarCheck /> Pay periods
            </Button>
          </>
        }
      />

      {!report ? <PayGapNotice gaps={gaps} className="mb-4" /> : null}
      <PayFilters>
        <div className="grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-36">
          <Label className="text-xs text-muted-foreground">Role</Label>
          <Select value={role} onValueChange={(v) => update({ role: v === 'all' ? null : v, page: report ? params.get('page') : null })}>
            <SelectTrigger className="w-full" aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="coach">Coaches</SelectItem>
              <SelectItem value="admin">Admins</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-[calc(50%-0.375rem)] gap-1.5 sm:w-36">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={status} onValueChange={(v) => update({ status: v === 'active' ? null : v, page: report ? params.get('page') : null })}>
            <SelectTrigger className="w-full" aria-label="Status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STAFF_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAFF_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid w-full gap-1.5 sm:w-auto sm:min-w-56 sm:flex-1">
          <Label className="text-xs text-muted-foreground">Employee</Label>
          <OptionPicker
            value={chosen}
            onChange={setEmployee}
            options={choices.map((s) => ({ value: s.id, label: s.name, hint: roleGroup(s) === 'admin' ? 'Admin' : undefined }))}
            placeholder="Choose employee…"
            searchPlaceholder="Search employees…"
          />
        </div>
        <PayRangeFields from={from} to={to} onFrom={setFrom} onTo={setTo} />
        <GenerateClear onGenerate={generate} onClear={clear} />
      </PayFilters>

      {report ? (
        <Card className="mb-4 gap-3 px-4 py-4" data-testid="payroll-summary">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
            <span className="font-semibold">{person?.name ?? 'Employee'}</span>
            <span className="text-muted-foreground">
              {formatDateKey(report.from, 'medium')} – {formatDateKey(report.to, 'medium')}
            </span>
            <PayRate rate={hourlyRate(comp?.rates)} />
          </div>
          <PayTiles sum={sum} />
          {reportMissing && person ? (
            <RateMissingNotice>
              {person.name} has no hourly rate, so this time is priced at $0.{' '}
              <Link to={`/admin/employees/directory/${person.id}#pay`} className="font-medium underline underline-offset-2">
                Set it
              </Link>
            </RateMissingNotice>
          ) : null}
        </Card>
      ) : null}

      <PayRecordsHeading title={report ? 'Generated payroll records' : 'Recent payroll records'} page={page} size={size} total={report ? rows.length : null} loading={loading} />

      <Card className="gap-0 overflow-hidden py-0">
        <Table data-testid="payroll-table">
          <TableHeader>
            <TableRow>
              <TableHead>
                <DateSortHead sortable={isReport} asc={sortAsc} onToggle={() => update({ sort: sortAsc ? 'desc' : null, page: null })} />
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Paid from</TableHead>
              <TableHead>Paid to</TableHead>
              <TableHead className="text-right">Hrs</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="w-32">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  {loading ? 'Loading records…' : report ? 'No records for this employee and date range.' : 'No payroll records yet.'}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r, i) => {
                const locked = isLocked(r.dateKey)
                const employeePath = `/admin/employees/directory/${r.staffId}`
                const worked = r.type !== 'extra'
                return (
                  <ContextMenuFor
                    key={r.key}
                    entries={menu(
                      { kind: 'label', label: `${r.name} · ${formatDateKey(r.dateKey, 'weekdayMedium')}` },
                      locked && { kind: 'label', label: 'In a locked pay period' },
                      { label: 'Edit shift…', icon: LuPencil, disabled: locked, onSelect: () => setEditing(r) },
                      { label: 'Delete shift', icon: LuTrash2, destructive: true, disabled: locked, onSelect: () => setDeleting(r) },
                      { label: 'Open employee profile', icon: LuUserRound, separatorBefore: true, onSelect: () => navigate(employeePath) },
                      { label: 'Open in new tab', onSelect: () => window.open(employeePath, '_blank', 'noopener') },
                      {
                        label: 'Clock in/out calendar',
                        icon: LuCalendarClock,
                        onSelect: () => navigate(`/admin/employees/calendar?staff=${r.staffId}&mode=clock`),
                      },
                    )}
                  >
                    <TableRow className={cn(shaded[i] && 'bg-muted/80 hover:bg-muted')} data-testid="payroll-row">
                      <TableCell className="whitespace-nowrap">{payDateLabel(r.dateKey, today)}</TableCell>
                      <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                      <TableCell>
                        <PayTypeBadge type={r.type} note={r.note} />
                      </TableCell>
                      <TableCell>
                        <PaidTime ms={worked ? r.segment.startMs : null} clockMs={r.clocked?.inMs} edge="in" timezone={timezone} />
                      </TableCell>
                      <TableCell>
                        <PaidTime ms={worked ? r.segment.endMs : null} clockMs={r.clocked?.outMs} edge="out" timezone={timezone} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.segment.hours.toFixed(2)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.segment.rate)}</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{money(r.segment.pay)}</TableCell>
                      <TableCell>
                        {locked ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <LuLock className="size-3.5" /> Locked
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>In a locked pay period</TooltipContent>
                          </Tooltip>
                        ) : (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="xs" onClick={() => setEditing(r)}>
                              Edit
                            </Button>
                            <Button variant="ghost" size="xs" className="text-destructive hover:text-destructive" onClick={() => setDeleting(r)}>
                              Delete
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  </ContextMenuFor>
                )
              })
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
        {describePay(settings)} Hours are rounded to 0.01 h; pay is computed from the rounded hours. A row is part of a time entry: Edit and Delete change the whole
        entry.
      </p>

      <ShiftDialog
        state={editing?.shift ?? null}
        onClose={() => setEditing(null)}
        staff={staff.map((s) => ({ id: s.id, name: s.name }))}
        isLocked={isLocked}
        defaultStaff={null}
        note={editing ? `This row is part of ${entryLabel(editing)}. Its pay is worked out again when you save.` : undefined}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this time entry?"
        description={
          deleting ? (
            <>
              {entryLabel(deleting)} will be deleted{deleting.parts > 1 ? `, with all ${deleting.parts} of its payroll rows` : ''}. This can’t be undone.
            </>
          ) : null
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!deleting) return
          try {
            await deleteShift(branchId, actor, deleting.shift)
            toast.success('Time entry deleted')
          } catch (e) {
            toast.error('Could not delete', { description: (e as Error).message.includes('permission') ? 'That date is in a locked pay period.' : (e as Error).message })
          }
        }}
      />
      <PayPeriodsDialog open={periodsOpen} onOpenChange={setPeriodsOpen} />
    </div>
  )
}
