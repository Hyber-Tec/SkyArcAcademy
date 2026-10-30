import { PELLET_MM, type ShotPoint } from '../shooting/target'
import type { Plane } from '../targets/image'
import type { SheetPanel } from './sheetPanels'

/**
 * Where each shot of a series is on its target picture (a results sheet's photo, sheetPanels.ts). The sheet prints
 * each shot's decimal score, and a score puts the shot's centre at one distance from the target's centre (±0.125 mm),
 * so only its direction is unknown: it is found where the picture shows a pellet-sized disc on that circle. The
 * discs are drawn semi-transparent with a darker outline, so even overlapping ones keep their whole outline; every
 * edge of the picture votes for the centre of the disc it may outline (the pellet's radius away along its normal),
 * the shots take the strongest votes on their circles, and shots of about the same score share them out sensibly.
 */

/** Of the series' typical disc's votes: below this share, no disc; from this share, a clear one. */
const NOISE = 0.3
const CLEAR = 0.45

/** The pellet's radius, the size every shot's disc is drawn at. */
const R_MM = PELLET_MM / 2

/** A shot's distance from the target's centre (mm) from its decimal score: 10.9 is within 0.25 mm, each tenth less 0.25 mm. */
export function scoreDistanceMm(value: number): number | null {
  if (!(value >= 1 && value <= 10.9)) return null
  return Math.max(0, (10.9 - value) * 2.5) + 0.125
}

/** How the votes for disc centres are laid out: a grid of photo pixels around the panel's centre. */
interface Votes {
  x0: number
  y0: number
  w: number
  h: number
  acc: Float32Array
}

/**
 * Every edge in the picture, out to `reachMm`, votes for the centre of a disc it may outline: the pellet's radius away
 * along its normal (both ways), through the panel's map so the discs' slant is followed. Only the crest of an edge
 * votes, weighted by its contrast.
 */
function discVotes(L: Plane, p: SheetPanel, reachMm: number): Votes {
  const ax = Math.hypot(p.a, p.c)
  const ay = Math.hypot(p.b, p.d)
  const half = Math.ceil((reachMm + R_MM + 1) * Math.max(ax, ay)) + 3
  const x0 = Math.max(1, Math.floor(p.x - half))
  const y0 = Math.max(1, Math.floor(p.y - half))
  const x1 = Math.min(L.width - 2, Math.ceil(p.x + half))
  const y1 = Math.min(L.height - 2, Math.ceil(p.y + half))
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const acc = new Float32Array(w * h)
  const d = L.data
  const W = L.width
  // E = A Aᵀ, for the offset from an edge to its disc's centre along the edge's normal n: R·E·n / |Aᵀn|.
  const e11 = p.a * p.a + p.b * p.b
  const e12 = p.a * p.c + p.b * p.d
  const e22 = p.c * p.c + p.d * p.d
  const mag = new Float32Array(w * h)
  const gxs = new Float32Array(w * h)
  const gys = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y + y0) * W + x + x0
      const gx = d[i + 1 - W] + 2 * d[i + 1] + d[i + 1 + W] - d[i - 1 - W] - 2 * d[i - 1] - d[i - 1 + W]
      const gy = d[i + W - 1] + 2 * d[i + W] + d[i + W + 1] - d[i - W - 1] - 2 * d[i - W] - d[i - W + 1]
      const k = y * w + x
      gxs[k] = gx
      gys[k] = gy
      mag[k] = Math.sqrt(gx * gx + gy * gy) / 8
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x
      const m = mag[k]
      const i = (y + y0) * W + x + x0
      const bright = d[i] + 20
      if (m < 0.035 * bright) continue
      const nx = gxs[k] / (8 * m)
      const ny = gys[k] / (8 * m)
      // The crest across the edge.
      const ox = Math.round(nx)
      const oy = Math.round(ny)
      if (m < mag[k + oy * w + ox] || m < mag[k - oy * w - ox]) continue
      const tx = p.a * nx + p.c * ny
      const ty = p.b * nx + p.d * ny
      const norm = Math.hypot(tx, ty)
      const vx = (R_MM * (e11 * nx + e12 * ny)) / norm
      const vy = (R_MM * (e12 * nx + e22 * ny)) / norm
      const weight = Math.min(1, m / bright / 0.15)
      splat(acc, w, h, x + vx, y + vy, weight)
      splat(acc, w, h, x - vx, y - vy, weight)
    }
  }
  return { x0, y0, w, h, acc: blur3(acc, w, h) }
}

