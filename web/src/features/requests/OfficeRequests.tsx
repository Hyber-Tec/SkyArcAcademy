import { useState } from 'react'
import { LuArrowLeft, LuArrowRightLeft, LuCalendarCheck, LuCalendarPlus, LuCheck, LuChevronRight, LuInbox, LuRotateCcw, LuSend, LuX } from 'react-icons/lu'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import {
  type ClassRequest,
  type ClassRequestKind,
  type ClassRequestStatus,
  type ClassSeats,
  REQUEST_KIND_LABELS,
  REQUEST_OFFICE_STATUS_LABELS,
  classWhen,
  isOpenRequest,
  offerText,
  requestHistory,
  requestStepText,
  seatLabelFor,
} from '@shared/schedule/requests'
import { formatDateKey, formatMinutes, formatTimeRange } from '@shared/time'
import type { TimestampLike, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { when } from '@/features/website/messageText'
import { cn } from '@/lib/utils'
import { type OfficeDecision, decideRequest, requestError } from './api'
import { ClassPicker } from './ClassPicker'
import { useClassChoices, useClassSeat, useOpenRequests, useRecentRequests, useRequest } from './hooks'

/**
 * The office's side of families' requests (docs/DECISIONS.md §23): the requests waiting on the office (on Home, on the
 * schedule's "Requests" with their count, and in the sidebar's Home badge), those waiting on a family's answer to a
 * class the office suggested, and the last two weeks' answers. A request opens to approve it (the seat is booked, a
 * moved class canceled), decline it with a note, or suggest another class with seats open, which the family accepts or
 * answers with another time; its back and forth shows under it. The office still books anything on the schedule.
 */

const ICON: Record<ClassRequestKind, typeof LuCalendarPlus> = { makeup: LuRotateCcw, reschedule: LuArrowRightLeft, extra: LuCalendarPlus }
const TINT: Record<ClassRequestKind, string> = {
  makeup: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  reschedule: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  extra: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
}
const STATUS_TONE: Record<ClassRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  offered: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  approved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  rejected: 'bg-muted text-muted-foreground',
  withdrawn: 'bg-muted text-muted-foreground',
}

/** When something happened, mid-sentence: "today, 12:29 PM", "yesterday, …", "Oct 26, …". */
function askedWhen(t: TimestampLike | null | undefined, timezone: string): string {
  const w = when(t, timezone)
  return /^(Today|Yesterday|Just)\b/.test(w) ? w[0].toLowerCase() + w.slice(1) : w
}

/** "Makeup for Oct 26", "Move from Nov 2", "Extra class". */
function whatFor(r: Pick<ClassRequest, 'kind' | 'forDateKey'>): string {
  if (r.kind === 'makeup' && r.forDateKey) return `Makeup for ${formatDateKey(r.forDateKey, 'monthDay')}`
  if (r.kind === 'reschedule' && r.forDateKey) return `Move from ${formatDateKey(r.forDateKey, 'monthDay')}`
  return REQUEST_KIND_LABELS[r.kind]
}

/** Where a request stands, in a few words: asked when, suggested what, answered how. */
function standing(r: WithId<ClassRequest>, timezone: string): string {
  const last = requestHistory(r).at(-1)
  if (r.status === 'pending') return last?.action === 'asked_again' ? `Asked for another time ${askedWhen(last.at, timezone)}` : `Asked ${askedWhen(r.createdAt, timezone)}`
  if (r.status === 'offered' && r.offer) return `Suggested ${formatDateKey(r.offer.dateKey, 'weekdayMedium')}, ${formatMinutes(r.offer.startMin)} · waiting on the family`
  const by = r.decidedBy?.name ? ` by ${r.decidedBy.name}` : ''
  if (r.status === 'approved') return last?.action === 'accepted' ? `The family accepted the time suggested, ${askedWhen(last.at, timezone)}` : `Approved${by}, ${askedWhen(r.decidedAt, timezone)}`
  if (r.status === 'rejected') return r.decidedBy ? `Declined${by}, ${askedWhen(r.decidedAt, timezone)}` : 'Closed: the class passed without an answer'
  return `Withdrawn by the family ${askedWhen(r.updatedAt, timezone)}`
}

