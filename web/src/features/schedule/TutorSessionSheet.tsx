import { LuGraduationCap, LuStickyNote, LuTriangleAlert } from 'react-icons/lu'
import { Link } from 'react-router'
import { type Conflict, tutorConflictText } from '@shared/schedule/conflicts'
import { formatDateKey, formatDuration, formatMinutes } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { StatePill } from '@/features/home/parts'
import { sessionState } from '@/features/tutor/sessionUi'
import { SESSION_CARD_STYLE } from './cardStyle'

/**
 * Phones: a tapped class opens as a sheet (as in the phone app) with its note, why it's waiting for the admin, and the
 * student button.
 */
export function TutorSessionSheet({
  session,
  onClose,
  today,
  nowMin,
  conflicts,
}: {
  session: WithId<Session> | null
  onClose: () => void
  today: string
  nowMin: number
  conflicts: Conflict[]
}) {
  const s = session
  const waiting = tutorConflictText(conflicts)
  const st = s ? sessionState(s, { today, nowMin, waiting }) : null
  return (
    <Sheet open={!!s} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85svh] gap-0 overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]">
        {s && st ? (
          <>
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/25" aria-hidden />
            <SheetHeader className="gap-1 px-5 pt-3 pb-4 text-left">
              <div className="flex items-center gap-2 pr-8">
                <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: SESSION_CARD_STYLE[s.status]?.bar }} aria-hidden />
                <SheetTitle className="truncate text-lg">{s.studentName}</SheetTitle>
                {s.studentGrade ? <span className="shrink-0 text-sm text-muted-foreground">Grade {s.studentGrade}</span> : null}
              </div>
              <SheetDescription className="tabular-nums">
                {formatDateKey(s.dateKey, 'weekdayLong').replace(/, \d{4}$/, '')} · {formatMinutes(s.startMin)} – {formatMinutes(s.endMin)} · {formatDuration(s.endMin - s.startMin)}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-3 px-5 pb-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <StatePill tone={st.tone} pulse={st.pulse}>
                  {st.label}
                </StatePill>
              </div>
              {waiting ? (
                <p className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                  <LuTriangleAlert className="mt-0.5 size-4 shrink-0 text-red-600" />
                  <span>
                    <span className="font-semibold">Not confirmed:</span> {waiting}
                  </span>
                </p>
              ) : null}
              {s.note ? (
                <p className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
                  <LuStickyNote className="mt-0.5 size-4 shrink-0" />
                  {s.note}
                </p>
              ) : null}
            </div>
            <div className="grid gap-2 border-t px-5 py-4">
              <Button size="lg" variant="ghost" asChild>
                <Link to={`/tutor/students/${s.studentId}`} onClick={onClose}>
                  <LuGraduationCap /> Student profile
                </Link>
              </Button>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
