import { ringRadiusMm } from '../shooting/target'
import { solve } from '../targets/geometry'
import { type Plane, type RgbaImage, boxBlur, downscaleLuma } from '../targets/image'

/**
 * The target pictures on a photo of a match's results sheet (a Scopos printout: each series of ten drawn on a target,
 * beside the table of its shots). Each picture is found by its rings: concentric circles at the ISSF 10 m air rifle
 * radii (0.25 mm, then 2.5 mm wider each ring), drawn at whatever zoom the series needed, so each picture is measured
 * on its own. Plain TypeScript on the photo's pixels, allocation-light: the phone runs it without a JIT.
 */

/** A target picture on the photo, with the map from the target's millimetres to the photo's pixels around it. */
export interface SheetPanel {
  /** The target's centre on the photo (px). */
  x: number
  y: number
  /**
   * Target millimetres (x right, y up) to photo pixels: px = x + a·u + b·v and py = y + c·u + d·v. The photo's slant
   * makes the rings ellipses; this local map follows them, and the page's own axes.
   */
  a: number
  b: number
  c: number
  d: number
  /**
   * The photo's perspective around the picture (per pixel): a point the map above puts at offset q from the centre
   * is really at q / (1 − g·q). Zero for a photo taken square on.
   */
  gx: number
  gy: number
  /** Photo pixels per target millimetre (the map's mean scale). */
  pxPerMm: number
  /** How far out the rings were seen (mm): the picture shows at least this much of the target around its centre. */
  reachMm: number
  /** Rings seen around the centre (of the nine from ring 9 out). */
  rings: number
  /** How clearly the rings were seen, 0–1. */
  confidence: number
}

/** Rings 9 to 1: their radii in millimetres (the 10 is a 0.5 mm dot, too small to measure on a photo). */
const RINGS_MM = [9, 8, 7, 6, 5, 4, 3, 2, 1].map(ringRadiusMm)

/** The photo's brightness (Rec. 601 luma), full size: what both the panels and the shots are read from. */
export function sheetLuma(img: RgbaImage): Plane {
  const n = img.width * img.height
  const out = new Float32Array(n)
  const d = img.data
  for (let i = 0, j = 0; i < n; i++, j += 4) out[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]
  return { width: img.width, height: img.height, data: out }
}

/** A plane's value at (x, y), interpolated; NaN outside it. */
function lumaAt(p: Plane, x: number, y: number): number {
  const w = p.width
  if (!(x >= 0 && y >= 0 && x <= w - 1 && y <= p.height - 1)) return NaN
  let x0 = Math.floor(x)
  let y0 = Math.floor(y)
  if (x0 >= w - 1) x0 = w - 2
  if (y0 >= p.height - 1) y0 = p.height - 2
  const fx = x - x0
  const fy = y - y0
  const i = y0 * w + x0
  const d = p.data
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + w] * (1 - fx) + d[i + w + 1] * fx) * fy
}

/** Target millimetres → photo pixels. */
export function panelToPhoto(p: SheetPanel, u: number, v: number): { x: number; y: number } {
  const qx = p.a * u + p.b * v
  const qy = p.c * u + p.d * v
  const k = 1 / (1 - p.gx * qx - p.gy * qy)
  return { x: p.x + qx * k, y: p.y + qy * k }
}

/** Photo pixels → target millimetres. */
export function photoToPanel(p: SheetPanel, x: number, y: number): { x: number; y: number } {
  const det = p.a * p.d - p.b * p.c
  const qx = x - p.x
  const qy = y - p.y
  const k = 1 / (1 + p.gx * qx + p.gy * qy)
  return { x: ((p.d * qx - p.b * qy) / det) * k, y: ((-p.c * qx + p.a * qy) / det) * k }
}

interface Candidate {
  x: number
  y: number
  peak: number
}

/**
 * Where concentric circles are centred: every edge of the photo, shrunk to about 500 px, votes along its gradient (both
 * ways) for the centre of the circle it may lie on. A target's rings all vote for one point; a disc or a letter is one
 * small circle, and straight lines spread their votes over a band. Peaks are scored against their surroundings.
 */
