import { serverTimestamp, updateDoc } from 'firebase/firestore'
import { useEffect, useMemo, useRef } from 'react'
import type { IconType } from 'react-icons'
import { LuArrowLeft, LuCalendarDays, LuNotebookPen, LuTarget, LuUserRound } from 'react-icons/lu'
import { Link, useNavigate, useParams } from 'react-router'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { type DateKey, addDays } from '@shared/time'
import type { Student, StudentPrivateProfile, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useDayConfigs, useStaffList } from '@/features/data/hooks'
import { useSessionDialog } from '@/features/schedule/useSessionDialog'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import { studentPrivateRef } from './api'
import { InfoTab } from './InfoTab'
import { ScoresTab } from './ScoresTab'
import { IdentityColumn, type ProfileTab } from './profile/IdentityColumn'
import { useStudentActivity } from './profile/useStudentActivity'
import { SessionsTab } from './SessionsTab'
import { StudentCalendarView } from './StudentCalendarView'

const TABS: { key: ProfileTab; label: string; icon: IconType; adminOnly: boolean }[] = [
  { key: 'sessions', label: 'Classes', icon: LuNotebookPen, adminOnly: false },
  { key: 'scores', label: 'Scores', icon: LuTarget, adminOnly: false },
  { key: 'info', label: 'Info', icon: LuUserRound, adminOnly: false },
  { key: 'calendar', label: 'Calendar', icon: LuCalendarDays, adminOnly: false },
]

export function StudentProfilePage({ mode = 'admin' }: { mode?: 'admin' | 'coach' }) {
  const { studentId = '' } = useParams()
  const { branchId, actor } = useBranch()
  const ref = useMemo(() => branchDocRef(branchId, COL.students, studentId), [branchId, studentId])
  const { data: student, loading } = useDoc<Student>(ref)
  const isAdmin = mode === 'admin'
  const base = `/${mode}/students`

  // First time an admin opens a new student: mark it reviewed (Home "new students to follow up").
  const marked = useRef(false)
  useEffect(() => {
    if (!isAdmin || !student || student.followUpReviewedAt || marked.current) return
    marked.current = true
    void updateDoc(ref, { followUpReviewedAt: serverTimestamp(), updatedBy: actor.email }).catch(() => undefined)
  }, [isAdmin, student, ref, actor.email])

  if (loading) return <Skeleton className="h-96 w-full max-w-7xl rounded-xl" />
  if (!student) {
    return (
      <div className="text-sm text-muted-foreground">
        Student not found.{' '}
        <Link to={base} className="underline">
          Back to students
        </Link>
      </div>
    )
  }
  return <StudentProfile student={{ ...student, id: studentId }} mode={mode} base={base} />
}

/**
 * The student page: who the student is on the left (it stays in view), and the Sessions, Info and Calendar tabs on the
 * right.
 */
function StudentProfile({ student, mode, base }: { student: WithId<Student>; mode: 'admin' | 'coach'; base: string }) {
  const { tab = 'sessions' } = useParams()
  const navigate = useNavigate()
  const { branchId, settings } = useBranch()
  const isAdmin = mode === 'admin'
  const activity = useStudentActivity(student)
  const privRef = useMemo(() => (isAdmin ? studentPrivateRef(branchId, student.id) : null), [isAdmin, branchId, student.id])
  const { data: priv, loading: privLoading } = useDoc<StudentPrivateProfile>(privRef)
  // Coaches can't read the staff list, and only admins book (opening a class goes to it on the schedule, for both).
  const { data: staff } = useStaffList(isAdmin)
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff])
  const sessionDialog = useSessionDialog({ enabled: isAdmin })
  const { map: dayConfigs } = useDayConfigs(activity.today, addDays(activity.today, 30))

  const tabs = TABS.filter((t) => isAdmin || !t.adminOnly)
  const active = (tabs.some((t) => t.key === tab) ? tab : 'sessions') as ProfileTab
  const go = (t: ProfileTab, search = '') => navigate(`${base}/${student.id}/${t}${search}`, { replace: true })

  /** Books this student into a class: on a picked day, or the next open day. */
  const newSession = (dateKey?: DateKey) => {
    let d = dateKey ?? activity.today
    if (sessionDialog.isLocked(d)) return
    if (!dateKey) for (let i = 0; i < 14 && !dayHours(d, settings, dayConfigs).isOpen; i++) d = addDays(d, 1)
    sessionDialog.openCreate(student.id, d)
  }
  const openSession = (id: string) => {
    const s = activity.sessions.find((x) => x.id === id)
    if (s) sessionDialog.openEdit(s)
  }

  return (
    <div className="max-w-7xl">
      <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2.5">
        <Link to={base}>
          <LuArrowLeft /> Students
        </Link>
      </Button>
      <div className="grid gap-6 lg:grid-cols-[19.5rem_minmax(0,1fr)]">
        <IdentityColumn
          student={student}
          activity={activity}
          priv={priv ?? null}
          isAdmin={isAdmin}
          staffById={staffById}
          onTab={go}
          onNewSession={() => newSession()}
          onOpenSession={openSession}
        />
        <div className="@container min-w-0">
          {/* A narrow column (a phone, or a tablet beside the student's card): the tabs share the width, without icons, so
              none is cut off. */}
          <div className="grid gap-1 rounded-xl bg-muted p-1 @lg:inline-flex" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Student">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active === t.key}
                onClick={() => go(t.key)}
                className={cn(
                  'inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded-lg px-1 text-sm font-medium whitespace-nowrap transition @lg:shrink-0 @lg:px-3.5 [&_svg]:size-4',
                  active === t.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <t.icon className="hidden @lg:block" />
                {t.label}
              </button>
            ))}
          </div>
          <div className="mt-5">
            {active === 'sessions' ? (
              <SessionsTab activity={activity} onOpenSession={openSession} />
            ) : null}
            {active === 'scores' ? <ScoresTab student={student} mode={mode} /> : null}
            {active === 'info' ? <InfoTab key={student.id} student={student} readOnly={!isAdmin} priv={priv ?? null} privLoading={privLoading} /> : null}
            {active === 'calendar' ? (
              <StudentCalendarView studentId={student.id} readOnly={!isAdmin} onCreate={(d) => newSession(d)} onOpen={(s) => sessionDialog.openEdit(s)} />
            ) : null}
          </div>
        </div>
      </div>
      {isAdmin ? sessionDialog.element : null}
    </div>
  )
}

export function CoachStudentProfilePage() {
  return <StudentProfilePage mode="coach" />
}
