import { ringRadiusMm } from '../shooting/target'
import type { Vec } from './geometry'
import { type Plane, type RgbaImage, boxBlur, medianOf, plane, sampleRgb } from './image'
import { MISS_BEYOND_MM } from './score'

/**
 * Pellet holes in one bull. The bull is resampled flat (millimetres, from its measured centre and axes); what the
 * printed bull looks like at each distance from its centre is learnt from the bull itself (the median around each
 * ring), and a hole is a 4 mm patch that differs from it. A hole shows whatever is behind the card (a white wall or
 * sheet, a brown desk, a black one) and often torn fibres at its rim, so lighter and darker both count, on the black
 * as on the paper, and so does another colour on the black, or a bluer one on the paper. The printed ring lines and
 * the centre dot are left out, and so is red ink (coaches write the scores in red; a brown desk seen through a hole
 * isn't red). Each mark's centre is then fitted with the shape of a hole: a rim of about 2 mm radius, often only
 * partly visible as torn fibres, and sometimes a differing inside. Last, each hole's own edge is found along rays from
 * that centre, for its size as the card shows it and the centre of that edge (`measureHole`): scores take the hole at
 * its real size (docs/DECISIONS.md §23, P1).
 */

/** Millimetres around the centre that are read, and the spacing of the samples. */
const HALF = 27
const STEP = 0.2
const N = Math.round((2 * HALF) / STEP) + 1
const BLACK_EDGE = ringRadiusMm(4)
/**
 * The printed lines, ring 9 to ring 1 (the black's edge is one): a ring's size is to the outside of its line, so the
 * line's middle is a tenth of a millimetre inside (measured on the academy's cards).
 */
const LINES = [9, 8, 7, 6, 5, 3, 2, 1].map((ring) => ringRadiusMm(ring) - 0.1)
/** A hole as paper shows it: a little smaller than the 4.5 mm pellet. */
const RIM = 2.05
/** Hole centres further out than this are misses or marks beside the bull (its printed number sits beyond). */
const SEARCH = MISS_BEYOND_MM + 0.5

export interface HoleMark {
  /** Millimetres from the bull's centre on the card: x right, y down. */
  x: number
  y: number
  /** The mean difference over a hole-sized square at its centre: about 1 for faint fibres, 5 and more for a clear hole. */
  strength: number
  /** The spread of the mark along its long and short axis (mm²), and the long axis' direction (two holes that touch). */
  l1: number
  l2: number
  dir: Vec
  /** Share of the difference nearby that lies within the hole's rim: near 1 for a hole, low for an edge or a stroke. */
  contained: number
  /** Share of the difference within 7.5 mm that lies within 5 mm: near 1 for holes (two touching ones too), low for an edge. */
  bounded: number
  /** How well the hole's shape fits the mark (the fit's score per mm² of rim). */
  fit: number
  /** The hole's radius as the card shows it (mm), measured on the photo; null when it couldn't be read cleanly. */
  radius: number | null
}

const toIndex = (mm: number) => Math.round((mm + HALF) / STEP)
const toMm = (g: number) => -HALF + g * STEP

/**
 * A red hue rather than an orange or brown one, from a colour's R − G and B − R: G − B stays small against R − min(G,
 * B), a hue under about 20°. The coaches' pens show pink to red in photos (under 15°, even in warm light); a wooden
 * desk seen through a hole is brown (20–30°), and so is the buff paper.
 */
const reddish = (rg: number, br: number) => -(rg + br) < 0.35 * Math.max(rg, -br)

/** Reads one bull. `axes`: photo pixels per millimetre along the card's x and y (down), as ScannedBull's. */
export function findHoles(img: RgbaImage, center: Vec, axes: [number, number, number, number]): HoleMark[] {
  return readBull(img, center, axes).marks
}