function RequestRow({ r, onOpen }: { r: WithId<ClassRequest>; onOpen: (id: string) => void }) {
  const { timezone } = useBranch()
  const Icon = ICON[r.kind]
  return (
    <button type="button" onClick={() => onOpen(r.id)} className="group flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50" data-testid="office-request">
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', TINT[r.kind])}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium">{r.studentName}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {whatFor(r)} · {formatDateKey(r.dateKey, 'weekdayMedium')}, {formatTimeRange(r.startMin, r.endMin)}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground/80">{standing(r, timezone)}</span>
      </span>
      <LuChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" />
    </button>
  )
}

/** "4 of 6 seats taken", in red once full. */
function SeatsTaken({ c }: { c: ClassSeats | null }) {
  if (!c) return null
  const full = c.isDeleted || c.taken >= c.seats
  return (
    <span className={cn('ml-1.5 text-xs', full ? 'font-medium text-destructive' : 'text-muted-foreground')}>
      · {c.isDeleted ? 'removed from the schedule' : `${c.taken} of ${c.seats} seats taken${full ? ' (full)' : ''}`}
    </span>
  )
}

/** One request, live: to approve, decline or suggest another class while it's open; its answer and history after. */
export function RequestReviewDialog({ requestId, onClose }: { requestId: string | null; onClose: () => void }) {
  return (
    <Dialog open={requestId !== null} onOpenChange={(o) => !o && onClose()}>
      {requestId ? (
        <DialogContent className="flex max-h-[min(92dvh,52rem)] flex-col gap-0 p-0 sm:max-w-lg" data-testid="request-review">
          <Review key={requestId} id={requestId} onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

function Review({ id, onClose }: { id: string; onClose: () => void }) {
  const { branchId, timezone, actor } = useBranch()
  const req = useRequest(id)
  const r = req.data
  const asked = useClassSeat(r?.classId).data
  const suggested = useClassSeat(r?.status === 'offered' ? r.offer?.classId : null).data
  const [mode, setMode] = useState<'answer' | 'suggest'>('answer')
  const [note, setNote] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [pickWhen, setPickWhen] = useState('')
  const [busy, setBusy] = useState<OfficeDecision | null>(null)

  if (req.loading) {
    return (
      <div className="space-y-3 p-5">
        <DialogTitle className="sr-only">Request</DialogTitle>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }
  if (!r) {
    return (
      <>
        <DialogHeader className="px-5 pt-5 pb-4">
          <DialogTitle>Request not found</DialogTitle>
          <DialogDescription>It may have been removed.</DialogDescription>
        </DialogHeader>
        <DialogFooter className="border-t px-5 py-4">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </>
    )
  }

  const open = isOpenRequest(r)
  // Picking a class to suggest (only while the request is open: the family may withdraw it meanwhile).
  const suggesting = open && mode === 'suggest'
  const askedFull = !!asked && (asked.isDeleted || asked.taken >= asked.seats)
  const steps = requestHistory(r)
  const label = seatLabelFor(r.kind, r.forDateKey)

  async function decide(decision: OfficeDecision) {
    if (!r) return
    setBusy(decision)
    try {
      await decideRequest(branchId, r.id, decision, { note: note.trim(), classId: decision === 'offer' ? pick : decision === 'approve' ? r.classId : null })
      if (decision === 'approve') toast.success('Approved', { description: `${r.studentName} is booked ${classWhen(r)} (${label}). The family is told.` })
      else if (decision === 'reject') toast.success('Declined', { description: 'The family is told, and can ask for another time.' })
      else toast.success('Suggested', { description: `${pickWhen}. The family is told, and can accept it or ask for another time.` })
      onClose()
    } catch (e) {
      toast.error(decision === 'approve' ? 'Not approved' : decision === 'reject' ? 'Not declined' : 'Not suggested', { description: requestError(e, 'Please try again.') })
      setBusy(null)
    }
  }

  return (
    <>
      <DialogHeader className="border-b px-5 pt-5 pb-4">
        <DialogTitle>
          {whatFor(r)}: {r.studentName}
        </DialogTitle>
        <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            Asked by {r.requestedBy.role === 'student' ? 'the student' : r.requestedBy.name || 'a parent'}, {askedWhen(r.createdAt, timezone)}.
          </span>
          <span className={cn('rounded-full px-2 text-xs leading-5 font-medium', STATUS_TONE[r.status])}>{REQUEST_OFFICE_STATUS_LABELS[r.status]}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {suggesting ? (
          <Suggest
            r={r}
            pick={pick}
            onPick={(classId, at) => {
              setPick(classId)
              setPickWhen(at)
            }}
          />
        ) : (
          <>
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5 text-sm">
              <dt className="text-muted-foreground">{r.status === 'approved' ? 'Booked' : 'Asked for'}</dt>
              <dd>
                {formatDateKey(r.dateKey, 'weekdayMedium')}, <span className="tabular-nums">{formatTimeRange(r.startMin, r.endMin)}</span>
                {open ? <SeatsTaken c={asked} /> : null}
              </dd>
              {r.kind !== 'extra' && r.forDateKey ? (
                <>
                  <dt className="text-muted-foreground">{r.kind === 'makeup' ? 'Makes up' : 'Moves'}</dt>
                  <dd>
                    The class on {formatDateKey(r.forDateKey, 'weekdayMedium')}
                    {r.kind === 'reschedule' && open ? <span className="block text-xs text-muted-foreground">Canceled when it’s booked; it stays booked if you decline.</span> : null}
                  </dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Seat label</dt>
              <dd>{label}</dd>
              {r.message ? (
                <>
                  <dt className="text-muted-foreground">Message</dt>
                  <dd className="break-words">“{r.message}”</dd>
                </>
              ) : null}
            </dl>

            {r.status === 'offered' && r.offer ? (
              <div className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2.5 text-sm dark:border-sky-900 dark:bg-sky-950/40" data-testid="request-offer">
                <p className="font-medium text-sky-950 dark:text-sky-100">
                  {offerText(r.offer, 'office', actor.email)}
                  <SeatsTaken c={suggested} />
                </p>
                {r.offer.note ? <p className="mt-0.5 break-words text-sky-950/80 dark:text-sky-100/80">“{r.offer.note}”</p> : null}
                <p className="mt-1 text-xs text-sky-950/70 dark:text-sky-100/70">
                  {suggested && (suggested.isDeleted || suggested.taken >= suggested.seats)
                    ? 'It has filled up since: suggest another class, or wait for their answer.'
                    : 'Waiting for the family to accept it or ask for another time. Its seat isn’t held for them.'}
                </p>
              </div>
            ) : null}

            {!open ? (
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                <span className="font-medium">{standing(r, timezone)}</span>
                {r.decisionNote ? <span className="mt-0.5 block break-words text-muted-foreground">“{r.decisionNote}”</span> : null}
              </div>
            ) : null}

            {steps.length ? (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">The back and forth</h3>
                <ol className="space-y-1.5 border-l pl-3 text-sm" data-testid="request-history">
                  {steps.map((s, i) => (
                    <li key={i}>
                      <span>{requestStepText(s, 'office', actor.email)}</span>
                      {s.note ? <span className="text-muted-foreground"> “{s.note}”</span> : null}
                      <span className="block text-xs text-muted-foreground/80">{when(s.at, timezone)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </>
        )}

        {open ? (
          <div className="space-y-1.5">
            <Label htmlFor="request-note" className="text-muted-foreground">
              {suggesting ? 'A note for the family (optional)' : 'A note for the family, if you decline (optional)'}
            </Label>
            <Textarea
              id="request-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={suggesting ? 'That day is full. Thursday has two seats open.' : 'That class is for advanced shooters; try Thursday.'}
            />
          </div>
        ) : null}
      </div>

      <DialogFooter className="border-t px-5 py-4 sm:flex-wrap">
        {!open ? (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        ) : suggesting ? (
          <>
            <Button variant="outline" onClick={() => setMode('answer')} disabled={busy !== null}>
              <LuArrowLeft /> Back
            </Button>
            <Button onClick={() => void decide('offer')} disabled={busy !== null || !pick} data-testid="request-suggest-send">
              <LuSend /> {busy === 'offer' ? 'Suggesting…' : 'Suggest this class'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => void decide('reject')} disabled={busy !== null} data-testid="request-decline">
              <LuX /> {busy === 'reject' ? 'Declining…' : 'Decline'}
            </Button>
            <Button variant="outline" onClick={() => setMode('suggest')} disabled={busy !== null} data-testid="request-suggest">
              <LuCalendarPlus /> {r.status === 'offered' ? 'Suggest a different class' : 'Suggest another class'}
            </Button>
            <Button onClick={() => void decide('approve')} disabled={busy !== null || askedFull} data-testid="request-approve">
              <LuCheck /> {busy === 'approve' ? 'Approving…' : r.status === 'offered' ? 'Approve as asked' : 'Approve'}
            </Button>
          </>
        )}
      </DialogFooter>
      {open && !suggesting && askedFull ? (
        <p className="-mt-2 px-5 pb-4 text-right text-xs text-muted-foreground">The class asked for is full: suggest another class, make room on the schedule, or decline.</p>
      ) : null}
    </>
  )
}

/** The classes the office can suggest instead: seats open, within the families' reach, none the student is in. */
function Suggest({ r, pick, onPick }: { r: WithId<ClassRequest>; pick: string | null; onPick: (classId: string, when: string) => void }) {
  const choice = useClassChoices({
    studentId: r.studentId,
    forSessionId: r.kind === 'reschedule' ? r.forSessionId : null,
    requestId: r.id,
    exclude: [r.classId, r.status === 'offered' ? r.offer?.classId : null],
    seatsUntil: r.forDateKey ?? undefined,
  })
  return (
    <div className="space-y-2">
      <div>
        <Label>Suggest another class</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Classes with seats open until {formatDateKey(choice.horizon, 'monthDay')}, none {r.studentName.split(' ')[0]} is in. The family accepts it or asks for another time.
        </p>
      </div>
      <ClassPicker
        choices={choice.choices}
        value={pick}
        onChange={(id) => {
          const c = choice.choices.find((x) => x.id === id)
          onPick(id, c ? classWhen(c) : '')
        }}
        loading={choice.loading}
        marked={{ dateKey: r.dateKey, label: 'Asked for' }}
        empty={`No other class has a seat open until ${formatDateKey(choice.horizon, 'monthDay')}. Make room on the schedule, or decline.`}
      />
    </div>
  )
}

/** Home's Requests: those waiting on the office, soonest class first, and how many wait on a family's answer. */
export function RequestsCard() {
  const open = useOpenRequests()
  const [openId, setOpenId] = useState<string | null>(null)
  if (!open.loading && !open.data.length) return null
  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="home-requests">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">Requests from families</h2>
        {open.pending.length ? (
          <span className="rounded-full bg-red-500 px-2 text-xs leading-5 font-semibold text-white tabular-nums" aria-label={`${open.pending.length} waiting on you`}>
            {open.pending.length}
          </span>
        ) : null}
      </div>
      {open.loading ? (
        <div className="px-4 pb-4 text-sm text-muted-foreground">Checking…</div>
      ) : open.pending.length ? (
        <div className="divide-y border-t">
          {open.pending.slice(0, 5).map((r) => (
            <RequestRow key={r.id} r={r} onOpen={setOpenId} />
          ))}
        </div>
      ) : (
        <p className="px-4 pb-3 text-sm text-muted-foreground">Nothing waiting on you.</p>
      )}
      <Link
        to="/admin/schedule?requests=1"
        className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        {[open.pending.length > 5 ? `${open.pending.length - 5} more waiting on you` : '', open.offered.length ? `${open.offered.length} waiting on the family` : ''].filter(Boolean).join(' · ') ||
          'All requests'}{' '}
        <LuChevronRight className="size-3.5" />
      </Link>
      <RequestReviewDialog requestId={openId} onClose={() => setOpenId(null)} />
    </section>
  )
}

function Section({ title, hint, list, onOpen, empty }: { title: string; hint: string; list: WithId<ClassRequest>[]; onOpen: (id: string) => void; empty: string }) {
  return (
    <section>
      <div className="sticky top-0 z-[1] border-b bg-background/95 px-4 pt-3 pb-2 backdrop-blur">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {title}
          {list.length ? <span className="rounded-full bg-muted px-1.5 text-xs leading-5 font-medium text-muted-foreground tabular-nums">{list.length}</span> : null}
        </h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      {list.length ? (
        <div className="divide-y">
          {list.map((r) => (
            <RequestRow key={r.id} r={r} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="px-4 py-4 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}

/**
 * The schedule's "Requests" button (with the count waiting on the office) and their sheet: waiting on us, waiting on
 * the family, and the last two weeks' answers. `?requests=1` opens the sheet, `?request=<id>` one request, whatever its
 * state (the office's notices link there).
 */
export function RequestsButton() {
  const open = useOpenRequests()
  const [params, setParams] = useSearchParams()
  const askedId = params.get('request')
  const sheetOpen = params.get('requests') === '1'
  const recent = useRecentRequests(sheetOpen)
  const [picked, setPicked] = useState<string | null>(null)
  const showing = picked ?? askedId
  const clear = (...keys: string[]) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        keys.forEach((k) => next.delete(k))
        return next
      },
      { replace: true },
    )
  const setSheet = (o: boolean) =>
    o
      ? setParams(
          (p) => {
            const next = new URLSearchParams(p)
            next.set('requests', '1')
            return next
          },
          { replace: true },
        )
      : clear('requests')

  if (!open.data.length && !askedId && !sheetOpen) return null
  return (
    <>
      <Button variant="outline" size="sm" className="relative gap-1.5" onClick={() => setSheet(true)} data-testid="schedule-requests">
        <LuCalendarCheck /> <span className="hidden sm:inline">Requests</span>
        {open.pending.length ? (
          <span className="rounded-full bg-red-500 px-1.5 text-[11px] leading-4 font-semibold text-white tabular-nums" aria-label={`${open.pending.length} waiting on you`}>
            {open.pending.length}
          </span>
        ) : null}
      </Button>
      <Sheet open={sheetOpen} onOpenChange={setSheet}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>Requests from families</SheetTitle>
            <SheetDescription>Makeups, moved classes and extra classes: those waiting on you, those waiting on a family’s answer, and the last two weeks’ answers.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            {!open.loading && !open.data.length && !recent.data.length && !recent.loading ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                <LuInbox className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                Nothing waiting.
              </div>
            ) : (
              <>
                <Section title="Waiting on us" hint="Approve, decline, or suggest another class." list={open.pending} onOpen={setPicked} empty="Nothing waiting on you." />
                <Section title="Waiting on the family" hint="A class you suggested, until they accept it or ask for another." list={open.offered} onOpen={setPicked} empty="No suggestions waiting." />
                <Section title="Decided" hint="Answered or withdrawn in the last two weeks." list={recent.data} onOpen={setPicked} empty={recent.loading ? 'Loading…' : 'None in the last two weeks.'} />
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
      <RequestReviewDialog
        requestId={showing}
        onClose={() => {
          setPicked(null)
          if (askedId) clear('request')
        }}
      />
    </>
  )
}
