import { useEffect, useMemo, useState } from 'react'
import { LuArrowLeft, LuEllipsis, LuExternalLink, LuPencil, LuRefreshCw, LuSend, LuTrash2, LuUndo2 } from 'react-icons/lu'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { COL } from '@shared/paths'
import { reportName } from '@shared/reports/compose'
import { evaluationsFingerprint } from '@shared/reports/facts'
import type { NarrativeKey, ProgressReportDoc, ReportNarrative, SectionMeta } from '@shared/reports/types'
import { useBranch } from '@/branch/BranchProvider'
import { FullPageSpinner } from '@/components/app/FullPage'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import { useStudentEvaluations } from '@/features/scores/hooks'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { deleteReport, refreshFigures, saveNarrative, unshareReport } from './api'
import { RenameDialog, ShareDialog } from './ReportDialogs'
import { ReportDocument } from './ReportDocument'
import type { EditApi } from './ReportEditors'
import { ReportRail } from './ReportRail'
import { type Report, errorMessage, stateLabel } from './model'

type Editing = { narrative: ReportNarrative; meta: Partial<Record<NarrativeKey, SectionMeta>>; touched: Set<NarrativeKey> }

/** Reports → a report: review, edit (admins), share with the family (admins and coaches), print. */
export function ReportEditorPage({ portal = 'admin' }: { portal?: 'admin' | 'coach' }) {
  const { reportId = '' } = useParams()
  const navigate = useNavigate()
  const { branchId, branch } = useBranch()
  const listPath = `/${portal}/reports`
  const ref = useMemo(() => branchDocRef(branchId, COL.progressReports, reportId), [branchId, reportId])
  const { data, loading } = useDoc<ProgressReportDoc>(ref)

  useEffect(() => {
    if (data) document.title = `${data.student.name} – Progress report | ${branch.name}`
  }, [data, branch.name])

  if (loading) return <FullPageSpinner label="Loading the report…" />
  if (!data) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-lg font-semibold">Report not found</h1>
        <p className="mt-1 text-sm text-muted-foreground">It may have been deleted.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate(listPath)}>
          Back to Reports
        </Button>
      </div>
    )
  }
  return <Editor key={data.id} report={data} portal={portal} listPath={listPath} />
}

export function CoachReportEditorPage() {
  return <ReportEditorPage portal="coach" />
}

