import { query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { LuArrowRight, LuCalendarPlus, LuMail, LuPhone } from 'react-icons/lu'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { formatPhone, gradeLabel } from '@shared/people'
import { coachesIn } from '@shared/schedule/classes'
import { formatDateKey } from '@shared/time'
import type { Availability, Session, Staff, Student, StudentPrivateProfile, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { StudentStatusBadge } from '@/components/app/StatusBadge'
import { SessionStatusBadge } from '@/components/app/SessionStatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { StudentContractCard } from '@/features/contracts/StudentContractCard'
import { useDayConfigs } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { FamilyCard } from './FamilyCard'
import { initialsOf, timeSpan } from './model'
import type { StudentActivity } from './useStudentActivity'

export type ProfileTab = 'sessions' | 'scores' | 'info' | 'calendar' | 'drive'

const actionClass = 'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border py-2.5 text-[11px] font-medium text-muted-foreground transition hover:bg-muted/50 hover:text-foreground [&_svg]:size-[18px] [&_svg]:text-foreground'

/**
 * The student page's left column: who the student is, quick actions, attendance, the next class (with the coaches in
 * at its time) and family. It stays in view while the tabs change.
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
  /** The staff list (admins only): names, and who teaches. */
  staffById: Map<string, WithId<Staff>>
  /** `search`: e.g. "?edit=family", which opens Info's form at the parents. */
  onTab: (tab: ProfileTab, search?: string) => void
  onNewSession: () => void
  onOpenSession: (id: string) => void
}) {
  const { attendance, next } = activity
  const coaches = useCoachesIn(next, isAdmin ? staffById : null)
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
            {student.rifle ? <Badge variant="outline">Rifle {student.rifle}</Badge> : null}
            {student.program ? <Badge variant="secondary">{student.program}</Badge> : null}
          </div>
          {actions.length ? (
            <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(2, actions.length)}, minmax(0, 1fr))` }}>
              {actions}
            </div>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 border-t text-center">
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
              <span className="font-medium tracking-wide uppercase">Next class</span>
              <SessionStatusBadge status={next.status} />
            </div>
            <div className="mt-3 text-lg font-semibold">{formatDateKey(next.dateKey, 'weekdayLong').replace(/, \d{4}$/, '')}</div>
            <div className="text-sm text-zinc-300">
              {timeSpan(next.startMin, next.endMin)}
              {next.note ? ` · ${next.note}` : ''}
            </div>
            <div className="mt-3 flex items-center gap-2 text-sm">
              {/* The coaches in at that time teach it. */}
              <span className={cn('min-w-0 truncate', !coaches.length && 'text-zinc-400')} title={coaches.map((k) => k.name).join(', ')}>
                {coaches.length ? `With ${coaches.map((k) => k.name.split(' ')[0]).join(', ')}` : 'No coach in yet'}
              </span>
              <button type="button" className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium text-zinc-300 hover:text-white" onClick={() => onOpenSession(next.id)}>
                Open <LuArrowRight className="size-3.5" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Next class</div>
            <div className="mt-2 text-sm text-zinc-300">Nothing booked yet.</div>
            {isAdmin ? (
              <Button size="sm" variant="secondary" className="mt-3" onClick={onNewSession}>
                <LuCalendarPlus /> Book a class
              </Button>
            ) : null}
          </>
        )}
      </div>

      {isAdmin ? <FamilyCard student={student} priv={priv} onEdit={() => onTab('info', '?edit=family')} /> : null}

      {/* The enrollment contract (F4): owners and admins send it from here and see where it stands. */}
      {isAdmin ? <StudentContractCard student={student} priv={priv} /> : null}
    </aside>
  )
}

/**
 * Who teaches a class: the coaches in at its time that day (their availability), named from the staff list when the
 * viewer has it (admins), else from the day's records.
 */
function useCoachesIn(s: WithId<Session> | null, staffById: Map<string, WithId<Staff>> | null): { id: string; name: string }[] {
  const { branchId, settings } = useBranch()
  const day = s?.dateKey ?? null
  const q = useMemo(() => (day ? query(branchCol(branchId, COL.availability), where('dateKey', '==', day)) : null), [branchId, day])
  const { data } = useQuery<Availability>(q, `student-next-in-${branchId}-${day}`)
  const { map: dayConfigs } = useDayConfigs(day ?? '', day ?? '', { enabled: !!day })
  return useMemo(() => {
    if (!s) return []
    // Admins know who teaches (active coaches); a coach, or the list still loading, goes by each record's role.
    const staff = staffById?.size ? staffById : null
    const isCoach = (id: string) => !staff || (staff.get(id)?.role === 'coach' && staff.get(id)?.status === 'active')
    return coachesIn(s, data, dayHours(s.dateKey, settings, dayConfigs), isCoach).map((k) => ({ id: k.staffId, name: staff?.get(k.staffId)?.name ?? (k.name || 'Coach') }))
  }, [s, data, settings, dayConfigs, staffById])
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
