import { useEffect, useState } from 'react'
import { type DateKey, formatDateKey } from '@shared/time'
import type { Availability, Staff, WithId } from '@shared/types'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import type { WhosInRow } from './classApi'
import { CoachBadge } from './seatParts'

/**
 * Who's in on a day, and when: each person on or off, with their hours (within opening hours). Every coach in at a
 * class's time teaches it; coaches can also set these hours themselves (Availability).
 */
export function WhosInDialog({
  dateKey,
  open,
  onOpenChange,
  staff,
  saved,
  hours,
  colorOf,
  onSave,
}: {
  dateKey: DateKey | null
  open: boolean
  onOpenChange: (open: boolean) => void
  staff: readonly WithId<Staff>[]
  /** That day's saved hours, by person. */
  saved: ReadonlyMap<string, Availability>
  hours: { openMin: number; closeMin: number }
  colorOf: (staffId: string) => string
  onSave: (rows: WhosInRow[]) => void
}) {
  const [draft, setDraft] = useState<Record<string, { on: boolean; start: number; end: number }>>({})
  // Filled when the dialog opens (not again while it's open, so nothing changed is lost).
  useEffect(() => {
    if (!open || !dateKey) return
    setDraft(
      Object.fromEntries(
        staff.map((s) => {
          const a = saved.get(s.id)
          const r = a && !a.unavailable ? a.ranges : []
          return [s.id, { on: r.length > 0, start: r[0]?.startMin ?? hours.openMin, end: r[r.length - 1]?.endMin ?? hours.closeMin }]
        }),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dateKey])
  if (!dateKey) return null
  const save = () =>
    onSave(
      staff.map((s) => {
        const x = draft[s.id]
        const a = saved.get(s.id)
        // Someone with several times that day keeps them unless their hours were changed here.
        const kept = a && !a.unavailable && a.ranges.length > 1 && x?.on && x.start === a.ranges[0].startMin && x.end === a.ranges[a.ranges.length - 1].endMin
        return { staffId: s.id, staffName: s.name, staffRole: s.role, ranges: !x?.on ? null : kept ? a.ranges : [{ startMin: x.start, endMin: Math.max(x.end, x.start + 15) }] }
      }),
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Who's in · {formatDateKey(dateKey, 'weekdayMedium')}</DialogTitle>
          <DialogDescription>Every coach in at a class's time teaches it. Coaches can also set their own hours (Availability).</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] divide-y overflow-y-auto rounded-lg border">
          {staff.map((s) => {
            const x = draft[s.id]
            if (!x) return null
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <CoachBadge name={s.name} color={colorOf(s.id)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.role === 'coach' ? 'Coach' : s.role === 'admin' ? 'Admin' : 'Owner'}</div>
                </div>
                {x.on ? (
                  <span className="flex items-center gap-1.5">
                    <TimeSelect value={x.start} step={15} min={hours.openMin} max={x.end - 15} onChange={(m) => setDraft({ ...draft, [s.id]: { ...x, start: m } })} className="h-8 w-28" />
                    <span className="text-xs text-muted-foreground">to</span>
                    <TimeSelect value={x.end} step={15} min={x.start + 15} max={hours.closeMin} onChange={(m) => setDraft({ ...draft, [s.id]: { ...x, end: m } })} className="h-8 w-28" />
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Not in</span>
                )}
                <Switch checked={x.on} onCheckedChange={(on) => setDraft({ ...draft, [s.id]: { ...x, on } })} aria-label={`${s.name} is in`} />
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
