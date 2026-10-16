import { BLACK_RADIUS_MM } from '../shooting/target'

/**
 * The paper card the academy shoots on: the 10 m air rifle card with ten record bulls and two sighters (the kind
 * scored on electronic scanners too). Its bulls sit on a grid of three columns and four rows; the two sighters are the
 * middle column's two inner rows, inside a printed box. Rows count from the card's top, where its header is (logo,
 * barcode, name line). Measured from the academy's cards; every distance is in millimetres.
 */

export type BullKind = 'record' | 'sighter'

export interface CardBull {
  kind: BullKind
  /** 1–10 for record bulls (as printed under each), 1–2 for sighters (top first). */
  n: number
  col: number
  row: number
}

/** Record bulls left to right and top to bottom, as the card numbers them. */
export const CARD_BULLS: readonly CardBull[] = [
  { kind: 'record', n: 1, col: 0, row: 0 },
  { kind: 'record', n: 2, col: 1, row: 0 },
  { kind: 'record', n: 3, col: 2, row: 0 },
  { kind: 'record', n: 4, col: 0, row: 1 },
  { kind: 'sighter', n: 1, col: 1, row: 1 },
  { kind: 'record', n: 5, col: 2, row: 1 },
  { kind: 'record', n: 6, col: 0, row: 2 },
  { kind: 'sighter', n: 2, col: 1, row: 2 },
  { kind: 'record', n: 7, col: 2, row: 2 },
  { kind: 'record', n: 8, col: 0, row: 3 },
  { kind: 'record', n: 9, col: 1, row: 3 },
  { kind: 'record', n: 10, col: 2, row: 3 },
]

export const CARD_COLS = 3
export const CARD_ROWS = 4

/** From one bull's centre to the next: across a row, and down a column. */
export const STEP_MM = { x: 71.9, y: 63.5 }

/** The card's edges (US Letter, 216 × 279 mm), from the top-left bull's centre (x right, y down). */
export const CARD_EDGES_MM = { left: -36, right: 180, top: -55, bottom: 224 }

/** The black aiming mark's radius (rings 4 to 10). */
export const BULL_RADIUS_MM = BLACK_RADIUS_MM

/** A bull's centre on the card, from the top-left bull's centre. */
export function bullCentreMm(b: Pick<CardBull, 'col' | 'row'>): { x: number; y: number } {
  return { x: b.col * STEP_MM.x, y: b.row * STEP_MM.y }
}

export function bullLabel(b: Pick<CardBull, 'kind' | 'n'>): string {
  return b.kind === 'record' ? `Bull ${b.n}` : `Sighter ${b.n}`
}
