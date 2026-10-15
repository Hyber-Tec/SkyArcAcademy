import { LuPlus } from 'react-icons/lu'
import { SESSION_STATUSES } from '@shared/schedule/status'
import type { DateKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { SessionStatusBadge } from '@/components/app/SessionStatusBadge'
import { Button } from '@/components/ui/button'
import { StudentMonthCalendar } from '@/features/schedule/StudentMonthCalendar'

/**
 * Student page → Calendar: the student's sessions month by month (scrolling).
 * Admins click a day to create a session and a session to open it (date, time,
 * coach and status change there); coaches see their own sessions.
 */
export function StudentCalendarView({
  studentId,
  readOnly = false,
  onCreate,
  onOpen,
}: {
  studentId: string
  readOnly?: boolean
  onCreate?: (dateKey?: DateKey) => void
  onOpen?: (session: WithId<Session>) => void
}) {
  const { staffId } = useBranch()
  return (
    <div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <div className="flex flex-wrap gap-1.5" aria-label="Status colors">
            {SESSION_STATUSES.map((s) => (
              <SessionStatusBadge key={s} status={s} />
            ))}
          </div>
          {!readOnly && onCreate ? (
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => onCreate()}>
              <LuPlus /> New class
            </Button>
          ) : null}
        </div>
        <StudentMonthCalendar
          studentId={studentId}
          coachId={readOnly ? staffId : undefined}
          frameless
          className="h-[min(74svh,740px)]"
          onPickDay={readOnly ? undefined : (d) => onCreate?.(d)}
          onPickSession={readOnly ? undefined : onOpen}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {readOnly ? 'Your classes with this student · Scroll for other months.' : 'Click a day to create a class · Click a class to open it · Scroll for other months.'}
      </p>
    </div>
  )
}
