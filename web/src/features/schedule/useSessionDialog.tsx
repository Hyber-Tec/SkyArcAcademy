import { query, where } from 'firebase/firestore'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { dayHours } from '@shared/availability'
import { COL } from '@shared/paths'
import { makeupLabel, makeupsOwed, takesSeat } from '@shared/schedule/classes'
import { type DateKey, addDays, formatDateKey, formatTimeRange, todayKey } from '@shared/time'
import type { AcademyClass, Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { OptionPicker } from '@/components/app/OptionPicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useStudentList } from '@/features/data/hooks'
import { branchCol, useQuery } from '@/lib/firestore'
import { cn } from '@/lib/utils'
import type { ScheduleCtx } from './api'
import { addSeat } from './classApi'

interface Draft {
  studentId: string
  dateKey: DateKey
  classId: string | null
  label: string
  /** Picks the first class from this time on, until one is chosen. */
  near: number | null
}

/**
 * Booking a student into a class from outside the schedule (Home, a student's calendar): the day's classes with a seat
 * free, and the label (a make-up names the class it makes up). Opening a booked class goes to it on the schedule.
 */
export function useSessionDialog({ source = 'student_calendar', enabled = true }: { source?: Session['source']; enabled?: boolean } = {}) {
  const { branchId, actor, timezone, settings, rules, isAdmin } = useBranch()
  const navigate = useNavigate()
  const { data: students } = useStudentList(enabled)
  const [draft, setDraft] = useState<Draft | null>(null)
  const ctx: ScheduleCtx = useMemo(() => ({ branchId, actor, timezone, settings, maxStudentsPerCoach: rules.maxStudentsPerCoach }), [branchId, actor, timezone, settings, rules.maxStudentsPerCoach])
  const isLocked = useCallback((d: DateKey) => d < todayKey(timezone), [timezone])

  const openCreate = useCallback(
    (studentId: string | null, dateKey: DateKey, startMin?: number) =>
      setDraft({ studentId: studentId ?? '', dateKey: isLocked(dateKey) ? todayKey(timezone) : dateKey, classId: null, label: '', near: startMin ?? null }),
    [isLocked, timezone],
  )
  const openEdit = useCallback(
    (s: WithId<Session>) => navigate(`/${isAdmin ? 'admin' : 'coach'}/schedule/day/${s.dateKey}${s.classId ? `?class=${s.classId}` : ''}`),
    [navigate, isAdmin],
  )

  const day = draft?.dateKey ?? null
  const classesQ = useMemo(() => (draft && day ? query(branchCol(branchId, COL.classes), where('dateKey', '==', day)) : null), [branchId, day, draft])
  const seatsQ = useMemo(() => (draft && day ? query(branchCol(branchId, COL.sessions), where('dateKey', '==', day)) : null), [branchId, day, draft])
  // The student's absences of the last six weeks still without a make-up.
  const sid = draft?.studentId ?? ''
  const theirsQ = useMemo(() => (draft && sid ? query(branchCol(branchId, COL.sessions), where('studentId', '==', sid)) : null), [branchId, sid, draft])
  const classes = useQuery<AcademyClass>(classesQ, `book-classes-${branchId}-${day}`)
  const seats = useQuery<Session>(seatsQ, `book-seats-${branchId}-${day}`)
  const theirs = useQuery<Session>(theirsQ, `book-theirs-${branchId}-${sid}`)
  const today = todayKey(timezone)
  const owed = useMemo(() => makeupsOwed(theirs.data, addDays(today, -42)), [theirs.data, today])

  const list = classes.data.filter((c) => !c.isDeleted).sort((a, b) => a.startMin - b.startMin)
  const taken = (c: WithId<AcademyClass>) => seats.data.filter((s) => s.classId === c.id && takesSeat(s))
  const hours = day ? dayHours(day, settings) : null
  const student = students.find((s) => s.id === draft?.studentId)
  const near = draft?.near
  const chosen = list.find((c) => c.id === draft?.classId) ?? (near != null ? (list.find((c) => c.startMin >= near && taken(c).length < c.seats) ?? null) : null)
  const already = chosen && draft ? taken(chosen).some((s) => s.studentId === draft.studentId) : false

  const save = async () => {
    if (!draft || !chosen || !student) return
    try {
      const order = Math.max(-1, ...seats.data.filter((s) => s.classId === chosen.id).map((s) => s.visualOrder ?? 0)) + 1
      await addSeat(ctx, chosen, { student, label: draft.label }, order, source)
      toast.success(`${student.name} booked: ${formatDateKey(chosen.dateKey, 'weekdayMedium')}, ${formatTimeRange(chosen.startMin, chosen.endMin)}`)
      setDraft(null)
    } catch (e) {
      toast.error((e as Error).message.includes('permission') ? 'This change isn’t allowed (a past day, or no access).' : (e as Error).message)
    }
  }

  const labels = [
    { value: '', name: 'Class' },
    ...owed.map((o) => ({ value: makeupLabel(o.dateKey), name: makeupLabel(o.dateKey) })),
    { value: 'Practice', name: 'Practice' },
    { value: 'Trial 1', name: 'Trial' },
  ]

  const element = (
    <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book a class</DialogTitle>
          <DialogDescription>Put a student in one of the day's classes. To add a class, open the schedule.</DialogDescription>
        </DialogHeader>
        {draft ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="book-student">Student</Label>
              <OptionPicker
                id="book-student"
                value={draft.studentId || null}
                onChange={(v) => setDraft({ ...draft, studentId: v, label: '' })}
                options={students.filter((s) => s.status !== 'finished').map((s) => ({ value: s.id, label: s.name, hint: s.level ?? undefined }))}
                placeholder="Choose a student"
                searchPlaceholder="Search students"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="book-day">Day</Label>
              <DatePicker id="book-day" value={draft.dateKey} min={today} onChange={(d) => setDraft({ ...draft, dateKey: d, classId: null, near: null })} />
            </div>
            <div className="space-y-1.5">
              <Label>Class</Label>
              {hours && !hours.isOpen && !list.length ? (
                <p className="text-sm text-muted-foreground">The academy is closed that day.</p>
              ) : !list.length ? (
                <p className="text-sm text-muted-foreground">{classes.loading ? 'Loading…' : 'No classes on that day yet.'}</p>
              ) : (
                <div className="grid gap-1.5" role="radiogroup" aria-label="Class">
                  {list.map((c) => {
                    const used = taken(c)
                    const inIt = draft.studentId ? used.some((s) => s.studentId === draft.studentId) : false
                    const full = used.length >= c.seats
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={chosen?.id === c.id}
                        disabled={full || inIt}
                        onClick={() => setDraft({ ...draft, classId: c.id })}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors enabled:hover:bg-muted disabled:opacity-50',
                          chosen?.id === c.id && 'border-foreground ring-1 ring-foreground',
                        )}
                      >
                        <span className="font-medium tabular-nums">{formatTimeRange(c.startMin, c.endMin)}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{inIt ? 'Already in it' : full ? 'Full' : `${c.seats - used.length} of ${c.seats} open`}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <div className="flex flex-wrap gap-1">
                {labels.map((l) => (
                  <button
                    key={l.value || 'class'}
                    type="button"
                    onClick={() => setDraft({ ...draft, label: l.value })}
                    className={cn('rounded-full border px-2.5 py-1 text-xs font-medium', draft.label === l.value ? 'border-foreground bg-foreground text-background' : 'hover:bg-muted', l.value.startsWith('MU') && draft.label !== l.value && 'border-red-200 text-red-700 dark:border-red-900 dark:text-red-300')}
                  >
                    {l.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button disabled={!chosen || !student || already} onClick={() => void save()}>
            Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  return { element, openCreate, openEdit, isLocked }
}
