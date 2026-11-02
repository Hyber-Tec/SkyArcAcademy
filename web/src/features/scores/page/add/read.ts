import { dateInName } from '@shared/drive/exif'
import type { DriveStudent } from '@shared/drive/model'
import { studentsNamedIn } from '@shared/drive/suggest'
import { positionFromName } from '@shared/sius/parse'
import { typedReview } from '@shared/targets/review'
import { type DateKey, dateKeyOf } from '@shared/time'
import { readSiusFile } from '@/features/drive/sius'
import type { CardDraft } from '@/features/scores/photos/cards'
import { readCardPhoto } from '@/features/scores/photos/reader'
import type { ReadCard } from '@/features/scores/photos/types'
import { draftFromReading, newSheetDraft, readSheet, sheetContent } from '@/features/scores/sheetDraft'
import { type AddItem, type Found, fileTypeOf } from './items'

/**
 * Reading one file dropped on the Scores page, in turn as what it could be: a PDF as a SIUS result (the Drive's reader),
 * a photo as a paper card (the card reader, as on the Scores tab); and when it's neither, either one as a competition's
 * results sheet (the server's text reader, as Add a competition). Whose it is comes from the name the file gives (on the
 * report, the sheet, or in the file's name), checked by whoever adds it.
 */

type Whose = Pick<AddItem, 'studentId' | 'studentFrom' | 'said' | 'saidIn' | 'candidates'>

/** Whose a text says it is, from where: a name printed on the report or the sheet, or the file's name. */
function whose(text: string, from: 'report' | 'sheet' | 'file', students: readonly DriveStudent[]): Whose | null {
  const named = studentsNamedIn(text, students, { printed: from !== 'file' })
  if (named.id) return { studentId: named.id, studentFrom: from, said: null, saidIn: null, candidates: [] }
  if (named.candidates.length) return { studentId: null, studentFrom: null, said: text.trim() || null, saidIn: from, candidates: named.candidates }
  return null
}

/** The file's own name, without its type. */
const bareName = (f: File) => f.name.replace(/\.[a-z0-9]+$/i, '')

const nobody: Whose = { studentId: null, studentFrom: null, said: null, saidIn: null, candidates: [] }

/** A paper card read from its photo, as the Scores tab's Add paper scores has it (photos/AddPaperScores.tsx). */
export function cardDraft(key: number, file: File, card: ReadCard, today: DateKey, timezone: string): CardDraft {
  const name = file.name
  const position = positionFromName(name)
  const review = card.found ? card.review : typedReview(1)
  // When it was taken, by the photo's own word; else a date in its name; else the file's date. Never after today.
  const named = dateInName(name)
  const date = card.takenAt?.dateKey ?? named ?? (file.lastModified ? dateKeyOf(file.lastModified, timezone) : today)
  return {
    key,
    name,
    source: { kind: 'computer', file },
    status: 'ready',
    error: null,
    read: card,
    scanned: review,
    review,
    position,
    positionFromName: !!position,
    dateKey: date > today ? today : date,
    dateFrom: card.takenAt ? 'photo' : named ? 'name' : 'file',
    kind: 'practice',
    note: '',
  }
}

export async function readFile(
  item: Pick<AddItem, 'key' | 'file'>,
  { branchId, timezone, today, students, onStep }: { branchId: string; timezone: string; today: DateKey; students: readonly DriveStudent[]; onStep: (step: string) => void },
): Promise<Pick<AddItem, 'found'> & Whose> {
  const { file } = item
  const type = fileTypeOf(file)
  if (type === 'other') return { found: { kind: 'none', reason: 'Only PDFs and photos are read here.', photo: null, tip: null }, ...nobody }

  let photo: ReadCard | null = null
  let notCard: string | null = null
  if (type === 'pdf') {
    onStep('Reading it as a SIUS result…')
    const sius = await readSiusFile(file, timezone)
    if (sius) {
      // A name printed on the report (set on the SIUS lane) comes first, then the file's name.
      const printed = sius.result.pageText.join(' ')
      const position = positionFromName(printed) ?? positionFromName(bareName(file))
      const found: Found = { kind: 'sius', sius, position, positionFrom: positionFromName(printed) ? 'report' : position ? 'file' : null, resultKind: 'practice', duplicateOf: null }
      const unknown = printed.trim() ? { ...nobody, said: printed.trim(), saidIn: 'report' as const } : nobody
      return { found, ...(whose(printed, 'report', students) ?? whose(bareName(file), 'file', students) ?? unknown) }
    }
  } else {
    onStep('Reading it as a paper card…')
    try {
      const card = await readCardPhoto(file, file.name)
      if (card.found) return { found: { kind: 'card', card: cardDraft(item.key, file, card, today, timezone), checked: false }, ...(whose(bareName(file), 'file', students) ?? nobody) }
      photo = card
      notCard = card.reason
    } catch (e) {
      return { found: { kind: 'none', reason: e instanceof Error ? e.message : 'This photo couldn’t be opened.', photo: null, tip: null }, ...nobody }
    }
  }

  // Neither a SIUS result nor a card: perhaps a competition's results sheet.
  onStep('Reading it as a results sheet…')
  const what = type === 'pdf' ? 'This PDF isn’t a SIUS result' : 'No paper card was found in this photo'
  const none = (reason: string): Found => ({ kind: 'none', reason, photo, tip: notCard })
  try {
    const { pixels, ...content } = await sheetContent(file)
    const { reading: r, found } = (await readSheet({ branchId, ...content })).data
    if (!found || (!r.positions.length && r.total === null)) return { found: none(`${what}, and it doesn’t read as a results sheet.`), ...nobody }
    let key = 1
    const read = draftFromReading(r, pixels, { base: newSheetDraft(today, key++), today, nextKey: () => key++, studentName: null })
    const sheet: Found = { kind: 'sheet', draft: read.draft, readNote: read.readNote, placedNote: read.placedNote, partly: !r.consistent, checked: false }
    return { found: sheet, ...((r.name ? whose(r.name, 'sheet', students) : null) ?? whose(bareName(file), 'file', students) ?? (r.name ? { ...nobody, said: r.name, saidIn: 'sheet' as const } : nobody)) }
  } catch {
    return { found: none(`${what}, and it couldn’t be read as a results sheet just now.`), ...nobody }
  }
}
