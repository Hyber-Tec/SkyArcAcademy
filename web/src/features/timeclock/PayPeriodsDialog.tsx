import { collection, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuLock, LuLockOpen, LuTriangleAlert } from 'react-icons/lu'
import { toast } from 'sonner'
import { COL, DOC } from '@shared/paths'
import { payLineTotals, payLines } from '@shared/pay/lines'
import { payPeriodLabel, periodId } from '@shared/pay/periods'
import { formatMoney } from '@shared/pay/segment'
import { effectiveRates } from '@shared/pay/shifts'
import { formatDateKey, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useStaffList } from '@/features/data/hooks'
import { addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'
import { usePayDays, useShifts } from './api'
import { useCompensationMap, usePayPeriods, usePayrollState } from './hooks'

const money = formatMoney

/**
 * Lock and unlock pay periods. Locking freezes pay up to the period's end:
 * time entries on those dates can't change and the totals are saved.
 * Only the latest locked period can be unlocked.
 */
export function PayPeriodsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { branchId, actor, settings, timezone } = useBranch()
  const today = todayKey(timezone)
  const { recent, current } = usePayPeriods(12)
  const { lockedThrough } = usePayrollState()
  const isLocked = (end: string) => !!lockedThrough && end <= lockedThrough
  // Start on the latest finished period that isn't locked yet, else the latest locked one.
  const suggested = recent.find((p) => p.end < today && !isLocked(p.end)) ?? recent.find((p) => isLocked(p.end)) ?? current
  const [picked, setPicked] = useState<string | null>(null)
  const period = recent.find((p) => periodId(p) === picked) ?? suggested
  const [busy, setBusy] = useState(false)

  const { data: staff } = useStaffList()
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const comps = useCompensationMap(open ? staff.map((s) => s.id) : [])
  const { data: shifts, loading: l1 } = useShifts(period.start, period.end, null, open)
  // The classes and who's in: a coach's paid time starts before their first class and ends with their last.
  const days = usePayDays(period.start, period.end, null, open)
  const loading = l1 || days.loading

  // Each person's pay in the period: the shared pay lines of their time entries (as Payroll lists them).
  const lines = useMemo(() => {
    const ratesFor = (id: string) => effectiveRates(staffById.get(id), comps.get(id))
    return payLines({ shifts, classes: days.classes, availability: days.availability, settings, ratesFor, from: period.start, to: period.end })
  }, [shifts, days.classes, days.availability, settings, staffById, comps, period.start, period.end])
  const people = useMemo(() => {
    const by = new Map<string, { name: string; lines: typeof lines }>()
    for (const l of lines) {
      const e = by.get(l.staffId) ?? { name: staffById.get(l.staffId)?.name ?? l.shift?.staffName ?? 'Employee', lines: [] }
      e.lines.push(l)
      by.set(l.staffId, e)
    }
    return [...by.entries()].map(([id, e]) => ({ id, name: e.name, lines: e.lines, t: payLineTotals(e.lines) }))
  }, [lines, staffById])
  const grand = payLineTotals(lines)
  const openShifts = grand.open

  const locked = isLocked(period.end)
  const ended = period.end < today
  const canLock = !locked && ended && openShifts === 0 && !loading
  const canUnlock = locked && lockedThrough === period.end
  const skipsEarlier = !locked && recent.some((p) => p.end < period.start && !isLocked(p.end))

  async function lock() {
    const id = periodId(period)
    const batch = writeBatch(db)
    batch.set(branchDocRef(branchId, COL.payPeriods, id), {
      ...period,
      type: settings.payroll.payPeriod.type,
      status: 'locked',
      totals: { total: grand.total, worked: grand.worked, extra: grand.extra },
      previousLockedThrough: lockedThrough ?? null,
      lockedAt: serverTimestamp(),
      lockedBy: actor.email,
    })
    for (const p of people) {
      batch.set(doc(collection(db, branchCol(branchId, COL.payPeriods).path, id, 'lines'), p.id), {
        staffId: p.id,
        name: p.name,
        total: p.t.total,
        worked: p.t.worked,
        extra: p.t.extra,
        // Each paid line as it was paid: when, its hours, the rate and the pay (extra time with its note).
        segments: p.lines.flatMap((l) => (l.open ? [] : [{ dateKey: l.dateKey, type: l.type, ...l.segment, ...(l.note ? { note: l.note } : {}) }])),
      })
    }
    batch.set(branchDocRef(branchId, COL.payroll, DOC.payrollState), { lockedThrough: period.end, updatedAt: serverTimestamp(), updatedBy: actor.email })
    addAudit(batch, branchId, actor, {
      action: 'pay.period_lock',
      category: 'pay',
      entityType: 'payPeriod',
      entityId: id,
      summary: `Locked the pay period ${payPeriodLabel(period)} (${money(grand.total.pay)})`,
    })
    await batch.commit()
    toast.success(`Locked ${payPeriodLabel(period)}`)
  }

  async function unlock() {
    const id = periodId(period)
    const snap = await getDoc(branchDocRef(branchId, COL.payPeriods, id))
    const previous = (snap.data()?.previousLockedThrough as string | null | undefined) ?? null
    const batch = writeBatch(db)
    batch.update(branchDocRef(branchId, COL.payPeriods, id), { status: 'unlocked', unlockedAt: serverTimestamp(), unlockedBy: actor.email })
    batch.set(branchDocRef(branchId, COL.payroll, DOC.payrollState), { lockedThrough: previous, updatedAt: serverTimestamp(), updatedBy: actor.email })
    addAudit(batch, branchId, actor, { action: 'pay.period_unlock', category: 'pay', entityType: 'payPeriod', entityId: id, summary: `Unlocked the pay period ${payPeriodLabel(period)}` })
    await batch.commit()
    toast.success(`Unlocked ${payPeriodLabel(period)}`)
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      toast.error('Could not save', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay periods</DialogTitle>
          <DialogDescription>Locking a period freezes its pay: time entries on its dates can’t change. Unlock it to make corrections.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={periodId(period)} onValueChange={setPicked}>
            <SelectTrigger className="w-full" aria-label="Pay period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recent.map((p) => (
                <SelectItem key={periodId(p)} value={periodId(p)}>
                  {payPeriodLabel(p)}
                  {periodId(p) === periodId(current) ? ' (current)' : ''}
                  {isLocked(p.end) ? ' · locked' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
            <div>
              <div className="font-medium tabular-nums">{loading ? 'Adding up…' : `${money(grand.total.pay)} · ${grand.total.hours.toFixed(2)} h`}</div>
              <div className="text-xs text-muted-foreground">
                {people.length} employee{people.length === 1 ? '' : 's'} · {formatDateKey(period.start, 'monthDay')} – {formatDateKey(period.end, 'medium')}
              </div>
            </div>
            {locked ? (
              <Badge variant="secondary" className="gap-1">
                <LuLock /> Locked
              </Badge>
            ) : !ended ? (
              <Badge variant="outline">In progress</Badge>
            ) : (
              <Badge variant="outline">Open</Badge>
            )}
          </div>
          {!locked && openShifts > 0 ? (
            <Alert>
              <LuTriangleAlert />
              <AlertDescription>
                {openShifts} shift{openShifts > 1 ? 's are' : ' is'} still clocked in during this period. Close {openShifts > 1 ? 'them' : 'it'} in Time Entries before locking.
              </AlertDescription>
            </Alert>
          ) : null}
          {!locked && !ended ? <p className="text-sm text-muted-foreground">This period hasn’t ended yet, so it can’t be locked.</p> : null}
          {locked && !canUnlock ? <p className="text-sm text-muted-foreground">Only the latest locked period can be unlocked.</p> : null}
          {skipsEarlier && ended ? <p className="text-sm text-muted-foreground">Earlier open periods are locked along with it.</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canUnlock ? (
            <Button variant="outline" disabled={busy} onClick={() => void run(unlock)}>
              {busy ? <Spinner /> : <LuLockOpen />} Unlock period
            </Button>
          ) : null}
          {!locked ? (
            <Button disabled={busy || !canLock} onClick={() => void run(lock)}>
              {busy ? <Spinner /> : <LuLock />} Lock period
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
