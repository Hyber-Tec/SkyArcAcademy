import { useLayoutEffect, useMemo, useRef } from 'react'
import { LuCalendarClock, LuChevronRight, LuExternalLink, LuMail, LuMapPin, LuPhone, LuStickyNote } from 'react-icons/lu'
import { type TrendLevel, trendLabel } from '@shared/reports/types'
import { familyNote, familyStatusLabel } from '@shared/schedule/family'
import type { SessionStatus } from '@shared/settings/defaults'
import { type DateKey, formatDateKey, formatDuration, formatTimeRange } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { type Tone, StatePill } from '@/features/home/parts'
import { TREND_STYLE } from '@/features/reports/model'
import { cn } from '@/lib/utils'
import { type Family, dayTitle, hasEnded, useAcademyContactDetails } from './data'

const STATUS_TONE: Record<SessionStatus, Tone> = { pending: 'muted', confirmed: 'live', present: 'done', no_show: 'warn', canceled: 'danger' }

/** A class's status in plain words ("Scheduled", "Attended", "Not marked yet"). */
export function FamilyStatus({ session: s, now }: { session: Pick<Session, 'status' | 'endAt'>; now: number }) {
  const ended = hasEnded(s, now)
  const unmarked = ended && (s.status === 'pending' || s.status === 'confirmed')
  return <StatePill tone={unmarked ? 'muted' : STATUS_TONE[s.status]}>{familyStatusLabel(s.status, ended)}</StatePill>
}

const TREND_TONE: Record<TrendLevel, Tone> = { improving: 'live', steady: 'done', dipping: 'warn' }

/** A report's trend in the family's words, in the app's light and dark colors (the report's own chip is for paper). */
export function FamilyTrend({ level }: { level: TrendLevel }) {
  const Icon = TREND_STYLE[level].icon
  return (
    <StatePill tone={TREND_TONE[level]}>
      <Icon className="size-3.5" /> {trendLabel(level, 'family')}
    </StatePill>
  )
}

/** The class's note ("Makeup for 10/12", "Trial 1"); staff write it for the family to read. */
export function NoteChip({ note, className }: { note: string; className?: string }) {
  const text = familyNote(note)
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
        <section key={d} aria-label={formatDateKey(d, 'weekdayLong')}>
          <h3 className={cn('border-b bg-muted/40 px-4 py-1.5 text-xs font-semibold', d === today ? 'text-foreground' : 'text-muted-foreground')}>{dayTitle(d, today)}</h3>
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

/** One class in a list: its time, whose it is, the coach, the note and the status; opens the details. */
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
  const canceled = s.status === 'canceled'
  const time = formatTimeRange(s.startMin, s.endMin)
  return (
    <button
      type="button"
      onClick={() => onOpen(s)}
      className={cn('flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 sm:items-center sm:gap-4', className)}
      data-testid="family-class"
    >
      <div className={cn('hidden w-40 shrink-0 text-sm font-medium tabular-nums sm:block', canceled && 'text-muted-foreground line-through')}>{time}</div>
      <div className="min-w-0 flex-1">
        {/* Phones: the time and the status on the first line, so whose class it is gets the whole width below. */}
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
              <span className="min-w-0 text-muted-foreground sm:truncate">with {s.coachName}</span>
            </>
          ) : (
            <span className="min-w-0 sm:truncate">
              with {s.coachName}
              <span className="text-muted-foreground"> · {formatDuration(s.endMin - s.startMin)}</span>
            </span>
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

/** A class's details, from any list or the month calendar. Families can't change classes: the academy does. */
export function ClassDetails({ session: s, family, now, onClose }: { session: WithId<Session> | null; family: Family; now: number; onClose: () => void }) {
  const { branch } = useBranch()
  const contact = useAcademyContactDetails()
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
            <DialogTitle>{formatDateKey(s.dateKey, 'weekdayLong').replace(/, \d{4}$/, '')}</DialogTitle>
            <DialogDescription>{family.who === 'parent' ? `${s.studentName}’s class` : 'Your class'}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Time</dt>
            <dd className="tabular-nums">
              {formatTimeRange(s.startMin, s.endMin)} <span className="text-muted-foreground">· {formatDuration(s.endMin - s.startMin)}</span>
            </dd>
            <dt className="text-muted-foreground">Coach</dt>
            <dd>{s.coachName || '—'}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <FamilyStatus session={s} now={now} />
            </dd>
            {s.note ? (
              <>
                <dt className="text-muted-foreground">Note</dt>
                <dd className="break-words">{familyNote(s.note)}</dd>
              </>
            ) : null}
          </dl>
          <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            {hasEnded(s, now) || s.status === 'canceled' ? 'A question about this class? Contact' : 'To change or cancel this class, contact'} {branch.name}
            {contact.phone || contact.email ? ':' : '.'}
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
    </Dialog>
  )
}

/** Everyone, or one child (parents with more than one child); one child at a time without `everyone` (Scores). */
export function KidFilter({ family, value, onChange, everyone = true }: { family: Family; value: string; onChange: (id: string) => void; everyone?: boolean }) {
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
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Whose">
      {everyone ? chip('all', 'Everyone') : null}
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
export function ContactCard({ title, hint = 'Questions, or a class to change?' }: { title?: string; hint?: string }) {
  const { branch } = useBranch()
  const c = useAcademyContactDetails()
  if (!c.phone && !c.email && !c.address && !c.website) return null
  return (
    <section className="rounded-xl border bg-card p-4" data-testid="family-contact">
      <h2 className="text-sm font-semibold">{title ?? `Contact ${branch.name}`}</h2>
      <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>
      <ContactLinks className="mt-3" />
    </section>
  )
}

/** No student to show yet: the account isn't linked to a record (or the record is gone). */
export function NotLinked({ family }: { family: Family }) {
  const { branch } = useBranch()
  return (
    <div className="space-y-4">
      <Empty className="border bg-card py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LuCalendarClock />
          </EmptyMedia>
          <EmptyTitle>{family.who === 'parent' ? 'No children linked yet' : 'Your account isn’t linked yet'}</EmptyTitle>
          <EmptyDescription>
            {family.who === 'parent'
              ? `Once ${branch.name} links your child to your account, their classes, scores and progress reports show here.`
              : `Once ${branch.name} links your account to your student record, your classes, scores and progress reports show here.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      <ContactCard title={`Ask ${branch.name}`} hint={family.who === 'parent' ? 'It links your child to your account.' : 'It links your account to your student record.'} />
    </div>
  )
}