/** The bull read flat: the differences (`A`), their hole-sized means (`S`, both N × N at STEP mm) and the marks. */
export function readBull(img: RgbaImage, center: Vec, axes: [number, number, number, number]): { A: Plane; S: Plane; marks: HoleMark[] } {
  const count = N * N
  const Y = new Float32Array(count)
  const C = new Float32Array(count)
  const RG = new Float32Array(count)
  const red = new Uint8Array(count)
  const valid = new Uint8Array(count)
  const masked = new Uint8Array(count)
  /** For a sample on a printed line: the line's radius (0 for the centre dot). */
  const band = new Float32Array(count)
  const radius = new Float32Array(count)
  const rgb = new Float32Array(3)
  const [ax, ay, bx, by] = axes
  for (let gy = 0; gy < N; gy++) {
    const ym = toMm(gy)
    for (let gx = 0; gx < N; gx++) {
      const xm = toMm(gx)
      const r = Math.sqrt(xm * xm + ym * ym)
      if (r > HALF) continue
      const i = gy * N + gx
      if (!sampleRgb(img, center.x + xm * ax + ym * bx, center.y + xm * ay + ym * by, rgb)) continue
      valid[i] = 1
      radius[i] = r
      const y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
      Y[i] = y
      const br = rgb[2] - rgb[0]
      C[i] = br
      const rg = rgb[0] - rgb[1]
      RG[i] = rg
      if (rg > 40 && rg > 0.28 * y && reddish(rg, br)) red[i] = 1
      if (r < 0.5) masked[i] = 1
      else if (Math.abs(r - BLACK_EDGE) < 0.4) {
        masked[i] = 1
        band[i] = BLACK_EDGE
      } else {
        for (const line of LINES) {
          if (Math.abs(r - line) < 0.32) {
            masked[i] = 1
            band[i] = line
          }
        }
      }
    }
  }

  // How the bull looks at each distance, from the samples off the printed lines; near the centre a hole may cover
  // most of a ring, so there the black's own level stands in.
  // (Samples are grouped by distance in typed arrays, counted first: no growing lists in the phone's hot loops.)
  const BIN = 0.25
  const BINS = Math.ceil(HALF / BIN) + 2
  const binOf = new Int16Array(count).fill(-1)
  const inBin = new Int32Array(BINS + 1)
  for (let i = 0; i < count; i++) {
    if (!valid[i] || masked[i] || red[i]) continue
    const b = Math.min(BINS - 1, Math.floor(radius[i] / BIN))
    binOf[i] = b
    inBin[b + 1]++
  }
  for (let b = 0; b < BINS; b++) inBin[b + 1] += inBin[b]
  const next = inBin.slice(0, BINS)
  const byY = new Float32Array(inBin[BINS])
  const byC = new Float32Array(inBin[BINS])
  const byR = new Float32Array(inBin[BINS])
  for (let i = 0; i < count; i++) {
    const b = binOf[i]
    if (b < 0) continue
    const k = next[b]++
    byY[k] = Y[i]
    byC[k] = C[i]
    byR[k] = RG[i]
  }
  const profY = new Float32Array(BINS)
  const profC = new Float32Array(BINS)
  const profR = new Float32Array(BINS)
  let lastY = 0
  let lastC = 0
  let lastR = 0
  for (let b = 0; b < BINS; b++) {
    const from = inBin[b]
    const to = inBin[b + 1]
    if (to - from >= 8) {
      lastY = medianOf(byY.subarray(from, to))
      lastC = medianOf(byC.subarray(from, to))
      lastR = medianOf(byR.subarray(from, to))
    }
    profY[b] = lastY
    profC[b] = lastC
    profR[b] = lastR
  }
  const inner = Math.floor(4.5 / BIN)
  const blackY = medianOf(Array.from(profY.subarray(inner, Math.floor(9 / BIN))))
  const blackC = medianOf(Array.from(profC.subarray(inner, Math.floor(9 / BIN))))
  for (let b = 0; b < inner; b++) {
    profY[b] = blackY
    profC[b] = blackC
  }
  const expected = (prof: Float32Array, r: number) => {
    const f = Math.min(BINS - 1.001, Math.max(0, r / BIN - 0.5))
    const b = Math.floor(f)
    const t = f - b
    return prof[b] * (1 - t) + prof[b + 1] * t
  }

  // Each sample's difference from the print there: in lightness (dY), in blueness (dC) and, on the black, in colour (CH,
  // the distance from the print's colour). Ink: redder than the paper there (even a faint stroke) and red, and just
  // around it (its soft edge).
  const dY = new Float32Array(count)
  const dC = new Float32Array(count)
  const CH = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    if (!valid[i]) continue
    const f = Math.min(BINS - 1.001, Math.max(0, radius[i] / BIN - 0.5))
    const b = Math.floor(f)
    const t = f - b
    const c = C[i] - (profC[b] * (1 - t) + profC[b + 1] * t)
    const d = RG[i] - (profR[b] * (1 - t) + profR[b + 1] * t)
    dY[i] = Y[i] - (profY[b] * (1 - t) + profY[b + 1] * t)
    dC[i] = c
    if (radius[i] < BLACK_EDGE) CH[i] = Math.sqrt(c * c + d * d)
    // Redder, without turning yellower as a brown desk seen through a hole may (G − B changes by −(d + c)).
    if (d > 14 && -(d + c) < 0.2 * d && reddish(RG[i], C[i])) red[i] = 1
  }
  const ink = dilate(red, 2)

  // Differences, in units of this photo's own noise on the black and on the paper. A colour difference is a distance,
  // spread as noise in two dimensions is: its median is 1.1774 σ, and past 3.5 σ it's as rare as past 3 σ in lightness.
  const third = Math.ceil(count / 3) + 1
  const onBlack = new Float32Array(third)
  const colour = new Float32Array(third)
  const onPaper = new Float32Array(third)
  const bluer = new Float32Array(third)
  let nBlack = 0
  let nPaper = 0
  for (let i = 0; i < count; i += 3) {
    if (!valid[i] || masked[i] || ink[i]) continue
    const r = radius[i]
    if (r < BLACK_EDGE - 1) {
      onBlack[nBlack] = Math.abs(dY[i])
      colour[nBlack++] = CH[i]
    } else if (r > BLACK_EDGE + 1) {
      onPaper[nPaper] = Math.abs(dY[i])
      bluer[nPaper++] = Math.abs(dC[i])
    }
  }
  const sBlack = Math.max(2, 1.4826 * medianOf(onBlack, nBlack))
  const sColour = Math.max(2, medianOf(colour, nBlack) / 1.1774)
  const sPaper = Math.max(2, 1.4826 * medianOf(onPaper, nPaper))
  const sBlue = Math.max(2, 1.4826 * medianOf(bluer, nPaper))
  const T = 3
  const TC = 3.5
  const A = plane(N, N)
  for (let i = 0; i < count; i++) {
    if (!valid[i] || masked[i] || ink[i]) continue
    if (radius[i] < BLACK_EDGE) {
      // On the black: lighter (a white or brown desk behind, torn fibres) or darker (a black desk), or another colour
      // (under coloured light the print takes the light's colour, while a dark hole stays dark).
      A.data[i] = Math.max(0, Math.abs(dY[i]) / sBlack - T) + Math.max(0, CH[i] / sColour - TC)
    } else {
      // On the paper: darker (a desk behind) or lighter, or bluer (a white or grey sheet behind).
      A.data[i] = Math.max(0, Math.abs(dY[i]) / sPaper - T) + Math.max(0, dC[i] / sBlue - T)
    }
  }
  // Across the printed lines a hole carries on: a line's samples are blended from just inside and just outside it.
  const at = (xm: number, ym: number) => {
    const gx = toIndex(xm)
    const gy = toIndex(ym)
    return gx >= 0 && gy >= 0 && gx < N && gy < N ? A.data[gy * N + gx] : 0
  }
  const filled = new Float32Array(count)
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      const i = gy * N + gx
      if (!valid[i] || !masked[i]) continue
      const xm = toMm(gx)
      const ym = toMm(gy)
      const r = radius[i]
      if (band[i] > 0) {
        const inner = (band[i] - 0.5) / r
        const outer = (band[i] + 0.5) / r
        const t = Math.max(0, Math.min(1, r - (band[i] - 0.5)))
        filled[i] = at(xm * inner, ym * inner) * (1 - t) + at(xm * outer, ym * outer) * t
      } else {
        // The centre dot: what surrounds it, all round.
        let low = Infinity
        for (let k = 0; k < 8; k++) low = Math.min(low, at(0.7 * Math.cos((k * Math.PI) / 4), 0.7 * Math.sin((k * Math.PI) / 4)))
        filled[i] = low
      }
    }
  }
  for (let i = 0; i < count; i++) if (masked[i]) A.data[i] = filled[i]

  // Candidates: where the mean difference over a hole-sized square peaks.
  const S = boxBlur(boxBlur(A, Math.round(2.0 / STEP)), 1)
  const reach = Math.round(1.6 / STEP)
  const peaks: { gx: number; gy: number; v: number }[] = []
  const lim = toIndex(SEARCH) - toIndex(0)
  const c0 = toIndex(0)
  for (let gy = Math.max(reach, c0 - lim); gy <= Math.min(N - 1 - reach, c0 + lim); gy++) {
    for (let gx = Math.max(reach, c0 - lim); gx <= Math.min(N - 1 - reach, c0 + lim); gx++) {
      const xm = toMm(gx)
      const ym = toMm(gy)
      if (xm * xm + ym * ym > SEARCH * SEARCH) continue
      const v = S.data[gy * N + gx]
      if (v < 0.25) continue
      let top = true
      for (let dy = -reach; dy <= reach && top; dy++) {
        const row = (gy + dy) * N + gx
        for (let dx = -reach; dx <= reach; dx++) {
          if (!dx && !dy) continue
          const w = S.data[row + dx]
          if (w > v || (w === v && (dy < 0 || (dy === 0 && dx < 0)))) {
            top = false
            break
          }
        }
      }
      if (top) peaks.push({ gx, gy, v })
    }
  }
  peaks.sort((p, q) => q.v - p.v)
  const marks: HoleMark[] = []
  for (const p of peaks.slice(0, 6)) {
    const m = fitHole(A, S, toMm(p.gx), toMm(p.gy))
    if (m.x * m.x + m.y * m.y > SEARCH * SEARCH) continue
    if (marks.some((o) => (o.x - m.x) ** 2 + (o.y - m.y) ** 2 < 1.8 * 1.8)) continue
    marks.push(m)
  }

  // Each mark's size: how far it differs from the print, measured straight from the photo along rays from its centre.
  const look = (xm: number, ym: number): number => {
    const r = Math.sqrt(xm * xm + ym * ym)
    // The centre dot, the black's edge and the printed lines look like holes; there the size can't be read.
    if (r < 0.5 || Math.abs(r - BLACK_EDGE) < 0.4) return NaN
    for (const line of LINES) if (Math.abs(r - line) < 0.32) return NaN
    if (!sampleRgb(img, center.x + xm * ax + ym * bx, center.y + xm * ay + ym * by, rgb)) return NaN
    const y = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]
    const rg = rgb[0] - rgb[1]
    const br = rgb[2] - rgb[0]
    const dr = rg - expected(profR, r)
    const dc = br - expected(profC, r)
    if (reddish(rg, br) && ((rg > 40 && rg > 0.28 * y) || (dr > 14 && -(dr + dc) < 0.2 * dr))) return NaN
    // Lighter or darker than the print, or on the paper bluer: not any colour, as colour is blurrier in a photo than
    // lightness and would push the edge out.
    const dy = Math.abs(y - expected(profY, r))
    return r < BLACK_EDGE ? dy / sBlack : Math.max(dy / sPaper, dc / sBlue)
  }
  for (const m of marks) {
    const edge = measureHole(look, m.x, m.y, T)
    if (!edge) continue
    // The hole is where its edge says, at the size it shows.
    m.x = Math.round(edge.x * 1000) / 1000
    m.y = Math.round(edge.y * 1000) / 1000
    m.radius = Math.round(edge.radius * 100) / 100
  }
  // Two marks whose edges turn out to be one hole's (its torn rim read apart): the stronger stays.
  marks.sort((p, q) => q.strength - p.strength)
  const holes = marks.filter((m, i) => !marks.slice(0, i).some((o) => (o.x - m.x) ** 2 + (o.y - m.y) ** 2 < 1.8 * 1.8))
  return { A, S, marks: holes }
}