function splat(acc: Float32Array, w: number, h: number, x: number, y: number, v: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  if (xi < 0 || yi < 0 || xi >= w - 1 || yi >= h - 1) return
  const fx = x - xi
  const fy = y - yi
  const i = yi * w + xi
  acc[i] += v * (1 - fx) * (1 - fy)
  acc[i + 1] += v * fx * (1 - fy)
  acc[i + w] += v * (1 - fx) * fy
  acc[i + w + 1] += v * fx * fy
}

function blur3(a: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      out[i] = (a[i - w - 1] + a[i - w] + a[i - w + 1] + a[i - 1] + a[i] + a[i + 1] + a[i + w - 1] + a[i + w] + a[i + w + 1]) / 9
    }
  }
  return out
}

/** The votes at a point in target millimetres (interpolated; 0 outside). */
function votesAt(v: Votes, p: SheetPanel, u: number, w: number): number {
  const qx = p.a * u + p.b * w
  const qy = p.c * u + p.d * w
  const k = 1 / (1 - p.gx * qx - p.gy * qy)
  const x = p.x + qx * k - v.x0
  const y = p.y + qy * k - v.y0
  if (!(x >= 0 && y >= 0 && x < v.w - 1 && y < v.h - 1)) return 0
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const i = yi * v.w + xi
  const a = v.acc
  return (a[i] * (1 - fx) + a[i + 1] * fx) * (1 - fy) + (a[i + v.w] * (1 - fx) + a[i + v.w + 1] * fx) * fy
}

/**
 * The group's centre as the picture draws it: two straight lines (the group's axes) cross at it. Every edge within
 * `reachMm` of the target's centre (inside the picture's frame) votes for the straight line along it; of the lines
 * passing within `withinMm` of `near` (where the shots placed put the group), the two longest about square to each
 * other are the axes. Null when two such lines aren't there.
 */
