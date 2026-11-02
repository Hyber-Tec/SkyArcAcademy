import type { CardReview } from '@shared/targets/review'

/** What the page asks of the card reader (reader.worker.ts), and what it answers (reader.ts sends and waits). */

export interface ReadRequest {
  id: number
  file: Blob
  /** Its name, to know a HEIC photo by (a computer may not give its type). */
  name: string
}

/** A photo read: the card found in it, or not (then the photo itself, to keep with typed scores). */
export type ReadReply =
  | {
      id: number
      ok: true
      found: true
      /** What the scan read, to check: each bull's shots with their places and scores (shared/src/targets/review.ts). */
      review: CardReview
      /** The card flattened and cropped (FLAT_SIZE), as the Drive keeps it: to show, and its JPEG to file. */
      image: ImageBitmap
      jpeg: Blob
      /** When it was taken, from the photo's own data (shared/src/drive/exif.ts). */
      takenAt: { dateKey: string; minutes: number } | null
    }
  | {
      id: number
      ok: true
      found: false
      /** Why no card was found, in words for the person who took the photo. */
      reason: string
      /** The photo upright (at most 2000 pixels along), to show, and as a JPEG to keep with typed scores. */
      image: ImageBitmap
      jpeg: Blob
      takenAt: { dateKey: string; minutes: number } | null
    }
  | { id: number; ok: false; error: string }

export type ReadCard = Extract<ReadReply, { ok: true }>
