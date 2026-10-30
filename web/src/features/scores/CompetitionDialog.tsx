import { httpsCallable } from 'firebase/functions'
import { useRef, useState } from 'react'
import { LuFileImage, LuPlus, LuScanText, LuTrash2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { classifyFile, cleanFileName } from '@shared/drive/files'
import { studentFolderId } from '@shared/drive/types'
import type { SheetReading } from '@shared/scores/sheet'
import { readSheetShots } from '@shared/scores/sheetRead'
import { type SheetPlaces, placedSeries, placesByPosition, sheetSeriesOf } from '@shared/scores/sheetSave'
import { type Evaluation, POSITIONS, POSITION_LABELS, type Position, type ResultKind, isPosition } from '@shared/shooting/evaluation'
import type { RgbaImage } from '@shared/targets/image'
import { wholeScore } from '@shared/shooting/target'
import { type DateKey, todayKey } from '@shared/time'
import type { AuditStamp } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { plannedFile, saveSheetResults } from '@/features/drive/upload'
import { useDriveIndex } from '@/features/drive/useDriveIndex'
import { functions } from '@/lib/firebase'
import { ResultKindPicker } from './kinds'

const read = httpsCallable<{ branchId: string; content: string; mime: string }, { reading: SheetReading; found: boolean }>(functions, 'readResultsSheet')

/**
 * A photo shrunk to read (2000 px is plenty for printed text), as base64 JPEG, with its pixels for finding the shots on
 * the sheet's target pictures (the server's words have their places on these same pixels); a PDF as it is.
 */
async function contentOf(file: File): Promise<{ content: string; mime: string; pixels?: RgbaImage }> {
  const base64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
  if (file.type === 'application/pdf') return { content: await base64(file), mime: 'application/pdf' }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const pixels = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : undefined
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('The photo couldn’t be prepared.')
  return { content: await base64(blob), mime: 'image/jpeg', pixels }
}

interface Row {
  key: number
  position: Position | null
  shots: string
  total: string
  innerTens: string
  /** Each shot, when the sheet listed them and they add up. */
  values: number[] | null
  /** Their places on the sheet's target pictures, when found (they go with the values). */
  places?: SheetPlaces | null
  /** What to check, when the sheet was only partly read ("1 shot not read: check the total"). */
  check?: string | null
}

const emptyRow = (key: number, position: Position | null = null): Row => ({ key, position, shots: '', total: '', innerTens: '', values: null })

/**
 * Student page → Scores → Add a competition (the manager's second meeting, P7): a match's results from its sheet. A
 * photo or PDF of the sheet is read by Google's text reader to fill the form (the shooter, the match, the date, each
 * position's total and inner tens); the staff check it and save. Each position becomes a result labelled Competition
 * (or what they choose), with the sheet filed in the student's Drive folder.
 */
export function CompetitionDialog({ open, onOpenChange, studentId, studentName }: { open: boolean; onOpenChange: (o: boolean) => void; studentId: string; studentName: string }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92svh] flex-col sm:max-w-xl" data-testid="competition-dialog">
        {open ? <CompetitionForm studentId={studentId} studentName={studentName} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

function CompetitionForm({ studentId, studentName, onDone }: { studentId: string; studentName: string; onDone: () => void }) {
  const { branchId, actor, timezone } = useBranch()
  const index = useDriveIndex()
  const today = todayKey(timezone)
  const fileInput = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [readNote, setReadNote] = useState<string | null>(null)
  const [placedNote, setPlacedNote] = useState<string | null>(null)
  const [match, setMatch] = useState('')
  const [course, setCourse] = useState('')
  const [dateKey, setDateKey] = useState<DateKey>(today)
  const [decimal, setDecimal] = useState(false)
  const [kind, setKind] = useState<ResultKind>('competition')
  const [note, setNote] = useState('')
  const [rows, setRows] = useState<Row[]>([emptyRow(1, 'standing')])
  const [busy, setBusy] = useState(false)
  const nextKey = useRef(2)

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch, values: 'values' in patch ? (patch.values ?? null) : null, places: 'values' in patch ? r.places : null } : r)))

  async function choose(f: File | null) {
    setFile(f)
    setReadNote(null)
    setPlacedNote(null)
    if (!f) return
    setReading(true)
    try {
      const { pixels, ...content } = await contentOf(f)
      const { reading: r, found } = (await read({ branchId, ...content })).data
      if (!found) {
        setReadNote('No text found on it. Type the numbers below.')
        return
      }
      if (r.match) setMatch(r.match)
      if (r.course) setCourse(r.course)
      if (r.dateKey && r.dateKey <= today) setDateKey(r.dateKey)
      setDecimal(r.decimal)
      if (r.positions.length) {
        setRows(
          r.positions.map((p) => {
            // Shots the reader missed: the course says how many there are; the total then needs the sheet's own.
            const missed = r.perPosition !== null && p.shots.length < r.perPosition ? r.perPosition - p.shots.length : 0
            return {
              key: nextKey.current++,
              position: p.position,
              shots: String(p.shots.length + missed),
              total: r.decimal ? p.decimalTotal.toFixed(1) : String(p.wholeTotal),
              innerTens: r.decimal ? '' : String(p.innerTens),
              values: r.consistent ? p.shots : null,
              check: missed ? `${missed} ${missed === 1 ? 'shot' : 'shots'} not read: type this position's total from the sheet.` : null,
            }
          }),
        )
      } else if (r.total !== null) {
        setRows([{ ...emptyRow(nextKey.current++, rows[0]?.position ?? 'standing'), total: String(r.total), innerTens: r.innerTens === null ? '' : String(r.innerTens) }])
      }
      const who = r.name && !r.name.toLowerCase().includes(studentName.split(' ')[0].toLowerCase()) ? ` The sheet names ${r.name}: check it’s ${studentName}’s.` : ''
      setReadNote(
        r.consistent
          ? `Read from the sheet: ${r.positions.length} ${r.positions.length === 1 ? 'position' : 'positions'}, adding up to the printed ${r.total}${r.innerTens !== null ? `-${r.innerTens}` : ''}.${who}`
          : `Partly read: check every number against the sheet.${who}`,
      )
      // Then each shot's place on the sheet's target pictures, for the replay: the rows keep it with their values.
      if (pixels && r.consistent && r.positions.length) {
        const shots = readSheetShots(pixels, r)
        const places = placesByPosition(shots)
        const { placed, of } = placedSeries(shots)
        setRows((all) => all.map((row) => (row.position && row.values ? { ...row, places: places[row.position] ?? null } : row)))
        if (of) setPlacedNote(placed === of ? `Every shot's place found on the sheet's targets (${of} series): they play back on the score.` : placed ? `Shots placed on ${placed} of ${of} series' targets; the others keep their scores only.` : "The sheet's targets couldn't be read, so the shots keep their scores only.")
      }
    } catch (e) {
      setReadNote((e as Error).message || 'The sheet couldn’t be read. Type the numbers below.')
    } finally {
      setReading(false)
    }
  }

  const parsed = rows.map((r) => {
    const shots = Number(r.shots)
    const total = Number(r.total)
    const tens = r.innerTens.trim() === '' ? null : Number(r.innerTens)
    const max = shots * (decimal ? 10.9 : 10)
    const ok =
      !!r.position &&
      Number.isInteger(shots) &&
      shots >= 1 &&
      shots <= 200 &&
      r.total.trim() !== '' &&
      Number.isFinite(total) &&
      total >= 0 &&
      total <= max + 1e-9 &&
      (decimal || Number.isInteger(total)) &&
      (tens === null || (Number.isInteger(tens) && tens >= 0 && tens <= shots))
    return { r, shots, total, tens, ok }
  })
  const ready = parsed.length > 0 && parsed.every((p) => p.ok) && !!dateKey && new Set(rows.map((r) => r.position)).size === rows.length

  async function save() {
    if (!ready) return
    setBusy(true)
    try {
      const label = { name: match.trim(), course: course.trim() }
      const evaluations: Omit<Evaluation, keyof AuditStamp>[] = parsed.map(({ r, shots, total, tens }) => {
        const values = r.values && r.values.length === shots ? r.values : null
        const series = values ? sheetSeriesOf(values, r.places) : []
        return {
          studentId,
          studentName,
          source: 'sheet',
          kind,
          position: r.position as Position,
          dateKey,
          timeMin: null,
          shots,
          total,
          wholeTotal: values ? values.reduce((n, v) => n + wholeScore(v), 0) : Math.floor(total),
          innerTens: tens,
          mpi: null,
          groupMm: null,
          series,
          sighters: 0,
          fileId: null,
          note: note.trim(),
          problems: [],
          sius: null,
          match: label.name || label.course ? label : null,
        }
      })
      const plan = file ? classifyFile(file) : null
      if (plan && !plan.ok) throw new Error(plan.reason)
      const up =
        file && plan && plan.ok
          ? plannedFile(branchId, file, { ...plan, name: `${cleanFileName(`${dateKey} ${label.name || 'Competition'} results`)}.${plan.kind}` }, studentFolderId(studentId), studentId)
          : null
      const failures = await saveSheetResults(branchId, actor, index, up, evaluations)
      toast.success(evaluations.length === 1 ? 'Competition result added' : `${evaluations.length} competition results added`, {
        description: failures.length ? `The sheet’s file didn’t upload: ${failures[0]}` : up ? 'The sheet is in the student’s Drive folder.' : undefined,
      })
      onDone()
    } catch (e) {
      toast.error('Not saved', { description: (e as Error).message })
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Add a competition result</DialogTitle>
        <DialogDescription>For {studentName}. A photo or PDF of the results sheet fills the form; check every number before saving.</DialogDescription>
      </DialogHeader>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <FieldGroup>
          <Field>
            <FieldLabel>The results sheet</FieldLabel>
            <input ref={fileInput} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void choose(e.target.files?.[0] ?? null)} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={reading}>
                {reading ? <Spinner /> : file ? <LuFileImage /> : <LuScanText />} {reading ? 'Reading the sheet…' : file ? 'Choose another' : 'Choose a photo or PDF'}
              </Button>
              {file ? <span className="min-w-0 truncate text-sm text-muted-foreground">{file.name}</span> : null}
            </div>
            {readNote ? <FieldDescription>{readNote}</FieldDescription> : <FieldDescription>Optional. It’s filed in the student’s Drive folder with the result.</FieldDescription>}
            {placedNote ? <FieldDescription data-testid="sheet-placed-note">{placedNote}</FieldDescription> : null}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="comp-match">Match</FieldLabel>
              <Input id="comp-match" value={match} onChange={(e) => setMatch(e.target.value)} placeholder="e.g. Fall Junior 3P" maxLength={120} />
            </Field>
            <Field>
              <FieldLabel>Date</FieldLabel>
              <DatePicker value={dateKey} onChange={setDateKey} max={today} aria-label="Date" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="comp-course">Course of fire</FieldLabel>
              <Input id="comp-course" value={course} onChange={(e) => setCourse(e.target.value)} placeholder="e.g. 3x20 Air Rifle" maxLength={80} />
            </Field>
            <Field>
              <FieldLabel>Totals</FieldLabel>
              <ToggleGroup type="single" variant="outline" size="sm" value={decimal ? 'decimal' : 'whole'} onValueChange={(v) => v && setDecimal(v === 'decimal')}>
                <ToggleGroupItem value="whole" className="flex-1">
                  Whole (478)
                </ToggleGroupItem>
                <ToggleGroupItem value="decimal" className="flex-1">
                  With tenths (587.4)
                </ToggleGroupItem>
              </ToggleGroup>
            </Field>
          </div>
          <Field>
            <FieldLabel>Each position</FieldLabel>
            <div className="space-y-2">
              <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_2rem] gap-2 text-xs text-muted-foreground">
                <span>Position</span>
                <span>Shots</span>
                <span>Total</span>
                <span>Inner tens</span>
                <span />
              </div>
              {rows.map((r) => (
                <div key={r.key} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.9fr)_2rem] items-center gap-2">
                  <Select value={r.position ?? ''} onValueChange={(v) => isPosition(v) && setRow(r.key, { position: v, values: r.values })}>
                    <SelectTrigger className="w-full" aria-label="Position">
                      <SelectValue placeholder="Position" />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS.map((p) => (
                        <SelectItem key={p} value={p} disabled={rows.some((x) => x.key !== r.key && x.position === p)}>
                          {POSITION_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input inputMode="numeric" aria-label="Shots" value={r.shots} onChange={(e) => setRow(r.key, { shots: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })} className="tabular-nums" placeholder="20" />
                  <Input inputMode="decimal" aria-label="Total" value={r.total} onChange={(e) => setRow(r.key, { total: e.target.value.replace(/[^0-9.]/g, '').slice(0, 6) })} className="tabular-nums" placeholder={decimal ? '196.4' : '187'} />
                  <Input inputMode="numeric" aria-label="Inner tens" value={r.innerTens} onChange={(e) => setRow(r.key, { innerTens: e.target.value.replace(/[^0-9]/g, '').slice(0, 3) })} className="tabular-nums" placeholder="—" />
                  <Button variant="ghost" size="icon-sm" aria-label="Remove" disabled={rows.length === 1} onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}>
                    <LuTrash2 />
                  </Button>
                  {r.check ? <p className="col-span-5 -mt-1 text-xs text-amber-700 dark:text-amber-400">{r.check}</p> : null}
                </div>
              ))}
              {rows.length < POSITIONS.length ? (
                <Button variant="ghost" size="sm" onClick={() => setRows((all) => [...all, emptyRow(nextKey.current++)])}>
                  <LuPlus /> Add a position
                </Button>
              ) : null}
            </div>
            <FieldDescription>Inner tens break ties; leave them empty when the sheet doesn’t give them. A shot reaches 10.9 with decimals.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>What it was</FieldLabel>
            <ResultKindPicker value={kind} onChange={setKind} />
          </Field>
          <Field>
            <FieldLabel htmlFor="comp-note">Coach’s note (optional)</FieldLabel>
            <Textarea id="comp-note" value={note} rows={2} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="How the match went." />
            <FieldDescription>The student and their parents see this note with the score.</FieldDescription>
          </Field>
        </FieldGroup>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => void save()} disabled={!ready || busy || reading} data-testid="competition-save">
          {busy ? <Spinner /> : null} Save
        </Button>
      </DialogFooter>
    </>
  )
}
