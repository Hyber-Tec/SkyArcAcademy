import { useMemo, useState } from 'react'
import { LuArrowRightLeft, LuCalendarCheck, LuCalendarPlus, LuCheck, LuChevronRight, LuInbox, LuRotateCcw, LuX } from 'react-icons/lu'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { type ClassRequest, type ClassRequestKind, type ClassSeats, REQUEST_KIND_LABELS, seatLabelFor } from '@shared/schedule/requests'
import { formatDateKey, formatTimeRange } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { when } from '@/features/website/messageText'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { decideRequest, requestError } from './api'
import { usePendingRequests } from './hooks'

/**
 * The office's side of families' requests (docs/DECISIONS.md §23): each waiting request on Home and on the schedule
 * ("Requests", with its count, also in the sidebar's Home badge), opened to approve (the seat is booked, a moved class
 * canceled) or decline with a note for the family. The office still books anything on the schedule directly.
 */

const ICON: Record<ClassRequestKind, typeof LuCalendarPlus> = { makeup: LuRotateCcw, reschedule: LuArrowRightLeft, extra: LuCalendarPlus }
const TINT: Record<ClassRequestKind, string> = {
  makeup: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  reschedule: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  extra: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
}

/** When it was asked, mid-sentence: "today, 12:29 PM", "yesterday, …", "Oct 26, …". */
function askedWhen(t: Parameters<typeof when>[0], timezone: string): string {
  const w = when(t, timezone)
  return /^(Today|Yesterday)\b/.test(w) ? w[0].toLowerCase() + w.slice(1) : w
}

/** "Makeup for Oct 26", "Move from Nov 2", "Extra class". */
function whatFor(r: Pick<ClassRequest, 'kind' | 'forDateKey'>): string {
  if (r.kind === 'makeup' && r.forDateKey) return `Makeup for ${formatDateKey(r.forDateKey, 'monthDay')}`
  if (r.kind === 'reschedule' && r.forDateKey) return `Move from ${formatDateKey(r.forDateKey, 'monthDay')}`
  return REQUEST_KIND_LABELS[r.kind]
}

function RequestRow({ r, onOpen }: { r: WithId<ClassRequest>; onOpen: (r: WithId<ClassRequest>) => void }) {
  const { timezone } = useBranch()
  const Icon = ICON[r.kind]
  return (
    <button type="button" onClick={() => onOpen(r)} className="group flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50" data-testid="office-request">
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', TINT[r.kind])}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-sm font-medium">{r.studentName}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">
          {whatFor(r)} · {formatDateKey(r.dateKey, 'weekdayMedium')}, {formatTimeRange(r.startMin, r.endMin)}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground/80">Asked {askedWhen(r.createdAt, timezone)}</span>
      </span>
      <LuChevronRight className="mt-2 size-4 shrink-0 text-muted-foreground/60 group-hover:text-muted-foreground" />
    </button>
  )
}