function ringCentres(img: RgbaImage): Candidate[] {
  const f = Math.max(1, Math.round(Math.max(img.width, img.height) / 500))
  const L = downscaleLuma(img, f)
  const { width: w, height: h, data: d } = L
  const local = boxBlur(L, 8).data
  const acc = new Float32Array(w * h)
  const rMax = Math.round(0.25 * Math.min(w, h))
  // Two pixels in from the edges: the crest test below looks at a neighbour's own gradient.
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      const gx = d[i + 1 - w] + 2 * d[i + 1] + d[i + 1 + w] - d[i - 1 - w] - 2 * d[i - 1] - d[i - 1 + w]
      const gy = d[i + w - 1] + 2 * d[i + w] + d[i + w + 1] - d[i - w - 1] - 2 * d[i - w] - d[i - w + 1]
      const m = Math.sqrt(gx * gx + gy * gy)
      if (m < 0.32 * local[i]) continue
      // Only the crest of an edge votes (its strongest pixel across it), which keeps the votes few and sharp.
      const ux = gx / m
      const uy = gy / m
      const ox = Math.round(ux)
      const oy = Math.round(uy)
      const j1 = i + oy * w + ox
      const j2 = i - oy * w - ox
      const m1 = Math.hypot(
        d[j1 + 1 - w] + 2 * d[j1 + 1] + d[j1 + 1 + w] - d[j1 - 1 - w] - 2 * d[j1 - 1] - d[j1 - 1 + w],
        d[j1 + w - 1] + 2 * d[j1 + w] + d[j1 + w + 1] - d[j1 - w - 1] - 2 * d[j1 - w] - d[j1 - w + 1],
      )
      const m2 = Math.hypot(
        d[j2 + 1 - w] + 2 * d[j2 + 1] + d[j2 + 1 + w] - d[j2 - 1 - w] - 2 * d[j2 - 1] - d[j2 - 1 + w],
        d[j2 + w - 1] + 2 * d[j2 + w] + d[j2 + w + 1] - d[j2 - w - 1] - 2 * d[j2 - w] - d[j2 - w + 1],
      )
      if (m < m1 || m < m2) continue
      for (let s = -1; s <= 1; s += 2) {
        let px = x + 0.5
        let py = y + 0.5
        const sx = s * ux
        const sy = s * uy
        px += 2 * sx
        py += 2 * sy
        for (let r = 2; r <= rMax; r++, px += sx, py += sy) {
          if (px < 0 || py < 0 || px >= w || py >= h) break
          acc[(py | 0) * w + (px | 0)] += 1
        }
      }
    }
  }
  const sm = boxBlur({ width: w, height: h, data: acc }, 1).data
  const out: Candidate[] = []
  const ring = 8
  for (let y = ring; y < h - ring; y++) {
    for (let x = ring; x < w - ring; x++) {
      const i = y * w + x
      const v = sm[i]
      if (v <= 0) continue
      let top = true
      for (let dy = -3; dy <= 3 && top; dy++) for (let dx = -3; dx <= 3; dx++) if (sm[i + dy * w + dx] > v) { top = false; break }
      if (!top) continue
      // How far the peak stands above the votes around it: a target's centre is sharp, a band of lines is flat.
      let around = 0
      for (let k = 0; k < 16; k++) {
        const t = (k / 16) * 2 * Math.PI
        around += sm[Math.round(y + ring * Math.sin(t)) * w + Math.round(x + ring * Math.cos(t))]
      }
      // The peak's centre to within a pixel: the votes' centroid around it.
      let sw = 0
      let sx = 0
      let sy = 0
      const floor = around / 16
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const q = sm[i + dy * w + dx] - floor
          if (q <= 0) continue
          sw += q
          sx += q * dx
          sy += q * dy
        }
      }
      out.push({ x: (x + 0.5 + (sw ? sx / sw : 0)) * f, y: (y + 0.5 + (sw ? sy / sw : 0)) * f, peak: v - floor })
    }
  }
  out.sort((p, q) => q.peak - p.peak)
  return out
}

/** The concentric ellipses the rings make: their common centre and shape (p − c)ᵀ Q (p − c) = ρ² for ring radius ρ. */
interface RingFit {
  x: number
  y: number
  q11: number
  q12: number
  q22: number
  rings: number
  reachMm: number
  confidence: number
  /** Each ring's share of rays that saw it (rings 9 to 1), and the fit's spread (mm). */
  shares: number[]
  /** The same, counting only lines within 1.5 px of the ring. */
  sharp: number[]
  rms: number
  /** The photo's perspective (per pixel), once fitted: an offset q from the centre is |S·q| / (1 + g·q) mm out. */
  gx: number
  gy: number
}

/** Darker than both sides by this share of the brighter side: a printed line. */
const LINE_CONTRAST = 0.08

/** The thin dark lines met along rays out from a point: each ray's lines' distances (sub-pixel). */
class Dips {
  static readonly PER_RAY = 96
  readonly r: Float32Array
  readonly n: Int32Array
  readonly cos: Float64Array
  readonly sin: Float64Array
  readonly rays: number
  readonly length: number
  private readonly prof: Float32Array
  constructor(rays: number, length: number) {
    this.rays = rays
    this.length = length
    this.r = new Float32Array(rays * Dips.PER_RAY)
    this.n = new Int32Array(rays)
    this.cos = new Float64Array(rays)
    this.sin = new Float64Array(rays)
    for (let t = 0; t < rays; t++) {
      this.cos[t] = Math.cos((t / rays) * 2 * Math.PI)
      this.sin[t] = Math.sin((t / rays) * 2 * Math.PI)
    }
    this.prof = new Float32Array(length)
  }

  collect(L: Plane, cx: number, cy: number) {
    const prof = this.prof
    for (let t = 0; t < this.rays; t++) {
      let n = this.length
      const ct = this.cos[t]
      const st = this.sin[t]
      for (let r = 0; r < this.length; r++) {
        const v = lumaAt(L, cx + r * ct, cy + r * st)
        if (Number.isNaN(v)) {
          n = r
          break
        }
        prof[r] = v
      }
      let k = 0
      const base = t * Dips.PER_RAY
      for (let r = 4; r < n - 4 && k < Dips.PER_RAY; r++) {
        const v = prof[r]
        if (!(v <= prof[r - 1] && v < prof[r + 1])) continue
        const left = Math.max(prof[r - 2], prof[r - 3], prof[r - 4])
        const right = Math.max(prof[r + 2], prof[r + 3], prof[r + 4])
        const c = (Math.min(left, right) - v) / Math.max(left, right, 1)
        if (c < LINE_CONTRAST) continue
        const den = prof[r - 1] - 2 * v + prof[r + 1]
        this.r[base + k] = r + (den > 0 ? (0.5 * (prof[r - 1] - prof[r + 1])) / den : 0)
        k++
      }
      this.n[t] = k
    }
  }