/** Rays from a hole's centre, the step along them and how far out they read (mm). */
const RAYS = 48
const RAY_STEP = 0.05
const RAY_FROM = 0.6
const RAY_TO = 3.8
/** A hole's possible size: a 4.5 mm pellet can't leave a hole much smaller or larger in card. */
const HOLE_RADIUS_LIMITS = [1.3, 3.0] as const
/** How far from round a hole's edge may be (mm, its typical deviation) and still give its size. */
const ROUND_ENOUGH = 0.2

/** A hole as the photo shows it: the centre of its edge (mm from the bull's centre, y down) and its radius. */
interface HoleEdge {
  x: number
  y: number
  radius: number
}

/**
 * Where each ray from (cx, cy) crosses the hole's edge (mm), for the rays that show it. The hole reaches out to where
 * the card is printed again: the last sample still clearly off the print (a fifth of the hole's strength, so a shadow
 * inside the hole counts and the photo's grain doesn't) before 0.3 mm of print. The edge is that last step down to
 * the print, at half its own height, so blur moves it neither way. A ray whose step falls on a printed line or ink
 * (unread samples) gives nothing.
 */
function rayEdges(look: (xm: number, ym: number) => number, cx: number, cy: number, floor: number): { x: number; y: number }[] {
  const n = Math.round((RAY_TO - RAY_FROM) / RAY_STEP) + 1
  const h = new Float32Array(n)
  const out: { x: number; y: number }[] = []
  for (let j = 0; j < RAYS; j++) {
    const a = (2 * Math.PI * j) / RAYS
    const ux = Math.cos(a)
    const uy = Math.sin(a)
    let peak = -Infinity
    for (let k = 0; k < n; k++) {
      const t = RAY_FROM + k * RAY_STEP
      h[k] = look(cx + t * ux, cy + t * uy)
      if (t <= 2.8 && h[k] > peak) peak = h[k]
    }
    if (!(peak >= 2 * floor)) continue
    const low = Math.max(floor, peak / 5)
    let lastIn = -1
    let below = 0
    for (let k = 0; k < n; k++) {
      const v = h[k]
      if (Number.isNaN(v)) continue
      if (v >= low) {
        lastIn = k
        below = 0
      } else if (lastIn >= 0 && ++below >= 6) break
    }
    if (lastIn < 0 || below < 6) continue
    let top = -1
    for (let k = Math.max(0, lastIn - 6); k <= lastIn; k++) if (!Number.isNaN(h[k]) && (top < 0 || h[k] > h[top])) top = k
    const outside: number[] = []
    for (let k = lastIn + 2; k <= Math.min(n - 1, lastIn + 10); k++) if (!Number.isNaN(h[k])) outside.push(h[k])
    if (top < 0 || outside.length < 4) continue
    const level = Math.max(floor, (h[top] + medianOf(outside)) / 2)
    let prev = -1
    let next = -1
    for (let k = top; k < n; k++) {
      if (Number.isNaN(h[k])) continue
      if (h[k] < level) {
        next = k
        break
      }
      prev = k
    }
    if (prev < 0 || next < 0 || next - prev > 3) continue
    const f = h[prev] > h[next] ? (h[prev] - level) / (h[prev] - h[next]) : 0.5
    const t = RAY_FROM + (prev + f * (next - prev)) * RAY_STEP
    out.push({ x: cx + t * ux, y: cy + t * uy })
  }
  return out
}

