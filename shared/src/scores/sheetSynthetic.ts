import { type ShotPoint, ringRadiusMm } from '../shooting/target'
import { type Mat3, applyH, invert3, multiply3 } from '../targets/geometry'
import type { RgbaImage } from '../targets/image'

/**
 * A made-up photo of a match's results sheet, for tests: target pictures as a Scopos printout draws them (rings at
 * the ISSF radii, each shot a semi-transparent disc the pellet's size with a darker outline, the group's ellipse and
 * its two axes crossing at the group's centre, a frame, each picture zoomed to its farthest shot), tables of ruled
 * lines and blocks of print beside them, then the photo's turn, slant and noise. Never drawn from a real sheet.
 */

export interface SyntheticSheet {
  width: number
  height: number
  /** Each series' shots (mm from the target's centre, x right, y up), a picture each, two to a row. */
  series: ShotPoint[][]
  /** Series whose picture is drawn with its rings only. */
  blank?: number[]
  /** The sheet's turn in the photo (degrees). */
  turnDeg?: number
  /** Perspective: how much farther one side of the sheet is (0 none; 0.0006 a clear slant). */
  tilt?: { x: number; y: number }
  /** Pixel noise (0–255 scale). */
  noise?: number
  seed?: number
}

export interface SyntheticSheetPhoto {
  image: RgbaImage
  /** Where each series' "Center" line is printed on the photo (px), as a text reader's word box would put it. */
  centreWords: { x: number; y: number }[]
  /** Each picture's target centre on the photo (px). */
  centres: { x: number; y: number }[]
  /** Photo pixels per target millimetre at each picture's centre (roughly: the photo's scale times the zoom). */
  pxPerMm: number[]
}

/** The page (mm): US Letter, pictures in two columns, each with its table to the right. */
const PAGE = { w: 216, h: 279 }
const BOX = 62
const TABLE = 30
const ROW = BOX + 12
const LEFT = 12
const TOP = 40

const PAPER = 238
const RING = 35
const FILL = 118
const OUTLINE = 68
const ELLIPSE = 150