  /**
   * The share of rays with a line at each distance, smoothed over a pixel or two; with `shape`, each distance first
   * divided by the ellipse's stretch along its ray, so a ring a little out of round adds up in one place.
   */
  histogram(H: Float32Array, shape: Shape | null = null) {
    H.fill(0)
    const raw = new Float32Array(H.length)
    for (let t = 0; t < this.rays; t++) {
      const base = t * Dips.PER_RAY
      const c = this.cos[t]
      const s = this.sin[t]
      const k = shape ? 1 / (1 + shape.e1 * (c * c - s * s) + shape.e2 * 2 * s * c) : 1
      for (let i = 0; i < this.n[t]; i++) {
        const r = Math.round(this.r[base + i] * k)
        if (r >= 0 && r < raw.length) raw[r] += 1
      }
    }
    for (let r = 1; r < H.length - 1; r++) H[r] = (raw[r - 1] + 2 * raw[r] + raw[r + 1]) / (2 * this.rays)
  }

  /**
   * How far the centre is off, by votes: a ring met at ra on one ray and at rb on the opposite ray puts the true centre
   * on the line δ·u = (ra − rb)/2. Every pair of lines on opposite rays votes along its line; only concentric rings
   * agree on one point (a shot's outline or a straight line has nothing to pair with). Within `range` pixels.
   */
  centreVote(range: number, minR: number): { x: number; y: number; votes: number } | null {
    const T = this.rays
    const half = T >> 1
    const size = 2 * range + 1
    const acc = new Float32Array(size * size)
    for (let t = 0; t < half; t++) {
      const c = this.cos[t]
      const s = this.sin[t]
      const a0 = t * Dips.PER_RAY
      const b0 = (t + half) * Dips.PER_RAY
      const na = this.n[t]
      const nb = this.n[t + half]
      const alongX = Math.abs(c) >= Math.abs(s)
      for (let i = 0; i < na; i++) {
        const ra = this.r[a0 + i]
        if (ra < minR) continue
        for (let j = 0; j < nb; j++) {
          const rb = this.r[b0 + j]
          const d = (ra - rb) / 2
          if (rb < minR || d > range || d < -range) continue
          // The line dx·c + dy·s = d through the grid, one cell per row or column.
          if (alongX) {
            for (let gy = -range; gy <= range; gy++) {
              const gx = Math.round((d - gy * s) / c)
              if (gx >= -range && gx <= range) acc[(gy + range) * size + gx + range] += 1
            }
          } else {
            for (let gx = -range; gx <= range; gx++) {
              const gy = Math.round((d - gx * c) / s)
              if (gy >= -range && gy <= range) acc[(gy + range) * size + gx + range] += 1
            }
          }
        }
      }
    }
    let best = 0
    for (let i = 1; i < acc.length; i++) if (acc[i] > acc[best]) best = i
    if (!acc[best]) return null
    const bx = (best % size) - range
    const by = Math.floor(best / size) - range
    // The peak's centroid over its 3 × 3 neighbourhood, for a fraction of a pixel.
    let sw = 0
    let sx = 0
    let sy = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = bx + dx
        const y = by + dy
        if (x < -range || x > range || y < -range || y > range) continue
        const v = acc[(y + range) * size + x + range]
        sw += v
        sx += v * x
        sy += v * y
      }
    }
    return { x: sx / sw, y: sy / sw, votes: acc[best] }
  }

  /**
   * How far the centre is off, from the ring nearest `rStar` on every ray: r(θ) = R + dx cos θ + dy sin θ +
   * R·(e1 cos 2θ + e2 sin 2θ) by least squares, rays far off dropped. Null when too few rays agree.
   */
  centreOffset(rStar: number): Offset | null {
    const T = this.rays
    const rr = new Float64Array(T)
    const use = new Uint8Array(T)
    const window = Math.max(4, 0.12 * rStar)
    for (let t = 0; t < T; t++) {
      const base = t * Dips.PER_RAY
      let best = -1
      let bestD = window
      for (let k = 0; k < this.n[t]; k++) {
        const d = Math.abs(this.r[base + k] - rStar)
        if (d < bestD) {
          bestD = d
          best = k
        }
      }
      if (best >= 0) {
        rr[t] = this.r[base + best]
        use[t] = 1
      }
    }
    let coef: number[] | null = null
    let inliers = 0
    for (let pass = 0; pass < 3; pass++) {
      const M = Array.from({ length: 5 }, () => new Array<number>(5).fill(0))
      const b = new Array<number>(5).fill(0)
      let n = 0
      for (let t = 0; t < T; t++) {
        if (!use[t]) continue
        const c = this.cos[t]
        const s = this.sin[t]
        const row = [1, c, s, c * c - s * s, 2 * s * c]
        for (let i = 0; i < 5; i++) {
          b[i] += row[i] * rr[t]
          for (let j = 0; j < 5; j++) M[i][j] += row[i] * row[j]
        }
        n++
      }
      if (n < 0.3 * T) return null
      coef = solve(M, b)
      if (!coef) return null
      const limit = pass === 0 ? Math.max(3, 0.05 * rStar) : 1.5
      inliers = 0
      for (let t = 0; t < T; t++) {
        if (!rr[t]) continue
        const c = this.cos[t]
        const s = this.sin[t]
        const fit = coef[0] + coef[1] * c + coef[2] * s + coef[3] * (c * c - s * s) + coef[4] * 2 * s * c
        use[t] = Math.abs(rr[t] - fit) < limit ? 1 : 0
        inliers += use[t]
      }
    }
    if (!coef || !(coef[0] > 0)) return null
    return { x: coef[1], y: coef[2], shape: { e1: coef[3] / coef[0], e2: coef[4] / coef[0] }, inliers }
  }
}

