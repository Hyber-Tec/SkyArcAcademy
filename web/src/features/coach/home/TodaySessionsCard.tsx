import { useState } from 'react'
import { LuCalendarDays, LuGraduationCap, LuStickyNote } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router'
import { coachConflictText } from '@shared/schedule/conflicts'
import { formatDateKey, formatMinutes } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { gradeLabel } from '@shared/people'
import { ContextMenuFor, menu } from '@/components/app/ItemMenu'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatePill, plural } from '@/features/home/parts'
import { cn } from '@/lib/utils'
import { sessionState } from '../sessionUi'
import type { CoachDay } from './useCoachDay'

/** Today's classes in time order with a "now" line; a row opens the student's profile. */
export function TodaySessionsCard({ t }: { t: CoachDay }) {
  const navigate = useNavigate()
  const [showCanceled, setShowCanceled] = useState(false)
  const coach = `/coach`
  const rows = t.day.active
  const canceled = t.day.canceled
  // The red line sits before the first session that hasn't started.
  const firstLater = rows.findIndex((s) => s.startMin > t.nowMin)
  const lineAt = rows.length === 0 ? -1 : firstLater === -1 ? rows.length : firstLater

  const row = (s: WithId<Session>, muted = false) => {
    const waiting = coachConflictText(t.conflictsOf(s.id))
    const st = sessionState(s, { today: t.today, nowMin: t.nowMin, waiting })
    const openStudent = () => navigate(`${coach}/students/${s.studentId}`)
    return (
      <ContextMenuFor
        key={s.id}
        entries={menu(
          { kind: 'label', label: `${s.studentName} · ${formatMinutes(s.startMin)}` },
          { label: 'Open student profile', icon: LuGraduationCap, onSelect: openStudent },
          { label: 'Open in schedule', icon: LuCalendarDays, onSelect: () => navigate(`${coach}/schedule?date=${s.dateKey}`) },
        )}
      >
        <li className={cn('group relative', muted && 'opacity-60')}>
          <div
            role="button"
            tabIndex={0}
            onClick={openStudent}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openStudent()
              }
            }}
            data-testid="today-session"
            className="grid cursor-pointer grid-cols-[4.25rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
          >
            <div className="text-sm leading-tight tabular-nums">
              <div className="font-medium">{formatMinutes(s.startMin)}</div>
              <div className="text-xs text-muted-foreground">{formatMinutes(s.endMin)}</div>
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium">
                {s.studentName}
                {s.studentGrade ? <span className="font-normal text-muted-foreground"> · {gradeLabel(s.studentGrade)}</span> : null}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                {s.note ? (
                  <span className="flex min-w-0 items-center gap-1 text-blue-700 dark:text-blue-300" title={`Note: ${s.note}`}>
                    <LuStickyNote className="size-3 shrink-0" />
                    <span className="hidden truncate sm:inline">{s.note}</span>
                  </span>
                ) : null}
              </div>
            </div>
            <StatePill tone={st.tone} pulse={st.pulse} title={st.title}>
              {st.label}
            </StatePill>
          </div>
        </li>
      </ContextMenuFor>
    )
  }

  const nowLine = (
    <li key="now" className="flex items-center gap-2 px-4 py-1" aria-label={`Now, ${formatMinutes(t.nowMin)}`} data-testid="today-now-line">
      <span className="text-[11px] font-semibold text-red-600 tabular-nums">{formatMinutes(t.nowMin)}</span>
      <span className="h-px flex-1 bg-red-400/70" />
    </li>
  )

  const next = t.day.next
  return (
    <section className="overflow-hidden rounded-xl border bg-card" data-testid="today-sessions">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-sm font-semibold">
          Today’s classes <span className="ml-1 font-normal text-muted-foreground">{t.loading ? '' : rows.length}</span>
        </h2>
        <Link to={`${coach}/schedule`} className="text-xs font-medium text-muted-foreground hover:text-foreground">
          Week view →
        </Link>
      </div>
      {t.loading ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-8 w-14" />
              <Skeleton className="h-8 flex-1" />
              <Skeleton className="h-5 w-20" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 && !showCanceled ? (
        <div className="flex flex-col items-center gap-1.5 px-4 py-10 text-center">
          <LuCalendarDays className="mb-1 size-6 text-muted-foreground/70" />
          <p className="text-sm font-medium">{canceled.length ? 'Today’s classes were canceled.' : 'No classes today.'}</p>
          {next.kind === 'day' ? (
            <p className="text-sm text-muted-foreground">
              Your next {next.sessions.length === 1 ? 'class is' : 'classes are'} on {formatDateKey(next.dateKey, 'weekdayMedium')}.
            </p>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y">
          {rows.map((s, i) => [i === lineAt ? nowLine : null, row(s)])}
          {rows.length > 0 && lineAt === rows.length ? nowLine : null}
          {showCanceled ? canceled.map((s) => row(s, true)) : null}
        </ul>
      )}
      {!t.loading && canceled.length > 0 ? (
        <div className="border-t p-1.5">
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setShowCanceled(!showCanceled)}>
            {showCanceled ? 'Hide canceled' : `${plural(canceled.length, 'canceled class')}`}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
