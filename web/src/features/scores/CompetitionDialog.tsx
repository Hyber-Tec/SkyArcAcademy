import { useRef, useState } from 'react'
import { LuFileImage, LuPlus, LuScanText, LuTrash2, LuTriangleAlert } from 'react-icons/lu'
import { toast } from 'sonner'
import { classifyFile, cleanFileName } from '@shared/drive/files'
import { studentFolderId } from '@shared/drive/types'
import { type SheetStudent, sheetStudent } from '@shared/scores/sheetStudent'
import { POSITIONS, POSITION_LABELS, isPosition } from '@shared/shooting/evaluation'
import { type DateKey, todayKey } from '@shared/time'
import { useBranch } from '@/branch/BranchProvider'
import { DatePicker } from '@/components/app/DatePicker'
import { useConfirm } from '@/components/app/useConfirm'
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
import { ResultKindPicker } from './kinds'
import { repeatQuestion, repeatsOf } from './repeats'
import { QUICK_COURSES, type SheetDraft, type SheetRow, checkSheet, draftFromReading, emptySheetRow, newSheetDraft, readSheet, sheetContent, sheetEvaluations, withCourse } from './sheetDraft'

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
        {open ? <CompetitionForm student={{ id: studentId, name: studentName }} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  )
}

/** A sheet already read elsewhere (the Scores page's Add scores), to check here: its figures and what was said about them. */
export interface ReadSheet {
  draft: SheetDraft
  fileName: string
  readNote: string | null
  placedNote: string | null
}

/**
 * The competition's form: its sheet (chosen and read here), the match, the date, the course, whole or decimal totals,
 * each position's shots, total and inner tens, what it was and the coach's note. Saved for `student`, or, given a sheet
 * read already (`checking`), handed back checked with `onApply` instead.
 */