/** A ring's stretch along a ray at angle θ: 1 + e1 cos 2θ + e2 sin 2θ. */
interface Shape {
  e1: number
  e2: number
}

interface Offset {
  x: number
  y: number
  shape: Shape
  inliers: number
}

/** The distances where lines are met most (local maxima of the histogram), most first. */
function histogramPeaks(H: Float32Array, from: number, count: number): number[] {
  const peaks: number[] = []
  for (let r = Math.max(1, from); r < H.length - 1; r++) if (H[r] > 0 && H[r] >= H[r - 1] && H[r] > H[r + 1]) peaks.push(r)
  peaks.sort((p, q) => H[q] - H[p])
  return peaks.slice(0, count)
}

/**
 * The rings around a candidate centre: each ray out from it is searched for thin dark lines; the lines' distances,
 * gathered over every ray, show the rings' spacing (they sit at the ISSF radii, so the comb that fits them gives the
 * scale); then each ring's line is found along each ray and one set of concentric ellipses is fitted to all of them.
 */
function fitRings(L: Plane, cx: number, cy: number, rMax: number): RingFit | null {
  const NT = 180
  const NR = Math.max(16, Math.floor(rMax))
  // Centring and the comb need fewer rays than the rings' points (180, below).
  const dips = new Dips(90, NR)
  const H = new Float32Array(NR)
  let shape: Shape | null = null
  // 1. The centre: first by the votes of lines on opposite rays (from up to 24 px off), then to a fraction of a pixel:
  // a ring's distance along every ray is a constant plus the centre's offset (cos θ, sin θ) plus the ring's ellipse
  // (2θ). The distances where most rays meet a line are tried, and the one most rays agree on moves the centre.
  for (let iter = 0; iter < 3; iter++) {
    dips.collect(L, cx, cy)
    const v = dips.centreVote(24, 12)
    if (!v) break
    cx += v.x
    cy += v.y
    if (Math.hypot(v.x, v.y) < 1) break
  }
  const voted = { x: cx, y: cy }
  for (let iter = 0; iter < 6; iter++) {
    dips.collect(L, cx, cy)
    dips.histogram(H, shape)
    let move: Offset | null = null
    for (const r of histogramPeaks(H, 12, 4)) {
      const m = dips.centreOffset(r)
      if (m && (!move || m.inliers > move.inliers)) move = m
    }
    if (!move) break
    cx += move.x
    cy += move.y
    shape = move.shape
    if (Math.hypot(move.x, move.y) < 0.25) break
  }
  // A single circle (shots' outlines stacked on one spot) can pull the fine step away; the votes are the safer start.
  if (Math.hypot(cx - voted.x, cy - voted.y) > 3) {
    cx = voted.x
    cy = voted.y
    shape = null
  }
  dips.collect(L, cx, cy)
  dips.histogram(H, shape)
  const at = (r: number) => {
    if (!(r >= 0 && r < NR - 1)) return 0
    const r0 = Math.floor(r)
    return H[r0] + (H[r0 + 1] - H[r0]) * (r - r0)
  }
  // 2. The comb: rings 9 to 1 at the ISSF radii times the scale. Each tooth counts how much more often a line is met
  // there than half a ring out on either side (where the gaps between rings are), less a little: shots' outlines
  // crowd the middle with lines at every distance, which a plain count would take for rings; and teeth on nothing
  // count against, so neither half nor double the spacing wins. The best few scales are each fitted, and the fit that
  // sees the most of its rings is kept.
  let top = 0
  for (let r = 0; r < NR; r++) top = Math.max(top, H[r])
  if (top < 0.2) return null
  const sMin = 2.4
  const sMax = (NR - 4) / RINGS_MM[1]
  const scales: number[] = []
  const scores: number[] = []
  for (let s = sMin; s <= sMax; s *= 1.004) {
    let score = 0
    const gap = 1.25 * s
    for (const rho of RINGS_MM) {
      const r = s * rho
      if (r + gap > NR - 4) break
      score += at(r) - 0.5 * (at(r - gap) + at(r + gap)) - 0.06
    }
    scales.push(s)
    scores.push(score)
  }
  const tries: number[] = []
  const order = scores.map((_, i) => i).filter((i) => scores[i] > 0 && (i === 0 || scores[i] >= scores[i - 1]) && (i === scores.length - 1 || scores[i] > scores[i + 1]))
  order.sort((p, q) => scores[q] - scores[p])
  for (const i of order) {
    if (tries.length >= 3) break
    if (tries.some((s) => Math.max(s, scales[i]) / Math.min(s, scales[i]) < 1.12)) continue
    tries.push(scales[i])
  }
  // 3. Each ring's line on each ray, near where the comb puts it, then the ellipses through all of them.
  let fit: RingFit | null = null
  let fitScore = 0
  for (const s0 of tries) {
    let f: RingFit | null = null
    let x0 = cx
    let y0 = cy
    let Q = [1 / (s0 * s0), 0, 1 / (s0 * s0)]
    if (shape) {
      // The ellipse seen while centring, as a starting shape: the stretch along θ is 1 + e1 cos 2θ + e2 sin 2θ.
      const k = 1 / (s0 * s0)
      Q = [k * (1 - 2 * shape.e1), -k * 2 * shape.e2, k * (1 + 2 * shape.e1)]
    }
    for (let pass = 0; pass < 3; pass++) {
      const pts = ringPoints(L, x0, y0, Q, NT, NR, pass === 0 ? 0.25 : 0.15)
      if (pts.n < 12) break
      const g = fitConcentric(pts, x0, y0, Q)
      if (!g) break
      f = g
      x0 = g.x
      y0 = g.y
      Q = [g.q11, g.q12, g.q22]
    }
    if (!f) continue
    // Rings out to the farthest one seen well should all be seen: a ring missing inside that counts against.
    let extent = -1
    for (let ri = 0; ri < f.shares.length; ri++) if (f.shares[ri] >= 0.5) extent = ri
    let score = 0
    for (let ri = 0; ri <= extent; ri++) score += f.shares[ri] - 0.3
    if (score > fitScore) {
      fit = f
      fitScore = score
    }
  }
  return fit ? fitPerspective(L, fit, NT, NR) : null
}

