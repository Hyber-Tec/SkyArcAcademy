import { type ResultPrint, printOf, repeatOf, sameResult } from '@shared/scores/duplicates'
import { POSITION_LABELS, type Position, type ResultKind } from '@shared/shooting/evaluation'
import { cardEvaluation } from '@shared/targets/flat'
import type { DateKey } from '@shared/time'
import type { SiusFile } from '@/features/drive/sius'
import { type CardDraft, cardNeeds } from '@/features/scores/photos/cards'
import type { ReadCard } from '@/features/scores/photos/types'
import { type SheetDraft, checkSheet, sheetEvaluations } from '@/features/scores/sheetDraft'

/**
 * Add scores on the Scores page: each file dropped or chosen, what it turned out to be once read, and whose it is.
 * Pure, so the dialog's words (what's left to do, how many results) come from one place.
 */

/** What reading a file found. */
export type Found =
  /** A SIUS result: its scores, the position (read, or to choose) and what it was. */
  | { kind: 'sius'; sius: SiusFile; position: Position | null; positionFrom: 'report' | 'file' | null; resultKind: ResultKind }
  /** A paper card read from its photo (or a photo whose scores are typed), checked as on the Scores tab. */
  | { kind: 'card'; card: CardDraft; checked: boolean }
  /** A competition's results sheet: its form's figures, checked when it was only partly read. */
  | { kind: 'sheet'; draft: SheetDraft; readNote: string | null; placedNote: string | null; partly: boolean; checked: boolean }
  /** Nothing to save: why, and for a photo, the photo itself (its scores can be typed) and the card reader's own word. */
  | { kind: 'none'; reason: string; photo: ReadCard | null; tip: string | null }

export type FileType = 'pdf' | 'photo' | 'other'

export interface AddItem {
  key: number
  file: File
  type: FileType
  status: 'waiting' | 'reading' | 'done'
  /** While reading, what it's being read as ("A SIUS result?", "A results sheet?"). */
  step: string | null
  found: Found | null
  studentId: string | null
  /** Where the student came from: the report's printed name, the file's name, the sheet's shooter, or picked here. */
  studentFrom: 'report' | 'file' | 'sheet' | 'picked' | 'page' | null
  /** On a student's own Scores tab: the other student the file names, when it names one (it's still this student's). */
  namesOther?: string | null
  /** The name the file gives, when it couldn't say whose ("Hwang"), and where: printed on the report or sheet, or its name. */
  said: string | null
  saidIn: 'report' | 'sheet' | 'file' | null
  /** The students it could be, best first. */
  candidates: string[]
  /**
   * The saved result (or a file above it) this one repeats (the third meeting, CP2), set by `markRepeats`: it's left
   * out unless kept anyway.
   */
  repeat?: Repeat | null
  /** Saved anyway, though it repeats one. */
  keepRepeat?: boolean
}

/** What a file repeats: a result in the student's scores (its day), or another file being added (its name). */
export type Repeat = { saved: string; dateKey: DateKey } | { file: string }

/** Left out: it repeats a result, and nobody chose to save it anyway. */
export const leftOut = (item: Pick<AddItem, 'repeat' | 'keepRepeat'>) => !!item.repeat && !item.keepRepeat

/** A file's type, by its own type or its name. */
export function fileTypeOf(f: File): FileType {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) return 'pdf'
  if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)) return 'photo'
  return 'other'
}

/** The results an item saves (a sheet's positions are one each; a SIUS file of sighters only, none). */
export function resultsOf(item: AddItem): number {
  const f = item.found
  if (!f || item.status !== 'done') return 0
  if (leftOut(item)) return 0
  if (f.kind === 'sius') return f.sius.reading.noShots ? 0 : 1
  if (f.kind === 'card') return 1
  if (f.kind === 'sheet') return f.draft.rows.length
  return 0
}

/** An item that saves something (results, or a SIUS file of sighters only). */
export const saves = (item: AddItem) => item.status === 'done' && !!item.found && item.found.kind !== 'none' && !leftOut(item)

