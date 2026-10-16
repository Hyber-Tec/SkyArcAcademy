import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { studentLabel } from '@shared/people'
import { type Evaluation, POSITIONS, POSITION_LABELS, type Position, isPosition, paperEvaluation } from '@shared/shooting/evaluation'
import { type DateKey, todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { OptionPicker } from '@/components/app/OptionPicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useStudentList } from '@/features/data/hooks'
import { createEvaluation, updateEvaluation } from './api'

const BULLS = 10

/**
 * A paper card's scores, typed in: the student, the position, the date written on the card, and either the ten
 * bulls or just the total. Scoring from a photo comes with the phone app (docs/DECISIONS.md §7).
 */
export function PaperScoreDialog({
  open,
  onOpenChange,
  studentId: fixedStudent = null,
  fileId = null,
  position: suggestedPosition = null,
  existing = null,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The student, when it's already known (their folder or page). */
  studentId?: string | null
  /** The card's photo in the Drive. */
  fileId?: string | null
  position?: Position | null
  existing?: WithId<Evaluation> | null
  onSaved?: (evaluationId: string) => void
}) {
  const { branchId, actor, timezone } = useBranch()
  const today = todayKey(timezone)
  const { data: students } = useStudentList(open)
  const firstShots = existing?.series[0]?.shots.map((s) => String(s.v)) ?? []
  const [studentId, setStudentId] = useState<string | null>(existing?.studentId ?? fixedStudent)
  const [position, setPosition] = useState<Position | null>(existing?.position ?? suggestedPosition)
  const [dateKey, setDateKey] = useState<DateKey>(existing?.dateKey ?? today)
  const [mode, setMode] = useState<'bulls' | 'total'>(existing && !firstShots.length ? 'total' : 'bulls')
  const [bulls, setBulls] = useState<string[]>(firstShots.length === BULLS ? firstShots : Array.from({ length: BULLS }, () => ''))
  const [total, setTotal] = useState(existing && !firstShots.length ? String(existing.total) : '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [busy, setBusy] = useState(false)

  const student = students.find((s) => s.id === studentId)
  const values = bulls.map((b) => (b.trim() === '' ? null : Number(b)))
  const bullsOk = values.every((v) => v !== null && Number.isInteger(v) && v >= 0 && v <= 10)
  const bullsTotal = values.reduce<number>((n, v) => n + (v ?? 0), 0)
  const totalNumber = Number(total)
  const totalOk = total.trim() !== '' && Number.isInteger(totalNumber) && totalNumber >= 0 && totalNumber <= 100
  const ready = !!studentId && !!student && !!position && !!dateKey && (mode === 'bulls' ? bullsOk : totalOk)
  const options = useMemo(() => students.filter((s) => s.status !== 'finished' || s.id === studentId).map((s) => ({ value: s.id, label: studentLabel(s.name, s.grade) })), [students, studentId])

  async function save() {
    if (!ready || !student || !position) return
    setBusy(true)
    try {
      const data = paperEvaluation({
        studentId: student.id,
        studentName: student.name,
        position,
        dateKey,
        shots: mode === 'bulls' ? (values as number[]) : null,
        total: mode === 'total' ? totalNumber : null,
        fileId: existing?.fileId ?? fileId,
        note: note.trim(),
      })
      let id = existing?.id ?? ''
      if (existing) await updateEvaluation(branchId, actor, existing.id, existing, data)
      else id = await createEvaluation(branchId, actor, data)
      toast.success(existing ? 'Scores saved' : `Scores added for ${student.name}`)
      onSaved?.(id)
      onOpenChange(false)
    } catch (e) {
      toast.error('Could not save the scores', { description: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Paper card scores' : 'Add paper card scores'}</DialogTitle>
          <DialogDescription>Type the scores written on the card. Use the date on the card, not the photo’s.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>Student</FieldLabel>
            <OptionPicker value={studentId} onChange={setStudentId} options={options} placeholder="Choose a student…" searchPlaceholder="Search students…" disabled={!!fixedStudent || !!existing} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Position</FieldLabel>
              <Select value={position ?? ''} onValueChange={(v) => isPosition(v) && setPosition(v)}>
                <SelectTrigger className="w-full" aria-label="Position">
                  <SelectValue placeholder="Choose…" />
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
              <FieldLabel>Date shot</FieldLabel>
              <DatePicker value={dateKey} onChange={setDateKey} max={today} aria-label="Date shot" />
            </Field>
          </div>
          <Field>
            <div className="flex items-center justify-between gap-3">
              <FieldLabel>Scores</FieldLabel>
              <ToggleGroup type="single" size="sm" variant="outline" value={mode} onValueChange={(v) => v && setMode(v as 'bulls' | 'total')}>
                <ToggleGroupItem value="bulls">Each bull</ToggleGroupItem>
                <ToggleGroupItem value="total">Total only</ToggleGroupItem>
              </ToggleGroup>
            </div>
            {mode === 'bulls' ? (
              <>
                <div className="grid grid-cols-5 gap-2">
                  {bulls.map((b, i) => (
                    <Input
                      key={i}
                      inputMode="numeric"
                      aria-label={`Bull ${i + 1}`}
                      placeholder={String(i + 1)}
                      value={b}
                      onChange={(e) => setBulls((all) => all.map((x, j) => (j === i ? e.target.value.replace(/[^0-9]/g, '').slice(0, 2) : x)))}
                      className="text-center tabular-nums"
                    />
                  ))}
                </div>
                <FieldDescription>
                  Whole numbers, 0 to 10, one per bull. {bullsOk ? `Total ${bullsTotal} out of 100.` : 'Fill in all ten.'}
                </FieldDescription>
              </>
            ) : (
              <>
                <Input inputMode="numeric" aria-label="Total" placeholder="e.g. 87" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} className="w-32 tabular-nums" />
                <FieldDescription>The card’s total, out of 100 (10 shots).</FieldDescription>
              </>
            )}
          </Field>
          <Field>
            <FieldLabel htmlFor="paper-note">Coach’s note (optional)</FieldLabel>
            <Textarea id="paper-note" value={note} maxLength={2000} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering about this card." />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!ready || busy}>
            {busy ? <Spinner /> : null} Save scores
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
