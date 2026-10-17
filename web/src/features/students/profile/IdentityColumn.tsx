import { LuArrowRight, LuCalendarPlus, LuMail, LuPhone } from 'react-icons/lu'
import { formatPhone, gradeLabel } from '@shared/people'
import { formatDateKey } from '@shared/time'
import type { Staff, Student, StudentPrivateProfile, WithId } from '@shared/types'
import { StudentStatusBadge } from '@/components/app/StatusBadge'
import { SessionStatusBadge } from '@/components/app/SessionStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { initialsOf, timeSpan } from './model'
import type { StudentActivity } from './useStudentActivity'

export type ProfileTab = 'sessions' | 'scores' | 'info' | 'calendar'

const actionClass = 'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border py-2.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground [&_svg]:size-[18px] [&_svg]:text-foreground'

/**
 * The student page's left column: who the student is, quick actions, attendance, the next session, family and coaches.
 * It stays in view while the tabs change.
 */
export function IdentityColumn({
  student,
  activity,
  priv,
  isAdmin,
  staffById,
  onTab,
  onNewSession,
  onOpenSession,
}: {
  student: WithId<Student>
  activity: StudentActivity
  /** Contact details (admins only). */
  priv: StudentPrivateProfile | null
  isAdmin: boolean
  staffById: Map<string, WithId<Staff>>
  onTab: (tab: ProfileTab) => void
  onNewSession: () => void
  onOpenSession: (id: string) => void
}) {
  const { attendance, next } = activity
  const upcoming = activity.sessions.filter(
    (s) => s.status !== 'canceled' && (s.dateKey > activity.today || (s.dateKey === activity.today && s.endMin > activity.nowMin)),
  ).length
  const first = student.firstName || student.name.split(' ')[0]
  const emails = priv
    ? [
        ...(priv.email ? [{ label: `${first} (student)`, value: priv.email }] : []),
        ...priv.parents.filter((p) => p.email).map((p) => ({ label: `${p.name}${p.relation ? ` (${p.relation})` : ''}`, value: p.email })),
      ]
    : []
  const phones = priv
    ? [
        ...(priv.phone ? [{ label: `${first} (student)`, value: priv.phone }] : []),
        ...priv.parents.filter((p) => p.phone).map((p) => ({ label: `${p.name}${p.relation ? ` (${p.relation})` : ''}`, value: p.phone })),
      ]
    : []
  const actions = [
    isAdmin ? (
      <button key="session" type="button" className={actionClass} onClick={onNewSession}>
        <LuCalendarPlus />
        Class
      </button>
    ) : null,
    emails.length ? (
      <ContactMenu key="email" icon={<LuMail />} label="Email" title="Send an email" items={emails.map((e) => ({ ...e, href: `mailto:${e.value}` }))} all={emails.length > 1 ? `mailto:${emails.map((e) => e.value).join(',')}` : null} />
    ) : null,
    phones.length ? <ContactMenu key="call" icon={<LuPhone />} label="Call" title="Call" items={phones.map((p) => ({ ...p, value: formatPhone(p.value), href: `tel:${p.value.replace(/[^\d+]/g, '')}` }))} all={null} /> : null,
  ].filter(Boolean)

  return (
    <aside className="min-w-0 space-y-4 lg:sticky lg:top-6 lg:self-start" data-testid="student-identity">
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="h-20 bg-gradient-to-r from-zinc-200 via-zinc-50 to-red-50 dark:from-zinc-800 dark:via-zinc-900 dark:to-red-950/40" />
        <div className="-mt-10 px-5 pb-5">
          <span className="flex size-[76px] items-center justify-center rounded-2xl bg-card p-1 shadow-sm ring-1 ring-border">
            <span className="flex size-full items-center justify-center rounded-xl bg-gradient-to-br from-zinc-700 to-black text-xl font-semibold text-white">{initialsOf(student.name)}</span>
          </span>
          <h1 className="mt-3 text-xl font-semibold tracking-tight">{student.name}</h1>
          <p className="text-sm text-muted-foreground">{[student.grade ? gradeLabel(student.grade) : null, student.school || null].filter(Boolean).join(' · ') || 'No grade or school yet'}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <StudentStatusBadge status={student.status} />
            {student.level ? <Badge variant="outline">{student.level}</Badge> : null}
            {student.program ? <Badge variant="secondary">{student.program}</Badge> : null}
          </div>
          {actions.length ? (
            <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(2, actions.length)}, minmax(0, 1fr))` }}>
              {actions}
            </div>
          ) : null}
        </div>
        {/* A coach sees only their own classes with the student, so the numbers say so. */}
        {isAdmin ? null : <p className="border-t px-5 pt-3 text-xs font-medium text-muted-foreground">Your classes with {first}</p>}
        <dl className={cn('grid grid-cols-2 text-center', isAdmin && 'border-t')}>
          <Stat label="Attended" value={String(attendance.attended)} className="border-r border-b" />
          <Stat label="Missed" value={String(attendance.missed)} className="border-b" />
          <Stat label="Attendance" value={attendance.percent !== null ? `${attendance.percent}%` : '—'} className="border-r" />
          <Stat label="Upcoming" value={String(upcoming)} />
        </dl>
        <dl className="hidden space-y-2 border-t px-5 py-4 text-sm sm:block">
          <DateRow label="Signed up" value={student.signUpDate} />
          <DateRow label="First class" value={student.firstSessionDate} />
          <DateRow label="Last class" value={student.lastSessionDate} />
        </dl>
      </div>

      <div className="rounded-xl bg-zinc-900 p-4 text-white shadow-sm dark:bg-zinc-800" data-testid="next-session">
        {next ? (
          <>
            <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
              <span className="font-medium tracking-wide uppercase">{isAdmin ? 'Next class' : 'Next class with you'}</span>
              <SessionStatusBadge status={next.status} />
            </div>
            <div className="mt-3 text-lg font-semibold">{formatDateKey(next.dateKey, 'weekdayLong').replace(/, \d{4}$/, '')}</div>
            <div className="text-sm text-zinc-300">
              {timeSpan(next.startMin, next.endMin)}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="flex size-6 items-center justify-center rounded-full bg-white/15 text-[10px] font-semibold">{initialsOf(next.coachName)}</span>
              <span className="truncate">{next.coachName}</span>
              {isAdmin ? (
                <button type="button" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-zinc-300 hover:text-white" onClick={() => onOpenSession(next.id)}>
                  Open <LuArrowRight className="size-3.5" />
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="text-xs font-medium tracking-wide text-zinc-400 uppercase">{isAdmin ? 'Next class' : 'Next class with you'}</div>
            <div className="mt-2 text-sm text-zinc-300">{isAdmin ? 'Nothing booked yet.' : 'Nothing booked with you.'}</div>
            {isAdmin ? (
              <Button size="sm" variant="secondary" className="mt-3" onClick={onNewSession}>
                <LuCalendarPlus /> Book a class
              </Button>
            ) : null}
          </>
        )}
      </div>

      {isAdmin ? (
        <div className="hidden rounded-xl border bg-card p-4 lg:block">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Family</h2>
            <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => onTab('info')}>
              Edit
            </button>
          </div>
          {priv?.parents.length ? (
            <ul className="space-y-3">
              {priv.parents.map((p, i) => (
                <li key={i} className="flex items-center gap-3">
                  <Avatar name={p.name || '?'} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{p.name || 'No name'}</div>
                    <div className="truncate text-xs text-muted-foreground">{[p.relation, p.phone ? formatPhone(p.phone) : null].filter(Boolean).join(' · ') || p.email}</div>
                  </div>
                  {p.email ? (
                    <a className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" href={`mailto:${p.email}`} aria-label={`Email ${p.name}`}>
                      <LuMail className="size-4" />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No parents or guardians yet.</p>
          )}
        </div>
      ) : null}

      {/* A coach sees only their own classes, so the list would only ever name them. */}
      {isAdmin && activity.coaches.length ? (
        <div className="hidden rounded-xl border bg-card p-4 lg:block">
          <h2 className="mb-3 text-sm font-semibold">Coaches</h2>
          <ul className="space-y-3">
            {activity.coaches.slice(0, 6).map((t) => (
              <li key={t.id} className="flex items-center gap-3">
                <Avatar name={t.name} color={staffById.get(t.id)?.color} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.name}</div>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{`${t.sessions} class${t.sessions === 1 ? '' : 'es'}`}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

    </aside>
  )
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn('px-3 py-3', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

function DateRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value ? formatDateKey(value, 'medium') : '—'}</dd>
    </div>
  )
}

export function Avatar({ name, color, className }: { name: string; color?: string; className?: string }) {
  const c = color ?? '#52525b'
  return (
    <span className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold', className)} style={{ backgroundColor: `${c}1f`, color: c }} title={name}>
      {initialsOf(name)}
    </span>
  )
}

/** Email or Call: one item opens directly; several open a menu of who to reach. */
function ContactMenu({ icon, label, title, items, all }: { icon: React.ReactNode; label: string; title: string; items: { label: string; value: string; href: string }[]; all: string | null }) {
  if (items.length === 1) {
    return (
      <a className={actionClass} href={items[0].href} title={`${title}: ${items[0].label}`}>
        {icon}
        {label}
      </a>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={actionClass}>
          {icon}
          {label}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{title}</DropdownMenuLabel>
        {items.map((it) => (
          <DropdownMenuItem key={it.href} asChild>
            <a href={it.href} className="flex flex-col items-start gap-0">
              <span className="text-sm">{it.label}</span>
              <span className="text-xs text-muted-foreground">{it.value}</span>
            </a>
          </DropdownMenuItem>
        ))}
        {all ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href={all}>Email everyone</a>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
