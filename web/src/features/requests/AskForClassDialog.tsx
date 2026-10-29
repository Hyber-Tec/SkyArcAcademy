import { useMemo, useState } from 'react'
import { LuCalendarPlus, LuSend } from 'react-icons/lu'
import { toast } from 'sonner'
import { makeupsOwed } from '@shared/schedule/classes'
import { type ClassRequest, type ClassRequestKind, classWhen } from '@shared/schedule/requests'
import { type DateKey, formatDateKey, formatMinutes } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { Family } from '@/features/family/data'
import { cn } from '@/lib/utils'
import { answerOffer, requestClass, requestError } from './api'
import { ClassPicker } from './ClassPicker'
import { useClassChoices } from './hooks'

/** What the dialog opens on: a child, and what for (a class to move, a missed class to make up). */
export interface AskPreset {
  studentId?: string
  kind?: ClassRequestKind
  forSessionId?: string | null
  /** The day of the class to move, so it's found however far ahead it is (choices stay within the horizon). */
  forDateKey?: DateKey
}

const missedText = (s: Pick<Session, 'dateKey' | 'startMin' | 'status'>) =>
  `${formatDateKey(s.dateKey, 'weekdayMedium')}, ${formatMinutes(s.startMin)} (${s.status === 'no_show' ? 'missed' : 'canceled'})`

/**
 * Parent and Student → Ask for a class: a makeup for a missed class, a class moved to another time, or an extra class,
 * in a class with seats open in the next days (docs/DECISIONS.md §23). Families see how many seats are open, never who's
 * in a class. The academy approves, declines or suggests another time; the family is told each time.
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
  const { branchId } = useBranch()
  const [studentId, setStudentId] = useState(preset?.studentId ?? family.kids[0]?.id ?? '')
  const movingId = preset?.kind === 'reschedule' ? (preset.forSessionId ?? null) : null
  const choice = useClassChoices({ studentId, forSessionId: movingId, seatsUntil: preset?.forDateKey })
  const { seats, pending, since, horizon } = choice

  // Missed classes still to make up, less those an open request is for (the server would refuse a second one).
  const missed = useMemo(() => makeupsOwed(seats.data, since), [seats.data, since])
  const owed = useMemo(() => missed.filter((s) => !pending.some((r) => r.forSessionId === s.id)), [missed, pending])
  const moving = movingId ? (seats.data.find((s) => s.id === movingId) ?? null) : null
  const [kind, setKind] = useState<ClassRequestKind>(preset?.kind ?? 'makeup')
  const [forId, setForId] = useState<string | null>(preset?.kind === 'makeup' ? (preset.forSessionId ?? null) : null)
  const [classId, setClassId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  // A makeup needs one owed; with none, an extra class is what's left (a move comes only from a class).
  const kindNow: ClassRequestKind = kind === 'makeup' && !owed.length && !seats.loading ? 'extra' : kind
  const makeupFor = kindNow === 'makeup' ? (owed.find((s) => s.id === forId) ?? owed[0] ?? null) : null
  const picked = choice.choices.find((c) => c.id === classId) ?? null
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
      toast.success('Request sent', { description: 'The academy approves it, declines it or suggests another time, and you’ll be told.' })
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
            : 'Choose a time with a seat open. The academy approves each request, or suggests another time.'}
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
                    {seats.loading
                      ? 'Looking for missed classes…'
                      : owed.length
                        ? `For a class ${who === 'you' ? 'you' : who} missed.`
                        : missed.length
                          ? 'Each missed class has a request open.'
                          : 'No missed classes to make up.'}
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
          <ClassPicker
            choices={choice.choices}
            value={classId}
            onChange={setClassId}
            loading={choice.loading}
            empty={`No open seats until ${formatDateKey(horizon, 'monthDay')}. Seats open up when students cancel, so check again soon.`}
          />
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

/**
 * The family's answer to a class the academy suggested, when it doesn't suit them: another time, picked as when asking
 * (seats open, none at the same time as their classes), with a message. The request goes back to the academy.
 */
export function AskAnotherDialog({ request, family, onClose }: { request: WithId<ClassRequest> | null; family: Family; onClose: () => void }) {
  return (
    <Dialog open={request !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[min(92dvh,48rem)] flex-col gap-0 p-0 sm:max-w-lg" data-testid="ask-another">
        {request ? <AnotherForm r={request} family={family} onDone={onClose} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function AnotherForm({ r, family, onDone }: { r: WithId<ClassRequest>; family: Family; onDone: () => void }) {
  const { branchId } = useBranch()
  const choice = useClassChoices({
    studentId: r.studentId,
    forSessionId: r.kind === 'reschedule' ? r.forSessionId : null,
    requestId: r.id,
    // The class suggested is accepted, not asked for.
    exclude: [r.offer?.classId],
    seatsUntil: r.forDateKey ?? undefined,
  })
  const [classId, setClassId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const picked = choice.choices.find((c) => c.id === classId) ?? null
  const whose = family.who === 'parent' ? `${family.firstName(r.studentId)}’s` : 'your'
  const what = r.kind === 'makeup' ? 'makeup' : r.kind === 'reschedule' ? 'moved class' : 'extra class'

  async function send() {
    if (!picked) return
    setSending(true)
    try {
      await answerOffer(branchId, r.id, 'another', { classId: picked.id, message: message.trim() })
      toast.success('Asked for another time', { description: `${classWhen(picked)}. The academy answers, and you’ll be told.` })
      onDone()
    } catch (e) {
      toast.error('That wasn’t sent', { description: requestError(e, 'Please try again.') })
      setSending(false)
    }
  }

  return (
    <>
      <DialogHeader className="border-b px-5 pt-5 pb-4">
        <DialogTitle>Ask for another time</DialogTitle>
        <DialogDescription>
          {r.offer ? `Instead of ${classWhen(r.offer)}, choose` : 'Choose'} a time with a seat open for {whose} {what}. The academy answers, and you’ll be told.
        </DialogDescription>
      </DialogHeader>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div className="space-y-2">
          <Label>When</Label>
          <ClassPicker
            choices={choice.choices}
            value={classId}
            onChange={setClassId}
            loading={choice.loading}
            marked={r.offer ? { dateKey: r.offer.dateKey, label: 'Suggested' } : null}
            empty={`No other open seats until ${formatDateKey(choice.horizon, 'monthDay')}. Accept the time suggested, or check again soon.`}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="another-message">Message (optional)</Label>
          <Textarea id="another-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={500} rows={2} placeholder="Weekday evenings after 5 work best" />
        </div>
      </div>
      <DialogFooter className="border-t px-5 py-4">
        <Button variant="outline" onClick={onDone} disabled={sending}>
          Cancel
        </Button>
        <Button onClick={() => void send()} disabled={!picked || sending} data-testid="ask-another-send">
          <LuSend /> {sending ? 'Sending…' : 'Ask for this time'}
        </Button>
      </DialogFooter>
    </>
  )
}