/** The results a file would save, as the duplicate check compares them (whose, the day, the position, the scores). */
export function printsOf(item: AddItem): ResultPrint[] {
  const f = item.found
  const studentId = item.studentId
  if (!f || !studentId || item.status !== 'done') return []
  if (f.kind === 'sius') {
    const r = f.sius.reading
    if (r.noShots) return []
    return [{ studentId, dateKey: r.dateKey, position: f.position ?? '', shots: r.shots, total: r.total, printed: r.printed, values: r.series.flatMap((s) => s.shots.map((t) => t.v)) }]
  }
  const student = { id: studentId, name: '' }
  if (f.kind === 'card') {
    const c = f.card
    if (!c.position || !c.review) return []
    return [printOf({ ...cardEvaluation({ student, position: c.position, dateKey: c.dateKey, note: '', review: c.review, total: null }, null), studentId })]
  }
  if (f.kind === 'sheet') return checkSheet(f.draft).ready ? sheetEvaluations(f.draft, student).map((e) => printOf(e)) : []
  return []
}

/**
 * Each file with what it repeats, if anything: a result already in the student's scores (`known`), or a file above it
 * in the list (the same PDF dropped twice). Worked out afresh as files are read, checked or given their student.
 */
export function markRepeats<K extends ResultPrint>(items: readonly AddItem[], known: readonly K[], words: (k: K) => string): AddItem[] {
  const out: AddItem[] = []
  for (const item of items) {
    const prints = printsOf(item)
    let repeat: Repeat | null = null
    for (const p of prints) {
      const saved = repeatOf(p, known)
      if (saved) {
        repeat = { saved: words(saved), dateKey: saved.dateKey }
        break
      }
    }
    if (!repeat && prints.length) {
      const above = out.find((o) => o.studentId === item.studentId && !leftOut(o) && printsOf(o).some((x) => prints.some((p) => sameResult(p, x))))
      if (above) repeat = { file: above.file.name }
    }
    out.push(repeat || item.repeat ? { ...item, repeat } : item)
  }
  return out
}

/** What an item still needs before it's saved, in words after its name ("needs its position"); null when nothing. */
export function itemNeeds(item: AddItem): string | null {
  const f = item.found
  if (!f || item.status !== 'done' || !saves(item)) return null
  if (!item.studentId) return 'needs a student'
  if (f.kind === 'sius') return !f.sius.reading.noShots && !f.position ? 'needs its position' : null
  if (f.kind === 'card') return cardNeeds(f.card)
  if (f.kind === 'sheet') {
    if (f.partly && !f.checked) return 'needs its numbers checked'
    return checkSheet(f.draft).ready ? null : 'needs its numbers checked'
  }
  return null
}

/** What it was, for its menu: a SIUS result's, a card's or a sheet's. */
export function kindOfItem(item: AddItem): ResultKind | null {
  const f = item.found
  if (!f) return null
  if (f.kind === 'sius') return f.resultKind
  if (f.kind === 'card') return f.card.kind
  if (f.kind === 'sheet') return f.draft.kind
  return null
}

/** The same item, its kind changed. */
export function withKind(item: AddItem, kind: ResultKind): AddItem {
  const f = item.found
  if (!f) return item
  if (f.kind === 'sius') return { ...item, found: { ...f, resultKind: kind } }
  if (f.kind === 'card') return { ...item, found: { ...f, card: { ...f.card, kind } } }
  if (f.kind === 'sheet') return { ...item, found: { ...f, draft: { ...f.draft, kind } } }
  return item
}

const plural = (n: number, word: string, words = `${word}s`) => `${n} ${n === 1 ? word : words}`

/** The footer's words: what's still to do, or that everything is ready. */
export function status(items: readonly AddItem[]): { ready: boolean; text: string } {
  const toSave = items.filter(saves)
  const results = toSave.reduce((n, i) => n + resultsOf(i), 0)
  const noStudent = toSave.filter((i) => !i.studentId).length
  if (noStudent) return { ready: false, text: `${plural(noStudent, 'file still needs', 'files still need')} a student.` }
  const other = toSave.find((i) => itemNeeds(i))
  if (other) return { ready: false, text: `${other.file.name} ${itemNeeds(other)}.` }
  if (!toSave.length) return { ready: false, text: 'Nothing here can be saved as scores.' }
  const students = new Set(toSave.map((i) => i.studentId)).size
  const extra = toSave.filter((i) => resultsOf(i) === 0).length
  return {
    ready: true,
    text: results ? `Ready: ${plural(results, 'result')} for ${plural(students, 'student')}${extra ? `, and ${plural(extra, 'file')} of sighters only` : ''}.` : `Ready: ${plural(extra, 'file')} of sighters only, filed without scores.`,
  }
}

/** "Prone · SIUS", the line under a result's name. */
export const positionWords = (p: Position | null) => (p ? POSITION_LABELS[p] : 'Position?')
