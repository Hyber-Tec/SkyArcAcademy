import type { AuditStamp } from '../types'
import { type Evaluation, POSITION_LABELS, type Position, paperEvaluation } from '../shooting/evaluation'
import type { DateKey } from '../time'
import { CARD_BULLS, CARD_EDGES_MM, bullCentreMm } from './card'
import type { Mat3, Vec } from './geometry'
import { type RgbaImage, sampleRgb } from './image'
import { type CardReview, reviewFromShots, reviewShots } from './review'
import type { ScannedBull } from './scan'

/**
 * The scanned card as the Drive keeps it: the photo turned flat and cropped like a scan, at a fixed size, so its bulls
 * are always in the same places. The phone app makes it when a card is scanned; the phone and the website both draw a
 * saved card's shots on it, and correct them bull by bull.
 */

/** The flattened card: a little paper beyond each edge, at six pixels per millimetre (about 1340 × 1720). */
export const FLAT = { marginMm: 4, pxPerMm: 6 } as const
const FLAT_LEFT = CARD_EDGES_MM.left - FLAT.marginMm
const FLAT_TOP = CARD_EDGES_MM.top - FLAT.marginMm

/** The flattened card's size in pixels: the Drive's copy of a scanned card is exactly this. */
export const FLAT_SIZE = {
  width: Math.round((CARD_EDGES_MM.right - CARD_EDGES_MM.left + 2 * FLAT.marginMm) * FLAT.pxPerMm),
  height: Math.round((CARD_EDGES_MM.bottom - CARD_EDGES_MM.top + 2 * FLAT.marginMm) * FLAT.pxPerMm),
} as const

/** Whether a picture of this size is a flattened card (and so shows the bulls where flatBull says). */
export function isFlatCard(width: number, height: number): boolean {
  return width === FLAT_SIZE.width && height === FLAT_SIZE.height
}

/** Where a point of the card (millimetres from the top-left bull, x right, y down) is on the flattened card. */
export function flatPoint(xMm: number, yMm: number): { x: number; y: number } {
  return { x: (xMm - FLAT_LEFT) * FLAT.pxPerMm, y: (yMm - FLAT_TOP) * FLAT.pxPerMm }
}

/**
 * The card flattened and cropped as a scanner would give it, from a photo through the scan's perspective
 * (`cardToImage`: card millimetres to photo pixels): each pixel taken from the photo between its pixels, white where
 * the photo ends. The website makes the Drive's copy of a card read from a photo with it, as the phone app does with its
 * own image code (mobile/src/features/scan/photo.ts), so a card's shots draw on it in the same places either way.
 */
export function flattenPhoto(img: RgbaImage, cardToImage: Mat3): RgbaImage {
  const { width, height } = FLAT_SIZE
  const data = new Uint8ClampedArray(width * height * 4)
  const [a, b, c, d, e, f, g, h, k] = cardToImage
  const rgb = [255, 255, 255]
  for (let py = 0; py < height; py++) {
    // Each pixel's middle, in card millimetres; the photo's pixels have their middles at whole coordinates (image.ts).
    const ym = (py + 0.5) / FLAT.pxPerMm + FLAT_TOP
    for (let px = 0; px < width; px++) {
      const xm = (px + 0.5) / FLAT.pxPerMm + FLAT_LEFT
      const w = g * xm + h * ym + k
      const i = (py * width + px) * 4
      if (!sampleRgb(img, (a * xm + b * ym + c) / w, (d * xm + e * ym + f) / w, rgb)) {
        rgb[0] = 255
        rgb[1] = 255
        rgb[2] = 255
      }
      data[i] = rgb[0]
      data[i + 1] = rgb[1]
      data[i + 2] = rgb[2]
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

/** A card's name in the Drive: its date and position, so the website can tell the position from it (as the phone names it). */
export function cardFileName(dateKey: DateKey, position: Position): string {
  return `${dateKey} ${POSITION_LABELS[position]} paper card.jpg`
}

/** Where record bull `n` is on the flattened card, as a review places it (its centre, and a millimetre's pixels). */
export function flatBull(n: number): { center: Vec; axes: ScannedBull['axes'] } | null {
  const cb = CARD_BULLS.find((b) => b.kind === 'record' && b.n === n)
  if (!cb) return null
  const c = bullCentreMm(cb)
  return { center: flatPoint(c.x, c.y), axes: [FLAT.pxPerMm, 0, 0, FLAT.pxPerMm] }
}

/**
 * How a saved score's shots can be changed: a paper card bull by bull (on the card's picture when it was scanned), a
 * card kept as a total only, or not at all (a SIUS result's scores come from its PDF; so do a paper card's whose shots
 * don't fit its ten bulls, which the typed form changes).
 */
export type EditMode = 'card' | 'total' | 'fixed'

const shotsOf = (e: Pick<Evaluation, 'series'>) => e.series.flatMap((s) => s.shots)
const isPlaced = (t: { x?: number | null; y?: number | null }) => typeof t.x === 'number' && typeof t.y === 'number'

export function editModeOf(e: Pick<Evaluation, 'source' | 'series'>): EditMode {
  if (e.source !== 'paper') return 'fixed'
  const n = shotsOf(e).length
  if (!n) return 'total'
  return n === 10 || (n >= 20 && n % 10 === 0) ? 'card' : 'fixed'
}

/** Whether a saved card was scanned: its shots have places, on the Drive's flattened copy of the card. */
export function wasScanned(e: Pick<Evaluation, 'source' | 'series'>): boolean {
  return editModeOf(e) === 'card' && shotsOf(e).some(isPlaced)
}

/** A saved card back as a review, to look at and correct: a scanned card's shots on the flattened card's bulls. */
export function savedReview(e: Pick<Evaluation, 'source' | 'series'>): CardReview | null {
  if (editModeOf(e) !== 'card') return null
  return reviewFromShots(shotsOf(e), wasScanned(e) ? flatBull : () => null)
}

const STAMPS = ['id', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy']

/**
 * A saved card rebuilt from its checked bulls (`cardEvaluation`) keeps what the rebuild doesn't know, as the phone app
 * saves it: what it was (a competition or an evaluation stays one), and the score the coach wrote on the card, still the
 * official one, with the new reading as its reference (and no longer marked once the reading agrees with it).
 */
export function keepOnResave(saved: Evaluation & { id?: string }, rebuilt: Omit<Evaluation, keyof AuditStamp>): Omit<Evaluation, keyof AuditStamp> {
  const kept = Object.fromEntries(Object.entries(saved).filter(([k]) => !STAMPS.includes(k))) as Omit<Evaluation, keyof AuditStamp>
  const next = { ...kept, ...rebuilt }
  if (saved.official) {
    next.total = saved.total
    next.wholeTotal = saved.wholeTotal
    next.official = rebuilt.total === saved.total ? null : { ...saved.official, appTotal: rebuilt.total }
  }
  return next
}

/** One card's scores, as the evaluation keeps them: its reviewed shots, or only its total. */
export function cardEvaluation(
  c: { student: { id: string; name: string }; position: Position; dateKey: DateKey; note: string; review: CardReview | null; total: number | null },
  fileId: string | null,
): Omit<Evaluation, keyof AuditStamp> {
  return paperEvaluation({
    studentId: c.student.id,
    studentName: c.student.name,
    position: c.position,
    dateKey: c.dateKey,
    shots: c.review ? reviewShots(c.review) : null,
    total: c.review ? null : c.total,
    shotCount: c.review ? undefined : 10,
    fileId,
    note: c.note.trim(),
  })
}
