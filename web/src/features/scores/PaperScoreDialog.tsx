import { type Timestamp, serverTimestamp } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { studentLabel } from '@shared/people'
import { type Evaluation, POSITIONS, POSITION_LABELS, type Position, type ResultKind, isPosition, kindOf, paperEvaluation } from '@shared/shooting/evaluation'
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
import { ResultKindPicker } from './kinds'

const BULLS = 10

/**
 * A paper card's scores, typed in: the student, the position, the date written on the card, and either the ten
 * bulls or just the total. Cards scanned with the phone app open here too: one box per shot (two per bull on some
 * cards), and a shot whose score stays keeps its place on the target.
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
  const existingShots = existing?.series[0]?.shots ?? []
  const slots = Math.max(BULLS, existingShots.length)
  const firstShots = existingShots.map((s) => String(s.v))
  const [studentId, setStudentId] = useState<string | null>(existing?.studentId ?? fixedStudent)
  const [position, setPosition] = useState<Position | null>(existing?.position ?? suggestedPosition)
  const [dateKey, setDateKey] = useState<DateKey>(existing?.dateKey ?? today)
  const [mode, setMode] = useState<'bulls' | 'total'>(existing && !firstShots.length ? 'total' : 'bulls')
  const [bulls, setBulls] = useState<string[]>(firstShots.length === slots ? firstShots : Array.from({ length: slots }, () => ''))
  const [total, setTotal] = useState(existing && !firstShots.length ? String(existing.total) : '')
  const [note, setNote] = useState(existing?.note ?? '')
  const [kind, setKind] = useState<ResultKind>(existing ? kindOf(existing) : 'practice')
  // Any number of shots (the manager: 20, 30, 60…): a total alone says how many, for its average per 10.
  const [shotCount, setShotCount] = useState(existing && !firstShots.length ? String(existing.shots) : '10')
  // A card the coach scored by hand: the written score is the official one (the app's reading is kept for reference).
  const [written, setWritten] = useState(existing?.official ? String(existing.total) : '')
  const [busy, setBusy] = useState(false)

  const student = students.find((s) => s.id === studentId)
  const values = bulls.map((b) => (b.trim() === '' ? null : Number(b)))
  const bullsOk = values.every((v) => v !== null && Number.isInteger(v) && v >= 0 && v <= 10)
  const bullsTotal = values.reduce<number>((n, v) => n + (v ?? 0), 0)
  const totalNumber = Number(total)
  const shotsNumber = Number(shotCount)
  const shotsOk = Number.isInteger(shotsNumber) && shotsNumber >= 1 && shotsNumber <= 200
  const totalOk = shotsOk && total.trim() !== '' && Number.isInteger(totalNumber) && totalNumber >= 0 && totalNumber <= shotsNumber * 10
  const writtenNumber = Number(written)
  const writtenOk = written.trim() === '' || (Number.isInteger(writtenNumber) && writtenNumber >= 0 && writtenNumber <= slots * 10)
  // The official score matters for a card read by the app (scanned): a typed card's own scores are the coach's already.
  const scanned = existingShots.some((t) => typeof t.x === 'number')
  const ready = !!studentId && !!student && !!position && !!dateKey && (mode === 'bulls' ? bullsOk && writtenOk : totalOk)
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
        shots:
          mode === 'bulls'
            ? (values as number[]).map((v, i) => {
                const was = existingShots[i]
                return was && was.v === v && typeof was.x === 'number' && typeof was.y === 'number' ? { v, x: was.x, y: was.y } : v
              })
            : null,
        total: mode === 'total' ? totalNumber : null,
        shotCount: mode === 'total' ? shotsNumber : undefined,
        fileId: existing?.fileId ?? fileId,
        note: note.trim(),
      })
      data.kind = kind
      // The written score, when it differs from the app's reading, is what everyone sees (totals, charts, reports).
      const official = mode === 'bulls' && scanned && written.trim() !== '' && writtenNumber !== data.total ? writtenNumber : null
      data.official = official === null ? null : { appTotal: data.total, by: actor.email, at: serverTimestamp() as unknown as Timestamp }
      if (official !== null) {
        data.total = official
        data.wholeTotal = official
      }
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
                      aria-label={`${slots > BULLS ? 'Shot' : 'Bull'} ${i + 1}`}
                      placeholder={String(i + 1)}
                      value={b}
                      onChange={(e) => setBulls((all) => all.map((x, j) => (j === i ? e.target.value.replace(/[^0-9]/g, '').slice(0, 2) : x)))}
                      className="text-center tabular-nums"
                    />
                  ))}
                </div>
                <FieldDescription>
                  Whole numbers, 0 to 10, one per {slots > BULLS ? 'shot' : 'bull'}. {bullsOk ? `Total ${bullsTotal} out of ${slots * 10}.` : `Fill in all ${slots === BULLS ? 'ten' : slots}.`}
                </FieldDescription>
                {scanned ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <FieldLabel htmlFor="paper-official" className="font-normal">
                      Score written on the card (official)
                    </FieldLabel>
                    <Input
                      id="paper-official"
                      inputMode="numeric"
                      value={written}
                      placeholder={bullsOk ? String(bullsTotal) : ''}
                      onChange={(e) => setWritten(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                      className="w-24 tabular-nums"
                    />
                    <FieldDescription className="w-full">
                      For a card the coach already scored: families, charts and reports show the written score; the app’s reading is kept for reference.
                    </FieldDescription>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Input inputMode="numeric" aria-label="Total" placeholder="e.g. 87" value={total} onChange={(e) => setTotal(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))} className="w-28 tabular-nums" />
                  <span className="text-muted-foreground">over</span>
                  <Input inputMode="numeric" aria-label="Shots" value={shotCount} onChange={(e) => setShotCount(e.target.value.replace(/[^0-9]/g, '').slice(0, 3))} className="w-20 tabular-nums" />
                  <span className="text-muted-foreground">shots</span>
                </div>
                <FieldDescription>{shotsOk ? `The total, out of ${shotsNumber * 10} (${shotsNumber} shots, whole numbers).` : 'How many shots: 10 a card, 20, 30, 60…'}</FieldDescription>
              </>
            )}
          </Field>
          <Field>
            <FieldLabel>What it was</FieldLabel>
            <ResultKindPicker value={kind} onChange={setKind} />
          </Field>
          <Field>
            <FieldLabel htmlFor="paper-note">Coach’s note (optional)</FieldLabel>
            <Textarea id="paper-note" value={note} maxLength={2000} rows={2} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering about this card." />
            <FieldDescription>The student and their parents see this note with the score.</FieldDescription>
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
