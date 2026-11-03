import { useEffect, useMemo, useRef, useState } from 'react'
import { LuArrowRight, LuCircleAlert, LuCopy, LuFileSearch, LuInfo, LuX } from 'react-icons/lu'
import type { DriveStudent } from '@shared/drive/model'
import { type ResultPrint, repeatOf, sameResult } from '@shared/scores/duplicates'
import { POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, isPosition, type ResultKind } from '@shared/shooting/evaluation'
import { formatDateKey, formatMinutes } from '@shared/time'
import { OptionPicker } from '@/components/app/OptionPicker'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { TargetPlot } from '@/features/scores/TargetPlot'
import { cn } from '@/lib/utils'
import { ResultKindPicker } from '@/features/scores/kinds'
import { type SiusFile, siusPrint } from './sius'

/** One dropped SIUS PDF, read and waiting for its student and position. */
export interface ResultRow {
  key: string
  file: File
  plan: { name: string; kind: string; mime: string }
  sius: SiusFile
  studentId: string | null
  position: Position | null
  /** Where the student was read from (the name printed on the report, or the file name): shown until someone picks one. */
  studentFrom?: ReadFrom | null
  /** Where the position was read from. */
  positionFrom?: ReadFrom | null
  /** Already in the student's scores (or twice in this drop), and added anyway. */
  keepRepeat?: boolean
}

/** A result already saved for its student, or the same as one above it in this drop. */
type Repeat = { kind: 'saved' } | { kind: 'twin'; of: string }

/** A choice read from the report's words or from the file name. */
export type ReadFrom = 'report' | 'file'

/** Rows and "Set all" share the columns: the target, the result, the student, the position, and Remove. */
const COLUMNS = 'sm:grid-cols-[56px_minmax(0,1fr)_14rem_10rem_2rem]'
/** Under the result on a phone: the student and the position side by side. */
const PICKERS = 'grid grid-cols-[minmax(0,1fr)_7.5rem] gap-2 sm:contents'

/** A placeholder short enough for a phone's narrow column, and the full one where there's room. */
const fits = (phone: string, wide: string) => (
  <>
    <span className="sm:hidden">{phone}</span>
    <span className="hidden sm:inline">{wide}</span>
  </>
)