export function CompetitionForm({
  student,
  onDone,
  checking,
  onApply,
}: {
  student: { id: string; name: string } | null
  onDone: () => void
  checking?: ReadSheet
  onApply?: (draft: SheetDraft) => void
}) {
  const { branchId, actor, timezone } = useBranch()
  const index = useDriveIndex()
  const today = todayKey(timezone)
  const fileInput = useRef<HTMLInputElement>(null)
  const nextKey = useRef(Math.max(1, ...(checking?.draft.rows.map((r) => r.key + 1) ?? [2])))
  const [file, setFile] = useState<File | null>(null)
  const [reading, setReading] = useState(false)
  const [readNote, setReadNote] = useState<string | null>(checking?.readNote ?? null)
  const [placedNote, setPlacedNote] = useState<string | null>(checking?.placedNote ?? null)
  const [draft, setDraft] = useState<SheetDraft>(() => checking?.draft ?? newSheetDraft(today, 1))
  const [busy, setBusy] = useState(false)
  const { confirm, dialog: confirmDialog } = useConfirm()
  // Whose the sheet says it is (the third meeting, CP1): when it names another student, the result can go to them.
  const [named, setNamed] = useState<(SheetStudent & { name: string }) | null>(null)
  const [instead, setInstead] = useState<{ id: string; name: string } | null>(null)
  const who = instead ?? student
  const studentName = (id: string) => index.students.find((s) => s.id === id)?.name ?? ''
  const { match, course, dateKey, decimal, kind, note, rows } = draft
  const set = (patch: Partial<SheetDraft>) => setDraft((d) => ({ ...d, ...patch }))
  const setRows = (next: (all: SheetRow[]) => SheetRow[]) => setDraft((d) => ({ ...d, rows: next(d.rows) }))

  const setRow = (key: number, patch: Partial<SheetRow>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch, values: 'values' in patch ? (patch.values ?? null) : null, places: 'values' in patch ? r.places : null } : r)))

  async function choose(f: File | null) {
    setFile(f)
    setReadNote(null)
    setPlacedNote(null)
    if (!f) return
    setReading(true)
    try {
      const { pixels, ...content } = await sheetContent(f)
      const { reading: r, found } = (await readSheet({ branchId, ...content })).data
      if (!found) {
        setReadNote('No text found on it. Type the numbers below.')
        return
      }
      const read = draftFromReading(r, pixels, { base: draft, today, nextKey: () => nextKey.current++ })
      setNamed({ ...sheetStudent(r, index.students), name: r.name })
      setDraft(read.draft)
      setReadNote(read.readNote)
      setPlacedNote(read.placedNote)
    } catch (e) {
      setReadNote((e as Error).message || 'The sheet couldn’t be read. Type the numbers below.')
    } finally {
      setReading(false)
    }
  }

  const { ready } = checkSheet(draft)

  async function save() {
    if (!ready || !who) return
    setBusy(true)
    // Already in their scores (the same day, position and scores)? Asked first (the third meeting, CP2).
    const evaluations = sheetEvaluations(draft, who)
    const repeats = await repeatsOf(branchId, evaluations.map((e) => ({ ...e, values: e.series.flatMap((x) => x.shots.map((t) => t.v)) })))
    if (repeats.length && !(await confirm(repeatQuestion(who.name, repeats)))) return setBusy(false)
    try {
      const label = match.trim()
      const plan = file ? classifyFile(file) : null
      if (plan && !plan.ok) throw new Error(plan.reason)
      const up =
        file && plan && plan.ok
          ? plannedFile(branchId, file, { ...plan, name: `${cleanFileName(`${dateKey} ${label || 'Competition'} results`)}.${plan.kind}` }, studentFolderId(who.id), who.id)
          : null
      const failures = await saveSheetResults(branchId, actor, index, up, evaluations)
      toast.success(evaluations.length === 1 ? 'Competition result added' : `${evaluations.length} competition results added`, {
        description: [instead ? `For ${instead.name}.` : '', failures.length ? `The sheet’s file didn’t upload: ${failures[0]}` : up ? 'The sheet is in the student’s Drive folder.' : ''].filter(Boolean).join(' ') || undefined,
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
        <DialogTitle>{checking ? 'Check the competition’s numbers' : 'Add a competition result'}</DialogTitle>
        <DialogDescription>
          {checking
            ? `${student ? `For ${student.name}. ` : ''}Filled in from the sheet; check every number against it.`
            : `For ${who?.name ?? ''}. A photo or PDF of the results sheet fills the form, or type it; check every number before saving.`}
        </DialogDescription>
      </DialogHeader>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <FieldGroup>
          <Field>
            <FieldLabel>The results sheet</FieldLabel>
            {checking ? (
              <p className="flex min-w-0 items-center gap-2 text-sm">
                <LuFileImage className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 truncate">{checking.fileName}</span>
              </p>
            ) : (
              <>
                <input ref={fileInput} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => void choose(e.target.files?.[0] ?? null)} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={reading}>
                    {reading ? <Spinner /> : file ? <LuFileImage /> : <LuScanText />} {reading ? 'Reading the sheet…' : file ? 'Choose another' : 'Choose a photo or PDF'}
                  </Button>
                  {file ? <span className="min-w-0 truncate text-sm text-muted-foreground">{file.name}</span> : null}
                </div>
              </>
            )}
            {readNote ? <FieldDescription>{readNote}</FieldDescription> : <FieldDescription>Optional. It’s filed in the student’s Drive folder with the result.</FieldDescription>}
            {!checking && named && who ? <SheetNames named={named} who={who} nameOf={studentName} onUse={(id) => setInstead(id === student?.id ? null : { id, name: studentName(id) })} /> : null}
            {placedNote ? <FieldDescription data-testid="sheet-placed-note">{placedNote}</FieldDescription> : null}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="comp-match">Match</FieldLabel>
              <Input id="comp-match" value={match} onChange={(e) => set({ match: e.target.value })} placeholder="e.g. Fall Junior 3P" maxLength={120} />
            </Field>
            <Field>
              <FieldLabel>Date</FieldLabel>
              <DatePicker value={dateKey} onChange={(d: DateKey) => set({ dateKey: d })} max={today} aria-label="Date" />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="comp-course">Course of fire</FieldLabel>
              <Input id="comp-course" value={course} onChange={(e) => set({ course: e.target.value })} placeholder="e.g. 3x20 Air Rifle" maxLength={80} />
              {!rows.some((r) => r.values) ? (
                <div className="flex flex-wrap items-center gap-1.5" data-testid="quick-courses">
                  <span className="text-xs text-muted-foreground">No sheet? Fill in:</span>
                  {QUICK_COURSES.map((c) => (
                    <Button key={c.label} type="button" variant="outline" size="xs" onClick={() => setDraft((d) => withCourse(d, c.course, () => nextKey.current++))}>
                      {c.label}
                    </Button>
                  ))}
                </div>
              ) : null}
            </Field>
            <Field>
              <FieldLabel>Totals</FieldLabel>
              <ToggleGroup type="single" variant="outline" size="sm" value={decimal ? 'decimal' : 'whole'} onValueChange={(v) => v && set({ decimal: v === 'decimal' })}>
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
                <Button variant="ghost" size="sm" onClick={() => setRows((all) => [...all, emptySheetRow(nextKey.current++)])}>
                  <LuPlus /> Add a position
                </Button>
              ) : null}
            </div>
            <FieldDescription>Inner tens break ties; leave them empty when the sheet doesn’t give them. A shot reaches 10.9 with decimals.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel>What it was</FieldLabel>
            <ResultKindPicker value={kind} onChange={(k) => set({ kind: k })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="comp-note">Coach’s note (optional)</FieldLabel>
            <Textarea id="comp-note" value={note} rows={2} maxLength={2000} onChange={(e) => set({ note: e.target.value })} placeholder="How the match went." />
            <FieldDescription>The student and their parents see this note with the score.</FieldDescription>
          </Field>
        </FieldGroup>
      </div>
      {confirmDialog}
      <DialogFooter>
        {checking ? (
          <>
            <Button variant="outline" onClick={onDone}>
              Back
            </Button>
            <Button onClick={() => onApply?.(draft)} disabled={!ready} data-testid="competition-apply">
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={onDone} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={!ready || busy || reading} data-testid="competition-save">
              {busy ? <Spinner /> : null} Save
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  )
}

/**
 * What the sheet's printed name says about whose it is: another student's (with a button to save it as theirs), the
 * student's own, or nobody's.
 */
function SheetNames({ named, who, nameOf, onUse }: { named: SheetStudent & { name: string }; who: { id: string; name: string }; nameOf: (id: string) => string; onUse: (id: string) => void }) {
  if (named.id && named.id !== who.id)
    return (
      <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-testid="sheet-other-student">
        <LuTriangleAlert className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          The sheet names {named.name || nameOf(named.id)}, not {who.name}.
        </span>
        <Button type="button" size="xs" variant="outline" className="bg-background" onClick={() => onUse(named.id as string)} data-testid="sheet-use-named">
          It’s {nameOf(named.id)}’s
        </Button>
      </div>
    )
  if (named.id) return <FieldDescription data-testid="sheet-names-student">The sheet names {named.name || who.name}: {who.name}.</FieldDescription>
  if (!named.name) return null
  return (
    <FieldDescription data-testid="sheet-unknown-student">
      The sheet names {named.name}{named.candidates.length ? `, which could be ${named.candidates.map(nameOf).join(' or ')}` : ', and no student has that name'}. Check it’s {who.name}’s.
    </FieldDescription>
  )
}
