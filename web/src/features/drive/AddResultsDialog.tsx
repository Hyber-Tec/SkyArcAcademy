import { useMemo, useState } from 'react'
import { LuCircleAlert, LuInfo } from 'react-icons/lu'
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
import type { SiusFile } from './sius'

/** One dropped SIUS PDF, read and waiting for its student and position. */
export interface ResultRow {
  key: string
  file: File
  plan: { name: string; kind: string; mime: string }
  sius: SiusFile
  studentId: string | null
  position: Position | null
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

export function AddResultsDialog({
  rows: initial,
  students,
  fixedStudentId,
  onConfirm,
  onClose,
}: {
  rows: ResultRow[]
  students: readonly DriveStudent[]
  /** Dropped inside a student's folder: every result is that student's. */
  fixedStudentId: string | null
  onConfirm: (rows: ResultRow[]) => Promise<void>
  onClose: () => void
}) {
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState(false)
  const options = useMemo(() => students.filter((s) => !s.finished).map((s) => ({ value: s.id, label: s.name })), [students])
  const set = (key: string, patch: Partial<ResultRow>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const missing = rows.filter((r) => !r.studentId || (!r.sius.reading.sightersOnly && !r.position)).length
  const scored = rows.filter((r) => !r.sius.reading.sightersOnly).length
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
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{rows.length === 1 ? 'Add a SIUS result' : `Add ${rows.length} SIUS results`}</DialogTitle>
          <DialogDescription>
            The date and the scores come from each PDF. Check whose result it is and the position; each one is filed in the student’s folder and named by its date.
          </DialogDescription>
        </DialogHeader>
        <div className="divide-y rounded-lg border">
          {rows.map((r) => {
            const reading = r.sius.reading
            const shots = reading.series.flatMap((s) => s.shots)
            const color = r.position ? POSITION_COLORS[r.position] : '#6b7280'
            return (
              <div key={r.key} className="grid gap-3 p-3 sm:grid-cols-[56px_minmax(0,1fr)_14rem_10rem] sm:items-center" data-testid="result-row">
                <div className="hidden sm:block">
                  <TargetPlot shots={shots} size={56} color={color} showMpi={false} />
                </div>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium tabular-nums">{formatDateKey(reading.dateKey, 'weekdayMedium')} · {formatMinutes(reading.timeMin)}</span>
                    {reading.sightersOnly ? (
                      <Badge variant="secondary">Sighters only</Badge>
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
                    {reading.notes.length && !reading.sightersOnly ? (
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
                  <div className="truncate text-xs text-muted-foreground" title={r.file.name}>
                    {r.file.name}
                    {reading.sightersOnly ? ' · saved as a file, without scores' : ''}
                  </div>
                </div>
                <OptionPicker
                  value={r.studentId}
                  onChange={(v) => set(r.key, { studentId: v })}
                  options={options}
                  placeholder="Whose result?"
                  searchPlaceholder="Search students…"
                  disabled={!!fixedStudentId}
                  className="w-full"
                />
                <Select value={r.position ?? ''} onValueChange={(v) => isPosition(v) && set(r.key, { position: v })}>
                  <SelectTrigger className="w-full" aria-label="Position">
                    <SelectValue placeholder={reading.sightersOnly ? 'Position (optional)' : 'Position'} />
                  </SelectTrigger>
                  <SelectContent>
                    {POSITIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {POSITION_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          })}
        </div>
        <DialogFooter className="items-center gap-2 sm:justify-between">
          <p className="text-sm text-muted-foreground">{missing ? `${missing} still ${missing === 1 ? 'needs' : 'need'} a student or a position.` : `${scored} with scores, ready to add.`}</p>
          <div className="flex gap-2">
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
