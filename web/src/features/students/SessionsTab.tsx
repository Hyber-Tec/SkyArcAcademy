import { useMemo, useState } from 'react'
import { LuChevronDown } from 'react-icons/lu'
import { MAKEUP_LOOKBACK_DAYS, makeupsLost, makeupsOwed } from '@shared/schedule/classes'
import { SESSION_STATUS_STYLE } from '@shared/schedule/status'
import { addDays, formatDateKey, formatMinutes } from '@shared/time'
import { SessionStatusBadge } from '@/components/app/SessionStatusBadge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { timeSpan } from './profile/model'
import type { StudentActivity } from './profile/useStudentActivity'

const SCHEDULE_STEP = 7

/** Student page → Classes: the student's upcoming and past classes, each with its label (make-up, trial…); one opens its class. */
export function SessionsTab({ activity, onOpenSession }: { activity: StudentActivity; onOpenSession: (id: string) => void }) {
  const { sessions, today, nowMin } = activity
  const [when, setWhen] = useState<'up' | 'past'>('up')
  const [schedShown, setSchedShown] = useState(SCHEDULE_STEP)
  const happened = (s: { dateKey: string; endMin: number }) => s.dateKey < today || (s.dateKey === today && s.endMin <= nowMin)
  const schedule = when === 'up' ? sessions.filter((s) => !happened(s)) : sessions.filter(happened).reverse()
  // Makeups (docs/DECISIONS.md §23): a canceled or missed class is owed one; a makeup missed too is lost.
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS)
  const owed = useMemo(() => makeupsOwed(sessions, since), [sessions, since])
  const lost = useMemo(() => makeupsLost(sessions, since), [sessions, since])

  return (
    <div className="space-y-4">
      {owed.length || lost.length ? (
        <div className="rounded-xl border bg-card px-5 py-3.5 text-sm" data-testid="student-makeups">
          <h2 className="text-base font-semibold">Makeups</h2>
          {owed.length ? (
            <p className="mt-1.5">
              <span className="font-medium">Owed:</span>{' '}
              {owed.map((m) => `${formatDateKey(m.dateKey, 'monthDay')} at ${formatMinutes(m.startMin)} (${m.status === 'no_show' ? 'no-show' : 'canceled'})`).join(', ')}
            </p>
          ) : null}
          {lost.length ? (
            <p className="mt-1 text-muted-foreground">
              <span className="font-medium text-foreground">Lost:</span> {lost.map((m) => `${m.note} missed on ${formatDateKey(m.dateKey, 'monthDay')}`).join(', ')}. A missed makeup isn’t made up again.
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border bg-card" data-testid="student-schedule">
        <div className="flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-base font-semibold">Scheduled classes</h2>
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs" role="group" aria-label="Which classes">
            {(
              [
                ['up', 'Upcoming'],
                ['past', 'Past'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={when === v}
                onClick={() => {
                  setWhen(v)
                  setSchedShown(SCHEDULE_STEP)
                }}
                className={cn('h-7 rounded-md px-2.5 font-medium whitespace-nowrap', when === v ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {schedule.length ? (
          <ol className="px-5 py-4">
            {schedule.slice(0, schedShown).map((s, i, list) => {
              const st = SESSION_STATUS_STYLE[s.status]
              return (
                <li key={s.id} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < list.length - 1 ? <span className="absolute top-6 bottom-0 left-[11px] w-px bg-border" /> : null}
                  <span className="relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-card" style={{ backgroundColor: st.bg, boxShadow: `0 0 0 1px ${st.border}` }}>
                  </span>
                  <button type="button" onClick={() => onOpenSession(s.id)} className="min-w-0 flex-1 rounded-lg px-2 py-0.5 text-left hover:bg-muted/50">
                    {/* Phones: the date as the title and the time under it, rather than the line cut off. */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 truncate text-sm font-medium">
                        {formatDateKey(s.dateKey, 'weekdayMedium')}
                        <span className="hidden sm:inline"> · {timeSpan(s.startMin, s.endMin)}</span>
                      </div>
                      <SessionStatusBadge status={s.status} />
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      <span className="sm:hidden">{timeSpan(s.startMin, s.endMin)}</span>
                      {s.note ? (
                        <>
                          <span className="sm:hidden"> · </span>
                          {s.note}
                        </>
                      ) : null}
                    </div>
                  </button>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {when === 'up' ? 'No upcoming classes.' : 'No past classes.'}
          </p>
        )}
        {schedule.length > schedShown ? (
          <div className="border-t p-2 text-center">
            <Button variant="ghost" size="sm" onClick={() => setSchedShown((n) => n + SCHEDULE_STEP)}>
              <LuChevronDown /> Show more
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