/** The circle through edge points (least squares, algebraic), the points taken with their weights; null if degenerate. */
function fitCircle(pts: readonly { x: number; y: number }[], w: readonly number[], ox: number, oy: number): HoleEdge | null {
  // Sums for the least squares fit, of x, y and z = x² + y² (relative to (ox, oy), for small numbers).
  let sxx = 0
  let sxy = 0
  let syy = 0
  let sx = 0
  let sy = 0
  let sn = 0
  let sxz = 0
  let syz = 0
  let sz = 0
  for (let i = 0; i < pts.length; i++) {
    if (!w[i]) continue
    const x = pts[i].x - ox
    const y = pts[i].y - oy
    const z = x * x + y * y
    sxx += x * x
    sxy += x * y
    syy += y * y
    sx += x
    sy += y
    sn += 1
    sxz += x * z
    syz += y * z
    sz += z
  }
  // [sxx sxy sx; sxy syy sy; sx sy n] [D E F]ᵀ = −[sxz syz sz]ᵀ, by Cramer's rule.
  const det = (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
  const M = det(sxx, sxy, sx, sxy, syy, sy, sx, sy, sn)
  if (!(Math.abs(M) > 1e-9)) return null
  const D = det(-sxz, sxy, sx, -syz, syy, sy, -sz, sy, sn) / M
  const E = det(sxx, -sxz, sx, sxy, -syz, sy, sx, -sz, sn) / M
  const F = det(sxx, sxy, -sxz, sxy, syy, -syz, sx, sy, -sz) / M
  const r2 = (D * D + E * E) / 4 - F
  return r2 > 0 ? { x: ox - D / 2, y: oy - E / 2, radius: Math.sqrt(r2) } : null
}

/**
 * A hole's edge as the card shows it: a circle fitted to where rays from its centre cross the edge, the odd points
 * (a tear, a flap, a neighbouring hole) left out; the rays cast again from that circle's centre when it moved. Null
 * when it can't be read cleanly: too little of the edge shows (printed lines, ink, a faint mark), or it isn't round
 * enough (two holes that touch, a big tear).
 */
function measureHole(look: (xm: number, ym: number) => number, x0: number, y0: number, floor: number): HoleEdge | null {
  let cx = x0
  let cy = y0
  let fit: HoleEdge | null = null
  let kept = 0
  let spread = Infinity
  for (let pass = 0; pass < 2; pass++) {
    const pts = rayEdges(look, cx, cy, floor)
    if (pts.length < RAYS * 0.4) return null
    const w = pts.map(() => 1)
    fit = fitCircle(pts, w, cx, cy)
    for (let round = 0; round < 3 && fit; round++) {
      const c = fit
      const res = pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y) - c.radius)
      spread = 1.4826 * medianOf(res.map(Math.abs))
      const limit = Math.max(0.12, 2.5 * spread)
      res.forEach((r, i) => (w[i] = Math.abs(r) <= limit ? 1 : 0))
      fit = fitCircle(pts, w, cx, cy)
    }
    if (!fit) return null
    const f = fit
    const res = pts.map((p, i) => (w[i] ? Math.abs(Math.hypot(p.x - f.x, p.y - f.y) - f.radius) : NaN)).filter((r) => !Number.isNaN(r))
    kept = res.length
    spread = 1.4826 * medianOf(res)
    if (Math.hypot(fit.x - cx, fit.y - cy) < 0.15) break
    cx = fit.x
    cy = fit.y
  }
  if (!fit || kept < RAYS * 0.4 || spread > ROUND_ENOUGH || Math.hypot(fit.x - x0, fit.y - y0) > 1) return null
  if (fit.radius < HOLE_RADIUS_LIMITS[0] || fit.radius > HOLE_RADIUS_LIMITS[1]) return null
  return { x: fit.x, y: fit.y, radius: fit.radius }
}

