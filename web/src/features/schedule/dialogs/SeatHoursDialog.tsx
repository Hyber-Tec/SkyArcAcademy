import { useState } from 'react'
import { LuTriangleAlert } from 'react-icons/lu'
import { formatDateKey, formatMinutes, formatTimeRange } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useBoard } from '../board'
import { classRange } from '../seatParts'
import { heldIn, hoursProblem, noCoachDuring, problemText } from '../seatHours'
import type { ClassView } from '../useClassData'

/**
 * A student's hours in their class (docs/DECISIONS.md §38), the way to change them on any screen (the timeline's cards
 * can also be dragged by their edges): from and until, in 15-minute steps, past the class into the one next to it when
 * it has a seat free then, or part of it. Says which class holds a seat for them, and when no coach is in.
 */
export function SeatHoursDialog({ seat, v, onClose }: { seat: WithId<Session> | null; v: ClassView | null; onClose: () => void }) {
  return (
    <Dialog open={!!seat && !!v} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">{seat && v ? <Body key={seat.id} seat={seat} v={v} onClose={onClose} /> : null}</DialogContent>
    </Dialog>
  )
}

function Body({ seat, v, onClose }: { seat: WithId<Session>; v: ClassView; onClose: () => void }) {
  const b = useBoard()
  const [startMin, setStart] = useState(seat.startMin)
  const [endMin, setEnd] = useState(seat.endMin)
  const next = { startMin, endMin }
  const { c } = v
  const hours = b.hoursOf(c.dateKey)
  const lo = Math.min(hours.isOpen ? hours.openMin : c.startMin, c.startMin)
  const hi = Math.max(hours.isOpen ? hours.closeMin : c.endMin, c.endMin)
  const problem = hoursProblem(b, seat, next)
  const held = problem ? [] : heldIn(b, seat, next, v)
  const gaps = problem ? [] : noCoachDuring(b, c.dateKey, next, v)
  const changed = startMin !== seat.startMin || endMin !== seat.endMin
  const whole = startMin === c.startMin && endMin === c.endMin
  // Families hear of a new time for a class still ahead (functions/src/sessionNotify.ts).
  const ahead = c.dateKey > b.today || (c.dateKey === b.today && Math.max(seat.startMin, startMin) > b.nowMin)
  return (
    <>
      <DialogHeader>
        <DialogTitle>{seat.studentName}’s hours</DialogTitle>
        <DialogDescription>
          {formatDateKey(c.dateKey, 'weekdayLong').replace(/, \d{4}$/, '')} · the {classRange(c.startMin, c.endMin)} class
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="seat-from">From</Label>
          <TimeSelect id="seat-from" value={startMin} step={15} min={lo} max={endMin - 15} onChange={setStart} className="w-32" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="seat-until">Until</Label>
          <TimeSelect id="seat-until" value={endMin} step={15} min={startMin + 15} max={hi} onChange={setEnd} className="w-32" />
        </div>
        {!whole ? (
          <Button
            variant="ghost"
            size="sm"
            className="mb-0.5"
            onClick={() => {
              setStart(c.startMin)
              setEnd(c.endMin)
            }}
          >
            The class’s hours
          </Button>
        ) : null}
      </div>
      <div className="space-y-2 text-sm" aria-live="polite">
        {problem ? (
          <p className="text-destructive">{problemText(problem)}</p>
        ) : held.length ? (
          held.map((x) => (
            <p key={x.c.id} className="text-muted-foreground">
              Holds a seat in the {classRange(x.c.startMin, x.c.endMin)} class {x.c.startMin >= c.startMin ? `until ${formatMinutes(endMin)}` : `from ${formatMinutes(startMin)}`}.
            </p>
          ))
        ) : startMin > c.startMin || endMin < c.endMin ? (
          <p className="text-muted-foreground">Part of the class only.</p>
        ) : null}
        {gaps.length ? (
          <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
            <LuTriangleAlert className="mt-0.5 size-4 shrink-0" />
            No coach is in {gaps.map((g) => formatTimeRange(g.startMin, g.endMin)).join(' or ')}.
          </p>
        ) : null}
        {changed && !problem && ahead ? <p className="text-xs text-muted-foreground">The family is told the new time.</p> : null}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          disabled={!changed || !!problem}
          onClick={() => {
            b.setSeatTime(seat, next)
            onClose()
          }}
        >
          Save
        </Button>
      </DialogFooter>
    </>
  )
}