/**
 * The rings again, with the photo's perspective: a circle seen at a slant is an ellipse whose centre drifts from the
 * target's centre the larger the circle (on a slanted photo, a pixel or two by ring 2). Every ring point is fitted to
 * |S·q| / (1 + g·q) = ρ, with q the point's offset from the centre, S the shape at the centre (symmetric) and g the
 * perspective, by Gauss–Newton from the concentric fit; g is held near zero when few rings show it.
 */
function fitPerspective(L: Plane, f: RingFit, NT: number, NR: number): RingFit {
  const pts = ringPoints(L, f.x, f.y, [f.q11, f.q12, f.q22], NT, NR, 0.12)
  const use = new Uint8Array(pts.n)
  let n = 0
  for (let i = 0; i < pts.n; i++) {
    if (f.shares[pts.ring[i]] < RING_SEEN) continue
    use[i] = 1
    n++
  }
  if (n < 30) return f
  const [s11, s12, s22] = sqrtSym(f.q11, f.q12, f.q22)
  // Parameters: centre (px), S (per px), and g scaled by 1000 for a well-conditioned system.
  const t = [f.x, f.y, s11, s12, s22, 0, 0]
  const pxPerMm = Math.pow(f.q11 * f.q22 - f.q12 * f.q12, -0.25)
  const limits = [0.15, 0.15, 2.5 / pxPerMm, 2 / pxPerMm, 2 / pxPerMm, 2 / pxPerMm]
  for (const limit of limits) {
    const M = Array.from({ length: 7 }, () => new Array<number>(7).fill(0))
    const b = new Array<number>(7).fill(0)
    const J = new Array<number>(7)
    let used = 0
    for (let i = 0; i < pts.n; i++) {
      if (!use[i]) continue
      const qx = pts.x[i] - t[0]
      const qy = pts.y[i] - t[1]
      const vx = t[2] * qx + t[3] * qy
      const vy = t[3] * qx + t[4] * qy
      const nv = Math.hypot(vx, vy)
      const gx = t[5] / 1000
      const gy = t[6] / 1000
      const w = 1 + gx * qx + gy * qy
      if (!(nv > 0 && w > 0)) continue
      const r = nv / w - pts.rho[i]
      if (Math.abs(r) > Math.max(limit, Math.min(0.15, 1.2 / pxPerMm))) continue
      J[0] = -(t[2] * vx + t[3] * vy) / (nv * w) + (nv * gx) / (w * w)
      J[1] = -(t[3] * vx + t[4] * vy) / (nv * w) + (nv * gy) / (w * w)
      J[2] = (vx * qx) / (nv * w)
      J[3] = (vx * qy + vy * qx) / (nv * w)
      J[4] = (vy * qy) / (nv * w)
      J[5] = (-nv * qx) / (1000 * w * w)
      J[6] = (-nv * qy) / (1000 * w * w)
      for (let a = 0; a < 7; a++) {
        b[a] -= J[a] * r
        for (let c = 0; c < 7; c++) M[a][c] += J[a] * J[c]
      }
      used++
    }
    if (used < 30) break
    // A little damping on the perspective (it is weakly seen with few rings, and small on any photo).
    for (let a = 0; a < 7; a++) M[a][a] *= 1.000001
    M[5][5] += 0.01 * used
    M[6][6] += 0.01 * used
    const step = solve(M, b)
    if (!step) break
    for (let a = 0; a < 7; a++) t[a] += step[a]
  }
  const S = [t[2], t[3], t[4]]
  const q11 = S[0] * S[0] + S[1] * S[1]
  const q12 = S[0] * S[1] + S[1] * S[2]
  const q22 = S[1] * S[1] + S[2] * S[2]
  if (!(q11 * q22 - q12 * q12 > 0) || Math.hypot(t[0] - f.x, t[1] - f.y) > 0.5 * pxPerMm) return f
  return { ...f, x: t[0], y: t[1], q11, q12, q22, gx: t[5] / 1000, gy: t[6] / 1000 }
}

interface RingPoints {
  n: number
  x: Float64Array
  y: Float64Array
  rho: Float64Array
  w: Float64Array
  ring: Int8Array
}

