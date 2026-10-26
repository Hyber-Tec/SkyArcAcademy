import { getDocs, query, where } from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { LuArrowDown, LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { toast } from 'sonner'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { type DateKey, type Weekday, WEEKDAY_SHORT, addDays, formatDateKey, orderedWeekdays, startOfWeek, weekDays, weekdayOf } from '@shared/time'
import type { AcademyClass, DayConfig, Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { useStudentList } from '@/features/data/hooks'
import { branchCol } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import type { ScheduleCtx } from '../api'
import { duplicateClasses } from '../classApi'

function WeekPicker({ value, onChange }: { value: DateKey; onChange: (d: DateKey) => void }) {
  const { settings } = useBranch()
  const days = weekDays(value, settings.general.weekStartsOn)
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => onChange(addDays(value, -7))}>
        <LuChevronLeft />
      </Button>
      <div className="flex-1 text-center text-sm font-medium">
        {formatDateKey(days[0], 'monthDay')} – {formatDateKey(days[6], 'medium')}
      </div>
      <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => onChange(addDays(value, 7))}>
        <LuChevronRight />
      </Button>
    </div>
  )
}

export function DuplicateDialog({ open, onOpenChange, ctx, anchor }: { open: boolean; onOpenChange: (o: boolean) => void; ctx: ScheduleCtx; anchor: DateKey }) {
  const { settings } = useBranch()
  const weekStartsOn = settings.general.weekStartsOn
  const { data: students } = useStudentList()
  const [from, setFrom] = useState(startOfWeek(anchor, weekStartsOn))
  const [to, setTo] = useState(addDays(startOfWeek(anchor, weekStartsOn), 7))
  const [selected, setSelected] = useState<Weekday[]>([])
  const [busy, setBusy] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()

  useEffect(() => {
    if (!open) return
    setFrom(startOfWeek(anchor, weekStartsOn))
    setTo(addDays(startOfWeek(anchor, weekStartsOn), 7))
    setSelected([])
  }, [open, anchor, weekStartsOn])

  const same = startOfWeek(from, weekStartsOn) === startOfWeek(to, weekStartsOn)
  const weekdays = orderedWeekdays(weekStartsOn)

  async function run() {
    const targetDays = weekDays(to, weekStartsOn)
    const label = `${formatDateKey(startOfWeek(from, weekStartsOn), 'monthDay')} → ${formatDateKey(targetDays[0], 'monthDay')}`
    const ok = await confirm({
      title: `Duplicate ${selected.length} day${selected.length > 1 ? 's' : ''}?`,
      description: `${label}. Each class comes with its regular students (make-ups, practice and trials stay behind).${settings.schedule.duplicate.overwriteTargetDays ? ' Classes already on those days in the target week move to the Trash.' : ''}`,
      confirmLabel: 'Duplicate',
    })
    if (!ok) return
    setBusy(true)
    try {
      const srcDays = weekDays(from, weekStartsOn)
      const week = (days: DateKey[]) =>
        Promise.all([
          getDocs(query(branchCol(ctx.branchId, COL.classes), where('dateKey', '>=', days[0]), where('dateKey', '<=', days[6]))),
          getDocs(query(branchCol(ctx.branchId, COL.sessions), where('dateKey', '>=', days[0]), where('dateKey', '<=', days[6]))),
        ]).then(([cSnap, sSnap]) => {
          const seats = sSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Session) }) as WithId<Session>)
          return cSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as AcademyClass) }) as WithId<AcademyClass>)
            .filter((c) => !c.isDeleted)
            .map((c) => ({ c, seats: seats.filter((x) => x.classId === c.id) }))
        })
      const [sources, existingTarget, cfgSnap] = await Promise.all([
        week(srcDays),
        week(targetDays),
        getDocs(query(branchCol(ctx.branchId, COL.dayConfigs), where('dateKey', '>=', targetDays[0]), where('dateKey', '<=', targetDays[6]))),
      ])
      const configs = new Map(cfgSnap.docs.map((d) => [d.id, d.data() as DayConfig]))
      const grades = new Map(students.map((s) => [s.id, s.grade]))
      const { classes: n, students: kids } = await duplicateClasses(ctx, {
        sources: sources.filter((x) => selected.includes(weekdayOf(x.c.dateKey))),
        targetDays: targetDays.filter((d) => selected.includes(weekdayOf(d))).map((d) => ({ dateKey: d, open: dayHours(d, settings, configs).isOpen })),
        existingTarget,
        liveGrade: (id) => grades.get(id),
        label,
      })
      if (n) toast.success(`Duplicated ${n} ${n === 1 ? 'class' : 'classes'} with ${kids} ${kids === 1 ? 'student' : 'students'}.`)
      else toast.info('Nothing to copy on those days (closed and past days are skipped).')
      if (n) onOpenChange(false)
    } catch (e) {
      toast.error('Duplicate failed', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Duplicate schedule</DialogTitle>
          <DialogDescription>Copy classes and their regular students into another week, as {settings.schedule.pasteStatus === 'pending' ? 'Pending' : 'Confirmed'}.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase">From</div>
          <WeekPicker value={from} onChange={setFrom} />
          <div className="flex justify-center text-muted-foreground">
            <LuArrowDown />
          </div>
          <div className="text-xs font-semibold text-muted-foreground uppercase">To</div>
          <WeekPicker value={to} onChange={setTo} />
          {same ? <p className="text-sm text-destructive">Source and destination weeks are the same. Pick a different destination.</p> : null}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Days to duplicate</span>
            <span className="space-x-3 text-xs">
              <button type="button" className="text-blue-600" onClick={() => setSelected(weekdays)}>
                Select all
              </button>
              <button type="button" className="text-blue-600" onClick={() => setSelected([])}>
                Clear
              </button>
            </span>
          </div>
          <div className="flex gap-1.5">
            {weekdays.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setSelected((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))}
                className={cn('flex-1 rounded-md border py-1.5 text-xs font-semibold', selected.includes(d) ? 'border-foreground bg-foreground text-background' : 'bg-background')}
              >
                {WEEKDAY_SHORT[d]}
              </button>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy || selected.length === 0 || same} onClick={() => void run()}>
            {busy ? <Spinner /> : null} Duplicate selected days
          </Button>
        </DialogFooter>
      </DialogContent>
      {confirmDialog}
    </Dialog>
  )
}
