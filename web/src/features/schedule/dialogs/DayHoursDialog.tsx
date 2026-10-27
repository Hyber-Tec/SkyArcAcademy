import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { dayHours } from '@shared/availability'
import { type DateKey, formatDateKey, formatTimeRange } from '@shared/time'
import type { DayConfig } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { setDateHours } from '@/features/settings/dateHoursApi'
import { type ScheduleCtx, clearDayConfig, saveDayConfig } from '../api'

/**
 * One date's opening hours: open or closed, and when, or back to the usual hours (Settings → Schedule). Closing the day
 * moves its classes to the Trash with their students; shorter hours keep the classes, marked.
 */
export function DayHoursDialog({
  dateKey,
  onClose,
  ctx,
  dayConfigs,
  classesOutside,
  seatsOn,
}: {
  dateKey: DateKey | null
  onClose: () => void
  ctx: ScheduleCtx
  dayConfigs: Map<DateKey, DayConfig>
  classesOutside: (d: DateKey, hours: { isOpen: boolean; openMin: number; closeMin: number }) => number
  /** The day's students in classes (their seats), which closing moves to Trash with the classes. */
  seatsOn: (d: DateKey) => string[]
}) {
  const { settings } = useBranch()
  const range = settings.schedule.editorRange
  const [isOpen, setIsOpen] = useState(true)
  const [openMin, setOpenMin] = useState(960)
  const [closeMin, setCloseMin] = useState(1260)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!dateKey) return
    const h = dayHours(dateKey, settings, dayConfigs)
    setIsOpen(h.isOpen)
    setOpenMin(h.isOpen ? h.openMin : 960)
    setCloseMin(h.isOpen ? h.closeMin : 1260)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey])
  if (!dateKey) return null
  const usual = dayHours(dateKey, settings, null)
  const custom = dayConfigs.has(dateKey)
  const outside = isOpen ? classesOutside(dateKey, { isOpen, openMin, closeMin }) : 0
  const closingClasses = !isOpen ? classesOutside(dateKey, { isOpen: false, openMin, closeMin }) : 0
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      toast.success(ok)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open={!!dateKey} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Opening hours · {formatDateKey(dateKey, 'weekdayMedium')}</DialogTitle>
          <DialogDescription>Usually {usual.isOpen ? formatTimeRange(usual.openMin, usual.closeMin) : 'closed'} that day (Settings → Schedule).</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Switch id="day-open" checked={isOpen} onCheckedChange={setIsOpen} />
            <Label htmlFor="day-open">{isOpen ? 'Open' : 'Closed'}</Label>
          </div>
          {isOpen ? (
            <div className="flex items-center gap-2">
              <TimeSelect value={openMin} step={15} min={range.startMin} max={closeMin - 15} onChange={setOpenMin} />
              <span className="text-sm text-muted-foreground">to</span>
              <TimeSelect value={closeMin} step={15} min={openMin + 15} max={range.endMin} onChange={setCloseMin} />
            </div>
          ) : null}
          {closingClasses ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Closing moves the day's {closingClasses === 1 ? 'class' : `${closingClasses} classes`} to the Trash with their students. They can come back from the Trash.
            </p>
          ) : null}
          {outside ? (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              {outside === 1 ? 'One class falls' : `${outside} classes fall`} outside these hours. They stay on the schedule, marked, until you move or remove them.
            </p>
          ) : null}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {custom ? (
            <Button variant="ghost" disabled={busy} onClick={() => void run(() => clearDayConfig(ctx, dateKey), 'Back to the usual hours')}>
              Use the usual hours
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={busy || (isOpen && closeMin <= openMin)}
              onClick={() =>
                void run(
                  () =>
                    closingClasses
                      ? setDateHours({
                          branchId: ctx.branchId,
                          actor: ctx.actor,
                          dates: [dateKey],
                          value: { isOpen: false },
                          closedTimes: { openMin: usual.openMin, closeMin: usual.closeMin },
                          summaryRange: formatDateKey(dateKey, 'weekdayMedium'),
                          trashSessionIds: seatsOn(dateKey),
                        })
                      : saveDayConfig(ctx, dateKey, { isOpen, openMin, closeMin }),
                  closingClasses ? 'Closed; its classes moved to Trash' : 'Opening hours saved',
                )
              }
            >
              {closingClasses ? 'Close and move the classes to Trash' : 'Save'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