/**
 * On each ray, each ring's line: of the thin dark lines within `window` ring spacings of where the current ellipses put
 * it, the nearest (a shot's outline beside a ring is often as dark as the ring).
 */
function ringPoints(L: Plane, cx: number, cy: number, Q: number[], NT: number, NR: number, window: number): RingPoints {
  const max = NT * RINGS_MM.length
  const out: RingPoints = { n: 0, x: new Float64Array(max), y: new Float64Array(max), rho: new Float64Array(max), w: new Float64Array(max), ring: new Int8Array(max) }
  const buf = new Float32Array(NR + 8)
  for (let t = 0; t < NT; t++) {
    const ct = Math.cos((t / NT) * 2 * Math.PI)
    const st = Math.sin((t / NT) * 2 * Math.PI)
    // Pixels per millimetre along this ray: (u Q u)^(-1/2).
    const k = 1 / Math.sqrt(Q[0] * ct * ct + 2 * Q[1] * ct * st + Q[2] * st * st)
    const half = Math.max(3, window * 2.5 * k)
    for (let ri = 0; ri < RINGS_MM.length; ri++) {
      const r0 = RINGS_MM[ri] * k
      if (r0 + half + 4 > NR) break
      const lo = Math.max(4, Math.floor(r0 - half))
      const hi = Math.ceil(r0 + half)
      // The profile from lo − 3 to hi + 3.
      let ok = true
      for (let r = lo - 3; r <= hi + 3; r++) {
        const v = lumaAt(L, cx + r * ct, cy + r * st)
        if (Number.isNaN(v)) {
          ok = false
          break
        }
        buf[r - lo + 3] = v
      }
      if (!ok) break
      let bestR = -1
      let bestD = Infinity
      let bestC = 0
      for (let r = lo; r <= hi; r++) {
        const j = r - lo + 3
        const v = buf[j]
        const vm = buf[j - 1]
        const vp = buf[j + 1]
        if (!(v <= vm && v < vp)) continue
        const left = Math.max(buf[j - 2], buf[j - 3])
        const right = Math.max(buf[j + 2], buf[j + 3])
        const c = (Math.min(left, right) - v) / Math.max(left, right, 1)
        if (c < LINE_CONTRAST) continue
        // Sub-pixel: the parabola through the dip.
        const den = vm - 2 * v + vp
        const rr = r + (den > 0 ? (0.5 * (vm - vp)) / den : 0)
        const d = Math.abs(rr - r0)
        if (d < bestD) {
          bestD = d
          bestR = rr
          bestC = c
        }
      }
      if (bestR < 0) continue
      const i = out.n++
      out.x[i] = cx + bestR * ct
      out.y[i] = cy + bestR * st
      out.rho[i] = RINGS_MM[ri]
      out.w[i] = Math.min(1, bestC * 4)
      out.ring[i] = ri
    }
  }
  return out
}

/** Each point's distance from its ring's ellipse, in millimetres. */
function ringResiduals(pts: RingPoints, cx: number, cy: number, Q: number[], out: Float64Array) {
  for (let i = 0; i < pts.n; i++) {
    const dx = pts.x[i] - cx
    const dy = pts.y[i] - cy
    out[i] = Math.abs(Math.sqrt(Math.max(0, Q[0] * dx * dx + 2 * Q[1] * dx * dy + Q[2] * dy * dy)) - pts.rho[i])
  }
}

/** A ring has to be seen on this share of rays to be fitted and counted (rings past the picture's edge are not). */
const RING_SEEN = 0.4

/**
 * Concentric ellipses through points on rings of known radii, starting from a guess: (p − c)ᵀ Q (p − c) = ρ², linear
 * in Q's three entries, −2Qc and cᵀQc, solved by weighted least squares. Only rings seen on enough rays take part
 * (lines met by chance past the picture's edge would pull it), and each round keeps the points nearer the ellipses
 * than the last (0.18 mm, then a few pixels), so the rings' own sharp lines decide, not shots' outlines beside them.
 */