/** The flat bull's size and spacing, for anything drawing its maps. */
export const BULL_GRID = { size: N, step: STEP, half: HALF }

function dilate(mask: Uint8Array, r: number): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let gy = 0; gy < N; gy++) {
    for (let gx = 0; gx < N; gx++) {
      if (!mask[gy * N + gx]) continue
      for (let dy = -r; dy <= r; dy++) {
        const y = gy + dy
        if (y < 0 || y >= N) continue
        for (let dx = -r; dx <= r; dx++) {
          const x = gx + dx
          if (x >= 0 && x < N) out[y * N + x] = 1
        }
      }
    }
  }
  return out
}

/**
 * The two shapes a hole is fitted with, as tables by squared distance from its centre: a disc (what's behind showing
 * through: differing inside and at the rim) and a ring (what's behind no different from the print there, with torn
 * fibres at the rim only). Both ask for nothing just outside the rim.
 */
const KERNEL_REACH = RIM + 1.4
const KERNEL_STEPS = 400
function kernel(inside: (d: number) => number): Float32Array {
  const table = new Float32Array(KERNEL_STEPS + 1)
  for (let k = 0; k <= KERNEL_STEPS; k++) {
    const d = Math.sqrt((k / KERNEL_STEPS) * KERNEL_REACH * KERNEL_REACH)
    const rim = Math.exp(-((d - RIM) ** 2) / (2 * 0.3 * 0.3))
    const beyond = 0.35 * Math.exp(-((d - RIM - 1.0) ** 2) / (2 * 0.3 * 0.3))
    table[k] = inside(d) + rim - beyond
  }
  return table
}
const DISC = kernel((d) => 0.6 / (1 + Math.exp((d - (RIM - 0.45)) / 0.12)))
const RING = kernel((d) => -0.3 / (1 + Math.exp((d - (RIM - 0.6)) / 0.12)))

