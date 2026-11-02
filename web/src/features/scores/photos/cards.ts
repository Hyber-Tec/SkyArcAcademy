import { isViewableImage } from '@shared/drive/files'
import type { DriveFile } from '@shared/drive/types'
import type { Position, ResultKind } from '@shared/shooting/evaluation'
import { type CardReview, SURE, closeCall } from '@shared/targets/review'
import type { DateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import type { ReadCard } from './types'

/** Paper cards read from their photos, while they're checked (AddPaperScores.tsx): what each holds and still needs. */

export type PhotoSource = { kind: 'computer'; file: File } | { kind: 'drive'; file: WithId<DriveFile> }

/** A photo the card reader can read, in the Drive: what browsers show, and an iPhone's HEIC. */
export const isPhoto = (f: Pick<DriveFile, 'kind'>) => isViewableImage(f.kind) || f.kind === 'heic' || f.kind === 'heif'

/** A photo from the computer the card reader can read, by its type or its name (a HEIC may come without a type). */
export const isPhotoFile = (f: File) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(f.name)

/** Photos read at once, one after another: a pile from a class reads in well under a minute. */
export const MAX_PHOTOS = 24

export interface CardDraft {
  key: number
  /** The photo's name, as it came. */
  name: string
  source: PhotoSource
  status: 'reading' | 'ready' | 'failed'
  error: string | null
  read: ReadCard | null
  /** The bulls as the scan read them: a box typed back to the scan's score takes its shot again. */
  scanned: CardReview | null
  /** The bulls as checked (or typed, for a photo where no card was found). */
  review: CardReview | null
  position: Position | null
  /** The position came from the photo's name. */
  positionFromName: boolean
  dateKey: DateKey
  /** Where the date came from: the photo's own data (when it was taken), a date in its name, or the file's date. */
  dateFrom: 'photo' | 'name' | 'file'
  kind: ResultKind
  note: string
}

/** No card was found in the photo: its scores are typed, and the photo is kept with them. */
export const typing = (c: CardDraft) => !!c.read && !c.read.found

/** What a card still needs before it's saved, in words ("needs its position"); null when it's ready. */
export function cardNeeds(c: CardDraft): string | null {
  if (c.status === 'reading') return 'is still being read'
  if (c.status === 'failed' || !c.review) return 'couldn’t be read: leave it out'
  if (!c.position) return 'needs its position'
  const r = c.review
  const unseen = r.bulls.filter((b) => !b.found && b.shots.length < r.shotsPerBull).map((b) => b.n)
  if (unseen.length === r.bulls.length) return 'needs its scores typed'
  if (unseen.length === 1) return `needs bull ${unseen[0]}’s score`
  if (unseen.length) return `needs the scores of bulls ${unseen.slice(0, -1).join(', ')} and ${unseen[unseen.length - 1]}`
  return null
}

/** Something about one bull worth a look, with what can be done about it there. */
export type BullLook =
  | { kind: 'close'; n: number; index: number; ring: number; text: string }
  | { kind: 'unsure' | 'marks' | 'missing' | 'unseen'; n: number; text: string }

/**
 * What to look at on a card read from its photo, bull by bull, in plain words: a hole that only just touches a ring's
 * line (counted the higher ring, by the matches' rule), one the scan wasn't sure of, other marks that look like holes,
 * a bull without a hole (it counts 0), and one the photo doesn't show (it needs its score).
 */
export function bullLooks(r: CardReview): BullLook[] {
  const out: BullLook[] = []
  for (const b of r.bulls) {
    if (!b.found && b.shots.length < r.shotsPerBull) {
      out.push({ kind: 'unseen', n: b.n, text: `Bull ${b.n}: the photo doesn’t show it. Type its score.` })
      continue
    }
    if (b.shots.length < r.shotsPerBull) out.push({ kind: 'missing', n: b.n, text: `Bull ${b.n}: no hole was found, so it counts 0. Type its score if there is one.` })
    b.shots.forEach((s, index) => {
      if (s.manual) return
      const close = closeCall(s, r)
      if (close) out.push({ kind: 'close', n: b.n, index, ring: close.ring, text: `Bull ${b.n}: its hole only just touches the ${close.ring}’s line, so it counts ${close.ring}.` })
      else if (s.confidence < SURE) out.push({ kind: 'unsure', n: b.n, text: `Bull ${b.n}: the scan wasn’t sure this is the hole. Check it against the card.` })
    })
    if (b.extra.length) out.push({ kind: 'marks', n: b.n, text: `Bull ${b.n}: other marks look like holes too. Check the one ringed is the shot.` })
  }
  return out
}