/** One request, to approve or decline. */
export function RequestReviewDialog({ request: r, onClose }: { request: WithId<ClassRequest> | null; onClose: () => void }) {
  const { branchId, timezone } = useBranch()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)
  const seatsRef = useMemo(() => (r ? branchDocRef(branchId, COL.classSeats, r.classId) : null), [branchId, r])
  const seats = useDoc<ClassSeats>(seatsRef)
  const c = seats.data
  const full = !!c && c.taken >= c.seats

  async function decide(decision: 'approve' | 'reject') {
    if (!r) return
    setBusy(decision)
    try {
      await decideRequest(branchId, r.id, decision, note.trim())
      toast.success(decision === 'approve' ? 'Approved' : 'Declined', {
        description:
          decision === 'approve'
            ? `${r.studentName} is booked ${formatDateKey(r.dateKey, 'weekdayMedium')}, ${formatTimeRange(r.startMin, r.endMin)} (${seatLabelFor(r.kind, r.forDateKey)}). The family is told.`
            : 'The family is told, and can ask for another time.',
      })
      setNote('')
      onClose()
    } catch (e) {
      toast.error(decision === 'approve' ? 'Not approved' : 'Not declined', { description: requestError(e, 'Please try again.') })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={r !== null} onOpenChange={(o) => !o && onClose()}>
      {r ? (
        <DialogContent className="sm:max-w-md" data-testid="request-review">
          <DialogHeader>
            <DialogTitle>
              {whatFor(r)}: {r.studentName}
            </DialogTitle>
            <DialogDescription>
              Asked by {r.requestedBy.role === 'student' ? 'the student' : r.requestedBy.name || 'a parent'}, {askedWhen(r.createdAt, timezone)}.
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-2.5 text-sm">
            <dt className="text-muted-foreground">Class</dt>
            <dd>
              {formatDateKey(r.dateKey, 'weekdayMedium')}, <span className="tabular-nums">{formatTimeRange(r.startMin, r.endMin)}</span>
              {c ? (
                <span className={cn('ml-1.5 text-xs', full ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                  · {c.taken} of {c.seats} seats taken{full ? ' (full)' : ''}
                </span>
              ) : null}
            </dd>
            {r.kind !== 'extra' && r.forDateKey ? (
              <>
                <dt className="text-muted-foreground">{r.kind === 'makeup' ? 'Makes up' : 'Moves'}</dt>
                <dd>
                  The class on {formatDateKey(r.forDateKey, 'weekdayMedium')}
                  {r.kind === 'reschedule' ? <span className="block text-xs text-muted-foreground">Canceled when you approve; it stays booked if you decline.</span> : null}
                </dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">Seat label</dt>
            <dd>{seatLabelFor(r.kind, r.forDateKey)}</dd>
            {r.message ? (
              <>
                <dt className="text-muted-foreground">Message</dt>
                <dd className="break-words">“{r.message}”</dd>
              </>
            ) : null}
          </dl>
          <div className="space-y-1.5">
            <Label htmlFor="decline-note" className="text-muted-foreground">
              A note for the family, if you decline (optional)
            </Label>
            <Textarea id="decline-note" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="That class is for advanced shooters; try Thursday." />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => void decide('reject')} disabled={busy !== null} data-testid="request-decline">
              <LuX /> {busy === 'reject' ? 'Declining…' : 'Decline'}
            </Button>
            <Button onClick={() => void decide('approve')} disabled={busy !== null || full} data-testid="request-approve">
              <LuCheck /> {busy === 'approve' ? 'Approving…' : 'Approve'}
            </Button>
          </DialogFooter>
          {full ? <p className="-mt-2 text-right text-xs text-muted-foreground">The class is full: make room on the schedule first, or decline.</p> : null}
        </DialogContent>
      ) : null}
    </Dialog>
  )
}

/** Home's Requests: the families' requests waiting for an answer, soonest class first. */
export function RequestsCard() {
  const pending = usePendingRequests()
  const [open, setOpen] = useState<WithId<ClassRequest> | null>(null)
  if (!pending.loading && !pending.data.length) return null
  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="home-requests">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">Requests from families</h2>
        {pending.data.length ? (
          <span className="rounded-full bg-red-500 px-2 text-xs leading-5 font-semibold text-white tabular-nums" aria-label={`${pending.data.length} waiting`}>
            {pending.data.length}
          </span>
        ) : null}
      </div>
      {pending.loading ? (
        <div className="px-4 pb-4 text-sm text-muted-foreground">Checking…</div>
      ) : (
        <div className="divide-y border-t">
          {pending.data.slice(0, 5).map((r) => (
            <RequestRow key={r.id} r={r} onOpen={setOpen} />
          ))}
        </div>
      )}
      <Link
        to="/admin/schedule?requests=1"
        className="flex items-center justify-center gap-1 border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        {pending.data.length > 5 ? `All requests (${pending.data.length - 5} more)` : 'On the schedule'} <LuChevronRight className="size-3.5" />
      </Link>
      <RequestReviewDialog request={open} onClose={() => setOpen(null)} />
    </section>
  )
}

/**
 * The schedule's "Requests" button (with its count) and their sheet. `?requests=1` opens the sheet, `?request=<id>` one
 * request (the office's notices link there).
 */
export function RequestsButton() {
  const pending = usePendingRequests()
  const [params, setParams] = useSearchParams()
  const askedId = params.get('request')
  const sheetOpen = params.get('requests') === '1'
  const [picked, setPicked] = useState<WithId<ClassRequest> | null>(null)
  const linked = askedId ? (pending.data.find((r) => r.id === askedId) ?? null) : null
  const showing = picked ?? linked
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

  if (!pending.data.length && !askedId) return null
  return (
    <>
      {pending.data.length ? (
        <Button variant="outline" size="sm" className="relative gap-1.5" onClick={() => setSheet(true)} data-testid="schedule-requests">
          <LuCalendarCheck /> <span className="hidden sm:inline">Requests</span>
          <span className="rounded-full bg-red-500 px-1.5 text-[11px] leading-4 font-semibold text-white tabular-nums">{pending.data.length}</span>
        </Button>
      ) : null}
      <Sheet open={sheetOpen} onOpenChange={setSheet}>
        <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>Requests from families</SheetTitle>
            <SheetDescription>Makeups, moved classes and extra classes waiting for an answer.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 divide-y overflow-y-auto">
            {pending.data.map((r) => (
              <RequestRow key={r.id} r={r} onOpen={setPicked} />
            ))}
            {!pending.loading && !pending.data.length ? (
              <div className="px-6 py-16 text-center text-sm text-muted-foreground">
                <LuInbox className="mx-auto mb-3 size-8 text-muted-foreground/40" />
                Nothing waiting.
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
      <RequestReviewDialog
        request={showing}
        onClose={() => {
          setPicked(null)
          if (askedId) clear('request')
        }}
      />
    </>
  )
}
