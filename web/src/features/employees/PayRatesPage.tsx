import { useEffect, useMemo, useState } from 'react'
import { LuSearch } from 'react-icons/lu'
import { toast } from 'sonner'
import { hourlyRate } from '@shared/pay/rates'
import { initials, STAFF_STATUS_LABELS, STAFF_STATUSES } from '@shared/people'
import { ROLE_LABELS, isAdminRole } from '@shared/roles'
import { todayKey } from '@shared/time'
import type { Compensation, Staff, StaffStatus, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { StaffStatusBadge } from '@/components/app/StatusBadge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStaffList } from '@/features/data/hooks'
import { useDoc } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { compensationRef, saveCompensation } from './api'
import { PayGapNotice } from './PayGapNotice'
import { usePayGaps } from './payGaps'

/** Each employee's one hourly rate (docs/DECISIONS.md §23, K1), edited in place. */
export function PayRatesPage() {
  const { data: staff } = useStaffList()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<'coach' | 'admin' | 'all'>('coach')
  const [status, setStatus] = useState<StaffStatus | 'all'>('active')
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return staff.filter(
      (s) =>
        (role === 'all' || (role === 'coach' ? s.role === 'coach' : isAdminRole(s.role))) &&
        (status === 'all' || s.status === status) &&
        (!q || s.nameLower.includes(q)),
    )
  }, [staff, search, role, status])
  const { gaps } = usePayGaps()
  const missing = useMemo(() => new Set(gaps.map((g) => g.staff.id)), [gaps])

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Pay Rates"
        description="Each employee’s hourly rate, paid for the time they’re clocked in at the kiosk. Changes save when you leave a field and apply from today."
      />
      <PayGapNotice gaps={gaps} link={false} className="mb-4" />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <InputGroup className="sm:w-72">
          <InputGroupAddon>
            <LuSearch />
          </InputGroupAddon>
          <InputGroupInput placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </InputGroup>
        <Select value={role} onValueChange={(v) => setRole(v as 'coach' | 'admin' | 'all')}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="coach">Coaches</SelectItem>
            <SelectItem value="admin">Owners & admins</SelectItem>
            <SelectItem value="all">All roles</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as StaffStatus | 'all')}>
          <SelectTrigger className="sm:w-40">
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
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead className="w-44">Hourly rate</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((s) => (
              <RateRow key={s.id} staff={s} missing={missing.has(s.id)} />
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function RateRow({ staff, missing }: { staff: WithId<Staff>; missing: boolean }) {
  const { branchId, actor, timezone } = useBranch()
  const ref = useMemo(() => compensationRef(branchId, staff.id), [branchId, staff.id])
  const { data: comp } = useDoc<Compensation>(ref)
  const [rate, setRate] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const r = hourlyRate(comp?.rates)
    setRate(comp && r > 0 ? String(r) : '')
  }, [comp])

  async function commit() {
    const n = rate === '' ? 0 : Number(rate)
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Enter a valid amount.')
      return
    }
    if (!comp && n === 0) return
    setBusy(true)
    try {
      await saveCompensation(branchId, actor, staff, comp, Math.round(n * 100) / 100, todayKey(timezone))
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback style={{ backgroundColor: `${staff.color}22`, color: staff.color }}>{initials(staff.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <div className="truncate font-medium">{staff.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[staff.role] ?? ''}</span>
              <StaffStatusBadge status={staff.status} className="h-5" />
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <InputGroup className={cn('h-8', missing && 'border-amber-400 bg-amber-50/60 dark:border-amber-700 dark:bg-amber-950/30')}>
          <InputGroupAddon>
            <InputGroupText>$</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            aria-label={`Hourly rate for ${staff.name}`}
            inputMode="decimal"
            placeholder={missing ? 'Not set' : undefined}
            value={rate}
            disabled={busy}
            onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={() => void commit()}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupText>/hr</InputGroupText>
          </InputGroupAddon>
        </InputGroup>
      </TableCell>
      <TableCell>{busy ? <Spinner className="size-4" /> : null}</TableCell>
    </TableRow>
  )
}
