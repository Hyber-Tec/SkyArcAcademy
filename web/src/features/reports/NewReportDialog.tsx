import { query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { LuCircleAlert, LuFileChartColumn } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { studentLabel } from '@shared/people'
import { PRESET_LABELS, periodLabel, presetPeriod } from '@shared/reports/period'
import type { ReportPreset } from '@shared/reports/types'
import { POSITIONS, POSITION_LABELS } from '@shared/shooting/evaluation'
import { type DateKey, addDays, formatDateKey, todayKey } from '@shared/time'
import type { Session } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { OptionPicker } from '@/components/app/OptionPicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { useStudentList } from '@/features/data/hooks'
import { useStudentEvaluations } from '@/features/scores/hooks'
import { branchCol, useQuery } from '@/lib/firestore'
import { createReport } from './api'
import { type Report, errorMessage } from './model'

/**
 * Reports → New report: pick a student and a period, see what the report will cover, and create a draft from the
 * student's evaluations and classes. The draft opens for review before anyone shares it.
 */
/** The latest day with a scored result, or null. */
function lastScoredDay(evaluations: readonly { dateKey: DateKey; shots: number }[]): DateKey | null {
  let last: DateKey | null = null
  for (const e of evaluations) if (e.shots > 0 && (!last || e.dateKey > last)) last = e.dateKey
  return last
}

export function NewReportDialog({
  open,
  onOpenChange,
  studentId: initialStudent = null,
  reports,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  studentId?: string | null
  /** Existing reports: the end of each student's last one ("Since the last report"), and drafts to reuse. */
  reports: readonly Report[]
}) {
  const { branchId, branch, actor, timezone } = useBranch()
  const navigate = useNavigate()
  const today = todayKey(timezone)
  const { data: students } = useStudentList(open)
  const [studentId, setStudentId] = useState<string | null>(initialStudent)
  const [chosen, setChosen] = useState<ReportPreset | null>(null)
  const [custom, setCustom] = useState<{ from: DateKey; to: DateKey } | null>(null)
  const [busy, setBusy] = useState(false)
  const student = students.find((s) => s.id === studentId)

  const lastReportTo = useMemo(() => {
    const m = new Map<string, DateKey>()
    for (const r of reports) if (!m.has(r.studentId) || r.endDate > m.get(r.studentId)!) m.set(r.studentId, r.endDate)
    return m
  }, [reports])
  const last = studentId ? (lastReportTo.get(studentId) ?? null) : null
  const presets: ReportPreset[] = [...(last ? (['since_last'] as const) : []), 'last_month', 'this_month', 'last_30', 'last_90', 'custom']
  const preset: ReportPreset = chosen && presets.includes(chosen) ? chosen : last ? 'since_last' : 'last_30'
  const period = preset === 'custom' && custom ? custom : presetPeriod(preset, today, { lastReportTo: last })

  // What the report will cover.
  const { data: evaluations, loading: evalsLoading } = useStudentEvaluations(open ? studentId : null)
  const inPeriod = evaluations.filter((e) => e.dateKey >= period.from && e.dateKey <= period.to && e.shots > 0)
  const sessionsQ = useMemo(
    () => (open && studentId ? query(branchCol(branchId, COL.sessions), where('studentId', '==', studentId), where('dateKey', '>=', period.from), where('dateKey', '<=', period.to)) : null),
    [open, branchId, studentId, period.from, period.to],
  )
  const sessions = useQuery<Session>(sessionsQ, `new-report-sessions-${studentId}-${period.from}-${period.to}`)
  const attended = sessions.data.filter((s) => !s.isDeleted && s.status === 'present').length
  const byPosition = POSITIONS.map((p) => ({ p, n: inPeriod.filter((e) => e.position === p).length })).filter((x) => x.n)
  const ready = !!student && !evalsLoading && inPeriod.length > 0
  // When the period has none: the student's last scored result, to offer a period that reaches it.
  const lastScored = lastScoredDay(evaluations)
  // (A day of its own: a helper given `today` would make the compiler distrust the period, which is built from it.)
  const reach90 = lastScored !== null && lastScored >= addDays(todayKey(timezone), -89)

  const close = (o: boolean) => {
    onOpenChange(o)
    if (!o) {
      setChosen(null)
      setCustom(null)
      if (!initialStudent) setStudentId(null)
    }
  }

  async function create() {
    if (!student) return
    const same = reports.find((r) => r.studentId === student.id && r.status === 'draft' && r.startDate === period.from && r.endDate === period.to)
    if (same) {
      toast.info('A draft for this period already exists, so it was opened.')
      close(false)
      navigate(`/admin/reports/${same.id}`)
      return
    }
    setBusy(true)
    try {
      const id = await createReport({ branchId, branch, actor, student, period: { ...period, preset } })
      toast.success('Draft ready. Review it, then share it with the family.')
      close(false)
      navigate(`/admin/reports/${id}`)
    } catch (e) {
      toast.error('Could not create the report', { description: errorMessage(e, 'Try again.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New progress report</DialogTitle>
          <DialogDescription>It’s drafted from the student’s scores and classes. You review it before the family sees it.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Student</FieldLabel>
            <OptionPicker
              value={studentId}
              onChange={(v) => {
                setStudentId(v)
                setChosen(null)
              }}
              placeholder="Choose a student…"
              searchPlaceholder="Search students…"
              disabled={!!initialStudent}
              options={students
                .filter((s) => s.status !== 'finished' || lastReportTo.has(s.id))
                .map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade), hint: lastReportTo.get(s.id) ? `last report to ${formatDateKey(lastReportTo.get(s.id)!, 'monthDay')}` : undefined }))}
            />
          </Field>
          <Field>
            <FieldLabel>Period</FieldLabel>
            <Select value={preset} onValueChange={(v) => setChosen(v as ReportPreset)}>
              <SelectTrigger className="w-full" aria-label="Period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {presets.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRESET_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {preset === 'custom' ? (
              <div className="mt-2 flex items-center gap-2">
                <DatePicker className="flex-1" value={period.from} max={today} onChange={(d) => setCustom({ from: d, to: d > period.to ? d : period.to })} aria-label="From" />
                <span className="text-sm text-muted-foreground">to</span>
                <DatePicker className="flex-1" value={period.to} min={period.from} max={today} onChange={(d) => setCustom({ from: period.from, to: d })} aria-label="To" />
              </div>
            ) : null}
          </Field>
        </FieldGroup>

        {studentId ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm" data-testid="new-report-preview">
            {evalsLoading ? (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Spinner /> Looking at the scores…
              </span>
            ) : inPeriod.length ? (
              <div className="flex items-start gap-2">
                <LuFileChartColumn className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <div className="font-medium">
                    {inPeriod.length} {inPeriod.length === 1 ? 'evaluation' : 'evaluations'} ({byPosition.map((x) => `${x.n} ${POSITION_LABELS[x.p].toLowerCase()}`).join(', ')}) · {attended}{' '}
                    {attended === 1 ? 'class' : 'classes'} attended
                  </div>
                  <div className="text-xs text-muted-foreground">{periodLabel(period.from, period.to)}</div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-2 text-amber-800 dark:text-amber-300">
                <LuCircleAlert className="mt-0.5 size-4 shrink-0" />
                {!lastScored ? (
                  <span>
                    {student?.firstName || 'This student'} has no scores yet. A report needs at least one: add paper scores on their page, or drop a SIUS
                    result in their Drive folder.
                  </span>
                ) : (
                  <span>
                    No scored evaluations in this period.
                    {preset !== 'last_90' && reach90 ? (
                      <button type="button" className="ml-1 font-medium underline underline-offset-2" onClick={() => setChosen('last_90')}>
                        Use the last 90 days
                      </button>
                    ) : !reach90 ? (
                      <button
                        type="button"
                        className="ml-1 font-medium underline underline-offset-2"
                        onClick={() => {
                          setCustom({ from: lastScored, to: today })
                          setChosen('custom')
                        }}
                      >
                        Start it on {formatDateKey(lastScored, 'monthDay')}, their last score
                      </button>
                    ) : null}
                  </span>
                )}
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={!ready || busy}>
            {busy ? <Spinner /> : null}
            {busy ? 'Preparing…' : 'Create draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
