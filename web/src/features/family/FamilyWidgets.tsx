import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { LuCalendarClock, LuCalendarX, LuChevronRight, LuExternalLink, LuMail, LuMapPin, LuPhone, LuStickyNote } from 'react-icons/lu'
import { toast } from 'sonner'
import { TREND_LABELS_KO, type TrendLevel, trendLabel } from '@shared/reports/types'
import { familyNote, familyStatusLabel } from '@shared/schedule/family'
import { familyCancelCheck, isOpenRequest } from '@shared/schedule/requests'
import type { SessionStatus } from '@shared/settings/defaults'
import type { DateKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { type Tone, StatePill } from '@/features/home/parts'
import { TREND_STYLE } from '@/features/reports/model'
import { cancelClass, requestError } from '@/features/requests/api'
import type { AskPreset } from '@/features/requests/AskForClassDialog'
import { cancelMessageIn, classWhenIn } from '@/features/requests/familyText'
import { useFamilyRequests } from '@/features/requests/hooks'
import { useLang, useT } from '@/lib/lang'
import { dateIn, dayLongIn, durationIn, timeRangeIn } from '@/lib/langFormat'
import { cn } from '@/lib/utils'
import { type Family, dayTitle, hasEnded, useAcademyContactDetails } from './data'

const STATUS_TONE: Record<SessionStatus, Tone> = { pending: 'muted', confirmed: 'live', present: 'done', no_show: 'warn', canceled: 'danger' }

/** A class's status in plain words ("Scheduled", "Attended", "Not marked yet"). */
export function FamilyStatus({ session: s, now }: { session: Pick<Session, 'status' | 'endAt'>; now: number }) {
  const lang = useLang()
  const ended = hasEnded(s, now)
  const unmarked = ended && (s.status === 'pending' || s.status === 'confirmed')
  return <StatePill tone={unmarked ? 'muted' : STATUS_TONE[s.status]}>{familyStatusLabel(s.status, ended, lang)}</StatePill>
}

const TREND_TONE: Record<TrendLevel, Tone> = { improving: 'live', steady: 'done', dipping: 'warn' }

/** A report's trend in the family's words, in the app's light and dark colors (the report's own chip is for paper). */
export function FamilyTrend({ level }: { level: TrendLevel }) {
  const lang = useLang()
  const Icon = TREND_STYLE[level].icon
  return (
    <StatePill tone={TREND_TONE[level]}>
      <Icon className="size-3.5" /> {lang === 'ko' ? TREND_LABELS_KO[level] : trendLabel(level, 'family')}
    </StatePill>
  )
}

/** The class's note ("Makeup for 10/12", "Trial 1"); staff write it for the family to read. */
export function NoteChip({ note, className }: { note: string; className?: string }) {
  const lang = useLang()
  const text = familyNote(note, lang)
  if (!text) return null
  return (
    <span className={cn('inline-flex max-w-full items-start gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-900 dark:bg-blue-950/50 dark:text-blue-200', className)}>
      <LuStickyNote className="mt-0.5 size-3 shrink-0" />
      <span className="min-w-0 break-words">{text}</span>
    </span>
  )
}

/** A child's initial in their tint. */
export function KidMark({ name, tint, className }: { name: string; tint: string; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', tint, className)}>
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  )
}

/** Classes grouped by day: upcoming earliest first, past latest day first (each day still in time order). */
export function ClassList({
  sessions,
  family,
  showKid,
  now,
  today,
  past = false,
  bare = false,
  onOpen,
  empty,
}: {
  sessions: WithId<Session>[]
  family: Family
  showKid: boolean
  now: number
  today: DateKey
  past?: boolean
  /** Inside a card that has its own border. */
  bare?: boolean
  onOpen: (s: WithId<Session>) => void
  empty: React.ReactNode
}) {
  const lang = useLang()
  const days = useMemo(() => {
    const m = new Map<DateKey, WithId<Session>[]>()
    for (const s of sessions) m.set(s.dateKey, [...(m.get(s.dateKey) ?? []), s])
    const list = [...m.entries()]
    return past ? list.reverse() : list
  }, [sessions, past])

  if (!sessions.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        <LuCalendarClock className="size-6 opacity-50" />
        {empty}
      </div>
    )
  }
  return (
    <div className={cn('[&_section:last-child_li:last-child]:border-b-0', !bare && 'overflow-hidden rounded-xl border bg-card')} data-testid="family-classes">
      {days.map(([d, list]) => (
        <section key={d} aria-label={dateIn(d, 'weekdayLong', lang)}>
          <h3 className={cn('border-b bg-muted/40 px-4 py-1.5 text-xs font-semibold', d === today ? 'text-foreground' : 'text-muted-foreground')}>{dayTitle(d, today, true, lang)}</h3>
          <ul>
            {list.map((s) => (
              <li key={s.id} className="border-b">
                <ClassRow session={s} family={family} showKid={showKid} now={now} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** One class in a list: its time, whose it is, how long, the note and the status; opens the details. */
export function ClassRow({
  session: s,
  family,
  showKid,
  now,
  onOpen,
  className,
}: {
  session: WithId<Session>
  family: Family
  showKid: boolean
  now: number
  onOpen: (s: WithId<Session>) => void
  className?: string
}) {
  const lang = useLang()
  const canceled = s.status === 'canceled'
  const time = timeRangeIn(s.startMin, s.endMin, lang)
  return (
    <button
      type="button"
      onClick={() => onOpen(s)}
      className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:items-center sm:gap-4', className)}
      data-testid="family-class"
    >
      <div className={cn('hidden w-40 shrink-0 text-sm font-medium tabular-nums sm:block', canceled && 'text-muted-foreground line-through')}>{time}</div>
      <div className="min-w-0 flex-1">
        {/* Phones: the time and the status on the first line, then whose class it is and how long. */}
        <div className="mb-1 flex items-center justify-between gap-2 sm:hidden">
          <span className={cn('text-sm font-medium tabular-nums', canceled && 'text-muted-foreground line-through')}>{time}</span>
          <FamilyStatus session={s} now={now} />
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm sm:flex-nowrap">
          {showKid ? (
            <>
              <span className="flex shrink-0 items-center gap-2">
                <KidMark name={family.firstName(s.studentId)} tint={family.tint(s.studentId)} className="size-5 text-[10px]" />
                <span className="font-medium">{family.firstName(s.studentId)}</span>
              </span>
              <span className="min-w-0 text-muted-foreground sm:truncate">{durationIn(s.endMin - s.startMin, lang)}</span>
            </>
          ) : (
            <span className="min-w-0 text-muted-foreground sm:truncate">{durationIn(s.endMin - s.startMin, lang)}</span>
          )}
        </div>
        {s.note ? <NoteChip note={s.note} className="mt-1.5" /> : null}
      </div>
      <span className="hidden sm:inline-flex">
        <FamilyStatus session={s} now={now} />
      </span>
      <LuChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/70 sm:mt-0" />
    </button>
  )
}

/**
 * A class's details, from any list or the month calendar. Families cancel an upcoming class until it's confirmed, and
 * ask to move it to another time (`onAsk`, which opens "Ask for a class"); the academy changes everything else
 * (docs/DECISIONS.md §23).
 */
export function ClassDetails({
  session: s,
  family,
  now,
  onClose,
  onAsk,
}: {
  session: WithId<Session> | null
  family: Family
  now: number
  onClose: () => void
  onAsk?: (p: AskPreset) => void
}) {
  const { branch, branchId, settings } = useBranch()
  const lang = useLang()
  const t = useT()
  const contact = useAcademyContactDetails()
  const { confirm, dialog } = useConfirm()
  const [canceling, setCanceling] = useState(false)
  const ids = useMemo(() => (s ? [s.studentId] : []), [s])
  const requests = useFamilyRequests(ids)
  // Closing goes back to the class it was opened from (the dialog has no trigger of its own), for keyboards.
  const opener = useRef<HTMLElement | null>(null)
  const open = s !== null
  useLayoutEffect(() => {
    if (open) opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }, [open])
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {s ? (
        <DialogContent
          className="sm:max-w-md"
          data-testid="class-details"
          onCloseAutoFocus={(e) => {
            if (!opener.current?.isConnected) return
            e.preventDefault()
            opener.current.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{dayLongIn(s.dateKey, lang)}</DialogTitle>
            <DialogDescription>{family.who === 'parent' ? t(`${s.studentName}’s class`, `${s.studentName} 학생 수업`) : t('Your class', '내 수업')}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-3 text-sm">
            <dt className="text-muted-foreground">{t('Time', '시간')}</dt>
            <dd className="tabular-nums">
              {timeRangeIn(s.startMin, s.endMin, lang)} <span className="text-muted-foreground">· {durationIn(s.endMin - s.startMin, lang)}</span>
            </dd>
            <dt className="text-muted-foreground">{t('Status', '상태')}</dt>
            <dd>
              <FamilyStatus session={s} now={now} />
            </dd>
            {s.note ? (
              <>
                <dt className="text-muted-foreground">{t('Note', '메모')}</dt>
                <dd className="break-words">{familyNote(s.note, lang)}</dd>
              </>
            ) : null}
          </dl>
          {(() => {
            const upcoming = !hasEnded(s, now) && (s.status === 'pending' || s.status === 'confirmed')
            if (!upcoming) return null
            const check = familyCancelCheck({ status: s.status, isDeleted: s.isDeleted, startMs: s.startAt?.toMillis?.() ?? 0 }, now, settings)
            const moving = requests.data.find((r) => isOpenRequest(r) && r.kind === 'reschedule' && r.forSessionId === s.id)
            async function cancelIt() {
              if (!s) return
              const whose = family.who === 'parent' ? `${family.firstName(s.studentId)}’s class` : 'Your class'
              const whoseKo = family.who === 'parent' ? `${family.firstName(s.studentId)} 학생 수업` : '내 수업'
              const ok = await confirm({
                title: t('Cancel this class?', '이 수업을 취소할까요?'),
                description: t(
                  `${whose} on ${dateIn(s.dateKey, 'weekdayMedium', 'en')} at ${timeRangeIn(s.startMin, s.endMin, 'en')}. The academy is told, and a makeup can be asked for afterwards.`,
                  `${dateIn(s.dateKey, 'weekdayMedium', 'ko')} ${timeRangeIn(s.startMin, s.endMin, 'ko')} ${whoseKo}이에요. 취소하면 아카데미에 바로 알림이 가고, 보강은 나중에 신청할 수 있어요.`,
                ),
                confirmLabel: t('Cancel class', '수업 취소'),
                destructive: true,
              })
              if (!ok) return
              setCanceling(true)
              try {
                await cancelClass(branchId, s.id)
                toast.success(t('Class canceled', '수업을 취소했어요'), {
                  description: t('The academy has been told. Ask for a makeup from Classes when you’re ready.', '아카데미에 알렸어요. 보강은 원할 때 수업 탭에서 신청할 수 있어요.'),
                })
              } catch (e) {
                toast.error(t('The class wasn’t canceled', '수업을 취소하지 못했어요'), { description: requestError(e, t('Please try again.', '다시 시도해 주세요.')) })
              } finally {
                setCanceling(false)
              }
            }
            return (
              <div className="space-y-2.5">
                {moving?.status === 'offered' && moving.offer ? (
                  <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:bg-sky-950/60 dark:text-sky-200">
                    {t(
                      `To move it, the academy suggests ${classWhenIn(moving.offer, 'en')}: accept it or ask for another time at the top of Classes.`,
                      `아카데미가 다른 시간을 제안했어요: ${classWhenIn(moving.offer, 'ko')}. 수업 탭 맨 위에서 수락하거나 다른 시간을 신청해 주세요.`,
                    )}
                  </p>
                ) : moving ? (
                  <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
                    {t(
                      `Moving to ${dateIn(moving.dateKey, 'weekdayMedium', 'en')}, ${timeRangeIn(moving.startMin, moving.endMin, 'en')}: waiting for the academy.`,
                      `${dateIn(moving.dateKey, 'weekdayMedium', 'ko')} ${timeRangeIn(moving.startMin, moving.endMin, 'ko')} 수업으로 옮겨 달라고 신청했어요. 아카데미에서 확인하고 있어요.`,
                    )}
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {onAsk && !moving ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        onClose()
                        onAsk({ studentId: s.studentId, kind: 'reschedule', forSessionId: s.id, forDateKey: s.dateKey })
                      }}
                      data-testid="class-move"
                    >
                      <LuCalendarClock /> {t('Move to another time', '다른 시간으로 옮기기')}
                    </Button>
                  ) : null}
                  <Button variant="outline" className="text-destructive hover:text-destructive" disabled={!check.ok || canceling} onClick={() => void cancelIt()} data-testid="class-cancel">
                    <LuCalendarX /> {canceling ? t('Canceling…', '취소하는 중…') : t('Cancel class', '수업 취소')}
                  </Button>
                </div>
                {!check.ok ? <p className="text-sm text-muted-foreground">{cancelMessageIn(check, settings, lang)}</p> : null}
              </div>
            )
          })()}
          <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            {lang === 'ko' ? (
              `${hasEnded(s, now) || s.status === 'canceled' ? '이 수업이 궁금하면' : '다르게 바꾸고 싶으면'} ${branch.name}에 문의해 주세요.`
            ) : (
              <>
                {hasEnded(s, now) || s.status === 'canceled' ? 'A question about this class? Contact' : 'To change it some other way, contact'} {branch.name}
                {contact.phone || contact.email ? ':' : '.'}
              </>
            )}
            {contact.phone || contact.email ? (
              <span className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {contact.phone ? (
                  <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1.5 font-medium text-foreground hover:underline">
                    <LuPhone className="size-3.5" /> {contact.phone}
                  </a>
                ) : null}
                {contact.email ? (
                  <a href={`mailto:${contact.email}`} className="inline-flex items-center gap-1.5 font-medium break-all text-foreground hover:underline">
                    <LuMail className="size-3.5 shrink-0" /> {contact.email}
                  </a>
                ) : null}
              </span>
            ) : null}
          </div>
        </DialogContent>
      ) : null}
      {dialog}
    </Dialog>
  )
}

/** Everyone, or one child (parents with more than one child); one child at a time without `everyone` (Scores). */
export function KidFilter({ family, value, onChange, everyone = true }: { family: Family; value: string; onChange: (id: string) => void; everyone?: boolean }) {
  const t = useT()
  if (family.kids.length < 2) return null
  const chip = (id: string, label: React.ReactNode) => (
    <Button
      key={id}
      variant={value === id ? 'default' : 'outline'}
      size="sm"
      className="rounded-full"
      aria-pressed={value === id}
      onClick={() => onChange(id)}
    >
      {label}
    </Button>
  )
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Whose', '자녀 선택')}>
      {everyone ? chip('all', t('Everyone', '전체')) : null}
      {family.kids.map((k) =>
        chip(
          k.id,
          <>
            <KidMark name={family.firstName(k.id)} tint={family.tint(k.id)} className="-ml-1 size-5 text-[10px]" />
            {family.firstName(k.id)}
          </>,
        ),
      )}
    </div>
  )
}

/** The ways to reach the academy, as links; nothing when it hasn't set any. */
export function ContactLinks({ className }: { className?: string }) {
  const c = useAcademyContactDetails()
  if (!c.phone && !c.email && !c.address && !c.website) return null
  return (
    <ul className={cn('space-y-2 text-sm', className)}>
      {c.phone ? (
        <li>
          <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-2 hover:underline">
            <LuPhone className="size-4 shrink-0 text-muted-foreground" /> {c.phone}
          </a>
        </li>
      ) : null}
      {c.email ? (
        <li>
          <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-2 break-all hover:underline">
            <LuMail className="size-4 shrink-0 text-muted-foreground" /> {c.email}
          </a>
        </li>
      ) : null}
      {c.address ? (
        <li className="flex items-start gap-2">
          <LuMapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" /> {c.address}
        </li>
      ) : null}
      {c.website ? (
        <li>
          <a href={/^https?:/.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 break-all hover:underline">
            <LuExternalLink className="size-4 shrink-0 text-muted-foreground" /> {c.website.replace(/^https?:\/\//, '')}
          </a>
        </li>
      ) : null}
    </ul>
  )
}

/** "Contact Sky Arc Sports Academy" with its details; nothing when it hasn't set any. */
export function ContactCard({ title, hint }: { title?: string; hint?: string }) {
  const { branch } = useBranch()
  const t = useT()
  const c = useAcademyContactDetails()
  if (!c.phone && !c.email && !c.address && !c.website) return null
  return (
    <section className="rounded-xl border bg-card p-4" data-testid="family-contact">
      <h2 className="text-sm font-semibold">{title ?? t(`Contact ${branch.name}`, `${branch.name} 연락처`)}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{hint ?? t('Questions, or a class to change?', '궁금한 점이 있거나 수업을 바꾸고 싶으면 연락해 주세요.')}</p>
      <ContactLinks className="mt-3" />
    </section>
  )
}

/** No student to show yet: the account isn't linked to a record (or the record is gone). */
export function NotLinked({ family }: { family: Family }) {
  const { branch } = useBranch()
  const t = useT()
  return (
    <div className="space-y-4">
      <Empty className="border bg-card py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LuCalendarClock />
          </EmptyMedia>
          <EmptyTitle>{family.who === 'parent' ? t('No children linked yet', '아직 연결된 자녀가 없어요') : t('Your account isn’t linked yet', '아직 계정이 연결되지 않았어요')}</EmptyTitle>
          <EmptyDescription>
            {family.who === 'parent'
              ? t(
                  `Once ${branch.name} links your child to your account, their classes, scores and progress reports show here.`,
                  `${branch.name}에서 자녀를 계정에 연결하면 여기서 수업, 점수, 성장 리포트를 볼 수 있어요.`,
                )
              : t(
                  `Once ${branch.name} links your account to your student record, your classes, scores and progress reports show here.`,
                  `${branch.name}에서 계정을 학생 기록에 연결하면 여기서 수업, 점수, 성장 리포트를 볼 수 있어요.`,
                )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      <ContactCard
        title={t(`Ask ${branch.name}`, `${branch.name}에 문의`)}
        hint={family.who === 'parent' ? t('It links your child to your account.', '자녀를 계정에 연결해 드려요.') : t('It links your account to your student record.', '계정을 학생 기록에 연결해 드려요.')}
      />
    </div>
  )
}