function fitConcentric(pts: RingPoints, ox: number, oy: number, Q0: number[]): RingFit | null {
  const n = pts.n
  const keep = new Uint8Array(n)
  const res = new Float64Array(n)
  const seen = new Float64Array(RINGS_MM.length)
  const sharp = new Float64Array(RINGS_MM.length)
  const limit = 0.18
  // Scaled coordinates around the starting centre, for a well-conditioned system.
  let scale = 0
  for (let i = 0; i < n; i++) scale = Math.max(scale, Math.abs(pts.x[i] - ox), Math.abs(pts.y[i] - oy))
  scale = scale || 1
  let cx = ox
  let cy = oy
  let Q = Q0
  let fitted = false
  const keepPx = [Infinity, Infinity, 6, 4, 3, 2.5]
  for (let iter = 0; iter < keepPx.length; iter++) {
    // How the current ellipses fit: residuals, and each ring's share of rays within 0.18 mm (and within 1.5 px).
    ringResiduals(pts, cx, cy, Q, res)
    const pxPerMm = Math.pow(Q[0] * Q[2] - Q[1] * Q[1], -0.25)
    const tight = Math.min(limit, 1.5 / pxPerMm)
    seen.fill(0)
    sharp.fill(0)
    for (let i = 0; i < n; i++) {
      if (res[i] < limit) seen[pts.ring[i]] += 1
      if (res[i] < tight) sharp[pts.ring[i]] += 1
    }
    if (iter === keepPx.length - 1) break
    const keepMm = Math.min(iter === 0 ? 0.3 : limit, keepPx[iter] / pxPerMm)
    let kept = 0
    for (let i = 0; i < n; i++) {
      keep[i] = res[i] < keepMm && seen[pts.ring[i]] >= RING_SEEN * 180 ? 1 : 0
      kept += keep[i]
    }
    if (kept < 12) {
      if (!fitted) return null
      break
    }
    const M = Array.from({ length: 6 }, () => new Array<number>(6).fill(0))
    const b = new Array<number>(6).fill(0)
    for (let i = 0; i < n; i++) {
      if (!keep[i]) continue
      const x = (pts.x[i] - ox) / scale
      const y = (pts.y[i] - oy) / scale
      const w = pts.w[i]
      const row = [x * x, 2 * x * y, y * y, x, y, 1]
      const rhs = pts.rho[i] * pts.rho[i]
      for (let r = 0; r < 6; r++) {
        b[r] += w * row[r] * rhs
        for (let c = 0; c < 6; c++) M[r][c] += w * row[r] * row[c]
      }
    }
    const p = solve(M, b)
    if (!p) break
    const [q11, q12, q22, g1, g2] = p
    const det = q11 * q22 - q12 * q12
    if (!(det > 0 && q11 > 0)) break
    // c = −Q⁻¹ g / 2, in the scaled coordinates.
    cx = ox - ((q22 * g1 - q12 * g2) / (2 * det)) * scale
    cy = oy - ((-q12 * g1 + q11 * g2) / (2 * det)) * scale
    Q = [q11 / (scale * scale), q12 / (scale * scale), q22 / (scale * scale)]
    fitted = true
  }
  if (!fitted) return null
  let rings = 0
  let reach = 0
  let total = 0
  for (let ri = 0; ri < RINGS_MM.length; ri++) {
    const share = seen[ri] / 180
    if (share >= RING_SEEN) {
      rings++
      reach = RINGS_MM[ri]
      total += share
    }
  }
  let ss = 0
  let sn = 0
  for (let i = 0; i < n; i++) {
    if (!(res[i] < limit) || seen[pts.ring[i]] < RING_SEEN * 180) continue
    ss += res[i] * res[i]
    sn++
  }
  return {
    x: cx,
    y: cy,
    q11: Q[0],
    q12: Q[1],
    q22: Q[2],
    rings,
    reachMm: reach,
    confidence: rings ? Math.min(1, total / rings) : 0,
    shares: Array.from(seen, (v) => v / 180),
    sharp: Array.from(sharp, (v) => v / 180),
    rms: sn ? Math.sqrt(ss / sn) : 1,
    gx: 0,
    gy: 0,
  }
}

/** A 2 × 2 symmetric matrix's square root. */
function sqrtSym(e11: number, e12: number, e22: number): [number, number, number] {
  const s = Math.sqrt(Math.max(0, e11 * e22 - e12 * e12))
  const t = Math.sqrt(e11 + e22 + 2 * s)
  return [(e11 + s) / t, e12 / t, (e22 + s) / t]
}

/**
 * The map from target millimetres to photo pixels whose x axis points along `ux` (the page's horizontal there) and
 * which takes circles to the rings' ellipses (A Aᵀ = Q⁻¹). The target's y goes up the page, the photo's down.
 */
function panelMap(f: RingFit, dir: { x: number; y: number }, along: 'x' | 'y'): [number, number, number, number] {
  const det = f.q11 * f.q22 - f.q12 * f.q12
  // E = Q⁻¹ and its square root, and the root's inverse.
  const [r11, r12, r22] = sqrtSym(f.q22 / det, -f.q12 / det, f.q11 / det)
  const rdet = r11 * r22 - r12 * r12
  const i11 = r22 / rdet
  const i12 = -r12 / rdet
  const i22 = r11 / rdet
  let v1x: number
  let v1y: number
  let v2x: number
  let v2y: number
  const wx = i11 * dir.x + i12 * dir.y
  const wy = i12 * dir.x + i22 * dir.y
  const wl = Math.hypot(wx, wy)
  if (along === 'x') {
    v1x = wx / wl
    v1y = wy / wl
    v2x = v1y
    v2y = -v1x
  } else {
    v2x = wx / wl
    v2y = wy / wl
    v1x = -v2y
    v1y = v2x
  }
  return [r11 * v1x + r12 * v1y, r11 * v2x + r12 * v2y, r12 * v1x + r22 * v1y, r12 * v2x + r22 * v2y]
}

/**
 * The target pictures on a results sheet's photo, in reading order (the top row left to right, then down). Each has
 * its centre and the map from the target's millimetres to the photo, measured from its own rings; the page's
 * horizontal at each picture comes from the row it sits in (the line through the row's centres is the page's
 * horizontal there, whatever the slant), or its column's vertical, or the photo's own axes for a picture alone.
 * `expected`, when the text says how many series there are, stops the search once they're found.
 */