export function crossCentre(L: Plane, p: SheetPanel, reachMm: number, near: ShotPoint, withinMm = 1.5): ShotPoint | null {
  const ax = Math.hypot(p.a, p.c)
  const ay = Math.hypot(p.b, p.d)
  const rPx = reachMm * Math.min(ax, ay)
  const half = Math.ceil(reachMm * Math.max(ax, ay)) + 2
  const x0 = Math.max(1, Math.floor(p.x - half))
  const y0 = Math.max(1, Math.floor(p.y - half))
  const x1 = Math.min(L.width - 2, Math.ceil(p.x + half))
  const y1 = Math.min(L.height - 2, Math.ceil(p.y + half))
  const NT = 180
  const NRho = 2 * half + 1
  const acc = new Float32Array(NT * NRho)
  const cosT = new Float64Array(NT)
  const sinT = new Float64Array(NT)
  for (let t = 0; t < NT; t++) {
    cosT[t] = Math.cos((t * Math.PI) / NT)
    sinT[t] = Math.sin((t * Math.PI) / NT)
  }
  const d = L.data
  const W = L.width
  const mag = (i: number) => {
    const gx = d[i + 1 - W] + 2 * d[i + 1] + d[i + 1 + W] - d[i - 1 - W] - 2 * d[i - 1] - d[i - 1 + W]
    const gy = d[i + W - 1] + 2 * d[i + W] + d[i + W + 1] - d[i - W - 1] - 2 * d[i - W] - d[i - W + 1]
    return Math.sqrt(gx * gx + gy * gy)
  }
  for (let y = y0 + 1; y < y1; y++) {
    for (let x = x0 + 1; x < x1; x++) {
      const qx = x - p.x
      const qy = y - p.y
      if (qx * qx + qy * qy > rPx * rPx) continue
      const i = y * W + x
      const gx = d[i + 1 - W] + 2 * d[i + 1] + d[i + 1 + W] - d[i - 1 - W] - 2 * d[i - 1] - d[i - 1 + W]
      const gy = d[i + W - 1] + 2 * d[i + W] + d[i + W + 1] - d[i - W - 1] - 2 * d[i - W] - d[i - W + 1]
      const m = Math.sqrt(gx * gx + gy * gy)
      if (m < 0.3 * (d[i] + 20)) continue
      const ox = Math.round(gx / m)
      const oy = Math.round(gy / m)
      if (m < mag(i + oy * W + ox) || m < mag(i - oy * W - ox)) continue
      // The line along this edge: its normal is the gradient; θ in [0, π) and ρ the signed distance from the centre.
      // A thin line's gradient wobbles by a few degrees, so the edge votes for every line through it within 5° of that.
      let th = Math.atan2(gy, gx)
      if (th < 0) th += Math.PI
      if (th >= Math.PI) th -= Math.PI
      const tc = Math.round((th / Math.PI) * NT)
      for (let k = -5; k <= 5; k++) {
        let t = tc + k
        // Across θ = π the line's normal flips.
        let flip = 1
        if (t < 0) {
          t += NT
          flip = -1
        } else if (t >= NT) {
          t -= NT
          flip = -1
        }
        const rho = flip * (qx * cosT[t] + qy * sinT[t]) + half
        const r0 = Math.floor(rho)
        const fr = rho - r0
        if (r0 < 0 || r0 >= NRho - 1) continue
        acc[t * NRho + r0] += 1 - fr
        acc[t * NRho + r0 + 1] += fr
      }
    }
  }
  // The two strongest lines near the group, by the votes over three bins of ρ (a line's two edges are a pixel or two
  // apart).
  const nq = panelOffset(p, near.x, near.y)
  const within = withinMm * Math.min(ax, ay)
  const line = (skip: (t: number) => boolean) => {
    let best = 0
    let bt = -1
    let br = -1
    for (let t = 0; t < NT; t++) {
      if (skip(t)) continue
      const at = nq.x * cosT[t] + nq.y * sinT[t] + half
      const lo = Math.max(1, Math.floor(at - within))
      const hi = Math.min(NRho - 2, Math.ceil(at + within))
      for (let r = lo; r <= hi; r++) {
        const v = acc[t * NRho + r - 1] + acc[t * NRho + r] + acc[t * NRho + r + 1]
        if (v > best) {
          best = v
          bt = t
          br = r
        }
      }
    }
    if (bt < 0) return null
    // Sub-bin ρ: the centroid of the three bins.
    const a = acc[bt * NRho + br - 1]
    const b = acc[bt * NRho + br]
    const c = acc[bt * NRho + br + 1]
    const rho = br + (c - a) / Math.max(1e-6, a + b + c) - half
    return { t: bt, rho, votes: best }
  }
  // Target-space direction of an image line with normal angle t: square lines in the target are square here only
  // up to the panel's slant, so the second line is looked for within 25° of square.
  const first = line(() => false)
  if (!first) return null
  const second = line((t) => {
    const dt = Math.abs(((t - first.t + NT) % NT) - NT / 2)
    return dt > (25 * NT) / 180
  })
  if (!second) return null
  // The long axis at least 1.5 mm of line (two edges vote per pixel along it), the short one 1 mm (a narrow or tight
  // group's short axis is short): and square to each other on the target (within 8°, through the panel's map).
  const mm = Math.min(ax, ay)
  if (first.votes < 2 * 1.5 * mm || second.votes < 2 * 1 * mm) return null
  const det2 = p.a * p.d - p.b * p.c
  // A line's direction on the photo (along it: (−sin θ, cos θ)) back to the target.
  const along = (t: number) => {
    const dx = -sinT[t]
    const dy = cosT[t]
    return { x: (p.d * dx - p.b * dy) / det2, y: (-p.c * dx + p.a * dy) / det2 }
  }
  const u1 = along(first.t)
  const u2 = along(second.t)
  const cos12 = Math.abs(u1.x * u2.x + u1.y * u2.y) / (Math.hypot(u1.x, u1.y) * Math.hypot(u2.x, u2.y))
  if (cos12 > Math.sin((8 * Math.PI) / 180)) return null
  // Where they cross: n1·q = ρ1, n2·q = ρ2.
  const a1 = cosT[first.t]
  const b1 = sinT[first.t]
  const a2 = cosT[second.t]
  const b2 = sinT[second.t]
  const det = a1 * b2 - a2 * b1
  const qx = (first.rho * b2 - second.rho * b1) / det
  const qy = (a1 * second.rho - a2 * first.rho) / det
  // Photo → target millimetres (with the panel's perspective); it has to be near the group too.
  const k = 1 / (1 + p.gx * qx + p.gy * qy)
  const out = { x: ((p.d * qx - p.b * qy) / det2) * k, y: ((-p.c * qx + p.a * qy) / det2) * k }
  return Math.hypot(out.x - near.x, out.y - near.y) <= withinMm ? out : null
}

