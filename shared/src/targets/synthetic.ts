import { ringRadiusMm } from '../shooting/target'
import { BULL_RADIUS_MM, CARD_BULLS, CARD_COLS, CARD_EDGES_MM, CARD_ROWS, STEP_MM, bullCentreMm } from './card'
import { type Mat3, applyH, invert3, multiply3 } from './geometry'
import type { RgbaImage } from './image'

/**
 * A made-up photo of the academy's paper card, for tests and demos: the printed bulls, ring lines and header, a wall
 * behind, some pen marks, holes where the shots are, a slant and noise. Never drawn from a real card or person.
 */

export interface SyntheticShot {
  /** The record bull (1–10). */
  bull: number
  /** Millimetres from the bull's centre, x right and y up. */
  x: number
  y: number
  /** What shows through the hole: the wall behind (bright) or the card behind (dark, with torn fibres at its rim). */
  look?: 'wall' | 'fibres'
  /** The hole's radius in the card (mm): a 4.5 mm pellet's is usually a little under 2.25. */
  radiusMm?: number
}

export interface SyntheticCard {
  width: number
  height: number
  shots: SyntheticShot[]
  /** Photo pixels per card millimetre at the card's centre. */
  pxPerMm?: number
  /** The card's turn in the photo, degrees (90: the phone held sideways; 180: upside down). */
  turnDeg?: number
  /** Perspective: how much farther one side of the card is (0 none; 0.0006 a slight slant). */
  tilt?: { x: number; y: number }
  /** Where the card's middle is in the photo (default: the photo's middle). */
  centre?: { x: number; y: number }
  /** Pixel noise (0–255 scale). */
  noise?: number
  /** Coaches' red marks next to the bulls. */
  ink?: boolean
  /** A sticky note over these record bulls. */
  coveredBulls?: number[]
  seed?: number
}

/** A made-up hole's radius unless a shot gives its own: a 4.5 mm pellet's hole as card usually shows it. */
export const SYNTHETIC_HOLE_MM = 2.05

const WALL = [206, 213, 226]
const PAPER = [233, 214, 172]
const BLACK = [40, 44, 57]
const LINE_ON_BLACK = [150, 132, 96]
const LINE_ON_PAPER = [96, 88, 72]
const FIBRE = [236, 230, 214]
const BEHIND = [33, 36, 47]
const INK = [196, 40, 58]
const NOTE = [244, 238, 160]

/** The card's middle, in card millimetres from the top-left bull. */
const CARD_MIDDLE = { x: (CARD_EDGES_MM.left + CARD_EDGES_MM.right) / 2, y: (CARD_EDGES_MM.top + CARD_EDGES_MM.bottom) / 2 }

