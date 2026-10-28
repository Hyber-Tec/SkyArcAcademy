import { useMemo, useState } from 'react'
import { LuCalendarPlus, LuCheck } from 'react-icons/lu'
import { toast } from 'sonner'
import { MAKEUP_LOOKBACK_DAYS, makeupsOwed, takesSeat } from '@shared/schedule/classes'
import { type ClassRequestKind, isRequestable, requestHorizon } from '@shared/schedule/requests'
import { type DateKey, addDays, formatDateKey, formatMinutes, formatTimeRange, todayKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { type Family, useFamilySessions } from '@/features/family/data'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { requestClass, requestError } from './api'
import { useClassSeats, useFamilyRequests } from './hooks'

const millis = (t: unknown) => (t && typeof t === 'object' && 'toMillis' in t ? (t as { toMillis: () => number }).toMillis() : 0)

/** What the dialog opens on: a child, and what for (a class to move, a missed class to make up). */
export interface AskPreset {
  studentId?: string
  kind?: ClassRequestKind
  forSessionId?: string | null
}

const missedText = (s: Pick<Session, 'dateKey' | 'startMin' | 'status'>) =>
  `${formatDateKey(s.dateKey, 'weekdayMedium')}, ${formatMinutes(s.startMin)} (${s.status === 'no_show' ? 'missed' : 'canceled'})`

/**
 * Parent and Student → Ask for a class: a makeup for a missed class, a class moved to another time, or an extra class,
 * in a class with seats open in the next days (docs/DECISIONS.md §23). Families see how many seats are open, never who's
 * in a class. The academy approves or declines; the family is told either way.
 */
export function AskForClassDialog({ open, onOpenChange, family, preset }: { open: boolean; onOpenChange: (o: boolean) => void; family: Family; preset?: AskPreset }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92dvh,48rem)] flex-col gap-0 p-0 sm:max-w-lg" data-testid="ask-for-class">
        {/* Each opening starts afresh from its preset. */}
        {open ? <AskForm family={family} preset={preset} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AskForm({ family, preset, onDone }: { family: Family; preset?: AskPreset; onDone: () => void }) {
  const { branchId, timezone, settings } = useBranch()
  const now = useNow(60_000)
  const today = todayKey(timezone, now)
  const horizon = requestHorizon(today, settings)
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS)
  const [studentId, setStudentId] = useState(preset?.studentId ?? family.kids[0]?.id ?? '')
  const ids = useMemo(() => (studentId ? [studentId] : []), [studentId])
  const seats = useFamilySessions(ids, since, horizon)
  const requests = useFamilyRequests(ids)
  const classes = useClassSeats(today, horizon)

  const owed = useMemo(() => makeupsOwed(seats.data, since), [seats.data, since])
  const moving = preset?.kind === 'reschedule' ? (seats.data.find((s) => s.id === preset.forSessionId) ?? null) : null
  const [kind, setKind] = useState<ClassRequestKind>(preset?.kind ?? 'makeup')
  const [forId, setForId] = useState<string | null>(preset?.kind === 'makeup' ? (preset.forSessionId ?? null) : null)
  const [classId, setClassId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  // A makeup needs one owed; with none, an extra class is what's left (a move comes only from a class).
  const kindNow: ClassRequestKind = kind === 'makeup' && !owed.length && !seats.loading ? 'extra' : kind
  const makeupFor = kindNow === 'makeup' ? (owed.find((s) => s.id === forId) ?? owed[0] ?? null) : null
  const pending = useMemo(() => requests.data.filter((r) => r.status === 'pending'), [requests.data])
  const live = useMemo(() => seats.data.filter(takesSeat), [seats.data])

  // Open classes the child can take: not one they're in or at the same time, nor one already asked for.
  const choices = useMemo(
    () =>
      classes.data.filter(
        (c) =>
          isRequestable({ ...c, startMs: millis(c.startAt) }, now, horizon) &&
          !live.some((s) => s.id !== moving?.id && s.dateKey === c.dateKey && s.startMin < c.endMin && s.endMin > c.startMin) &&
          !pending.some((r) => r.classId === c.id),
      ),
    [classes.data, live, pending, horizon, moving?.id, now],
  )
  const byDay = useMemo(() => {
    const m = new Map<DateKey, WithId<(typeof choices)[number]>[]>()
    for (const c of choices) m.set(c.dateKey, [...(m.get(c.dateKey) ?? []), c])
    return [...m.entries()]
  }, [choices])
  const picked = choices.find((c) => c.id === classId) ?? null
  const loading = seats.loading || classes.loading || requests.loading
  const ready = !!picked && !!studentId && (kindNow === 'extra' || (kindNow === 'makeup' ? !!makeupFor : !!moving))
  const who = family.who === 'parent' ? family.firstName(studentId) : 'you'

  async function send() {
    if (!picked || !ready) return
    setSending(true)
    try {
      await requestClass({
        branchId,
        studentId,
        kind: kindNow,
        classId: picked.id,
        forSessionId: kindNow === 'extra' ? null : kindNow === 'makeup' ? (makeupFor?.id ?? null) : (moving?.id ?? null),
        message: message.trim(),
      })
      toast.success('Request sent', { description: 'The academy approves or declines it, and you’ll be told either way.' })
      onDone()
    } catch (e) {
      toast.error('The request wasn’t sent', { description: requestError(e, 'Please try again.') })
      setSending(false)
    }
  }

  return (
    <>
      <DialogHeader className="border-b px-5 pt-5 pb-4">
        <DialogTitle>{moving ? 'Move a class' : 'Ask for a class'}</DialogTitle>
        <DialogDescription>
          {moving
            ? `Choose another time for ${family.who === 'parent' ? `${family.firstName(studentId)}’s` : 'your'} class on ${formatDateKey(moving.dateKey, 'weekdayMedium')}. It stays booked until the academy approves the move.`
            : 'Choose a time with a seat open. The academy approves or declines each request.'}
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {family.who === 'parent' && family.kids.length > 1 && !moving ? (
          <div className="space-y-2">
            <Label>For</Label>
            <div className="flex flex-wrap gap-2">
              {family.kids.map((k) => (
                <Button
                  key={k.id}
                  type="button"
                  size="sm"
                  variant={studentId === k.id ? 'default' : 'outline'}
                  onClick={() => {
                    setStudentId(k.id)
                    setClassId(null)
                    setForId(null)
                  }}
                >
                  {family.firstName(k.id)}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {moving ? null : (
          <div className="space-y-2">
            <Label>What for</Label>
            <RadioGroup value={kindNow} onValueChange={(v) => setKind(v as ClassRequestKind)} className="gap-2">
              <label className={cn('flex items-start gap-3 rounded-lg border p-3 text-sm', !owed.length && 'opacity-60')}>
                <RadioGroupItem value="makeup" disabled={!owed.length} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">A makeup</span>
                  <span className="block text-muted-foreground">
                    {seats.loading ? 'Looking for missed classes…' : owed.length ? `For a class ${who === 'you' ? 'you' : who} missed.` : 'No missed classes to make up.'}
                  </span>
                  {kindNow === 'makeup' && owed.length > 1 ? (
                    <Select value={makeupFor?.id ?? ''} onValueChange={setForId}>
                      <SelectTrigger className="mt-2 w-full" aria-label="The class it makes up">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {owed.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {missedText(s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : kindNow === 'makeup' && makeupFor ? (
                    <span className="mt-1 block text-foreground">{missedText(makeupFor)}</span>
                  ) : null}
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                <RadioGroupItem value="extra" className="mt-0.5" />
                <span>
                  <span className="font-medium">An extra class</span>
                  <span className="block text-muted-foreground">Extra practice in an open seat.</span>
                </span>
              </label>
            </RadioGroup>
          </div>
        )}

        <div className="space-y-2">
          <Label>When</Label>
          {loading ? (
            <Skeleton className="h-40 w-full rounded-lg" />
          ) : byDay.length ? (
            <div className="space-y-3" role="radiogroup" aria-label="When">
              {byDay.map(([day, list]) => (
                <div key={day}>
                  <div className="mb-1.5 text-xs font-semibold text-muted-foreground">{formatDateKey(day, 'weekdayMedium')}</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {list.map((c) => {
                      const on = c.id === classId
                      const open = c.seats - c.taken
                      return (
                        <button
                          key={c.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => setClassId(c.id)}
                          className={cn(
                            'flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                            on ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted/60',
                          )}
                        >
                          <span className="tabular-nums">{formatTimeRange(c.startMin, c.endMin)}</span>
                          <span className={cn('flex items-center gap-1 text-xs whitespace-nowrap', on ? 'text-background/80' : 'text-muted-foreground')}>
                            {on ? <LuCheck className="size-3.5" /> : null}
                            {open} {open === 1 ? 'seat' : 'seats'} open
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-lg bg-muted/50 px-3 py-6 text-center text-sm text-muted-foreground">
              No open seats until {formatDateKey(horizon, 'monthDay')}. Seats open up when students cancel, so check again soon.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="ask-message">Message (optional)</Label>
          <Textarea id="ask-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={2} placeholder="Anything the academy should know" />
        </div>
      </div>
      <DialogFooter className="border-t px-5 py-4">
        <Button variant="outline" onClick={onDone} disabled={sending}>
          Cancel
        </Button>
        <Button onClick={() => void send()} disabled={!ready || sending} data-testid="ask-send">
          <LuCalendarPlus /> {sending ? 'Sending…' : 'Send request'}
        </Button>
      </DialogFooter>
    </>
  )
}
