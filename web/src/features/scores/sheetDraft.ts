import { httpsCallable } from 'firebase/functions'
import { type SheetReading, courseRows } from '@shared/scores/sheet'
import { readSheetShots } from '@shared/scores/sheetRead'
import { type SheetPlaces, placedSeries, placesByPosition, sheetSeriesOf } from '@shared/scores/sheetSave'
import type { Evaluation, Position, ResultKind } from '@shared/shooting/evaluation'
import { wholeScore } from '@shared/shooting/target'
import type { RgbaImage } from '@shared/targets/image'
import type { DateKey } from '@shared/time'
import type { AuditStamp } from '@shared/types'
import { functions } from '@/lib/firebase'

/**
 * A competition's results sheet, read and checked before it's saved: the reader (Google's text reader, on the server)
 * and the form's figures, shared by Add a competition (CompetitionDialog.tsx) and the Scores page's Add scores.
 */

/** Reads a sheet's photo or PDF on the server (functions/src/sheets.ts). */
export const readSheet = httpsCallable<{ branchId: string; content: string; mime: string }, { reading: SheetReading; found: boolean }>(functions, 'readResultsSheet')

/**
 * A photo shrunk to read (2000 px is plenty for printed text), as base64 JPEG, with its pixels for finding the shots on
 * the sheet's target pictures (the server's words have their places on these same pixels); a PDF as it is.
 */
export async function sheetContent(file: File): Promise<{ content: string; mime: string; pixels?: RgbaImage }> {
  const base64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
      r.onerror = () => reject(r.error)
      r.readAsDataURL(blob)
    })
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return { content: await base64(file), mime: 'application/pdf' }
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

