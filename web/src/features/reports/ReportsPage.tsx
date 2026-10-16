import { useMemo, useState } from 'react'
import { LuChartLine, LuExternalLink, LuFilePlus, LuPlus, LuTrash2 } from 'react-icons/lu'
import { useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { studentLabel } from '@shared/people'
import { reportName } from '@shared/reports/compose'
import { useBranch } from '@/branch/BranchProvider'
import { ContextMenuFor, ItemMenuButton, menu } from '@/components/app/ItemMenu'
import { OptionPicker } from '@/components/app/OptionPicker'
import { PageHeader } from '@/components/app/PageHeader'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useStudentList } from '@/features/data/hooks'
import { cn } from '@/lib/utils'
import { deleteReport } from './api'
import { useAllReports } from './data'
import { NewReportDialog } from './NewReportDialog'
import { TrendChip } from './ReportParts'
import { type Report, errorMessage, one, stateLabel } from './model'

const PAGE = 20
type Tab = 'all' | 'draft' | 'shared'

/**
 * Reports: every progress report, its state, and New report. Coaches see every report too, and can open and share
 * them (docs/DECISIONS.md §6, Q11); only admins create, change or delete them.
 */
export function ReportsPage({ portal = 'admin' }: { portal?: 'admin' | 'coach' }) {
  const { branchId, timezone, actor } = useBranch()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState<{ studentId: string | null } | null>(null)
  const { confirm, dialog } = useConfirm()
  const admin = portal === 'admin'
  const tab: Tab = params.get('tab') === 'draft' || params.get('tab') === 'shared' ? (params.get('tab') as Tab) : 'all'
  const studentId = params.get('student')
  const page = Math.max(1, Number(params.get('page')) || 1) - 1
  const update = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v)
          else next.delete(k)
        }
        if (!('page' in patch)) next.delete('page')
        return next
      },
      { replace: true },
    )

  const { data: reports, loading } = useAllReports()
  const { data: students } = useStudentList()
  const rows = reports.filter((r) => (tab === 'all' || r.status === tab) && (!studentId || r.studentId === studentId))
  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const at = Math.min(page, pages - 1)
  const shown = rows.slice(at * PAGE, at * PAGE + PAGE)
  const counts = useMemo(() => ({ all: reports.length, draft: reports.filter((r) => r.status === 'draft').length, shared: reports.filter((r) => r.status === 'shared').length }), [reports])
  const open = (id: string) => navigate(`/${portal}/reports/${id}`)

  async function remove(r: Report) {
    if (!(await confirm({ title: 'Delete this report?', description: `${reportName(r)} for ${r.studentName} will be deleted. This can’t be undone.`, confirmLabel: 'Delete', destructive: true }))) return
    try {
      await deleteReport(branchId, actor, r)
      toast.success('Report deleted')
    } catch (e) {
      toast.error('Could not delete the report', { description: errorMessage(e, 'Try again.') })
    }
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Reports"
        description={admin ? 'Prepare progress reports from the students’ scores, review them, and share them with families.' : 'Every student’s progress reports. Share a draft with the family once it’s ready.'}
        actions={
          admin ? (
            <Button onClick={() => setCreating({ studentId })}>
              <LuPlus /> New report
            </Button>
          ) : null
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Reports" className="flex rounded-lg bg-muted p-0.5 text-sm font-medium">
          {(
            [
              ['all', 'All'],
              ['draft', 'Drafts'],
              ['shared', 'Shared'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => update({ tab: key === 'all' ? null : key })}
              className={cn('rounded-md px-3 py-1 transition-colors', tab === key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {label} <span className="text-muted-foreground tabular-nums">{counts[key]}</span>
            </button>
          ))}
        </div>
        <OptionPicker
          className="w-full sm:w-64"
          value={studentId ?? 'all'}
          onChange={(v) => update({ student: v === 'all' ? null : v })}
          options={[{ value: 'all', label: 'All students' }, ...students.map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade) }))]}
        />
      </div>

      {!loading && reports.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuChartLine />
            </EmptyMedia>
            <EmptyTitle>No progress reports yet</EmptyTitle>
            <EmptyDescription>
              {admin ? 'A report is drafted from a student’s scores (SIUS results and paper cards) over a period. You review it before the family sees it.' : 'Reports appear here once an admin prepares them.'}
            </EmptyDescription>
          </EmptyHeader>
          {admin ? (
            <EmptyContent>
              <Button onClick={() => setCreating({ studentId: null })}>
                <LuPlus /> New report
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Period</TableHead>
                <TableHead className="hidden text-right md:table-cell">Evaluations</TableHead>
                <TableHead className="hidden text-right md:table-cell">Average</TableHead>
                <TableHead className="hidden sm:table-cell">Trend</TableHead>
                <TableHead>Report</TableHead>
                <TableHead className="hidden lg:table-cell">Prepared by</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((r) => {
                const entries = menu(
                  { kind: 'label', label: `${r.studentName} · ${r.period.label}` },
                  { label: 'Open', icon: LuChartLine, onSelect: () => open(r.id) },
                  { label: 'Open printable report', icon: LuExternalLink, onSelect: () => window.open(`/report/${r.id}`, '_blank', 'noopener') },
                  admin && { label: 'New report for this student', icon: LuFilePlus, separatorBefore: true, onSelect: () => setCreating({ studentId: r.studentId }) },
                  admin && { label: 'Delete', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void remove(r) },
                )
                const level = r.facts?.trend?.level ?? null
                return (
                  <ContextMenuFor key={r.id} entries={entries}>
                    <TableRow className="cursor-pointer" onClick={() => open(r.id)} data-testid="report-row">
                      <TableCell>
                        <div className="font-medium">{r.studentName}</div>
                        {r.student?.level ? <div className="text-xs text-muted-foreground">{r.student.level}</div> : null}
                      </TableCell>
                      <TableCell>
                        <div className="whitespace-nowrap">{r.period.label}</div>
                        {r.customName ? <div className="max-w-56 truncate text-xs text-muted-foreground">{r.customName}</div> : null}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{r.evaluationCount ?? '—'}</TableCell>
                      <TableCell className="hidden text-right tabular-nums md:table-cell">{r.facts?.average != null ? one(r.facts.average) : '—'}</TableCell>
                      <TableCell className="hidden sm:table-cell">{level ? <TrendChip level={level} audience="staff" size="sm" /> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {r.status === 'draft' ? (
                          <Badge variant="secondary">Draft</Badge>
                        ) : (
                          <span className="text-xs font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-400">{stateLabel(r, timezone)}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{r.generatedBy?.name}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ItemMenuButton entries={entries} />
                      </TableCell>
                    </TableRow>
                  </ContextMenuFor>
                )
              })}
              {!loading && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                    No reports match these filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
          {pages > 1 ? (
            <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-sm">
              <Button variant="ghost" size="sm" disabled={at === 0} onClick={() => update({ page: at > 1 ? String(at) : null })}>
                ‹ Previous
              </Button>
              <span className="text-muted-foreground">
                Page {at + 1} of {pages}
              </span>
              <Button variant="ghost" size="sm" disabled={at >= pages - 1} onClick={() => update({ page: String(at + 2) })}>
                Next ›
              </Button>
            </div>
          ) : null}
        </Card>
      )}
      {creating ? <NewReportDialog open onOpenChange={(o) => !o && setCreating(null)} studentId={creating.studentId} reports={reports} /> : null}
      {dialog}
    </div>
  )
}

export function CoachReportsPage() {
  return <ReportsPage portal="coach" />
}
