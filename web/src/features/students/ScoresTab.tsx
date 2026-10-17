import { useMemo, useState } from 'react'
import { LuChartLine, LuFilePlus, LuPlus } from 'react-icons/lu'
import { useNavigate } from 'react-router'
import { toPoint } from '@shared/reports/facts'
import { POSITIONS, POSITION_COLORS, POSITION_LABELS, per10 } from '@shared/shooting/evaluation'
import { todayKey } from '@shared/time'
import type { Student, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { NewReportDialog } from '@/features/reports/NewReportDialog'
import { TrendChip } from '@/features/reports/ReportParts'
import { TrendChart } from '@/features/reports/charts'
import { useStudentReports } from '@/features/reports/data'
import { one, stateLabel, trendSeries } from '@/features/reports/model'
import { useStudentEvaluations } from '@/features/scores/hooks'
import { PaperScoreDialog } from '@/features/scores/PaperScoreDialog'
import { CompareCard } from './scores/CompareCard'
import { ResultsPanel } from './scores/ResultsPanel'

/**
 * Student page → Scores: the latest result played back on the target with its series shot by shot, every result
 * (each with its target in small, and picking one shows it large), the scores over time, a comparison of any two,
 * and the student's progress reports. Coaches see it all; admins also add paper scores and make reports.
 */
export function ScoresTab({ student, mode }: { student: WithId<Student>; mode: 'admin' | 'coach' }) {
  const { timezone } = useBranch()
  const navigate = useNavigate()
  const admin = mode === 'admin'
  const { data: evaluations, loading } = useStudentEvaluations(student.id)
  const { data: reports } = useStudentReports(student.id)
  const [adding, setAdding] = useState(false)
  const [creating, setCreating] = useState(false)
  const scored = useMemo(() => evaluations.filter((e) => e.shots > 0), [evaluations])
  const points = useMemo(() => scored.map(toPoint), [scored])
  const today = todayKey(timezone)

  const summary = POSITIONS.map((pos) => {
    const list = scored.filter((e) => e.position === pos)
    const shots = list.reduce((n, e) => n + e.shots, 0)
    return { pos, n: list.length, average: shots ? per10(list.reduce((n, e) => n + e.wholeTotal, 0), shots) : null }
  }).filter((s) => s.n)

  if (loading) return <Skeleton className="h-96 w-full rounded-xl" />

  return (
    <div className="space-y-5" data-testid="scores-tab">
      <section className="@container overflow-hidden rounded-xl border bg-card">
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Scores</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {scored.length ? `${scored.length} scored ${scored.length === 1 ? 'evaluation' : 'evaluations'}, per 10 shots in whole numbers (decimals for SIUS).` : 'No scores yet.'}
              </p>
            </div>
            {admin ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
                  <LuPlus /> Add paper scores
                </Button>
                <Button size="sm" onClick={() => setCreating(true)} disabled={!scored.length}>
                  <LuFilePlus /> New report
                </Button>
              </div>
            ) : null}
          </div>
          {summary.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {summary.map((s) => (
                <div key={s.pos} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="size-2.5 rounded-full" style={{ background: POSITION_COLORS[s.pos] }} />
                  <span className="font-medium">{POSITION_LABELS[s.pos]}</span>
                  <span className="text-muted-foreground">
                    {s.n} {s.n === 1 ? 'result' : 'results'}
                  </span>
                  {s.average !== null ? <span className="font-semibold tabular-nums">avg {one(s.average)}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <ResultsPanel evaluations={evaluations} mode={mode} />
      </section>

      {points.length >= 2 ? (
        <section className="rounded-xl border bg-card p-5">
          <div className="rounded-xl border bg-white p-4 text-[#0b0b0b]">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Scores over time</h2>
              <span className="text-xs text-[#7d7a72]">per 10 shots</span>
            </div>
            <TrendChart className="mt-2" series={trendSeries(points)} from={points[0].dateKey} to={today > points[points.length - 1].dateKey ? today : points[points.length - 1].dateKey} label={`${student.name}'s scores per 10 shots over time`} />
          </div>
        </section>
      ) : null}

      <CompareCard evaluations={scored} />

      <section className="overflow-hidden rounded-xl border bg-card" data-testid="student-reports">
        <div className="flex items-center justify-between gap-2 border-b px-5 py-3.5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <LuChartLine className="size-4 text-muted-foreground" /> Progress reports
          </h2>
          {admin && scored.length ? (
            <Button variant="ghost" size="sm" onClick={() => setCreating(true)}>
              <LuFilePlus /> New report
            </Button>
          ) : null}
        </div>
        {reports.length ? (
          <ul className="divide-y">
            {reports.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => navigate(`/${mode}/reports/${r.id}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.customName || r.period.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.evaluationCount} {r.evaluationCount === 1 ? 'evaluation' : 'evaluations'}
                      {r.facts?.average != null ? ` · average ${one(r.facts.average)}` : ''}
                    </div>
                  </div>
                  {r.facts?.trend?.level ? <TrendChip level={r.facts.trend.level} audience="staff" size="sm" /> : null}
                  {r.status === 'draft' ? <Badge variant="secondary">Draft</Badge> : <span className="text-xs font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-400">{stateLabel(r, timezone)}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">No reports for {student.firstName || student.name} yet.</p>
        )}
      </section>

      {adding ? <PaperScoreDialog open onOpenChange={setAdding} studentId={student.id} /> : null}
      {creating ? <NewReportDialog open onOpenChange={setCreating} studentId={student.id} reports={reports} /> : null}
    </div>
  )
}