/** Where a hole's centre best explains the differences around a peak: a coarse then a fine search with the hole's shape. */
function fitHole(A: Plane, S: Plane, x0: number, y0: number): HoleMark {
  // The differences near the peak, as a short list (most samples are 0).
  const gather = 7.5
  const px: number[] = []
  const py: number[] = []
  const pw: number[] = []
  const g0x = Math.max(0, toIndex(x0 - gather))
  const g1x = Math.min(N - 1, toIndex(x0 + gather))
  const g0y = Math.max(0, toIndex(y0 - gather))
  const g1y = Math.min(N - 1, toIndex(y0 + gather))
  for (let gy = g0y; gy <= g1y; gy++) {
    for (let gx = g0x; gx <= g1x; gx++) {
      const w = A.data[gy * N + gx]
      if (w > 0) {
        px.push(toMm(gx))
        py.push(toMm(gy))
        pw.push(w)
      }
    }
  }
  const reach2 = KERNEL_REACH * KERNEL_REACH
  const search = (table: Float32Array) => {
    const score = (cx: number, cy: number) => {
      let s = 0
      for (let k = 0; k < pw.length; k++) {
        const dx = px[k] - cx
        const dy = py[k] - cy
        const d2 = dx * dx + dy * dy
        if (d2 >= reach2) continue
        s += pw[k] * table[Math.round((d2 / reach2) * KERNEL_STEPS)]
      }
      return s
    }
    let best = { x: x0, y: y0, s: score(x0, y0) }
    for (const [span, step] of [
      [2.4, 0.4],
      [0.4, 0.1],
      [0.1, 0.025],
    ]) {
      const cx = best.x
      const cy = best.y
      for (let oy = -span; oy <= span + 1e-9; oy += step) {
        for (let ox = -span; ox <= span + 1e-9; ox += step) {
          const s = score(cx + ox, cy + oy)
          if (s > best.s) best = { x: cx + ox, y: cy + oy, s }
        }
      }
    }
    return best
  }
  // A differing inside means what's behind shows through (the disc); otherwise only the rim's fibres do (the ring). An
  // inside only a shade off the print, beside bright fibres, is the ring's.
  const disc = search(DISC)
  let inside = 0
  let lit = 0
  const r2 = (RIM - 0.5) * (RIM - 0.5)
  const shade = 0.25 * S.data[Math.min(N - 1, Math.max(0, toIndex(y0))) * N + Math.min(N - 1, Math.max(0, toIndex(x0)))]
  for (let gy = toIndex(disc.y - RIM); gy <= toIndex(disc.y + RIM); gy++) {
    for (let gx = toIndex(disc.x - RIM); gx <= toIndex(disc.x + RIM); gx++) {
      if (gx < 0 || gy < 0 || gx >= N || gy >= N || (toMm(gx) - disc.x) ** 2 + (toMm(gy) - disc.y) ** 2 > r2) continue
      inside++
      if (A.data[gy * N + gx] > shade) lit++
    }
  }
  const best = inside && lit / inside >= 0.5 ? disc : search(RING)
  // The mark's spread around that centre (two touching holes make a long one), and how much of what's around lies
  // within the hole's rim.
  let sw = 0
  let sxx = 0
  let syy = 0
  let sxy = 0
  let within = 0
  for (let k = 0; k < pw.length; k++) {
    const dx = px[k] - best.x
    const dy = py[k] - best.y
    const d2 = dx * dx + dy * dy
    if (d2 > 4.5 * 4.5) continue
    if (d2 <= (RIM + 0.8) * (RIM + 0.8)) within += pw[k]
    if (d2 > 4.2 * 4.2) continue
    sw += pw[k]
    sxx += pw[k] * dx * dx
    syy += pw[k] * dy * dy
    sxy += pw[k] * dx * dy
  }
  let around = 0
  let near = 0
  let far = 0
  for (let k = 0; k < pw.length; k++) {
    const d2 = (px[k] - best.x) ** 2 + (py[k] - best.y) ** 2
    if (d2 <= 4.5 * 4.5) around += pw[k]
    if (d2 <= 5 * 5) near += pw[k]
    if (d2 <= 7.5 * 7.5) far += pw[k]
  }
  let l1 = 0
  let l2 = 0
  let dir = { x: 1, y: 0 }
  if (sw > 0) {
    const mxx = sxx / sw
    const myy = syy / sw
    const mxy = sxy / sw
    const tr = mxx + myy
    const root = Math.sqrt(Math.max(0, ((mxx - myy) * (mxx - myy)) / 4 + mxy * mxy))
    l1 = tr / 2 + root
    l2 = tr / 2 - root
    const ang = 0.5 * Math.atan2(2 * mxy, mxx - myy)
    dir = { x: Math.cos(ang), y: Math.sin(ang) }
  }
  const gx = Math.min(N - 1, Math.max(0, toIndex(best.x)))
  const gy = Math.min(N - 1, Math.max(0, toIndex(best.y)))
  const rimArea = 2 * Math.PI * RIM * 0.8
  return {
    x: best.x,
    y: best.y,
    strength: S.data[gy * N + gx],
    l1,
    l2,
    dir,
    contained: around > 0 ? within / around : 0,
    bounded: far > 0 ? near / far : 0,
    fit: (best.s * STEP * STEP) / rimArea,
    radius: null,
  }
}
