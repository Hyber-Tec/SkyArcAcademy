import { useState } from 'react'
import { MAX_SEATS_PER_CLASS } from '@shared/settings/businessRules'
import { type DateKey, formatDateKey } from '@shared/time'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { ClassDraft } from './classApi'

/**
 * A new class on a day: its time (after the day's last class by default), its seats (the academy's number) and a note
 * for the coaches. The coaches in at that time teach it.
 */
export function AddClassDialog({
  dateKey,
  open,
  onOpenChange,
  hours,
  after,
  length,
  seats,
  onCreate,
}: {
  dateKey: DateKey | null
  open: boolean
  onOpenChange: (open: boolean) => void
  hours: { openMin: number; closeMin: number }
  /** Where the day's classes end, so the new one starts there. */
  after: number | null
  length: number
  seats: number
  onCreate: (d: ClassDraft) => void
}) {
  const startDefault = Math.min(Math.max(hours.openMin, after ?? hours.openMin + 30), hours.closeMin - 30)
  const [start, setStart] = useState(startDefault)
  const [end, setEnd] = useState(Math.min(hours.closeMin, startDefault + length))
  const [count, setCount] = useState(seats)
  const [note, setNote] = useState('')
  if (!dateKey) return null
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Add a class</DialogTitle>
          <DialogDescription>{formatDateKey(dateKey, 'weekdayLong')}. The coaches in at that time teach it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-class-start">Starts</Label>
              <TimeSelect
                id="new-class-start"
                value={start}
                step={15}
                min={hours.openMin}
                max={hours.closeMin - 15}
                onChange={(m) => {
                  setStart(m)
                  setEnd(Math.min(hours.closeMin, m + (end - start)))
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-class-end">Ends</Label>
              <TimeSelect id="new-class-end" value={end} step={15} min={start + 15} max={hours.closeMin} onChange={setEnd} />
            </div>
            <div className="w-20 space-y-1.5">
              <Label htmlFor="new-class-seats">Seats</Label>
              <Input id="new-class-seats" type="number" min={1} max={MAX_SEATS_PER_CLASS} value={count} onChange={(e) => setCount(Math.max(1, Math.min(MAX_SEATS_PER_CLASS, Number(e.target.value) || 1)))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-class-note">Note for the coaches (optional)</Label>
            <Textarea id="new-class-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What to work on, equipment, anything to pass on." className="min-h-16" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={end <= start} onClick={() => onCreate({ dateKey, startMin: start, endMin: end, seats: count, note })}>
            Add the class
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
