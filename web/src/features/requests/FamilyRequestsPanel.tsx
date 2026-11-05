import { useMemo, useState } from 'react'
import { LuCalendarCheck, LuCalendarPlus, LuChevronDown, LuRefreshCw, LuX } from 'react-icons/lu'
import { toast } from 'sonner'
import { MAKEUP_LOOKBACK_DAYS, makeupsLost, makeupsOwed } from '@shared/schedule/classes'
import { type ClassRequest, type ClassRequestStatus, REQUEST_STATUS_LABELS, REQUEST_STATUS_LABELS_KO, isOpenRequest, requestHistory, requestHorizon } from '@shared/schedule/requests'
import { addDays, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { type Family, useFamilySessions } from '@/features/family/data'
import { KidMark } from '@/features/family/FamilyWidgets'
import { useLang, useT } from '@/lib/lang'
import { dateIn, timeIn } from '@/lib/langFormat'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { answerOffer, requestError, withdrawRequest } from './api'
import { type AskPreset, AskAnotherDialog } from './AskForClassDialog'
import { classWhenIn, offerTextIn, requestLineIn, stepTextIn, whenIn } from './familyText'
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
  const lang = useLang()
  const t = useT()
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
  const whoseKo = (studentId: string) => (family.who === 'parent' ? `${family.firstName(studentId)} 학생 ` : '')

  async function withdraw(id: string) {
    const ok = await confirm({
      title: t('Withdraw this request?', '이 신청을 취소할까요?'),
      description: t('The academy won’t see it anymore. You can ask again any time.', '아카데미에서 더 이상 볼 수 없어요. 언제든 다시 신청할 수 있어요.'),
      confirmLabel: t('Withdraw', '신청 취소'),
    })
    if (!ok) return
    setBusy(id)
    try {
      await withdrawRequest(branchId, id)
      toast.success(t('Request withdrawn', '신청을 취소했어요'))
    } catch (e) {
      toast.error(t('Couldn’t withdraw it', '신청을 취소하지 못했어요'), { description: requestError(e, t('Please try again.', '다시 시도해 주세요.')) })
    } finally {
      setBusy(null)
    }
  }

  async function accept(r: WithId<ClassRequest>) {
    const offer = r.offer
    if (!offer) return
    const moved = r.kind === 'reschedule' && r.forDateKey ? `, and the class on ${dateIn(r.forDateKey, 'weekdayMedium', 'en')} is canceled` : ''
    const movedKo = r.kind === 'reschedule' && r.forDateKey ? ` ${dateIn(r.forDateKey, 'weekdayMedium', 'ko')} 수업은 취소돼요.` : ''
    const ok = await confirm({
      title: t('Book the time suggested?', '제안받은 시간으로 예약할까요?'),
      description: t(
        `${family.who === 'parent' ? family.firstName(r.studentId) : 'You'} ${family.who === 'parent' ? 'is' : 'are'} booked ${classWhenIn(offer, 'en')}${moved}. The academy is told.`,
        `${whoseKo(r.studentId)}${classWhenIn(offer, 'ko')} 수업을 예약해요.${movedKo} 아카데미에도 알림이 가요.`,
      ),
      confirmLabel: t('Book it', '예약하기'),
    })
    if (!ok) return
    setBusy(r.id)
    try {
      await answerOffer(branchId, r.id, 'accept', { classId: offer.classId })
      toast.success(t('Booked', '예약했어요'), { description: t(`${classWhenIn(offer, 'en')}. The academy is told.`, `${classWhenIn(offer, 'ko')}. 아카데미에 알림이 갔어요.`) })
    } catch (e) {
      toast.error(t('It wasn’t booked', '예약하지 못했어요'), { description: requestError(e, t('Please try again.', '다시 시도해 주세요.')) })
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
          <h2 className="text-sm font-semibold">{t('Makeups to book', '잡아야 할 보강')}</h2>
          <ul className="mt-2 space-y-2">
            {owed.map((s) => {
              const open = openFor.get(s.id)
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                  {kid(s.studentId)}
                  <span className="min-w-0 flex-1">
                    {several ? `${family.firstName(s.studentId)}: ` : ''}
                    {lang === 'ko' ? `${dateIn(s.dateKey, 'weekdayMedium', 'ko')} ${timeIn(s.startMin, 'ko')}` : `${dateIn(s.dateKey, 'weekdayMedium', 'en')}, ${timeIn(s.startMin, 'en')}`}{' '}
                    <span className="text-muted-foreground">({s.status === 'no_show' ? t('missed', '결석') : t('canceled', '취소')})</span>
                  </span>
                  {open ? (
                    <span className="text-xs text-muted-foreground">
                      {open.status === 'offered' ? t('Another time suggested: answer below', '다른 시간을 제안받았어요. 아래에서 답해 주세요.') : t('Asked, waiting for the academy', '신청했어요. 아카데미에서 확인하고 있어요.')}
                    </span>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => onAsk({ studentId: s.studentId, kind: 'makeup', forSessionId: s.id })}>
                      <LuCalendarPlus /> {t('Ask for a makeup', '보강 신청')}
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
          <h2 className="text-sm font-semibold">{t('Requests', '신청 내역')}</h2>
          <ul className="mt-2 space-y-3">
            {shown.map((r) => (
              <li key={r.id} className="text-sm" data-testid="family-request">
                <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
                  {kid(r.studentId)}
                  <span className="min-w-0 flex-1">
                    <span className={cn('block', r.status === 'offered' && 'text-muted-foreground')}>
                      {several ? `${family.firstName(r.studentId)}: ` : ''}
                      {requestLineIn(r, lang)}
                    </span>
                    {r.status === 'rejected' && r.decisionNote ? <span className="mt-0.5 block text-muted-foreground">“{r.decisionNote}”</span> : null}
                  </span>
                  <Badge variant="secondary" className={cn('border-0', TONE[r.status])}>
                    {lang === 'ko' ? REQUEST_STATUS_LABELS_KO[r.status] : REQUEST_STATUS_LABELS[r.status]}
                  </Badge>
                  {r.status === 'pending' ? (
                    <Button size="sm" variant="ghost" className="-my-1 text-muted-foreground" disabled={busy === r.id} onClick={() => void withdraw(r.id)}>
                      <LuX /> {t('Withdraw', '신청 취소')}
                    </Button>
                  ) : null}
                </div>
                {r.status === 'offered' && r.offer ? (
                  <OfferBox
                    r={r}
                    whose={whose(r.studentId)}
                    whoseKo={whoseKo(r.studentId)}
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
            const missedOn = dateIn(s.dateKey, 'monthDay', lang)
            const forDay = was ? `${was[1]}/${was[2]}` : ''
            return (
              <p key={s.id}>
                {several ? `${family.firstName(s.studentId)}: ` : ''}
                {lang === 'ko'
                  ? `${was ? `${was[1]}월 ${was[2]}일 수업 ` : ''}보강을 ${missedOn}에 빠져서 사용한 것으로 처리됐어요.`
                  : `the makeup${forDay ? ` for ${forDay}` : ''} was missed on ${missedOn}, so it counts as used.`}
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
  whoseKo,
  busy,
  onAccept,
  onAnother,
  onWithdraw,
  now,
}: {
  r: WithId<ClassRequest>
  whose: string
  /** "Jiwoo 학생 " for a parent, "" for the student. */
  whoseKo: string
  busy: boolean
  onAccept: () => void
  onAnother: () => void
  onWithdraw: () => void
  now: number
}) {
  const offer = r.offer!
  const lang = useLang()
  const t = useT()
  const seats = useClassSeat(offer.classId).data
  const started = millis(offer.startAt) <= now
  const full = !!seats && (seats.isDeleted || seats.taken >= seats.seats)
  const open = seats ? seats.seats - seats.taken : null
  return (
    <div className="mt-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2.5 dark:border-sky-900 dark:bg-sky-950/40" data-testid="family-offer">
      <p className="font-medium text-sky-950 dark:text-sky-100">{offerTextIn(offer, lang)}</p>
      {offer.note ? <p className="mt-0.5 break-words text-sky-950/80 dark:text-sky-100/80">“{offer.note}”</p> : null}
      <p className="mt-1 text-xs text-sky-950/70 dark:text-sky-100/70">
        {started
          ? t('That class has started: ask for another time.', '이미 시작한 수업이에요. 다른 시간을 신청해 주세요.')
          : full
            ? t('That class has filled up since: ask for another time, or wait for the academy to suggest one.', '그사이 자리가 다 찼어요. 다른 시간을 신청하거나 아카데미 제안을 기다려 주세요.')
            : lang === 'ko'
              ? `${whoseKo}${r.kind === 'makeup' ? '보강' : r.kind === 'reschedule' ? '옮길 수업' : '추가 수업'}으로 제안한 시간이에요${open !== null ? ` · 빈자리 ${open}개` : ''}.`
              : `For ${whose} ${r.kind === 'makeup' ? 'makeup' : r.kind === 'reschedule' ? 'moved class' : 'extra class'}${open !== null ? ` · ${open} ${open === 1 ? 'seat' : 'seats'} open` : ''}.`}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <Button size="sm" onClick={onAccept} disabled={busy || started || full} data-testid="offer-accept">
          <LuCalendarCheck /> {t('Accept', '수락')}
        </Button>
        <Button size="sm" variant="outline" onClick={onAnother} disabled={busy} data-testid="offer-another">
          <LuRefreshCw /> {t('Ask for another', '다른 시간 신청')}
        </Button>
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={onWithdraw} disabled={busy}>
          <LuX /> {t('Withdraw', '신청 취소')}
        </Button>
      </div>
    </div>
  )
}

/** A request's back and forth, oldest first, folded under it once there's more than the ask. */
function History({ r }: { r: WithId<ClassRequest> }) {
  const { timezone, actor } = useBranch()
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const steps = requestHistory(r)
  if (steps.length < 2) return null
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <LuChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} />
        {lang === 'ko' ? `주고받은 내용 ${open ? '접기' : '보기'} (${steps.length})` : `${open ? 'Hide' : 'Show'} the back and forth (${steps.length})`}
      </button>
      {open ? (
        <ol className="mt-1.5 space-y-1.5 border-l pl-3 text-xs">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="text-foreground">{stepTextIn(s, actor.email, lang)}</span>
              {s.note ? <span className="text-muted-foreground"> “{s.note}”</span> : null}
              <span className="block text-muted-foreground/80">{whenIn(s.at, timezone, lang)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
