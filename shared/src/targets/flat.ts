import type { AuditStamp } from '../types'
import { type Evaluation, type Position, paperEvaluation } from '../shooting/evaluation'
import type { DateKey } from '../time'
import { CARD_BULLS, CARD_EDGES_MM, bullCentreMm } from './card'
import type { Vec } from './geometry'
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
