import { useMemo, useState } from 'react'
import { LuCalendarCheck, LuCalendarPlus, LuChevronDown, LuRefreshCw, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import { MAKEUP_LOOKBACK_DAYS, makeupsLost, makeupsOwed } from '@shared/schedule/classes'
import {
  type ClassRequest,
  type ClassRequestStatus,
  REQUEST_STATUS_LABELS,
  classWhen,
  isOpenRequest,
  offerText,
  requestHistory,
  requestHorizon,
  requestLine,
  requestStepText,
} from '@shared/schedule/requests'
import { addDays, formatDateKey, formatMinutes, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type Family, useFamilySessions } from '@/features/family/data'
import { KidMark } from '@/features/family/FamilyWidgets'
import { when } from '@/features/website/messageText'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { answerOffer, requestError, withdrawRequest } from './api'
import { type AskPreset, AskAnotherDialog } from './AskForClassDialog'
import { RECENT_REQUESTS_MS, useClassSeat, useFamilyRequests } from './hooks'

const millis = (t: unknown) => (t && typeof t === 'object' && 'toMillis' in t ? (t as { toMillis: () => number }).toMillis() : 0)

const TONE: Record<ClassRequestStatus, string> = {
  pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  offered: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  approved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  rejected: 'bg-muted text-muted-foreground',
  withdrawn: 'bg-muted text-muted-foreground',
}

/**
 * Parent and Student → Classes, at the top: makeups still owed (each with "Ask for a makeup"), makeups missed (their
 * credit is lost), and the family's requests with the academy's answers: a time the academy suggests instead comes
 * first, to accept or answer with another time, and each request's back and forth opens under it. Nothing shows when
 * there's nothing to say.
 */
export function FamilyRequestsPanel({ family, ids, onAsk }: { family: Family; ids: string[]; onAsk: (p: AskPreset) => void }) {
  const { branchId, timezone, settings } = useBranch()
  const { confirm, dialog } = useConfirm()
  const today = todayKey(timezone)
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS)
  // Classes canceled ahead count too (a makeup is owed as soon as a class is canceled).
  const seats = useFamilySessions(ids, since, requestHorizon(today, settings))
  const requests = useFamilyRequests(ids)
  const [busy, setBusy] = useState<string | null>(null)
  const [another, setAnother] = useState<WithId<ClassRequest> | null>(null)
  const now = useNow(60_000)

  const owed = useMemo(() => makeupsOwed(seats.data, since), [seats.data, since])
  const lost = useMemo(() => makeupsLost(seats.data, since), [seats.data, since])
  const openFor = new Map(requests.data.filter(isOpenRequest).map((r) => [r.forSessionId, r]))
  // A time suggested waits on the family: it comes first.
  const shown = requests.data
    .filter((r) => isOpenRequest(r) || now - millis(r.decidedAt ?? r.updatedAt) < RECENT_REQUESTS_MS)
    .sort((a, b) => Number(b.status === 'offered') - Number(a.status === 'offered'))
  const several = family.kids.length > 1
  if (!owed.length && !lost.length && !shown.length) return null

  const whose = (studentId: string) => (family.who === 'parent' ? `${family.firstName(studentId)}’s` : 'your')

  async function withdraw(id: string) {
    if (!(await confirm({ title: 'Withdraw this request?', description: 'The academy won’t see it anymore. You can ask again any time.', confirmLabel: 'Withdraw' }))) return
    setBusy(id)
    try {
      await withdrawRequest(branchId, id)
      toast.success('Request withdrawn')
    } catch (e) {
      toast.error('Couldn’t withdraw it', { description: requestError(e, 'Please try again.') })
    } finally {
      setBusy(null)
    }
  }

  async function accept(r: WithId<ClassRequest>) {
    const offer = r.offer
    if (!offer) return
    const moved = r.kind === 'reschedule' && r.forDateKey ? `, and the class on ${formatDateKey(r.forDateKey, 'weekdayMedium')} is canceled` : ''
    const ok = await confirm({
      title: 'Book the time suggested?',
      description: `${family.who === 'parent' ? family.firstName(r.studentId) : 'You'} ${family.who === 'parent' ? 'is' : 'are'} booked ${classWhen(offer)}${moved}. The academy is told.`,
      confirmLabel: 'Book it',
    })
    if (!ok) return
    setBusy(r.id)
    try {
      await answerOffer(branchId, r.id, 'accept', { classId: offer.classId })
      toast.success('Booked', { description: `${classWhen(offer)}. The academy is told.` })
    } catch (e) {
      toast.error('It wasn’t booked', { description: requestError(e, 'Please try again.') })
    } finally {
      setBusy(null)
    }
  }

  const kid = (studentId: string) =>
    several ? <KidMark name={family.firstName(studentId)} tint={family.tint(studentId)} className="size-5 shrink-0 text-[10px]" /> : null

  return (
    <section className="mb-4 overflow-hidden rounded-xl border bg-card" data-testid="family-requests">
      {owed.length ? (
        <div className="border-b px-4 py-3 last:border-b-0">
          <h2 className="text-sm font-semibold">Makeups to book</h2>
          <ul className="mt-2 space-y-2">
            {owed.map((s) => {
              const open = openFor.get(s.id)
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  {kid(s.studentId)}
                  <span className="min-w-0 flex-1">
                    {several ? `${family.firstName(s.studentId)}: ` : ''}
                    {formatDateKey(s.dateKey, 'weekdayMedium')}, {formatMinutes(s.startMin)} <span className="text-muted-foreground">({s.status === 'no_show' ? 'missed' : 'canceled'})</span>
                  </span>
                  {open ? (
                    <span className="text-xs text-muted-foreground">{open.status === 'offered' ? 'Another time suggested: answer below' : 'Asked, waiting for the academy'}</span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => onAsk({ studentId: s.studentId, kind: 'makeup', forSessionId: s.id })}>
                      <LuCalendarPlus /> Ask for a makeup
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {shown.length ? (
        <div className="border-b px-4 py-3 last:border-b-0">
          <h2 className="text-sm font-semibold">Requests</h2>
          <ul className="mt-2 space-y-3">
            {shown.map((r) => (
              <li key={r.id} className="text-sm" data-testid="family-request">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                  {kid(r.studentId)}
                  <span className="min-w-0 flex-1">
                    <span className={cn('block', r.status === 'offered' && 'text-muted-foreground')}>
                      {several ? `${family.firstName(r.studentId)}: ` : ''}
                      {requestLine(r)}
                    </span>
                    {r.status === 'rejected' && r.decisionNote ? <span className="mt-0.5 block text-muted-foreground">“{r.decisionNote}”</span> : null}
                  </span>
                  <Badge variant="secondary" className={cn('border-0', TONE[r.status])}>
                    {REQUEST_STATUS_LABELS[r.status]}
                  </Badge>
                  {r.status === 'pending' ? (
                    <Button size="sm" variant="ghost" className="-my-1 text-muted-foreground" disabled={busy === r.id} onClick={() => void withdraw(r.id)}>
                      <LuX /> Withdraw
                    </Button>
                  ) : null}
                </div>
                {r.status === 'offered' && r.offer ? (
                  <OfferBox
                    r={r}
                    whose={whose(r.studentId)}
                    busy={busy === r.id}
                    onAccept={() => void accept(r)}
                    onAnother={() => setAnother(r)}
                    onWithdraw={() => void withdraw(r.id)}
                    now={now}
                  />
                ) : null}
                <History r={r} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {lost.length ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">
          {lost.map((s) => {
            const was = /(\d+)\/(\d+)/.exec(s.note ?? '')
            const missedOn = formatDateKey(s.dateKey, 'monthDay')
            const forDay = was ? `${was[1]}/${was[2]}` : ''
            return (
              <p key={s.id}>
                {several ? `${family.firstName(s.studentId)}: ` : ''}the makeup{forDay ? ` for ${forDay}` : ''} was missed on {missedOn}, so it counts as used.
              </p>
            )
          })}
        </div>
      ) : null}
      <AskAnotherDialog request={another} family={family} onClose={() => setAnother(null)} />
      {dialog}
    </section>
  )
}

/** The time the academy suggests instead, with its note and the seats it has open now, to accept or answer. */
function OfferBox({
  r,
  whose,
  busy,
  onAccept,
  onAnother,
  onWithdraw,
  now,
}: {
  r: WithId<ClassRequest>
  whose: string
  busy: boolean
  onAccept: () => void
  onAnother: () => void
  onWithdraw: () => void
  now: number
}) {
  const offer = r.offer!
  const seats = useClassSeat(offer.classId).data
  const started = millis(offer.startAt) <= now
  const full = !!seats && (seats.isDeleted || seats.taken >= seats.seats)
  const open = seats ? seats.seats - seats.taken : null
  return (
    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2.5 dark:border-sky-900 dark:bg-sky-950/40" data-testid="family-offer">
      <p className="font-medium text-sky-950 dark:text-sky-100">{offerText(offer, 'family')}</p>
      {offer.note ? <p className="mt-0.5 break-words text-sky-950/80 dark:text-sky-100/80">“{offer.note}”</p> : null}
      <p className="mt-1 text-xs text-sky-950/70 dark:text-sky-100/70">
        {started
          ? 'That class has started: ask for another time.'
          : full
            ? 'That class has filled up since: ask for another time, or wait for the academy to suggest one.'
            : `For ${whose} ${r.kind === 'makeup' ? 'makeup' : r.kind === 'reschedule' ? 'moved class' : 'extra class'}${open !== null ? ` · ${open} ${open === 1 ? 'seat' : 'seats'} open` : ''}.`}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" onClick={onAccept} disabled={busy || started || full} data-testid="offer-accept">
          <LuCalendarCheck /> Accept
        </Button>
        <Button size="sm" variant="outline" onClick={onAnother} disabled={busy} data-testid="offer-another">
          <LuRefreshCw /> Ask for another
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onWithdraw} disabled={busy}>
          <LuX /> Withdraw
        </Button>
      </div>
    </div>
  )
}

/** A request's back and forth, oldest first, folded under it once there's more than the ask. */
function History({ r }: { r: WithId<ClassRequest> }) {
  const { timezone, actor } = useBranch()
  const [open, setOpen] = useState(false)
  const steps = requestHistory(r)
  if (steps.length < 2) return null
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <LuChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        {open ? 'Hide' : 'Show'} the back and forth ({steps.length})
      </button>
      {open ? (
        <ol className="mt-1.5 space-y-1.5 border-l pl-3 text-xs">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="text-foreground">{requestStepText(s, 'family', actor.email)}</span>
              {s.note ? <span className="text-muted-foreground"> “{s.note}”</span> : null}
              <span className="block text-muted-foreground/80">{when(s.at, timezone)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