function Editor({ report: r, portal, listPath }: { report: Report; portal: 'admin' | 'coach'; listPath: string }) {
  const navigate = useNavigate()
  const { branchId, timezone, isAdmin, actor } = useBranch()
  const [editing, setEditing] = useState<Editing | null>(null)
  const [busy, setBusy] = useState<'save' | 'refresh' | null>(null)
  const [sharing, setSharing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const { confirm, dialog } = useConfirm()
  const draft = r.status === 'draft'
  const mayEdit = isAdmin && draft

  // What the report would be built from now, to say when it has fallen behind its evaluations.
  const { data: evaluations, loading: evalsLoading } = useStudentEvaluations(r.studentId)
  const inPeriod = useMemo(() => evaluations.filter((e) => e.dateKey >= r.startDate && e.dateKey <= r.endDate && e.shots > 0), [evaluations, r.startDate, r.endDate])
  const stale = !evalsLoading && evaluationsFingerprint(inPeriod) !== r.source?.fingerprint
  const problems = inPeriod.filter((e) => e.problems?.length).length

  const startEdit = () => setEditing({ narrative: structuredClone(r.narrative), meta: { ...(r.narrativeMeta?.sections ?? {}) }, touched: new Set() })
  const editApi: EditApi | null = editing
    ? {
        narrative: editing.narrative,
        meta: editing.meta,
        onChange: (key, value) =>
          setEditing((e) => (e ? { ...e, narrative: { ...e.narrative, [key]: value }, meta: { ...e.meta, [key]: { source: 'staff', editedBy: actor.name } }, touched: new Set(e.touched).add(key) } : e)),
        onRestore: (key) =>
          setEditing((e) => {
            if (!e) return e
            const meta = { ...e.meta }
            delete meta[key]
            return { ...e, narrative: { ...e.narrative, [key]: structuredClone(r.narrativeOriginal?.[key] ?? r.narrative[key]) }, meta, touched: new Set(e.touched).add(key) }
          }),
      }
    : null

  async function save() {
    if (!editing) return
    setBusy('save')
    try {
      await saveNarrative(branchId, actor, r, editing.narrative, [...editing.touched])
      toast.success('Report saved')
      setEditing(null)
    } catch (e) {
      toast.error('Could not save the report', { description: errorMessage(e, 'Try again.') })
    } finally {
      setBusy(null)
    }
  }

  async function cancelEdit() {
    if (editing?.touched.size && !(await confirm({ title: 'Discard your changes?', description: 'Your edits to this report won’t be saved.', confirmLabel: 'Discard', destructive: true }))) return false
    setEditing(null)
    return true
  }

  async function refresh() {
    setBusy('refresh')
    try {
      await refreshFigures(branchId, actor, r)
      toast.success('Figures updated from the latest evaluations')
    } catch (e) {
      toast.error('Could not update the report', { description: errorMessage(e, 'Try again.') })
    } finally {
      setBusy(null)
    }
  }

  async function unshare() {
    if (!(await confirm({ title: 'Stop sharing this report?', description: 'The family won’t see it in their portal until it’s shared again.', confirmLabel: 'Stop sharing' }))) return
    try {
      await unshareReport(branchId, actor, r)
      toast.success('The report is a draft again')
    } catch (e) {
      toast.error('Could not change the report', { description: errorMessage(e, 'Try again.') })
    }
  }

  async function remove() {
    if (!(await confirm({ title: 'Delete this report?', description: `${reportName(r)} for ${r.student.name} will be deleted. This can’t be undone.`, confirmLabel: 'Delete', destructive: true }))) return
    try {
      await deleteReport(branchId, actor, r)
      toast.success('Report deleted')
      navigate(listPath)
    } catch (e) {
      toast.error('Could not delete the report', { description: errorMessage(e, 'Try again.') })
    }
  }

  const back = async () => {
    if (editing && !(await cancelEdit())) return
    navigate(listPath)
  }

  return (
    <div className="-m-4 min-h-[calc(100svh-3rem)] sm:-m-6">
      <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur print:hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
          <Button variant="ghost" size="sm" onClick={() => void back()}>
            <LuArrowLeft /> Reports
          </Button>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">{r.student.name}</div>
            <div className="truncate text-xs text-muted-foreground">{reportName(r)}</div>
          </div>
          <Badge variant={draft ? 'secondary' : 'default'} data-testid="report-state">
            {stateLabel(r, timezone)}
          </Badge>
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => void cancelEdit()}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy === 'save'} onClick={() => void save()}>
                {busy === 'save' ? <Spinner /> : null} Save
              </Button>
            </>
          ) : (
            <>
              {mayEdit ? (
                <Button variant="outline" size="sm" onClick={startEdit}>
                  <LuPencil /> Edit
                </Button>
              ) : null}
              {draft ? (
                <Button size="sm" onClick={() => setSharing(true)}>
                  <LuSend /> Share with family
                </Button>
              ) : isAdmin ? (
                <Button variant="outline" size="sm" onClick={() => void unshare()}>
                  <LuUndo2 /> Stop sharing
                </Button>
              ) : null}
              <Button variant="outline" size="sm" onClick={() => window.open(`/report/${r.id}`, '_blank', 'noopener')}>
                <LuExternalLink /> Print / PDF
              </Button>
              {isAdmin ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More actions">
                      <LuEllipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {mayEdit ? (
                      <DropdownMenuItem disabled={!!busy} onSelect={() => void refresh()}>
                        <LuRefreshCw /> Update figures
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem onSelect={() => setRenaming(true)}>
                      <LuPencil /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                      <LuTrash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </>
          )}
        </div>
        {busy === 'refresh' ? (
          <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-2 text-sm text-muted-foreground sm:px-6" role="status">
            <Spinner /> Updating the figures…
          </div>
        ) : null}
        {!draft && !editing ? (
          <div className="border-t bg-muted/40 px-4 py-2 text-xs text-muted-foreground sm:px-6">
            Shared reports are locked. {isAdmin ? 'Stop sharing to change it.' : 'An admin can stop sharing it to make changes.'}
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="report-canvas -mx-4 min-w-0 py-6 sm:mx-0 sm:rounded-xl sm:px-4 sm:py-8">
          <ReportDocument report={r} audience="family" timezone={timezone} edit={editApi} />
        </div>
        <ReportRail report={r} portal={portal} mayEdit={mayEdit && !editing} stale={stale} problems={problems} onRefresh={() => void refresh()} />
      </div>
      {sharing ? <ShareDialog report={r} stale={stale} onClose={() => setSharing(false)} /> : null}
      {renaming ? <RenameDialog report={r} onClose={() => setRenaming(false)} /> : null}
      {dialog}
    </div>
  )
}