function PositionSelect({ value, onChange, placeholder, label }: { value: Position | null; onChange: (p: Position) => void; placeholder: React.ReactNode; label: string }) {
  return (
    <Select value={value ?? ''} onValueChange={(v) => isPosition(v) && onChange(v)}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {POSITIONS.map((p) => (
          <SelectItem key={p} value={p}>
            {POSITION_LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Marks a choice read from the report or the file name, so whoever adds the result checks it. */
function ReadFromNote({ what, from }: { what: 'student' | 'position'; from: ReadFrom }) {
  const where = from === 'report' ? 'the report' : 'the file name'
  return (
    <p className="flex items-center gap-1 text-[11px] leading-4 text-amber-700 dark:text-amber-400" title={`The ${what} was read from ${where}: check it’s right.`} data-testid={`guessed-${what}`}>
      <LuFileSearch className="size-3 shrink-0" /> From {where}
    </p>
  )
}

export function AddResultsDialog({
  rows: initial,
  students,
  fixedStudentId,
  whereOf,
  savedOf,
  onConfirm,
  onClose,
}: {
  rows: ResultRow[]
  students: readonly DriveStudent[]
  /** Dropped inside a student's folder: every result is that student's. */
  fixedStudentId: string | null
  /** Where a student's result is filed ("Mia Larkin’s folder"). */
  whereOf: (studentId: string) => string
  /** A student's results already saved, for the duplicate check (the third meeting, CP2). */
  savedOf: (studentId: string) => Promise<ResultPrint[]>
  /** The rows to add (repeats only when added anyway), and what they were (Practice, Competition or Evaluation). */
  onConfirm: (rows: ResultRow[], kind: ResultKind) => Promise<void>
  onClose: () => void
}) {
  const [rows, setRows] = useState(initial)
  const [kind, setKind] = useState<ResultKind>('practice')
  const [busy, setBusy] = useState(false)
  // A finished student's folder can still take a result dropped into it.
  const options = useMemo(() => students.filter((s) => !s.finished || s.id === fixedStudentId).map((s) => ({ value: s.id, label: s.name })), [students, fixedStudentId])
  // Each student's saved results, read once their result's student is known, so a repeat shows at once (Goo,
  // 2026-11-03): it isn't added unless someone adds it anyway.
  const [saved, setSaved] = useState<Record<string, ResultPrint[] | 'failed'>>({})
  const asked = useRef(new Set<string>())
  const needed = useMemo(() => [...new Set(rows.filter((r) => r.studentId && !r.sius.reading.noShots).map((r) => r.studentId as string))], [rows])
  useEffect(() => {
    for (const id of needed) {
      if (asked.current.has(id)) continue
      asked.current.add(id)
      savedOf(id).then(
        (prints) => setSaved((s) => ({ ...s, [id]: prints })),
        // Unknown: nothing is called a repeat, and the server-side check on adding still runs.
        () => setSaved((s) => ({ ...s, [id]: 'failed' })),
      )
    }
  }, [needed, savedOf])
  const checking = needed.some((id) => !(id in saved))
  const repeats = useMemo(() => {
    const out = new Map<string, Repeat>()
    const taken = new Map<string, { print: ResultPrint; name: string }[]>()
    for (const r of rows) {
      if (!r.studentId || r.sius.reading.noShots) continue
      const print = siusPrint(r.studentId, r.position, r.sius.reading)
      const theirs = saved[r.studentId]
      const twin = (taken.get(r.studentId) ?? []).find((t) => sameResult(t.print, print))
      const repeat: Repeat | null = Array.isArray(theirs) && repeatOf(print, theirs) ? { kind: 'saved' } : twin ? { kind: 'twin', of: twin.name } : null
      if (repeat) out.set(r.key, repeat)
      if (!repeat || r.keepRepeat) taken.set(r.studentId, [...(taken.get(r.studentId) ?? []), { print, name: r.file.name }])
    }
    return out
  }, [rows, saved])
  const adding = rows.filter((r) => !repeats.has(r.key) || r.keepRepeat)
  const leftOut = rows.length - adding.length
  const firstName = (studentId: string) => (options.find((o) => o.value === studentId)?.label ?? 'the student').split(' ')[0]
  const set = (key: string, patch: Partial<ResultRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  // A file taken off the list (a duplicate, or one dropped by mistake) isn't added; the last one closes the dialog.
  const remove = (key: string) => {
    if (rows.length === 1) return onClose()
    setRows((all) => all.filter((r) => r.key !== key))
  }
  const setAll = (patch: Partial<ResultRow>) => setRows((all) => all.map((r) => ({ ...r, ...patch })))
  // "Set all" shows the student or the position when every row has the same one.
  const allStudent = rows.every((r) => r.studentId === rows[0]?.studentId) ? (rows[0]?.studentId ?? null) : null
  const allPosition = rows.every((r) => r.position === rows[0]?.position) ? (rows[0]?.position ?? null) : null
  const missing = adding.filter((r) => !r.studentId || (!r.sius.reading.noShots && !r.position)).length
  const scored = adding.filter((r) => !r.sius.reading.noShots).length
  const fixedName = fixedStudentId ? options.find((o) => o.value === fixedStudentId)?.label : null
  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm(adding, kind)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="flex max-h-[92svh] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>
            {rows.length === 1 ? 'Add a SIUS result' : `Add ${rows.length} SIUS results`}
            {fixedName ? ` for ${fixedName}` : ''}
          </DialogTitle>
          <DialogDescription>
            {fixedName
              ? `The date and the scores come from each PDF. Check the position: each result is filed in ${whereOf(fixedStudentId!)}, named by its date, with its scores.`
              : 'The date and the scores come from each PDF. Choose whose result each one is and its position: it’s filed in that student’s folder, named by its date, with its scores.'}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">What {rows.length === 1 ? 'it was' : 'they were'}</span>
            <ResultKindPicker value={kind} onChange={setKind} />
          </div>
          <div className="rounded-lg border">
            {rows.length > 1 ? (
              // Kept in view over a long list, where there's the height for it.
              <div className={cn('grid gap-x-3 gap-y-2 rounded-t-lg border-b bg-muted p-3 sm:sticky sm:top-0 sm:z-10 sm:items-center', COLUMNS)} data-testid="set-all">
                <span className="hidden sm:block" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">Set all {rows.length}</div>
                  <div className="hidden text-xs text-muted-foreground sm:block">{fixedName ? 'The position for every result at once.' : 'The student or the position for every result at once.'}</div>
                </div>
                <div className={PICKERS}>
                  <OptionPicker
                    value={fixedStudentId ?? allStudent}
                    onChange={(v) => setAll({ studentId: v, studentFrom: null })}
                    options={options}
                    placeholder="Student for all…"
                    searchPlaceholder="Search students…"
                    disabled={!!fixedStudentId}
                    className="w-full bg-background"
                  />
                  <PositionSelect value={allPosition} onChange={(p) => setAll({ position: p, positionFrom: null })} placeholder={fits('Position…', 'Position for all')} label="Position for all" />
                </div>
                <span className="hidden sm:block" />
              </div>
            ) : null}
            <div className="divide-y">
              {rows.map((r) => {
                const reading = r.sius.reading
                const shots = reading.series.flatMap((s) => s.shots)
                const color = r.position ? POSITION_COLORS[r.position] : '#6b7280'
                const studentFrom = r.studentId && !fixedStudentId ? (r.studentFrom ?? null) : null
                const repeat = repeats.get(r.key) ?? null
                return (
                  <div key={r.key} className={cn('relative grid gap-x-3 gap-y-2 p-3 sm:items-start', COLUMNS, repeat && !r.keepRepeat && 'bg-amber-50/40 dark:bg-amber-950/10')} data-testid="result-row">
                    <div className="hidden sm:block">
                      <TargetPlot shots={shots} size={56} color={color} showMpi={false} />
                    </div>
                    {/* On a phone the Remove button sits in the row's corner: the text keeps clear of it. */}
                    <div className="min-w-0 space-y-1 pr-8 sm:pr-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium tabular-nums">{formatDateKey(reading.dateKey, 'weekdayMedium')} · {formatMinutes(reading.timeMin)}</span>
                        {reading.noShots ? (
                          <span className="flex items-center gap-2">
                            <Badge variant="secondary">No shots</Badge>
                            <span className="text-xs text-muted-foreground">kept as a file, without scores</span>
                          </span>
                        ) : (
                          <span className="text-sm tabular-nums">
                            <span className="font-semibold">{reading.total.toFixed(1)}</span>
                            <span className="text-muted-foreground"> · {reading.shots} shots · {reading.innerTens} inner {reading.innerTens === 1 ? 'ten' : 'tens'}</span>
                          </span>
                        )}
                        {reading.problems.length ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                <LuCircleAlert className="size-3.5" /> Check
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{reading.problems.join(' ')}</TooltipContent>
                          </Tooltip>
                        ) : null}
                        {reading.notes.length && !reading.noShots ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex text-muted-foreground" aria-label="Notes">
                                <LuInfo className="size-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{reading.notes.join(' ')}</TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate" title={r.file.name}>
                          {r.file.name}
                        </span>
                        {r.studentId ? (
                          <>
                            <LuArrowRight className="size-3 shrink-0" aria-label="filed in" />
                            <span className="truncate font-medium text-foreground" data-testid="result-where">
                              {whereOf(r.studentId)}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className={PICKERS}>
                      <div className="min-w-0 space-y-1">
                        <OptionPicker
                          value={r.studentId}
                          onChange={(v) => set(r.key, { studentId: v, studentFrom: null })}
                          options={options}
                          placeholder="Whose result?"
                          searchPlaceholder="Search students…"
                          disabled={!!fixedStudentId}
                          className={cn('w-full', studentFrom && 'border-amber-400 dark:border-amber-500/60')}
                        />
                        {studentFrom ? <ReadFromNote what="student" from={studentFrom} /> : null}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <PositionSelect
                          value={r.position}
                          onChange={(p) => set(r.key, { position: p, positionFrom: null })}
                          placeholder={reading.noShots ? fits('Optional', 'Position (optional)') : 'Position'}
                          label="Position"
                        />
                        {r.positionFrom && r.position ? <ReadFromNote what="position" from={r.positionFrom} /> : null}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 size-8 text-muted-foreground hover:text-foreground sm:static sm:mt-0.5"
                      onClick={() => remove(r.key)}
                      disabled={busy}
                      aria-label={`Remove “${r.file.name}”: it won’t be added`}
                      title="Remove: it won’t be added"
                      data-testid="result-remove"
                    >
                      <LuX />
                    </Button>
                    {repeat && r.studentId ? (
                      <div
                        className={cn(
                          'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border px-3 py-2 text-sm sm:col-span-5',
                          r.keepRepeat ? 'text-muted-foreground' : 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200',
                        )}
                        data-testid="drive-repeat"
                      >
                        <LuCopy className="size-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">
                          {r.keepRepeat
                            ? repeat.kind === 'saved'
                              ? `Added anyway, though it’s already in ${firstName(r.studentId)}’s scores.`
                              : `Added anyway, though it’s the same result as “${repeat.of}”.`
                            : repeat.kind === 'saved'
                              ? `“${r.file.name}” is already in ${firstName(r.studentId)}’s scores, so it won’t be added again.`
                              : `“${r.file.name}” is the same result as “${repeat.of}” above, so it won’t be added twice.`}
                        </span>
                        <Button type="button" size="xs" variant="outline" className="bg-background" onClick={() => set(r.key, { keepRepeat: !r.keepRepeat })} data-testid={r.keepRepeat ? 'drive-repeat-skip' : 'drive-repeat-keep'}>
                          {r.keepRepeat ? 'Leave it out' : 'Add it anyway'}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" data-testid="results-status">
            {checking
              ? 'Checking what’s already in the students’ scores…'
              : missing
                ? `${missing} still ${missing === 1 ? 'needs' : 'need'} a student or a position.`
                : `${scored} with scores, ready to add${leftOut ? ` · ${leftOut === 1 ? 'one repeat' : `${leftOut} repeats`} left out` : ''}.`}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={!!missing || busy || checking || !adding.length} data-testid="add-results">
              {busy || checking ? <Spinner /> : null} {!adding.length ? 'Nothing to add' : adding.length === 1 ? 'Add result' : `Add ${adding.length} results`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