function random(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
/** Coverage of a line of width `w` at distance `d` from its middle, for a pixel `pix` wide (all in one unit). */
const lineCover = (d: number, w: number, pix: number) => clamp01(0.5 - (Math.abs(d) - w / 2) / pix)

interface Picture {
  /** The picture's box (page mm) and its target's centre. */
  x0: number
  y0: number
  cx: number
  cy: number
  /** Page millimetres per target millimetre. */
  zoom: number
  shots: ShotPoint[]
  mean: ShotPoint
  /** The group's axes: unit directions (target) and half-lengths (target mm). */
  axes: { ux: number; uy: number; half: number }[]
  /** The group's ellipse: semi-axes along the axes (target mm). */
  ellipse: [number, number]
}

function picture(shots: ShotPoint[], col: number, row: number, blank: boolean): Picture {
  const x0 = LEFT + col * (BOX + TABLE + 8)
  const y0 = TOP + row * ROW
  const far = Math.max(0, ...shots.map((s) => Math.hypot(s.x, s.y)))
  const view = Math.max(far + 2.25 + 0.4, ringRadiusMm(8) + 0.5)
  const n = shots.length || 1
  const mean = { x: shots.reduce((a, s) => a + s.x, 0) / n, y: shots.reduce((a, s) => a + s.y, 0) / n }
  // The group's spread along its principal axes.
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const s of shots) {
    sxx += (s.x - mean.x) ** 2
    sxy += (s.x - mean.x) * (s.y - mean.y)
    syy += (s.y - mean.y) ** 2
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const ux = Math.cos(angle)
  const uy = Math.sin(angle)
  const major = Math.sqrt(Math.max(0.3, (sxx * ux * ux + 2 * sxy * ux * uy + syy * uy * uy) / n))
  const minor = Math.sqrt(Math.max(0.3, (sxx * uy * uy - 2 * sxy * ux * uy + syy * ux * ux) / n))
  return {
    x0,
    y0,
    cx: x0 + BOX / 2,
    cy: y0 + BOX / 2,
    zoom: BOX / 2 / view,
    shots: blank ? [] : shots,
    mean,
    axes: blank ? [] : [{ ux, uy, half: 2.2 * major + 1 }, { ux: -uy, uy: ux, half: 2.2 * minor + 1 }],
    ellipse: [2 * major + 0.5, 2 * minor + 0.5],
  }
}

/** The grey of the page at (x, y) page millimetres; `pix` is a photo pixel's size there (page mm). */
function pageGrey(pictures: Picture[], x: number, y: number, pix: number): number {
  let g = PAPER
  // Header: a grey band with blocks of print.
  if (y > 12 && y < 34 && x > LEFT && x < PAGE.w - LEFT) {
    g = 205
    if (y > 15 && y < 31 && Math.floor(y / 2.2) % 3 !== 0 && ((x > 16 && x < 90) || (x > 150 && x < 200)) && Math.floor(x * 1.3) % 4 !== 0) g = 60
  }
  for (const p of pictures) {
    // The table beside the picture: ruled rows with print in them.
    const tx = p.x0 + BOX
    if (x > tx && x < tx + TABLE && y > p.y0 && y < p.y0 + ROW - 2) {
      const ry = (y - p.y0) % 5.6
      g = Math.min(g, PAPER - (PAPER - 30) * lineCover(ry, 0.3, pix))
      g = Math.min(g, PAPER - (PAPER - 30) * Math.max(lineCover(x - tx - TABLE, 0.3, pix), lineCover(x - tx - 9, 0.2, pix)))
      if (ry > 1.4 && ry < 4.2 && ((x > tx + 1.5 && x < tx + 6) || (x > tx + 12 && x < tx + 19)) && Math.floor(x * 2.1 + y) % 3 !== 0) g = 70
    }
    // The strip under the picture: "Area … MOA … Center: (…)".
    if (x > p.x0 + 6 && x < p.x0 + BOX - 6 && y > p.y0 + BOX + 2 && y < p.y0 + BOX + 8 && Math.floor(x * 1.7) % 3 !== 0 && Math.floor(y * 3) % 2 === 0) g = 90
    if (x < p.x0 - 0.5 || x > p.x0 + BOX + 0.5 || y < p.y0 - 0.5 || y > p.y0 + BOX + 0.5) continue
    // The frame.
    const frame = Math.max(lineCover(x - p.x0, 0.35, pix), lineCover(x - p.x0 - BOX, 0.35, pix), lineCover(y - p.y0, 0.35, pix), lineCover(y - p.y0 - BOX, 0.35, pix))
    if (x < p.x0 || x > p.x0 + BOX || y < p.y0 || y > p.y0 + BOX) {
      g = PAPER - (PAPER - 30) * frame
      continue
    }
    // Target millimetres (y up), and a pixel's size there.
    const u = (x - p.cx) / p.zoom
    const v = -(y - p.cy) / p.zoom
    const tp = pix / p.zoom
    g = PAPER
    // The group's ellipse, light and soft-edged.
    if (p.shots.length) {
      const a = p.axes[0]
      const du = u - p.mean.x
      const dv = v - p.mean.y
      const e1 = (du * a.ux + dv * a.uy) / p.ellipse[0]
      const e2 = (-du * a.uy + dv * a.ux) / p.ellipse[1]
      const inside = clamp01((1 - Math.sqrt(e1 * e1 + e2 * e2)) * p.ellipse[1] / tp + 0.5)
      g = g + (ELLIPSE - g) * 0.35 * inside
    }
    // Each shot: a semi-transparent grey disc with a darker outline.
    for (const s of p.shots) {
      const d = Math.hypot(u - s.x, v - s.y)
      if (d > 2.25 + tp) continue
      g = g + (FILL - g) * 0.33 * clamp01((2.25 - d) / tp + 0.5)
      g = g + (OUTLINE - g) * 0.8 * lineCover(d - 2.25, 0.2 / p.zoom, tp)
    }
    // The rings (drawn over the shots), the ten's dot, and the group's axes.
    const r = Math.hypot(u, v)
    let ring = lineCover(r - 0.25, 0.25 / p.zoom, tp)
    for (let k = 1; k <= 9; k++) ring = Math.max(ring, lineCover(r - ringRadiusMm(10 - k), 0.25 / p.zoom, tp))
    g = g + (RING - g) * ring
    for (const a of p.axes) {
      const along = (u - p.mean.x) * a.ux + (v - p.mean.y) * a.uy
      const across = -(u - p.mean.x) * a.uy + (v - p.mean.y) * a.ux
      if (Math.abs(along) > a.half) continue
      g = g + (RING - g) * lineCover(across, 0.22 / p.zoom, tp)
    }
    g = Math.min(g, PAPER - (PAPER - 30) * frame)
  }
  return g
}

/** Page millimetres → photo pixels. */
function pageToPhoto(spec: SyntheticSheet): Mat3 {
  const k = Math.min(spec.width / (PAGE.w + 20), spec.height / (PAGE.h + 20))
  const a = ((spec.turnDeg ?? 0) * Math.PI) / 180
  const t = spec.tilt ?? { x: 0, y: 0 }
  const toMiddle: Mat3 = [1, 0, -PAGE.w / 2, 0, 1, -PAGE.h / 2, 0, 0, 1]
  const slant: Mat3 = [1, 0, 0, 0, 1, 0, t.x, t.y, 1]
  const place: Mat3 = [k * Math.cos(a), -k * Math.sin(a), spec.width / 2, k * Math.sin(a), k * Math.cos(a), spec.height / 2, 0, 0, 1]
  return multiply3(place, multiply3(slant, toMiddle))
}

export function drawSyntheticSheet(spec: SyntheticSheet): SyntheticSheetPhoto {
  const { width, height } = spec
  const H = pageToPhoto(spec)
  const inv = invert3(H)!
  const rand = random(spec.seed ?? 11)
  const noise = spec.noise ?? 6
  const pictures = spec.series.map((shots, i) => picture(shots, i % 2, Math.floor(i / 2), (spec.blank ?? []).includes(i)))
  const data = new Uint8ClampedArray(width * height * 4)
  const behind = 40
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const p = applyH(inv, { x: px, y: py })
      const q = applyH(inv, { x: px + 1, y: py })
      const pix = Math.max(0.01, Math.hypot(q.x - p.x, q.y - p.y))
      const on = p.x >= 0 && p.x <= PAGE.w && p.y >= 0 && p.y <= PAGE.h
      const grey = on ? pageGrey(pictures, p.x, p.y, pix) : behind
      // Light falling off across the photo, a faint warm cast, and sensor noise.
      const light = 0.9 + 0.1 * (px / width)
      const i = (py * width + px) * 4
      data[i] = grey * light + (rand() - 0.5) * noise + 2
      data[i + 1] = grey * light + (rand() - 0.5) * noise
      data[i + 2] = grey * light + (rand() - 0.5) * noise - 3
      data[i + 3] = 255
    }
  }
  const scale = Math.min(width / (PAGE.w + 20), height / (PAGE.h + 20))
  return {
    image: { width, height, data },
    centreWords: pictures.map((p) => applyH(H, { x: p.x0 + BOX / 2 + 8, y: p.y0 + BOX + 6 })),
    centres: pictures.map((p) => applyH(H, { x: p.cx, y: p.cy })),
    pxPerMm: pictures.map((p) => scale * p.zoom),
  }
}
