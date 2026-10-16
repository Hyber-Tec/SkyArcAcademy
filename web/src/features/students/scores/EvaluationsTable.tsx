import { Fragment, useState } from 'react'
import { LuChevronDown, LuChevronRight, LuFileText, LuPencil, LuTrash2 } from 'react-icons/lu'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { type Evaluation, POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, isPosition, per10 } from '@shared/shooting/evaluation'
import { offsetWords } from '@shared/shooting/target'
import { formatDateKey, formatMinutes } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { ItemMenuButton, menu } from '@/components/app/ItemMenu'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { one } from '@/features/reports/model'
import { type NewEvaluation, deleteEvaluation, updateEvaluation } from '@/features/scores/api'
import { PaperScoreDialog } from '@/features/scores/PaperScoreDialog'
import { TargetPlot } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'

/** The student's evaluations, newest first; a row opens to the target, the series and any notes. */
export function EvaluationsTable({ evaluations, mode }: { evaluations: WithId<Evaluation>[]; mode: 'admin' | 'coach' }) {
  const { branchId, actor } = useBranch()
  const navigate = useNavigate()
  const { confirm, dialog } = useConfirm()
  const [open, setOpen] = useState<string | null>(null)
  const [editing, setEditing] = useState<WithId<Evaluation> | null>(null)
  const admin = mode === 'admin'
  const rows = [...evaluations].reverse()

  async function remove(e: WithId<Evaluation>) {
    const ok = await confirm({
      title: 'Delete these scores?',
      description: `The ${POSITION_LABELS[e.position].toLowerCase()} result of ${formatDateKey(e.dateKey, 'medium')} leaves ${e.studentName}'s scores. Its file stays in the Drive, and reports already made keep their figures.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteEvaluation(branchId, actor, e.id, e)
      toast.success('Scores deleted')
    } catch (err) {
      toast.error('Could not delete the scores', { description: (err as Error).message })
    }
  }

  if (!rows.length) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No scores yet. SIUS results dropped in the Drive and paper cards typed in show here.</p>

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="w-8 py-2.5 pl-3" />
              <th className="py-2.5 pr-3 font-medium">Date</th>
              <th className="py-2.5 pr-3 font-medium">Position</th>
              <th className="py-2.5 pr-3 font-medium">Source</th>
              <th className="py-2.5 pr-3 text-right font-medium">Per 10</th>
              <th className="py-2.5 pr-3 text-right font-medium">Total</th>
              <th className="py-2.5 pr-3 text-right font-medium">Inner tens</th>
              <th className="py-2.5 pr-3 text-right font-medium">Group</th>
              <th className="w-10 py-2.5 pr-3" />
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((e) => {
              const expanded = open === e.id
              const whole = per10(e.wholeTotal, e.shots)
              const decimal = e.source === 'sius' ? per10(e.total, e.shots) : null
              const entries = menu(
                !!e.fileId && { label: 'Open the file in the Drive', icon: LuFileText, onSelect: () => navigate(`/${mode}/drive/file/${e.fileId}`) },
                admin && { label: e.source === 'paper' ? 'Edit scores' : 'Edit position or note', icon: LuPencil, separatorBefore: !!e.fileId, onSelect: () => setEditing(e) },
                admin && { label: 'Delete', icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => void remove(e) },
              )
              return (
                <Fragment key={e.id}>
                  <tr className={cn('cursor-pointer border-b last:border-0 hover:bg-muted/40', expanded && 'bg-muted/30')} onClick={() => setOpen(expanded ? null : e.id)}>
                    <td className="py-2.5 pl-3 text-muted-foreground">
                      <button type="button" aria-label={expanded ? 'Hide details' : 'Show details'} aria-expanded={expanded} className="flex" onClick={(ev) => (ev.stopPropagation(), setOpen(expanded ? null : e.id))}>
                        {expanded ? <LuChevronDown className="size-4" /> : <LuChevronRight className="size-4" />}
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 whitespace-nowrap">
                      {formatDateKey(e.dateKey, 'medium')}
                      {e.timeMin !== null ? <span className="ml-1.5 text-xs text-muted-foreground">{formatMinutes(e.timeMin)}</span> : null}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full" style={{ background: POSITION_COLORS[e.position] }} />
                        {POSITION_LABELS[e.position]}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge variant="outline">{e.source === 'sius' ? 'SIUS' : 'Paper'}</Badge>
                      {e.problems?.length ? (
                        <Badge variant="outline" className="ml-1 border-amber-300 text-amber-800 dark:text-amber-300">
                          Check
                        </Badge>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      <span className="font-semibold">{whole !== null ? one(whole) : '—'}</span>
                      {decimal !== null ? <span className="ml-1.5 text-xs text-muted-foreground">{one(decimal)}</span> : null}
                    </td>
                    <td className="py-2.5 pr-3 text-right">
                      {one(e.total)} <span className="text-xs text-muted-foreground">/ {e.shots}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-right">{e.innerTens ?? '—'}</td>
                    <td className="py-2.5 pr-3 text-right">{e.groupMm !== null ? `${one(e.groupMm)} mm` : '—'}</td>
                    <td className="py-2.5 pr-3" onClick={(ev) => ev.stopPropagation()}>
                      {entries.length ? <ItemMenuButton entries={entries} /> : null}
                    </td>
                  </tr>
                  {expanded ? (
                    <tr className="border-b bg-muted/20">
                      <td />
                      <td colSpan={8} className="py-4 pr-3">
                        <Details e={e} mode={mode} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {editing?.source === 'paper' ? <PaperScoreDialog open onOpenChange={(o) => !o && setEditing(null)} existing={editing} /> : null}
      {editing?.source === 'sius' ? <SiusEditDialog evaluation={editing} onClose={() => setEditing(null)} /> : null}
      {dialog}
    </>
  )
}

function Details({ e, mode }: { e: WithId<Evaluation>; mode: 'admin' | 'coach' }) {
  const directions = e.series.some((s) => s.shots.some((t) => t.a !== null))
  const where = offsetWords(e.mpi)
  return (
    <div className="flex flex-col gap-4 sm:flex-row">
      {directions ? (
        <div className="shrink-0 self-center rounded-xl bg-white p-1">
          <TargetPlot shots={e.series.flatMap((s) => s.shots)} size={150} color={POSITION_COLORS[e.position]} highlightLast />
        </div>
      ) : null}
      <div className="min-w-0 flex-1 space-y-2 text-sm">
        {e.series.length ? (
          <ul className="space-y-1">
            {e.series.map((s) => (
              <li key={s.n} className="flex flex-wrap items-baseline gap-x-2">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{e.source === 'sius' ? `Series ${s.n}` : 'Bulls'}</span>
                <span className="font-medium tabular-nums">{one(s.total)}</span>
                <span className="text-xs break-all text-muted-foreground tabular-nums">{s.shots.map((t) => one(t.v)).join('  ')}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Only the card’s total was typed in.</p>
        )}
        {e.source === 'sius' ? (
          <p className="text-xs text-muted-foreground">
            {[e.sighters ? `${e.sighters} sighters (not counted)` : '', e.mpi ? `Average point ${where ? `${where}, ` : ''}X ${one(e.mpi.x)} mm, Y ${one(e.mpi.y)} mm` : '', e.sius?.clockFixMin ? 'time corrected for the SIUS computer’s clock' : '']
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        {e.note ? <p className="rounded-lg bg-background px-3 py-2">“{e.note}”</p> : null}
        {e.problems?.length ? (
          <ul className="space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            {e.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        {e.fileId ? (
          <Link to={`/${mode}/drive/file/${e.fileId}`} className="inline-flex items-center gap-1 text-xs font-medium underline underline-offset-2">
            <LuFileText className="size-3.5" /> Open the file in the Drive
          </Link>
        ) : null}
      </div>
    </div>
  )
}

/** A SIUS result's scores come from the PDF; what staff can change is the position and the note. */
function SiusEditDialog({ evaluation: e, onClose }: { evaluation: WithId<Evaluation>; onClose: () => void }) {
  const { branchId, actor } = useBranch()
  const [position, setPosition] = useState<Position>(e.position)
  const [note, setNote] = useState(e.note ?? '')
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    try {
      const stamps = new Set(['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy'])
      const data = Object.fromEntries(Object.entries(e).filter(([k]) => !stamps.has(k))) as NewEvaluation
      await updateEvaluation(branchId, actor, e.id, e, { ...data, position, note: note.trim() })
      toast.success('Saved')
      onClose()
    } catch (err) {
      toast.error('Could not save', { description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>SIUS result of {formatDateKey(e.dateKey, 'medium')}</DialogTitle>
          <DialogDescription>The scores come from the PDF. The position and the note are yours to set.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Position</FieldLabel>
            <Select value={position} onValueChange={(v) => isPosition(v) && setPosition(v)}>
              <SelectTrigger className="w-full" aria-label="Position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {POSITION_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="sius-note">Coach’s note</FieldLabel>
            <Textarea id="sius-note" value={note} maxLength={2000} rows={3} onChange={(ev) => setNote(ev.target.value)} placeholder="Anything worth remembering about this result." />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