/** A target point's offset from the panel's centre on the photo (px), with the panel's perspective. */
function panelOffset(p: SheetPanel, u: number, w: number): { x: number; y: number } {
  const qx = p.a * u + p.b * w
  const qy = p.c * u + p.d * w
  const k = 1 / (1 - p.gx * qx - p.gy * qy)
  return { x: qx * k, y: qy * k }
}

/** The strongest votes on a shot's circle (allowing for the score's ±0.125 mm), sampled every `step` radians. */
function circleVotes(v: Votes, p: SheetPanel, d: number, n: number, out: Float32Array) {
  for (let t = 0; t < n; t++) {
    const th = (t / n) * 2 * Math.PI
    const c = Math.cos(th)
    const s = Math.sin(th)
    let best = 0
    for (let k = -1; k <= 1; k++) {
      const r = d + k * 0.1
      const q = votesAt(v, p, r * c, r * s)
      if (q > best) best = q
    }
    out[t] = best
  }
}

/** A disc the picture may show: its centre (mm) and the votes there. */
interface Disc {
  x: number
  y: number
  votes: number
}

/** Local maxima of the votes around (x, y) within `radius` mm: the disc's own centre, to a few hundredths of a mm. */
function refineDisc(v: Votes, p: SheetPanel, x: number, y: number, radius: number): Disc {
  let bx = x
  let by = y
  let best = votesAt(v, p, x, y)
  // A coarse then fine search on a small grid.
  for (const step of [radius / 3, radius / 9, radius / 27]) {
    const cx = bx
    const cy = by
    for (let j = -3; j <= 3; j++) {
      for (let i = -3; i <= 3; i++) {
        const q = votesAt(v, p, cx + i * step, cy + j * step)
        if (q > best) {
          best = q
          bx = cx + i * step
          by = cy + j * step
        }
      }
    }
  }
  return { x: bx, y: by, votes: best }
}

/**
 * The assignment of rows to columns with the largest total `gain` (rows ≤ columns), by the Hungarian method on costs.
 * Returns each row's column.
 */
export function assignMax(gain: number[][]): number[] {
  const n = gain.length
  const m = gain[0]?.length ?? 0
  if (!n || m < n) return []
  let top = 0
  for (const row of gain) for (const g of row) top = Math.max(top, g)
  // Costs, 1-based with a dummy row and column 0 (the classic potentials form).
  const u = new Float64Array(n + 1)
  const vv = new Float64Array(m + 1)
  const way = new Int32Array(m + 1)
  const match = new Int32Array(m + 1)
  for (let i = 1; i <= n; i++) {
    match[0] = i
    let j0 = 0
    const minv = new Float64Array(m + 1).fill(Infinity)
    const used = new Uint8Array(m + 1)
    do {
      used[j0] = 1
      const i0 = match[j0]
      let delta = Infinity
      let j1 = 0
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue
        const cur = top - gain[i0 - 1][j - 1] - u[i0] - vv[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) {
          u[match[j]] += delta
          vv[j] -= delta
        } else minv[j] -= delta
      }
      j0 = j1
    } while (match[j0] !== 0)
    do {
      const j1 = way[j0]
      match[j0] = match[j1]
      j0 = j1
    } while (j0)
  }
  const out = new Array<number>(n).fill(-1)
  for (let j = 1; j <= m; j++) if (match[j]) out[match[j] - 1] = j - 1
  return out
}

/** A series placed on its picture. */
export interface PlacedShots {
  /** Each shot's centre (mm from the target's centre, x right, y up), in the values' order. */
  points: ShotPoint[]
  /** How clearly the picture showed every shot, 0–1. */
  confidence: number
  /** Each shot's votes (its disc's outline seen), for the confidence and for checking. */
  votes: number[]
  /** The group's centre as the picture draws it (where its axes cross), when they were found. */
  drawnCentre: ShotPoint | null
}

/** How much a millimetre between the shots' mean and the group's centre counts, against the votes of a typical disc. */
const CENTRE_WEIGHT = 3

/**
 * Each shot's place on a panel, from its decimal score: on the circle the score allows, where the picture shows a
 * pellet's disc. Shots of about the same score see each other's discs too: candidate discs are gathered from every
 * shot's circle, each refined to its own centre, and the shots are given the discs that together explain the picture
 * best (a disc can take a second shot, two shots in one hole, only at a cost). Which disc holds two shots is often a
 * toss-up for the outlines; the group's centre settles it: the picture draws it (its two axes cross there), or, when
 * those aren't found, `hint` gives it (the sheet's printed centre), and single shots move between the discs on their
 * circle while that brings the shots' mean to it at little cost in votes. Null when the panel can't be read: a shot
 * with no disc on its circle, or a miss (0.0) with no disc outside the rings.
 */
