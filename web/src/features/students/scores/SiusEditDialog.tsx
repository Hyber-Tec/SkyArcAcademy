import { useState } from 'react'
import { toast } from 'sonner'
import { type Evaluation, POSITIONS, POSITION_LABELS, type Position, isPosition } from '@shared/shooting/evaluation'
import { formatDateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { type NewEvaluation, updateEvaluation } from '@/features/scores/api'

/** A SIUS result's scores come from the PDF; what staff can change is the position and the note. */
export function SiusEditDialog({ evaluation: e, onClose }: { evaluation: WithId<Evaluation>; onClose: () => void }) {
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
