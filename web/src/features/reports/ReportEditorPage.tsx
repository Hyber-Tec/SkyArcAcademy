import { useEffect, useMemo, useState } from 'react'
import { LuArrowLeft, LuEllipsis, LuExternalLink, LuPencil, LuRefreshCw, LuSend, LuSparkles, LuTrash2, LuUndo2 } from 'react-icons/lu'
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
import { callError, draftReportText, isLimitError, useAiPublic } from '@/features/ai/api'
import { useStudentEvaluations } from '@/features/scores/hooks'
import { branchDocRef, useDoc } from '@/lib/firestore'
import { deleteReport, refreshFigures, saveNarrative, unshareReport } from './api'
import { RenameDialog, ShareDialog } from './ReportDialogs'
import { ReportDocument } from './ReportDocument'
import type { EditApi } from './ReportEditors'
import { ReportRail } from './ReportRail'
import { type Report, errorMessage, stateLabel } from './model'

type Editing = { narrative: ReportNarrative; meta: Partial<Record<NarrativeKey, SectionMeta>>; touched: Set<NarrativeKey> }

/** What "Write with AI" replaces: everything but the coach's note. */
const AI_SECTIONS: NarrativeKey[] = ['overview', 'strengths', 'focusAreas', 'goals']

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
  const [busy, setBusy] = useState<'save' | 'refresh' | 'ai' | null>(null)
  const [sharing, setSharing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const { confirm, dialog } = useConfirm()
  const draft = r.status === 'draft'
  const mayEdit = isAdmin && draft
  // "Write with AI": owners and admins, on a draft, once a super admin has set AI up for report text.
  const aiOn = useAiPublic()?.reportText === true
  const mayWriteWithAi = mayEdit && aiOn

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
          setEditing((e) =>
            // A section AI drafted stays AI's as it's changed (Restore takes it back to the standard text).
            e ? { ...e, narrative: { ...e.narrative, [key]: value }, meta: { ...e.meta, [key]: { source: e.meta[key]?.source === 'ai' ? 'ai' : 'staff', editedBy: actor.name } }, touched: new Set(e.touched).add(key) } : e,
          ),
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
      await saveNarrative(branchId, actor, r, editing.narrative, [...editing.touched], editing.meta)
      toast.success('Report saved')
      setEditing(null)
    } catch (e) {
      toast.error('Could not save the report', { description: errorMessage(e, 'Try again.') })
    } finally {
      setBusy(null)
    }
  }

  /** A draft from AI for every section but the coach's note, as changes to review and save. */
  async function writeWithAi() {
    const ok = await confirm({
      title: 'Replace the overview, strengths, focus areas and goals with a draft?',
      description: 'AI writes them from this report’s figures. You can edit the draft before sharing; the coach’s note stays as it is.',
      confirmLabel: 'Write with AI',
    })
    if (!ok) return
    setBusy('ai')
    try {
      const { narrative, check } = await draftReportText(branchId, r.id)
      setEditing((e) => {
        const base = e ?? { narrative: structuredClone(r.narrative), meta: { ...(r.narrativeMeta?.sections ?? {}) }, touched: new Set<NarrativeKey>() }
        const meta = { ...base.meta }
        for (const k of AI_SECTIONS) meta[k] = { source: 'ai', editedBy: actor.name }
        return { narrative: { ...base.narrative, ...narrative }, meta, touched: new Set([...base.touched, ...AI_SECTIONS]) }
      })
      toast.success('AI wrote a draft', { description: 'Read it through and change what you like, then Save.' })
      if (check?.length) {
        toast.warning('Check these numbers before saving', { description: `${check.join(', ')}: they aren’t in the report’s figures.`, duration: 15_000 })
      }
    } catch (e) {
      toast.error(isLimitError(e) ? callError(e) : 'AI couldn’t write this just now. Try again, or write it yourself.')
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
          <Button variant="ghost" size="sm" aria-label="Reports" onClick={() => void back()}>
            <LuArrowLeft />
            <span className="hidden sm:inline">Reports</span>
          </Button>
          {/* Phones: the back arrow and the buttons on the first line, whose report it is on its own line below. */}
          <span className="flex-1 sm:hidden" />
          <div className="order-last min-w-0 basis-full px-1 leading-tight sm:order-none sm:flex-1 sm:basis-auto sm:px-0">
            <div className="truncate text-sm font-semibold">{r.student.name}</div>
            <div className="truncate text-xs text-muted-foreground">{reportName(r)}</div>
          </div>
          <Badge variant={draft ? 'secondary' : 'default'} data-testid="report-state">
            {stateLabel(r, timezone)}
          </Badge>
          {mayWriteWithAi ? (
            // Phones: in the ⋯ menu until editing, so the header keeps to one line.
            <Button
              variant="outline"
              size="sm"
              className={editing ? undefined : 'hidden sm:inline-flex'}
              disabled={!!busy}
              onClick={() => void writeWithAi()}
              aria-label="Write with AI"
              title="Write with AI"
              data-testid="write-with-ai"
            >
              {busy === 'ai' ? <Spinner /> : <LuSparkles />}
              <span className="hidden sm:inline">Write with AI</span>
            </Button>
          ) : null}
          {editing ? (
            <>
              <Button variant="ghost" size="sm" disabled={busy === 'ai'} onClick={() => void cancelEdit()}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy === 'save' || busy === 'ai'} onClick={() => void save()}>
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
                  <LuSend />
                  <span className="sm:hidden">Share</span>
                  <span className="hidden sm:inline">Share with family</span>
                </Button>
              ) : isAdmin ? (
                <Button variant="outline" size="sm" onClick={() => void unshare()}>
                  <LuUndo2 /> Stop sharing
                </Button>
              ) : null}
              <Button variant="outline" size="sm" aria-label="Print / PDF" title="Print / PDF" onClick={() => window.open(`/report/${r.id}`, '_blank', 'noopener')}>
                <LuExternalLink />
                <span className="hidden sm:inline">Print / PDF</span>
              </Button>
              {isAdmin ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="More actions">
                      <LuEllipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {mayWriteWithAi ? (
                      <DropdownMenuItem className="sm:hidden" disabled={!!busy} onSelect={() => void writeWithAi()}>
                        <LuSparkles /> Write with AI
                      </DropdownMenuItem>
                    ) : null}
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
        {busy === 'refresh' || busy === 'ai' ? (
          <div className="flex items-center gap-2 border-t bg-muted/40 px-4 py-2 text-sm text-muted-foreground sm:px-6" role="status">
            <Spinner /> {busy === 'ai' ? 'AI is writing a draft from the figures…' : 'Updating the figures…'}
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