export function placeSheetShots(L: Plane, panel: SheetPanel, values: readonly number[], hint: ShotPoint | null = null): PlacedShots | null {
  if (!values.length) return null
  const dist = values.map(scoreDistanceMm)
  const misses = dist.filter((d) => d === null).length
  const dmax = Math.max(0, ...dist.map((d) => d ?? 0))
  const reach = misses ? Math.max(dmax, 30) : dmax
  const v = discVotes(L, panel, reach + 0.6)
  // Candidate discs: the strong local maxima on every shot's circle.
  const candidates: Disc[] = []
  const buf = new Float32Array(4096)
  for (const d of dist) {
    if (d === null) continue
    const n = Math.min(4096, Math.max(90, Math.round((2 * Math.PI * d * panel.pxPerMm) / 0.7)))
    circleVotes(v, panel, d, n, buf)
    let top = 0
    for (let t = 0; t < n; t++) top = Math.max(top, buf[t])
    if (!(top > 0)) continue
    const peaks: number[] = []
    for (let t = 0; t < n; t++) {
      const q = buf[t]
      if (q < 0.2 * top) continue
      if (q >= buf[(t - 1 + n) % n] && q > buf[(t + 1) % n]) peaks.push(t)
    }
    peaks.sort((a, b) => buf[b] - buf[a])
    for (const t of peaks.slice(0, 6)) {
      const th = (t / n) * 2 * Math.PI
      const disc = refineDisc(v, panel, d * Math.cos(th), d * Math.sin(th), 0.35)
      if (!candidates.some((c) => Math.hypot(c.x - disc.x, c.y - disc.y) < 0.3)) candidates.push(disc)
    }
  }
  // A miss's disc: the strongest votes outside the rings (ring 1 reaches 22.75 mm; a pellet touching it is in).
  if (misses) {
    for (let r = 25.1; r <= reach; r += 0.6) {
      const n = Math.max(90, Math.round((2 * Math.PI * r * panel.pxPerMm) / 1.5))
      for (let t = 0; t < n; t++) {
        const th = (t / n) * 2 * Math.PI
        const q = votesAt(v, panel, r * Math.cos(th), r * Math.sin(th))
        if (q <= 0) continue
        const disc = refineDisc(v, panel, r * Math.cos(th), r * Math.sin(th), 0.4)
        if (Math.hypot(disc.x, disc.y) < 25 || candidates.some((c) => Math.hypot(c.x - disc.x, c.y - disc.y) < 0.3)) continue
        candidates.push(disc)
      }
    }
  }
  if (!candidates.length) return null
  // A disc as the series shows one: the votes of its typical disc (an outline crossed by others or under a dark
  // cluster still gets a good share). Far fewer is no disc at all, just edges meeting by chance.
  const strongest = candidates.map((c) => c.votes).sort((a, b) => b - a)
  const typical = strongest[Math.min(strongest.length, values.length) >> 1]
  const discs = candidates.filter((c) => c.votes >= NOISE * typical)
  // What each shot gains from each disc: the votes on its own circle in the disc's direction (none for a disc off its
  // circle), and for a clear disc a bonus for taking it at all: every disc on the picture is some shot's, so one left
  // over counts against. A disc's second shot gains a fifth and no bonus, so two shots share a hole only when nothing
  // else fits (a disc on its own has a clean, whole outline and the most votes, so many votes are no sign of two).
  const raw: number[][] = dist.map((d) =>
    discs.map((c) => {
      if (d === null) return Math.hypot(c.x, c.y) >= 25 ? c.votes : 0
      const rho = Math.hypot(c.x, c.y)
      if (Math.abs(rho - d) >= 0.45) return 0
      const th = Math.atan2(c.y, c.x)
      let g = 0
      for (let k = -1; k <= 1; k++) g = Math.max(g, votesAt(v, panel, (d + k * 0.1) * Math.cos(th), (d + k * 0.1) * Math.sin(th)))
      return g
    }),
  )
  const first = raw.map((row) => row.map((g, j) => (g > 0 && discs[j].votes >= CLEAR * typical ? g + 0.5 * discs[j].votes : g)))
  // Each disc offers three places: whole, then a fifth and a tenth for a second and third shot in one hole (a pile of
  // shots puts two or three within a fraction of a millimetre, which the outlines show as one disc).
  const cols = assignMax(raw.map((row, i) => row.flatMap((g, j) => [first[i][j], 0.2 * g, 0.1 * g])))
  if (cols.length !== values.length || cols.some((c, i) => !(raw[i][Math.floor(c / 3)] > 0))) return null
  const assign = cols.map((c) => Math.floor(c / 3))

  // Where each shot is with a given disc: on its own circle in the disc's direction (a miss: the disc itself).
  const pos = (i: number, j: number): ShotPoint => {
    const d = dist[i]
    const c = discs[j]
    if (d === null) return { x: c.x, y: c.y }
    const th = Math.atan2(c.y, c.x)
    return { x: d * Math.cos(th), y: d * Math.sin(th) }
  }
  const meanOf = (a: number[]) => {
    let x = 0
    let y = 0
    a.forEach((j, i) => {
      const q = pos(i, j)
      x += q.x
      y += q.y
    })
    return { x: x / a.length, y: y / a.length }
  }
  // An assignment's votes, as the places above: on each disc the shot gaining most takes it whole, a second shot gains a
  // fifth, any more a tenth (the larger shares first).
  const score = (a: number[]) => {
    let total = 0
    const on = new Map<number, number[]>()
    a.forEach((j, i) => on.set(j, [...(on.get(j) ?? []), i]))
    for (const [j, shots] of on) {
      shots.sort((p, q) => first[q][j] - first[p][j])
      total += first[shots[0]][j]
      const rest = shots.slice(1).map((i) => raw[i][j]).sort((p, q) => q - p)
      rest.forEach((g, k) => (total += (k === 0 ? 0.2 : 0.1) * g))
    }
    return total / typical
  }
  const drawn = crossCentre(L, panel, dmax + 1, meanOf(assign))
  const centre = drawn ?? hint
  if (centre) {
    const objective = (a: number[]) => {
      const m = meanOf(a)
      return score(a) - CENTRE_WEIGHT * Math.hypot(m.x - centre.x, m.y - centre.y)
    }
    let current = objective(assign)
    for (let round = 0; round < 10; round++) {
      let bestGain = 1e-6
      let move: [number, number] | null = null
      for (let i = 0; i < assign.length; i++) {
        const was = assign[i]
        for (let j = 0; j < discs.length; j++) {
          if (j === was || !(raw[i][j] > 0)) continue
          assign[i] = j
          const o = objective(assign) - current
          if (o > bestGain) {
            bestGain = o
            move = [i, j]
          }
        }
        assign[i] = was
      }
      if (!move) break
      assign[move[0]] = move[1]
      current += bestGain
    }
  }
  // Which shot is first on each disc, and so which share.
  const firstOn = new Map<number, number>()
  assign.forEach((j, i) => {
    const k = firstOn.get(j)
    if (k === undefined || first[i][j] > first[k][j]) firstOn.set(j, i)
  })
  const points: ShotPoint[] = []
  const votes: number[] = []
  let confidence = 1
  for (let i = 0; i < values.length; i++) {
    const c = discs[assign[i]]
    const d = dist[i]
    // How sure this shot is: its disc as clearly seen as the series' typical one, and less so in a shared hole.
    const shared = firstOn.get(assign[i]) !== i
    if (d === null) {
      points.push({ x: c.x, y: c.y })
      votes.push(c.votes)
      confidence = Math.min(confidence, Math.min(1, c.votes / (0.6 * typical)) * (shared ? 0.6 : 1))
      continue
    }
    // The shot's direction, refined on its own circle near its disc.
    const th0 = Math.atan2(c.y, c.x)
    let best = -1
    let bestTh = th0
    const span = Math.min(0.5, 0.5 / Math.max(d, 0.5))
    for (let k = -20; k <= 20; k++) {
      const th = th0 + (k / 20) * span
      let q = 0
      for (let j = -1; j <= 1; j++) q = Math.max(q, votesAt(v, panel, (d + j * 0.1) * Math.cos(th), (d + j * 0.1) * Math.sin(th)))
      if (q > best) {
        best = q
        bestTh = th
      }
    }
    points.push({ x: d * Math.cos(bestTh), y: d * Math.sin(bestTh) })
    votes.push(best)
    confidence = Math.min(confidence, Math.min(1, best / (0.6 * typical)) * (shared ? 0.6 : 1))
  }
  return { points, confidence, votes, drawnCentre: drawn }
}