function random(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

/** Card millimetres → photo pixels for a spec. */
export function syntheticCardToImage(spec: SyntheticCard): Mat3 {
  const k = spec.pxPerMm ?? Math.min(spec.width / 230, spec.height / 300)
  const a = ((spec.turnDeg ?? 0) * Math.PI) / 180
  const c = spec.centre ?? { x: spec.width / 2, y: spec.height / 2 }
  const t = spec.tilt ?? { x: 0, y: 0 }
  const toMiddle: Mat3 = [1, 0, -CARD_MIDDLE.x, 0, 1, -CARD_MIDDLE.y, 0, 0, 1]
  const slant: Mat3 = [1, 0, 0, 0, 1, 0, t.x, t.y, 1]
  const place: Mat3 = [k * Math.cos(a), -k * Math.sin(a), c.x, k * Math.sin(a), k * Math.cos(a), c.y, 0, 0, 1]
  return multiply3(place, multiply3(slant, toMiddle))
}

export function drawSyntheticCard(spec: SyntheticCard): RgbaImage {
  const { width, height } = spec
  const H = syntheticCardToImage(spec)
  const inv = invert3(H)!
  const rand = random(spec.seed ?? 7)
  const noise = spec.noise ?? 6
  const data = new Uint8ClampedArray(width * height * 4)
  // Shots by bull, in card millimetres (y down), with their look.
  const holes = new Map<string, { x: number; y: number; r: number; look: 'wall' | 'fibres'; tears: number[] }[]>()
  for (const s of spec.shots) {
    const b = CARD_BULLS.find((cb) => cb.kind === 'record' && cb.n === s.bull)
    if (!b) continue
    const key = `${b.col},${b.row}`
    const list = holes.get(key) ?? []
    // Torn fibres: which twelfths of the rim show them.
    list.push({ x: s.x, y: -s.y, r: s.radiusMm ?? SYNTHETIC_HOLE_MM, look: s.look ?? 'wall', tears: Array.from({ length: 12 }, () => (rand() < 0.6 ? 1 : 0)) })
    holes.set(key, list)
  }
  const covered = new Set((spec.coveredBulls ?? []).map((n) => CARD_BULLS.find((cb) => cb.kind === 'record' && cb.n === n)).filter(Boolean).map((b) => `${b!.col},${b!.row}`))
  const lines = [9, 8, 7, 6, 5, 3, 2, 1].map((ring) => ringRadiusMm(ring) - 0.1)
  const mix = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // Pixel centres at whole coordinates, as the scan samples them.
      const p = applyH(inv, { x: px, y: py })
      // The size of this pixel on the card, for soft edges.
      const q = applyH(inv, { x: px + 1, y: py })
      const pix = Math.max(0.02, Math.hypot(q.x - p.x, q.y - p.y))
      let color = WALL
      const onCard = p.x >= CARD_EDGES_MM.left && p.x <= CARD_EDGES_MM.right && p.y >= CARD_EDGES_MM.top && p.y <= CARD_EDGES_MM.bottom
      if (onCard) {
        color = PAPER
        // The header: a barcode and blocks of print above the first row.
        if (p.y > -50 && p.y < -38 && p.x > -24 && p.x < 8 && Math.floor((p.x + 24) * 2.3) % 3 !== 0) color = BLACK
        else if (p.y > -50 && p.y < -44 && p.x > 14 && p.x < 60) color = LINE_ON_PAPER
        else if (p.y > -50 && p.y < -36 && p.x > 100 && p.x < 168 && Math.floor(p.y * 1.5) % 2 === 0) color = LINE_ON_PAPER
        const col = Math.max(0, Math.min(CARD_COLS - 1, Math.round(p.x / STEP_MM.x)))
        const row = Math.max(0, Math.min(CARD_ROWS - 1, Math.round(p.y / STEP_MM.y)))
        const c = bullCentreMm({ col, row })
        const X = p.x - c.x
        const Y = p.y - c.y
        const r = Math.sqrt(X * X + Y * Y)
        const key = `${col},${row}`
        if (r < 30) {
          // The black, the dotted ring lines and the centre dot.
          color = mix(BLACK, color, clamp01((r - BULL_RADIUS_MM) / pix + 0.5))
          const ang = Math.atan2(Y, X)
          for (const R of lines) {
            if (Math.abs(r - R) > 0.4) continue
            // Dots every 0.6 mm along the ring.
            const along = ang * R
            const dotCentre = Math.round(along / 0.6) * 0.6
            const d = Math.hypot(r - R, (along - dotCentre))
            const t = clamp01(0.5 - (d - 0.13) / pix)
            color = mix(color, R < BULL_RADIUS_MM ? LINE_ON_BLACK : LINE_ON_PAPER, t)
          }
          if (r < 0.25) color = LINE_ON_BLACK
          if (spec.ink && X > -4 && X < 4 && Y > -29 && Y < -25 && Math.abs(X - (Y + 27) * 0.4) < 0.35) color = INK
          for (const h of holes.get(key) ?? []) {
            const hd = Math.hypot(X - h.x, Y - h.y)
            if (hd > h.r + 0.4) continue
            const inside = clamp01((h.r - hd) / pix + 0.5)
            if (h.look === 'wall') color = mix(color, WALL, inside)
            else {
              // Torn fibres over the rim, from half a millimetre inside it to just past it.
              const tear = h.tears[Math.floor(((Math.atan2(Y - h.y, X - h.x) + Math.PI) / (2 * Math.PI)) * 12) % 12]
              const rim = tear && hd > h.r - 0.5 && hd < h.r + 0.15 ? FIBRE : BEHIND
              color = mix(color, rim, hd < h.r - 0.5 ? inside : tear ? clamp01((h.r + 0.15 - hd) / pix + 0.5) : inside)
            }
          }
          if (covered.has(key) && X > -20 && X < 30 && Y > -26 && Y < 24) color = NOTE
        }
      }
      // A little light falling off across the photo, and sensor noise.
      const light = 0.92 + 0.08 * (px / width)
      const i = (py * width + px) * 4
      data[i] = color[0] * light + (rand() - 0.5) * noise
      data[i + 1] = color[1] * light + (rand() - 0.5) * noise
      data[i + 2] = color[2] * light + (rand() - 0.5) * noise
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}
