import { useState } from 'react'
import { LuBan, LuLock, LuPlus, LuTrash2, LuTriangleAlert } from 'react-icons/lu'
import { fitRangesToDay, normalizeRanges, rangesContain } from '@shared/availability'
import type { DayHours } from '@shared/settings/defaults'
import { formatDateKey, formatTimeRange } from '@shared/time'
import type { AvailabilityRange } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { TimeSelect } from '@/components/app/TimeSelect'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export interface DayEditorState {
  dateKey: string
  ranges: AvailabilityRange[]
  /** Marked not available. */
  unavailable: boolean
  exists: boolean
  /** Inside the coach's lock (or over): its times can't be removed or shortened. */
  locked: boolean
  /** Locked, but not over: the coach can still add times (docs/DECISIONS.md §23, C2). */
  addOnly: boolean
  leadWarning: boolean
  hours: DayHours
}

export function DayEditorDialog({
  state,
  onClose,
  onSave,
  onAdd,
}: {
  state: DayEditorState | null
  onClose: () => void
  /** Times, or not available (empty times and not `unavailable` clear the day). False: the person backed out (keep the dialog open). */
  onSave: (day: { ranges: AvailabilityRange[]; unavailable: boolean }) => Promise<boolean | void>
  /** A locked day: the times to add to it (fitted to its hours). */
  onAdd: (added: AvailabilityRange[]) => Promise<boolean | void>
}) {
  const { settings } = useBranch()
  const a = settings.availability
  const [ranges, setRanges] = useState<AvailabilityRange[]>([])
  const [notAvailable, setNotAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastKey, setLastKey] = useState<string | null>(null)
  if ((state?.dateKey ?? null) !== lastKey) {
    setLastKey(state?.dateKey ?? null)
    setError(null)
    setNotAvailable(!!state?.unavailable && !state.addOnly)
    // A new day starts from the opening hours. A locked day keeps what's saved: the coach adds new times beside it,
    // starting from the opening hours when it has none; a day that's over only shows what's saved.
    const open = state ? [{ startMin: state.hours.openMin, endMin: state.hours.closeMin }] : []
    setRanges(!state ? [] : state.addOnly ? (state.ranges.length ? [] : open) : state.ranges.length || state.locked ? state.ranges : open)
  }
  if (!state) return null

  const { locked, addOnly } = state
  const editable = !locked || addOnly
  const step = a.stepMinutes

  async function finish(run: () => Promise<boolean | void>) {
    setBusy(true)
    try {
      if ((await run()) !== false) onClose()
    } catch (e) {
      setError(
        (e as Error).message.includes('permission')
          ? addOnly
            ? 'This day is locked: you can add time, not remove it. Ask an admin to remove time.'
            : 'This day is locked. Please contact an admin.'
          : (e as Error).message,
      )
    } finally {
      setBusy(false)
    }
  }

  /** The ranges typed, fitted to the date's opening hours; null (with the reason shown) when they don't fit. */
  function fitted(next: AvailabilityRange[]): AvailabilityRange[] | null {
    const wrong = next.some((r) => r.endMin <= r.startMin)
      ? 'End time must be after start time.'
      : next.some((r) => r.endMin - r.startMin < a.minBlockMinutes)
        ? `Each range must be at least ${a.minBlockMinutes} minutes.`
        : null
    if (wrong) {
      setError(wrong)
      return null
    }
    // Availability follows this date's opening hours (owner rule).
    const fit = fitRangesToDay(next, state!.hours, a)
    if (fit.ok) return fit.ranges
    setError(
      fit.reason === 'closed'
        ? 'The academy is closed on this day.'
        : fit.reason === 'too_many'
          ? `Use at most ${a.maxRangesPerDay} time ranges per day.`
          : `Choose a time within opening hours (${formatTimeRange(state!.hours.openMin, state!.hours.closeMin)}).`,
    )
    return null
  }

  function save() {
    if (notAvailable) return finish(() => onSave({ ranges: [], unavailable: true }))
    const fit = fitted(ranges)
    if (fit) return finish(() => onSave({ ranges: fit, unavailable: false }))
  }

  function add() {
    if (!ranges.length) return setError('Add a time range first.')
    const fit = fitted(ranges)
    if (!fit) return
    if (fit.every((r) => rangesContain(state!.ranges, r.startMin, r.endMin))) return setError('Those times are already in your availability.')
    if (normalizeRanges([...state!.ranges, ...fit]).length > a.maxRangesPerDay) return setError(`Use at most ${a.maxRangesPerDay} time ranges per day.`)
    return finish(() => onAdd(fit))
  }

  const merged = normalizeRanges(ranges)
  const outside = merged.some((r) => r.startMin < state.hours.openMin || r.endMin > state.hours.closeMin)
  // Another range fits after the last one (the saved ones too, on a locked day) before closing.
  const all = addOnly ? [...state.ranges, ...ranges] : ranges
  const canAddRange = editable && all.length < a.maxRangesPerDay && roomAfter(all, state.hours.closeMin, a.minBlockMinutes)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{addOnly ? 'Add availability' : locked ? 'Availability' : state.exists ? 'Edit availability' : 'Add availability'}</DialogTitle>
          <DialogDescription>{formatDateKey(state.dateKey, 'weekdayLong')}</DialogDescription>
        </DialogHeader>
        {locked ? (
          <Alert data-testid="day-locked">
            <LuLock />
            <AlertDescription>
              {addOnly ? 'Locked: you can add time, not remove it. Ask an admin to remove time.' : 'This day is over, so its availability can’t be changed.'}
            </AlertDescription>
          </Alert>
        ) : state.leadWarning ? (
          <Alert>
            <LuTriangleAlert />
            <AlertDescription>Please set availability at least {a.leadTimeDays} days in advance.</AlertDescription>
          </Alert>
        ) : null}
        {/* Not available: an answer only an open day can change to (inside the lock, time can only be added). */}
        {!locked ? (
          <ToggleGroup
            type="single"
            variant="outline"
            value={notAvailable ? 'no' : 'yes'}
            onValueChange={(v) => {
              if (!v) return
              setError(null)
              setNotAvailable(v === 'no')
              // Back to times on a day without any: the day's opening hours, as a new day starts.
              if (v === 'yes' && ranges.length === 0) setRanges([{ startMin: state.hours.openMin, endMin: state.hours.closeMin }])
            }}
            className="w-full"
            aria-label="Available or not"
          >
            <ToggleGroupItem value="yes" className="flex-1 data-[state=on]:bg-foreground data-[state=on]:text-background" data-testid="day-available">
              Available
            </ToggleGroupItem>
            <ToggleGroupItem value="no" className="flex-1 data-[state=on]:bg-foreground data-[state=on]:text-background" data-testid="day-not-available">
              <LuBan /> Not available
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}
        {notAvailable ? (
          <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            The schedule shows this day as not available, and it no longer counts as a day to set.
          </p>
        ) : (
          <div className="space-y-2">
            {addOnly ? (
              <div className="space-y-1.5" data-testid="day-saved-times">
                <div className="text-xs font-medium text-muted-foreground">Your times</div>
                {state.ranges.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {state.ranges.map((r) => (
                      <li
                        key={`${r.startMin}-${r.endMin}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-sm font-medium text-emerald-800 tabular-nums dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        <LuLock className="size-3 opacity-70" aria-hidden /> {formatTimeRange(r.startMin, r.endMin)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{state.unavailable ? 'Marked not available. Times you add make you available.' : 'None yet.'}</p>
                )}
                <div className="pt-2 text-xs font-medium text-muted-foreground">Add</div>
              </div>
            ) : null}
            {ranges.map((r, i) => (
              <div key={i} className="flex items-center gap-2" data-testid={addOnly ? 'day-new-range' : undefined}>
                <TimeSelect
                  value={r.startMin}
                  step={step}
                  min={state.hours.openMin}
                  max={state.hours.closeMin - step}
                  disabled={!editable}
                  onChange={(m) => setRanges(ranges.map((x, idx) => (idx === i ? { ...x, startMin: m } : x)))}
                />
                <span className="text-sm text-muted-foreground">to</span>
                <TimeSelect
                  value={r.endMin}
                  step={step}
                  min={state.hours.openMin + step}
                  max={state.hours.closeMin}
                  disabled={!editable}
                  onChange={(m) => setRanges(ranges.map((x, idx) => (idx === i ? { ...x, endMin: m } : x)))}
                />
                {editable ? (
                  <Button variant="ghost" size="icon-sm" aria-label="Remove range" onClick={() => setRanges(ranges.filter((_, idx) => idx !== i))}>
                    <LuTrash2 />
                  </Button>
                ) : null}
              </div>
            ))}
            {canAddRange ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setError(null)
                  // Inside the lock the new time starts where the day's times end (extending them); elsewhere, after a gap.
                  const last = normalizeRanges(all).pop()
                  const start = last ? Math.min(last.endMin + (addOnly ? 0 : step), state.hours.closeMin - a.minBlockMinutes) : state.hours.openMin
                  setRanges([...ranges, { startMin: start, endMin: Math.min(start + 120, state.hours.closeMin) }])
                }}
              >
                <LuPlus /> Add a time range
              </Button>
            ) : null}
            {ranges.length === 0 && !addOnly ? <p className="text-sm text-muted-foreground">No availability on this day.</p> : null}
            <p className="text-xs text-muted-foreground">
              Open {formatTimeRange(state.hours.openMin, state.hours.closeMin)} this day
              {outside && editable ? '; times outside opening hours are trimmed.' : '.'}
            </p>
          </div>
        )}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter className="gap-2 sm:justify-between">
          {state.exists && !locked ? (
            <Button variant="destructive" disabled={busy} onClick={() => void finish(() => onSave({ ranges: [], unavailable: false }))}>
              <LuTrash2 /> Remove
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              {editable ? 'Cancel' : 'Close'}
            </Button>
            {addOnly ? (
              <Button disabled={busy || !ranges.length} onClick={() => void add()} data-testid="day-add-time">
                {busy ? <Spinner /> : <LuPlus />} Add time
              </Button>
            ) : !locked ? (
              <Button disabled={busy} onClick={() => void save()}>
                {busy ? <Spinner /> : null} Save
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Whether another range still fits after the last one before closing. */
function roomAfter(ranges: AvailabilityRange[], closeMin: number, minBlock: number): boolean {
  const last = normalizeRanges(ranges).pop()
  return !last || last.endMin + minBlock <= closeMin
}
