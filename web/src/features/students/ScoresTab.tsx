import { useEffect, useMemo, useRef, useState } from 'react'
import { LuChartLine, LuFilePlus, LuFileText, LuGitCompareArrows, LuPlus, LuTrophy } from 'react-icons/lu'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { toPoint } from '@shared/reports/facts'
import { resultRows } from '@shared/scores/match'
import { POSITIONS, RESULT_KIND_LABELS, type ResultKind, kindOf } from '@shared/shooting/evaluation'
import { personalBestIds } from '@shared/shooting/progress'
import { positionSummaries } from '@shared/shooting/summary'
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
import { CompetitionDialog } from '@/features/scores/CompetitionDialog'
import { useStudentEvaluations } from '@/features/scores/hooks'
import { ResultKindFilter } from '@/features/scores/kinds'
import { prefersReducedMotion } from '@/features/scores/playback'
import { AddPaperScoresDialog } from '@/features/scores/photos/AddPaperScores'
import { ResultListHead, ResultRow } from '@/features/scores/ResultRow'
import { rowOf, shortDate, useOpenRows } from '@/features/scores/results'
import { useResultActions } from '@/features/scores/useResultActions'
import { CompareCard } from './scores/CompareCard'
import { FoldedSection } from './scores/FoldedSection'
import { PositionTiles } from './scores/PositionTiles'
import { useOpenSections } from './scores/sections'

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`

/** Brings a row of the list into view (a link to one result; Show on a message: the first of the rows named). */
function showRow(keys: string | readonly string[], smooth: boolean) {
  const wanted = new Set(typeof keys === 'string' ? [keys] : keys)
  const el = [...document.querySelectorAll<HTMLElement>('[data-row]')].find((x) => wanted.has(x.dataset.row ?? ''))
  el?.scrollIntoView({ block: 'start', behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' })
}

/**
 * Student page → Scores (Goo's pick, docs/DECISIONS.md §29): what the student shoots at a glance, then every result.
 * Each position's tile gives its average per 10 shots, which way it's going, a small line of its results, the best and
 * how many; the kind picked (practice, competitions, evaluations) filters the tiles and the list alike. Every result
 * is a row, newest first, that opens under itself to play its shots back (several at once; nothing scrolls), and a
 * link to one result (`?score=`, from Home and the Drive) opens it and brings it into view. Below, folded until opened
 * (remembered on this device): the scores over time, two results compared, and the progress reports. Admins and
 * coaches add, correct and delete scores alike; admins make reports.
 */
export function ScoresTab({ student, mode }: { student: WithId<Student>; mode: 'admin' | 'coach' }) {
  const { timezone } = useBranch()
  const navigate = useNavigate()
  const admin = mode === 'admin'
  const today = todayKey(timezone)
  const { data: all, loading } = useStudentEvaluations(student.id)
  // Practice, competitions or evaluations only, or everything (the manager's second meeting, §23), while there are any.
  const [kindPicked, setKind] = useState<ResultKind | 'all'>('all')
  const kind = kindPicked !== 'all' && all.some((e) => kindOf(e) === kindPicked) ? kindPicked : 'all'
  const evaluations = useMemo(() => (kind === 'all' ? all : all.filter((e) => kindOf(e) === kind)), [all, kind])
  const allRows = useMemo(() => resultRows(all), [all])
  const rows = useMemo(() => resultRows(evaluations), [evaluations])
  const scored = useMemo(() => evaluations.filter((e) => e.shots > 0), [evaluations])
  const summaries = useMemo(() => positionSummaries(scored), [scored])
  const positions = useMemo(() => POSITIONS.filter((p) => all.some((e) => e.position === p && e.shots > 0)), [all])
  const points = useMemo(() => scored.map(toPoint), [scored])
  // A personal best is a result's own: higher than every earlier one in its position, whichever kind is shown.
  const bests = useMemo(() => personalBestIds(all), [all])
  const { data: reports } = useStudentReports(student.id)
  const actions = useResultActions(mode)
  const openRows = useOpenRows()
  const { show } = openRows
  const [sections, toggleSection] = useOpenSections()
  const [adding, setAdding] = useState(false)
  const [competing, setCompeting] = useState(false)
  const [creating, setCreating] = useState(false)
  const name = student.firstName || student.name
  // Results just added: marked "Just added" for a little while, and the first of them in the list (the newest) opens
  // as soon as the list has it.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set())
  const [toOpen, setToOpen] = useState<ReadonlySet<string> | null>(null)
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const added = (ids: string[]) => {
    if (!ids.length) return
    setKind('all')
    setFresh(new Set(ids))
    setToOpen(new Set(ids))
    if (freshTimer.current) clearTimeout(freshTimer.current)
    freshTimer.current = setTimeout(() => setFresh(new Set()), 9000)
  }
  useEffect(
    () => () => {
      if (freshTimer.current) clearTimeout(freshTimer.current)
    },
    [],
  )
  const firstNew = toOpen ? rows.find((r) => toOpen.has(r.key)) : null
  if (toOpen && firstNew) {
    setToOpen(null)
    show(firstNew.key)
  }

  // A link to one result (`?score=`, from Home's latest scores and the Drive's Score column): its row opens and comes
  // into view, once.
  const [params] = useSearchParams()
  const asked = params.get('score')
  const arrived = useRef<string | null>(null)
  useEffect(() => {
    if (loading || !asked || arrived.current === asked) return
    arrived.current = asked
    const row = rowOf(allRows, asked)
    if (!row) {
      toast('That score isn’t in the list any more', { description: 'It may have been deleted.' })
      return
    }
    show(row.key)
    // Once it has unfolded: the page is then long enough to bring a row near its end to the top.
    setTimeout(() => showRow(row.key, false), 320)
  }, [loading, asked, allRows, show])

  if (loading) return <Skeleton className="h-96 w-full rounded-xl" />

  const first = allRows.length ? allRows[allRows.length - 1].results[0].dateKey : null
  const drafts = reports.filter((r) => r.status === 'draft').length
  const reportsSub = reports.length ? [drafts ? `${drafts} ${drafts === 1 ? 'draft' : 'drafts'}` : '', reports.length - drafts ? `${reports.length - drafts} shared` : ''].filter(Boolean).join(' · ') : 'None yet'

  return (
    <div className="space-y-5" data-testid="scores-tab">
      <section className="@container overflow-hidden rounded-xl border bg-card">
        <div className="space-y-4 p-4 @xl:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold">Scores</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {first ? `${plural(allRows.length, 'result')} since ${shortDate(first, today)} · per 10 shots, whole numbers (decimals for SIUS)` : 'No scores yet.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setAdding(true)} data-testid="add-paper-scores">
                <LuPlus /> Add paper scores
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCompeting(true)} data-testid="add-competition">
                <LuTrophy /> Add a competition
              </Button>
              {admin ? (
                <Button size="sm" onClick={() => setCreating(true)} disabled={!all.some((e) => e.shots > 0)}>
                  <LuFilePlus /> New report
                </Button>
              ) : null}
            </div>
          </div>
          <ResultKindFilter list={allRows.map((r) => r.results[0])} value={kind} onChange={setKind} />
          <PositionTiles positions={positions} summaries={summaries} kind={kind} today={today} />
        </div>

        <div className="flex items-baseline justify-between gap-3 border-t px-4 pt-3.5 pb-2.5 @xl:px-5">
          <h3 className="text-sm font-semibold">{kind === 'all' ? 'All results' : `${RESULT_KIND_LABELS[kind]} results`}</h3>
          {rows.length ? <span className="hidden text-xs text-muted-foreground @xl:inline">{plural(rows.length, 'result')} · newest first · open one to play it back</span> : null}
        </div>
        {rows.length ? (
          <>
            <ResultListHead />
            <ul className="border-t @xl:border-t-0" data-testid="results-list">
              {rows.map((row) => (
                <ResultRow key={row.key} row={row} mode={mode} open={openRows.isOpen(row.key)} onToggle={() => openRows.toggle(row.key)} entries={actions.entriesOf(row)} bests={bests} fresh={fresh.has(row.key)} />
              ))}
            </ul>
          </>
        ) : (
          <p className="border-t px-5 py-10 text-center text-sm text-muted-foreground">No scores yet. Add paper scores or a competition above; SIUS results dropped in the Drive show here too.</p>
        )}
      </section>

      <div className="@container overflow-hidden rounded-xl border bg-card">
        <FoldedSection
          icon={LuChartLine}
          title="Scores over time"
          sub={points.length ? `Per 10 shots, ${shortDate(points[0].dateKey, today)} – ${shortDate(points[points.length - 1].dateKey, today)}, each position` : 'Per 10 shots, each position'}
          open={sections.has('chart')}
          onToggle={() => toggleSection('chart')}
          testId="scores-over-time"
        >
          {points.length >= 2 ? (
            <div className="rounded-xl border bg-white p-4 text-[#0b0b0b]">
              <TrendChart series={trendSeries(points)} from={points[0].dateKey} to={today > points[points.length - 1].dateKey ? today : points[points.length - 1].dateKey} label={`${student.name}'s scores per 10 shots over time`} />
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">Two results are needed to draw a line.</p>
          )}
        </FoldedSection>
        <FoldedSection icon={LuGitCompareArrows} title="Compare" sub="Two results of a position side by side" open={sections.has('compare')} onToggle={() => toggleSection('compare')} testId="compare-section">
          <CompareCard evaluations={scored} bare />
        </FoldedSection>
        <FoldedSection icon={LuFileText} title="Progress reports" sub={`${reportsSub} · for the family, from these scores`} open={sections.has('reports')} onToggle={() => toggleSection('reports')} testId="student-reports">
          {reports.length ? (
            <ul className="divide-y rounded-lg border">
              {reports.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => navigate(`/${mode}/reports/${r.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/40">
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
            <p className="py-2 text-sm text-muted-foreground">No reports for {name} yet.</p>
          )}
          {admin ? (
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setCreating(true)} disabled={!all.some((e) => e.shots > 0)}>
              <LuFilePlus /> New report
            </Button>
          ) : null}
        </FoldedSection>
      </div>

      <AddPaperScoresDialog open={adding} onOpenChange={setAdding} studentId={student.id} onSaved={added} savedAction={(ids) => ({ label: 'Show', onClick: () => showRow(ids, true) })} />
      <CompetitionDialog open={competing} onOpenChange={setCompeting} studentId={student.id} studentName={student.name} />
      {creating ? <NewReportDialog open onOpenChange={setCreating} studentId={student.id} reports={reports} /> : null}
      {actions.element}
    </div>
  )
}
