import { useMemo, useState } from 'react'
import { LuArrowRight, LuCircleAlert, LuFileSearch, LuInfo } from 'react-icons/lu'
import type { DriveStudent } from '@shared/drive/model'
import { POSITIONS, POSITION_COLORS, POSITION_LABELS, type Position, isPosition } from '@shared/shooting/evaluation'
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
import type { SiusFile } from './sius'

/** One dropped SIUS PDF, read and waiting for its student and position. */
export interface ResultRow {
  key: string
  file: File
  plan: { name: string; kind: string; mime: string }
  sius: SiusFile
  studentId: string | null
  position: Position | null
  /** The student was guessed from the file name: shown as such until someone picks one. */
  studentGuessed?: boolean
  /** The position came from the file name. */
  positionGuessed?: boolean
}

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)

/**
 * The student a file name points at: a student whose first name is a word of it (and, when several share that
 * first name, whose last name is too). Nothing is trusted without the admin seeing it.
 */
export function suggestStudent(fileName: string, students: readonly DriveStudent[]): string | null {
  const name = new Set(words(fileName.replace(/\.pdf$/i, '')))
  const byFirst = students.filter((s) => !s.finished && name.has(words(s.name)[0] ?? ''))
  if (byFirst.length === 1) return byFirst[0].id
  const byBoth = byFirst.filter((s) => words(s.name).slice(1).some((w) => name.has(w)))
  return byBoth.length === 1 ? byBoth[0].id : null
}

/** Rows and "Set all" share the columns: the target, the result, the student, the position. */
const COLUMNS = 'sm:grid-cols-[56px_minmax(0,1fr)_14rem_10rem]'
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

/** Marks a choice read from the file name, so whoever adds the result checks it. */
function FromFileName({ what }: { what: 'student' | 'position' }) {
  return (
    <p className="flex items-center gap-1 text-[11px] leading-4 text-amber-700 dark:text-amber-400" title={`The ${what} was read from the file name: check it’s right.`} data-testid={`guessed-${what}`}>
      <LuFileSearch className="size-3 shrink-0" /> From the file name
    </p>
  )
}

export function AddResultsDialog({
  rows: initial,
  students,
  fixedStudentId,
  whereOf,
  onConfirm,
  onClose,
}: {
  rows: ResultRow[]
  students: readonly DriveStudent[]
  /** Dropped inside a student's folder: every result is that student's. */
  fixedStudentId: string | null
  /** Where a student's result is filed ("Mia Larkin’s folder"). */
  whereOf: (studentId: string) => string
  onConfirm: (rows: ResultRow[]) => Promise<void>
  onClose: () => void
}) {
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState(false)
  // A finished student's folder can still take a result dropped into it.
  const options = useMemo(() => students.filter((s) => !s.finished || s.id === fixedStudentId).map((s) => ({ value: s.id, label: s.name })), [students, fixedStudentId])
  const set = (key: string, patch: Partial<ResultRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const setAll = (patch: Partial<ResultRow>) => setRows((all) => all.map((r) => ({ ...r, ...patch })))
  // "Set all" shows the student or the position when every row has the same one.
  const allStudent = rows.every((r) => r.studentId === rows[0]?.studentId) ? (rows[0]?.studentId ?? null) : null
  const allPosition = rows.every((r) => r.position === rows[0]?.position) ? (rows[0]?.position ?? null) : null
  const missing = rows.filter((r) => !r.studentId || (!r.sius.reading.noShots && !r.position)).length
  const scored = rows.filter((r) => !r.sius.reading.noShots).length
  const fixedName = fixedStudentId ? options.find((o) => o.value === fixedStudentId)?.label : null
  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm(rows)
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
                    onChange={(v) => setAll({ studentId: v, studentGuessed: false })}
                    options={options}
                    placeholder="Student for all…"
                    searchPlaceholder="Search students…"
                    disabled={!!fixedStudentId}
                    className="w-full bg-background"
                  />
                  <PositionSelect value={allPosition} onChange={(p) => setAll({ position: p, positionGuessed: false })} placeholder={fits('Position…', 'Position for all')} label="Position for all" />
                </div>
              </div>
            ) : null}
            <div className="divide-y">
              {rows.map((r) => {
                const reading = r.sius.reading
                const shots = reading.series.flatMap((s) => s.shots)
                const color = r.position ? POSITION_COLORS[r.position] : '#6b7280'
                const guessedStudent = !!r.studentGuessed && !!r.studentId && !fixedStudentId
                return (
                  <div key={r.key} className={cn('grid gap-x-3 gap-y-2 p-3 sm:items-start', COLUMNS)} data-testid="result-row">
                    <div className="hidden sm:block">
                      <TargetPlot shots={shots} size={56} color={color} showMpi={false} />
                    </div>
                    <div className="min-w-0 space-y-1">
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
                          onChange={(v) => set(r.key, { studentId: v, studentGuessed: false })}
                          options={options}
                          placeholder="Whose result?"
                          searchPlaceholder="Search students…"
                          disabled={!!fixedStudentId}
                          className={cn('w-full', guessedStudent && 'border-amber-400 dark:border-amber-500/60')}
                        />
                        {guessedStudent ? <FromFileName what="student" /> : null}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <PositionSelect
                          value={r.position}
                          onChange={(p) => set(r.key, { position: p, positionGuessed: false })}
                          placeholder={reading.noShots ? fits('Optional', 'Position (optional)') : 'Position'}
                          label="Position"
                        />
                        {r.positionGuessed && r.position ? <FromFileName what="position" /> : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" data-testid="results-status">
            {missing ? `${missing} still ${missing === 1 ? 'needs' : 'need'} a student or a position.` : `${scored} with scores, ready to add.`}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={!!missing || busy}>
              {busy ? <Spinner /> : null} {rows.length === 1 ? 'Add result' : `Add ${rows.length} results`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