export function findSheetPanels(img: RgbaImage, luma: Plane = sheetLuma(img), expected = 0): SheetPanel[] {
  const candidates = ringCentres(img).slice(0, 16)
  // A picture is well under half the photo's short side across (a sheet holds several), so its rings are too.
  const rMax = 0.22 * Math.min(img.width, img.height)
  const kept: { fit: RingFit; quality: number; px: number }[] = []
  let after = 0
  for (const c of candidates) {
    // With as many pictures as the sheet should have, a couple more candidates may still replace a poorer one.
    if (expected && kept.length >= expected && ++after > 2) break
    const f = fitRings(luma, c.x, c.y, rMax)
    if (!f) continue
    const px = Math.pow(f.q11 * f.q22 - f.q12 * f.q12, -0.25)
    // A target: at least two rings seen, and either one of them sharply on most rays, or rings 9 and 8 both all round
    // (a pile of shots or a noisy photo can blur the sharp count). A table's ruled lines, taken for two huge rings,
    // are met by chance: never sharply, never all round. And not so small its rings blur together.
    const sharpest = Math.max(...f.sharp)
    const round = f.rings >= 3 && f.shares[0] >= 0.85 && f.shares[1] >= 0.85
    if (f.rings < 2 || (sharpest < SHARP_RING && !round) || px < 3) continue
    const quality = f.sharp.reduce((n, v) => n + v, 0)
    // Two candidates on one picture (a cluster of shots near its centre votes too): the better fit stays.
    const same = kept.findIndex((k) => Math.hypot(k.fit.x - f.x, k.fit.y - f.y) < RINGS_MM[1] * Math.max(k.px, px))
    if (same < 0) kept.push({ fit: f, quality, px })
    else if (quality > kept[same].quality) kept[same] = { fit: f, quality, px }
  }
  if (!kept.length) return []
  return orderAndMap(kept.map((k) => k.fit))
}

/** The share of rays a target's clearest ring has to be seen on within 1.5 px. */
const SHARP_RING = 0.55

/** Rows and columns of the pictures, the page's axes at each, and the reading order. */
function orderAndMap(fits: RingFit[]): SheetPanel[] {
  const n = fits.length
  // The page's tilt, roughly: the median direction between pictures side by side (within 25° of the photo's x).
  const angles: number[] = []
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const dx = fits[j].x - fits[i].x
      const dy = fits[j].y - fits[i].y
      if (dx <= 0) continue
      const a = Math.atan2(dy, dx)
      if (Math.abs(a) < (25 * Math.PI) / 180) angles.push(a)
    }
  }
  angles.sort((p, q) => p - q)
  const tilt = angles.length ? angles[angles.length >> 1] : 0
  const ct = Math.cos(tilt)
  const st = Math.sin(tilt)
  // Down the page and across it, untilted.
  const down = fits.map((f) => -f.x * st + f.y * ct)
  const across = fits.map((f) => f.x * ct + f.y * st)
  // Nearest-neighbour spacing, to tell rows apart.
  let spacing = Infinity
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) spacing = Math.min(spacing, Math.hypot(fits[i].x - fits[j].x, fits[i].y - fits[j].y))
  const gap = Number.isFinite(spacing) ? 0.35 * spacing : Infinity
  const order = fits.map((_, i) => i).sort((p, q) => down[p] - down[q])
  const rows: number[][] = []
  for (const i of order) {
    const row = rows[rows.length - 1]
    if (row && Math.abs(down[i] - down[row[0]]) < gap) row.push(i)
    else rows.push([i])
  }
  for (const row of rows) row.sort((p, q) => across[p] - across[q])
  // Columns: pictures in different rows at about the same place across.
  const colOf = new Map<number, number[]>()
  for (const i of order) {
    const col = [...colOf.values()].find((c) => Math.abs(across[c[0]] - across[i]) < gap)
    if (col) col.push(i)
    else colOf.set(i, [i])
  }
  const columnOf = (i: number) => [...colOf.values()].find((c) => c.includes(i)) ?? [i]
  const out: SheetPanel[] = []
  for (const row of rows) {
    for (const i of row) {
      const f = fits[i]
      let map: [number, number, number, number]
      if (row.length >= 2) {
        const dir = lineDirection(row.map((k) => fits[k]))
        map = panelMap(f, dir, 'x')
      } else {
        const col = columnOf(i)
        if (col.length >= 2) {
          const sorted = [...col].sort((p, q) => down[p] - down[q])
          const dir = lineDirection(sorted.map((k) => fits[k]))
          // Up the page: from the lowest picture to the highest.
          map = panelMap(f, { x: -dir.x, y: -dir.y }, 'y')
        } else map = panelMap(f, { x: ct, y: st }, 'x')
      }
      const [a, b, c, d] = map
      out.push({ x: f.x, y: f.y, a, b, c, d, gx: f.gx, gy: f.gy, pxPerMm: Math.sqrt(Math.abs(a * d - b * c)), reachMm: f.reachMm, rings: f.rings, confidence: f.confidence })
    }
  }
  return out
}

/** The direction of the line through points (first to last), by least squares. */
function lineDirection(pts: { x: number; y: number }[]): { x: number; y: number } {
  let mx = 0
  let my = 0
  for (const p of pts) {
    mx += p.x
    my += p.y
  }
  mx /= pts.length
  my /= pts.length
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const p of pts) {
    sxx += (p.x - mx) ** 2
    sxy += (p.x - mx) * (p.y - my)
    syy += (p.y - my) ** 2
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  let dx = Math.cos(angle)
  let dy = Math.sin(angle)
  const first = pts[0]
  const last = pts[pts.length - 1]
  if ((last.x - first.x) * dx + (last.y - first.y) * dy < 0) {
    dx = -dx
    dy = -dy
  }
  return { x: dx, y: dy }
}
