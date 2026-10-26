import { LuCalendarClock, LuCalendarDays, LuChevronRight, LuSparkles, LuStickyNote } from 'react-icons/lu'
import { Link } from 'react-router'
import { takesSeat } from '@shared/schedule/classes'
import { isFirstSession } from '@shared/schedule/firstSession'
import { addDays, formatDateKey, formatDuration, formatMinutes } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatePill, nameList, plural } from '@/features/home/parts'
import { KindTag, LevelChip, SeatCount, StatusDot, gradeLabel } from '@/features/schedule/seatParts'
import type { ClassView } from '@/features/schedule/useClassData'
import { cn } from '@/lib/utils'
import { leftText, untilText } from '../sessionUi'
import type { CoachDay } from './useCoachDay'

/**
 * The class that matters now: the one in progress (with what's left and what comes after), else the next one today
 * with a countdown, else the next day with classes in the coach's hours. Each with its students and who else is in.
 */
export function NextUpCard({ t }: { t: CoachDay }) {
  const { settings } = useBranch()
  const next = t.day.next
  const coach = `/coach`

  if (t.loading) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-5 h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-72" />
      </section>
    )
  }

  if (next.kind === 'none') {
    return (
      <section className="rounded-xl border bg-card p-5" data-testid="next-up">
        <Eyebrow>Next up</Eyebrow>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <LuCalendarClock className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold">No classes in the next two weeks</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Your classes are the ones in your hours. Keep your availability set at least {settings.availability.leadTimeDays} days ahead.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to={`${coach}/availability`}>Set availability</Link>
          </Button>
        </div>
      </section>
    )
  }

  const first = next.classes[0].c
  const header =
    next.kind === 'now' ? (
      <>
        <Eyebrow tone="live">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Now
          <span className="font-normal text-muted-foreground">
            {next.classes.length > 1 ? `· ${next.classes.length} classes` : `· ends at ${formatMinutes(first.endMin)}`}
          </span>
        </Eyebrow>
        <span className="text-sm font-medium text-muted-foreground tabular-nums">{leftText(Math.min(...next.classes.map((v) => v.c.endMin)) - t.nowMin)}</span>
      </>
    ) : next.kind === 'later' ? (
      <>
        <Eyebrow>
          Next up <span className="font-normal text-muted-foreground">· {untilText(next.startMin - t.nowMin)}</span>
        </Eyebrow>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatMinutes(next.startMin)}</span>
      </>
    ) : (
      <>
        <Eyebrow>
          Next up{' '}
          <span className="font-normal text-muted-foreground">
            · {next.dateKey === addDays(t.today, 1) ? 'Tomorrow' : formatDateKey(next.dateKey, 'weekdayLong').replace(/, \d{4}$/, '')}
          </span>
        </Eyebrow>
        <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatMinutes(first.startMin)}</span>
      </>
    )

  // How far the first class in progress has run.
  const progress = next.kind === 'now' ? Math.min(1, Math.max(0, (t.nowMin - first.startMin) / Math.max(1, first.endMin - first.startMin))) : null
  // A day ahead shows its first class; the others are in the footer.
  const shown = next.kind === 'day' ? next.classes.slice(0, 1) : next.classes

  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="next-up" aria-label="Next up">
      <div className="flex items-center justify-between gap-3 px-5 pt-4">{header}</div>
      {progress !== null ? (
        <div className="mx-5 mt-3 h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-700" style={{ width: `${progress * 100}%` }} />
        </div>
      ) : null}
      <ul className="mt-3 divide-y">
        {shown.map((v) => (
          <NextClass key={v.c.id} v={v} t={t} />
        ))}
      </ul>
      {next.kind === 'now' && next.then ? (
        <Footer>
          Then at <span className="font-medium text-foreground tabular-nums">{formatMinutes(next.then.c.startMin)}</span> · {plural(next.then.taken, 'student')}
        </Footer>
      ) : null}
      {next.kind === 'day' ? (
        <Footer
          action={
            <Link to={`${coach}/schedule/day/${next.dateKey}`} className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
              <LuCalendarDays className="size-3.5" /> Open in schedule
            </Link>
          }
        >
          {plural(next.classes.length, 'class')} that day, {formatMinutes(first.startMin)} – {formatMinutes(Math.max(...next.classes.map((v) => v.c.endMin)))}
        </Footer>
      ) : null}
    </section>
  )
}

/** One class: its time and seats, who else is in, the note for the coaches, and its students. */
function NextClass({ v, t }: { v: ClassView; t: CoachDay }) {
  const { settings } = useBranch()
  const { c } = v
  const others = v.coaches.filter((k) => k.staffId !== t.staffId).map((k) => k.name || 'Coach')
  // Canceled students last: they free their seat.
  const seats = [...v.seats.filter(takesSeat), ...v.seats.filter((s) => !takesSeat(s))]
  return (
    <li className="px-5 py-4" data-testid="next-class">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-lg leading-tight font-semibold tabular-nums">
          {formatMinutes(c.startMin)} – {formatMinutes(c.endMin)}
        </h2>
        <span className="text-sm text-muted-foreground">{formatDuration(c.endMin - c.startMin)}</span>
        <SeatCount used={v.taken} of={c.seats} className="ml-auto" />
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{others.length ? `With ${nameList(others, 3)}` : 'No other coach in'}</p>
      {c.note ? (
        <p className="mt-2.5 flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
          <LuStickyNote className="mt-0.5 size-3.5 shrink-0" />
          {c.note}
        </p>
      ) : null}
      {seats.length ? (
        <ul className="mt-3 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {seats.map((s) => (
            <NextStudent key={s.id} s={s} t={t} levels={settings.students.levels} firstOn={settings.schedule.alerts.firstSession} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No students in this class yet.</p>
      )}
      <div className="mt-3">
        <Button variant="ghost" size="sm" className="-ml-2.5 text-muted-foreground" asChild>
          <Link to={`/coach/schedule/day/${c.dateKey}?class=${c.id}`}>
            Open the class <LuChevronRight />
          </Link>
        </Button>
      </div>
    </li>
  )
}

function NextStudent({ s, t, levels, firstOn }: { s: WithId<Session>; t: CoachDay; levels: readonly string[]; firstOn: boolean }) {
  const student = t.student(s.studentId)
  const away = !takesSeat(s)
  // The schedule bell's "First class" notice, from the same rule.
  const first = firstOn && !!student && isFirstSession(s, student, t.seats)
  return (
    <li className={cn('flex min-w-0 items-center gap-2 py-1', away && 'opacity-60')}>
      <Link to={`/coach/students/${s.studentId}`} className={cn('min-w-0 truncate text-sm font-medium hover:underline', away && 'line-through')}>
        {s.studentName}
      </Link>
      <StatusDot status={s.status} />
      {s.studentGrade ? <span className="shrink-0 text-xs text-muted-foreground">{gradeLabel(s.studentGrade)}</span> : null}
      <LevelChip level={student?.level ?? null} levels={levels} rifle={student?.rifle} short />
      <KindTag note={s.note} />
      {first ? (
        <StatePill tone="info">
          <LuSparkles className="size-3" /> First class
        </StatePill>
      ) : null}
    </li>
  )
}

function Eyebrow({ children, tone }: { children: React.ReactNode; tone?: 'live' }) {
  return (
    <span className={cn('flex items-center gap-2 text-sm font-semibold', tone === 'live' ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground')}>
      {children}
    </span>
  )
}

function Footer({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/30 px-5 py-2.5 text-sm text-muted-foreground">
      <span className="min-w-0">{children}</span>
      {action}
    </div>
  )
}