/** One position's line of the form. */
export interface SheetRow {
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

/** Everything the form holds about a match. */
export interface SheetDraft {
  match: string
  course: string
  dateKey: DateKey
  decimal: boolean
  kind: ResultKind
  note: string
  rows: SheetRow[]
}

export const emptySheetRow = (key: number, position: Position | null = null): SheetRow => ({ key, position, shots: '', total: '', innerTens: '', values: null })

/** A new match's form: one standing line, today, a competition. */
export const newSheetDraft = (today: DateKey, key: number): SheetDraft => ({ match: '', course: '', dateKey: today, decimal: false, kind: 'competition', note: '', rows: [emptySheetRow(key, 'standing')] })

/**
 * What a sheet's reading fills in (the match, the date, each position's shots, total and inner tens, and each shot's
 * place on the sheet's targets when its photo shows them), with what to say about it. Whose it is comes from the name
 * printed on it (`sheetStudent`), said by each place that reads one.
 */
export function draftFromReading(
  r: SheetReading,
  pixels: RgbaImage | undefined,
  { base, today, nextKey }: { base: SheetDraft; today: DateKey; nextKey: () => number },
): { draft: SheetDraft; readNote: string; placedNote: string | null } {
  const draft: SheetDraft = { ...base }
  if (r.match) draft.match = r.match
  if (r.course) draft.course = r.course
  if (r.dateKey && r.dateKey <= today) draft.dateKey = r.dateKey
  draft.decimal = r.decimal
  if (r.positions.length) {
    draft.rows = r.positions.map((p) => {
      // Shots the reader missed: the course says how many there are; the total then needs the sheet's own.
      const missed = r.perPosition !== null && p.shots.length < r.perPosition ? r.perPosition - p.shots.length : 0
      return {
        key: nextKey(),
        position: p.position,
        shots: String(p.shots.length + missed),
        total: r.decimal ? p.decimalTotal.toFixed(1) : String(p.wholeTotal),
        innerTens: r.decimal ? '' : String(p.innerTens),
        values: r.consistent ? p.shots : null,
        check: missed ? `${missed} ${missed === 1 ? 'shot' : 'shots'} not read: type this position's total from the sheet.` : null,
      }
    })
  } else if (r.total !== null) {
    draft.rows = [{ ...emptySheetRow(nextKey(), base.rows[0]?.position ?? 'standing'), total: String(r.total), innerTens: r.innerTens === null ? '' : String(r.innerTens) }]
  }
  const readNote = r.consistent
    ? `Read from the sheet: ${r.positions.length} ${r.positions.length === 1 ? 'position' : 'positions'}, adding up to the printed ${r.total}${r.innerTens !== null ? `-${r.innerTens}` : ''}.`
    : 'Partly read: check every number against the sheet.'
  // Then each shot's place on the sheet's target pictures, for the replay: the rows keep it with their values.
  let placedNote: string | null = null
  if (pixels && r.consistent && r.positions.length) {
    const shots = readSheetShots(pixels, r)
    const places = placesByPosition(shots)
    const { placed, of } = placedSeries(shots)
    draft.rows = draft.rows.map((row) => (row.position && row.values ? { ...row, places: places[row.position] ?? null } : row))
    if (of) placedNote = placed === of ? `Every shot's place found on the sheet's targets (${of} series): they play back on the score.` : placed ? `Shots placed on ${placed} of ${of} series' targets; the others keep their scores only.` : "The sheet's targets couldn't be read, so the shots keep their scores only."
  }
  return { draft, readNote, placedNote }
}

/** Courses of fire filled in one tap when a match is typed by hand (the third meeting, CP5). */
export const QUICK_COURSES = [
  { label: '3×20', course: '3x20 Air Rifle' },
  { label: '3×10', course: '3x10 Air Rifle' },
  { label: '60 shots', course: '60 Shots Air Rifle' },
  { label: '40 shots', course: '40 Shots Air Rifle' },
] as const

/** A course of fire's positions and shots in the form, keeping any total already typed for a position it has. */
export function withCourse(d: SheetDraft, course: string, nextKey: () => number): SheetDraft {
  const list = courseRows(course)
  if (!list) return d
  const rows = list.map(({ position, shots }) => {
    const had = d.rows.find((r) => r.position === position)
    return { ...emptySheetRow(nextKey(), position), shots: String(shots), total: had?.total ?? '', innerTens: had?.innerTens ?? '' }
  })
  return { ...d, course, rows }
}

/** Each line's numbers, and whether every one is a result that can be saved (each position once, a date). */
export function checkSheet(d: Pick<SheetDraft, 'rows' | 'decimal' | 'dateKey'>) {
  const parsed = d.rows.map((r) => {
    const shots = Number(r.shots)
    const total = Number(r.total)
    const tens = r.innerTens.trim() === '' ? null : Number(r.innerTens)
    const max = shots * (d.decimal ? 10.9 : 10)
    const ok =
      !!r.position &&
      Number.isInteger(shots) &&
      shots >= 1 &&
      shots <= 200 &&
      r.total.trim() !== '' &&
      Number.isFinite(total) &&
      total >= 0 &&
      total <= max + 1e-9 &&
      (d.decimal || Number.isInteger(total)) &&
      (tens === null || (Number.isInteger(tens) && tens >= 0 && tens <= shots))
    return { r, shots, total, tens, ok }
  })
  const ready = parsed.length > 0 && parsed.every((p) => p.ok) && !!d.dateKey && new Set(d.rows.map((r) => r.position)).size === d.rows.length
  return { parsed, ready }
}

/** The results a checked sheet saves, one per position, labelled with the match. */
export function sheetEvaluations(d: SheetDraft, student: { id: string; name: string }): Omit<Evaluation, keyof AuditStamp>[] {
  const label = { name: d.match.trim(), course: d.course.trim() }
  return checkSheet(d).parsed.map(({ r, shots, total, tens }) => {
    const values = r.values && r.values.length === shots ? r.values : null
    const series = values ? sheetSeriesOf(values, r.places) : []
    return {
      studentId: student.id,
      studentName: student.name,
      source: 'sheet',
      kind: d.kind,
      position: r.position as Position,
      dateKey: d.dateKey,
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
      note: d.note.trim(),
      problems: [],
      sius: null,
      match: label.name || label.course ? label : null,
    }
  })
}
