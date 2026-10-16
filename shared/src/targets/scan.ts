import { BULL_RADIUS_MM, type BullKind, CARD_BULLS, CARD_COLS, CARD_ROWS, STEP_MM, bullCentreMm } from './card'
import { type Ellipse, type Mat3, type Vec, applyH, ellipseOffset, fitEllipse, fitHomography, jacobianH } from './geometry'
import { type HoleMark, findHoles } from './holes'
import { type Plane, type RgbaImage, blobs, downscaleLuma, medianOf, otsu, sampleRgb, samplePlane } from './image'
import { scoreAt } from './score'

/**
 * Reads a photo of the academy's paper card (card.ts): finds its twelve bulls, works out which is which from the grid
 * and the header, measures each bull's black edge to know its centre and scale in millimetres (and the photo's tilt),
 * then finds the pellet holes in each record bull and scores them by ISSF's rule. What it finds is a suggestion: the
 * phone app shows it over the photo and a person confirms or corrects every bull before anything is saved.
 */

export interface ScanOptions {
  /** Shots fired at each record bull: usually 1; 'auto' counts them from the card. */
  shotsPerBull?: number | 'auto'
}

export interface ScannedShot {
  /** Millimetres from the bull's centre, x right and y up (as shooting/target.ts). */
  x: number
  y: number
  /** Whole score (the hole touching a ring counts it) and the electronic decimal for the same point. */
  value: number
  decimal: number
  /** How sure the scan is that this is a pellet hole, 0 to 1 (1 for one a person placed). */
  confidence: number
}

export interface ScannedBull {
  kind: BullKind
  /** 1–10 for record bulls, 1–2 for sighters. */
  n: number
  col: number
  row: number
  /** Whether the bull could be measured (not covered, cut off or out of focus). */
  found: boolean
  /** Its centre in the photo, in pixels. */
  center: Vec
  /**
   * Photo pixels per millimetre along the card's x (right) and y (down) at this bull: a point (X, Y) mm from its
   * centre is at center + X·(ax, ay) + Y·(bx, by).
   */
  axes: [ax: number, ay: number, bx: number, by: number]
  /** The shots found, best first, at most the expected number (sighters: none are looked for). */
  shots: ScannedShot[]
  /** Further marks that looked like holes, for a person to check. */
  extra: ScannedShot[]
}

export interface CardScan {
  /** False when no card was found: `reason` says why, in words for the person holding the phone. */
  ok: boolean
  reason: string | null
  bulls: ScannedBull[]
  shotsPerBull: number
  /** Card millimetres (from the top-left bull's centre, x right, y down) to photo pixels. */
  cardToImage: Mat3 | null
}

const COARSE_SIDE = 640

const failed = (reason: string): CardScan => ({ ok: false, reason, bulls: [], shotsPerBull: 1, cardToImage: null })

export function scanCard(img: RgbaImage, opts: ScanOptions = {}): CardScan {
  const coarseF = Math.max(1, Math.round(Math.max(img.width, img.height) / COARSE_SIDE))
  const coarse = downscaleLuma(img, coarseF)
  const discs = findDiscs(coarse, coarseF)
  if (discs.length < 4) return failed('No target found. Lay the card flat, fill the photo with it and keep it sharp.')

  const lattice = fitLattice(discs, coarse, coarseF)
  if (!lattice) return failed('The card’s bulls didn’t line up. Take the photo from straight above, with the whole card in it.')

  // Each bull: measured from its black edge where it was seen, placed by the grid where it wasn't.
  const refined = CARD_BULLS.map((cb) => {
    const at = lattice.found.get(`${cb.col},${cb.row}`)
    const guess = at ?? applyH(lattice.H, { x: cb.col, y: cb.row })
    const radius = at?.r ?? lattice.radius
    const ellipse: Ellipse | null = refineBull(img, guess, radius)
    return { cb, ellipse, guess }
  })
  // A bull half under a sticky note, or cut by the photo's edge, measures out of shape against the others: unseen.
  const sizes = refined.filter((r) => r.ellipse).map((r) => r.ellipse!)
  if (sizes.length >= 4) {
    const a = medianOf(sizes.map((e) => e.a))
    const b = medianOf(sizes.map((e) => e.b))
    for (const r of refined) {
      const e = r.ellipse
      if (e && (Math.abs(e.a / a - 1) > 0.12 || Math.abs(e.b / b - 1) > 0.12)) r.ellipse = null
    }
  }
  const measured = refined.filter((r) => r.ellipse)
  if (measured.length < 4) return failed('The bulls couldn’t be measured. Take the photo in even light, without glare or shadows.')

  // Card millimetres → photo pixels, from the measured bull centres.
  const cardToImage = fitHomography(
    measured.map((r) => bullCentreMm(r.cb)),
    measured.map((r) => ({ x: r.ellipse!.cx, y: r.ellipse!.cy })),
  )
  if (!cardToImage) return failed('The card’s bulls didn’t line up. Take the photo from straight above, with the whole card in it.')

  const bulls: ScannedBull[] = []
  const reads: (HoleMark[] | null)[] = []
  for (const r of refined) {
    const mm = bullCentreMm(r.cb)
    const J = jacobianH(cardToImage, mm)
    const axes = r.ellipse ? bullAxes(r.ellipse, J) : ([J[0], J[2], J[1], J[3]] as ScannedBull['axes'])
    const center = r.ellipse ? { x: r.ellipse.cx, y: r.ellipse.cy } : applyH(cardToImage, mm)
    const found = !!r.ellipse && insidePhoto(img, center, axes)
    bulls.push({ kind: r.cb.kind, n: r.cb.n, col: r.cb.col, row: r.cb.row, found, center, axes, shots: [], extra: [] })
    reads.push(found && r.cb.kind === 'record' ? findHoles(img, center, axes) : null)
  }

  const shotsPerBull = opts.shotsPerBull === undefined || opts.shotsPerBull === 'auto' ? countShotsPerBull(reads) : Math.max(1, Math.round(opts.shotsPerBull))
  bulls.forEach((b, i) => {
    const read = reads[i]
    if (!read) return
    const { shots, extra } = pickShots(read, shotsPerBull)
    b.shots = shots
    b.extra = extra
  })
  return { ok: true, reason: null, bulls, shotsPerBull, cardToImage }
}

// ---------------------------------------------------------------------------------------------------------------
// The bulls: dark discs of one size.

interface Disc extends Vec {
  /** Radius in photo pixels (the geometric mean of the disc's semi-axes). */
  r: number
  area: number
}

function findDiscs(lum: Plane, f: number): Disc[] {
  const t = otsu(lum.data)
  const mask = new Uint8Array(lum.width * lum.height)
  for (let i = 0; i < mask.length; i++) mask[i] = lum.data[i] < t ? 1 : 0
  const candidates: Disc[] = []
  for (const b of blobs(mask, lum.width, lum.height, lum.width * lum.height * 0.0003)) {
    if (b.touchesEdge) continue
    const tr = b.mxx + b.myy
    const det = b.mxx * b.myy - b.mxy * b.mxy
    const root = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
    const l1 = tr / 2 + root
    const l2 = tr / 2 - root
    if (!(l2 > 0)) continue
    const a = 2 * Math.sqrt(l1)
    const c = 2 * Math.sqrt(l2)
    const fill = b.area / (Math.PI * a * c)
    const boxFill = b.area / ((b.maxX - b.minX + 1) * (b.maxY - b.minY + 1))
    if (c / a < 0.45 || fill < 0.78 || fill > 1.15 || boxFill < 0.55) continue
    candidates.push({ x: (b.cx + 0.5) * f - 0.5, y: (b.cy + 0.5) * f - 0.5, r: Math.sqrt(a * c) * f, area: b.area * f * f })
  }
  // The bulls are the biggest set of discs of about the same size.
  let best: Disc[] = []
  for (const ref of candidates) {
    const group = candidates.filter((d) => d.area >= ref.area / 1.8 && d.area <= ref.area * 1.8)
    if (group.length > best.length || (group.length === best.length && ref.area > (best[0]?.area ?? 0))) best = group
  }
  return best
}

// ---------------------------------------------------------------------------------------------------------------
// The grid: which disc is which bull.

interface Lattice {
  /** Card grid (column, row) → photo pixels. */
  H: Mat3
  /** The discs seen, by "col,row". */
  found: Map<string, Disc>
  /** A typical bull radius in pixels. */
  radius: number
}

function fitLattice(discs: Disc[], lum: Plane, f: number): Lattice | null {
  const n = discs.length
  // The grid's two directions: the commonest directions between nearest neighbours.
  const vectors: Vec[] = []
  for (let i = 0; i < n; i++) {
    const near = discs
      .map((d, j) => ({ j, d2: (d.x - discs[i].x) ** 2 + (d.y - discs[i].y) ** 2 }))
      .filter((o) => o.j !== i)
      .sort((p, q) => p.d2 - q.d2)
      .slice(0, 4)
    for (const o of near) vectors.push({ x: discs[o.j].x - discs[i].x, y: discs[o.j].y - discs[i].y })
  }
  const hist = new Float64Array(180)
  for (const v of vectors) {
    const deg = ((Math.atan2(v.y, v.x) * 180) / Math.PI + 360) % 180
    for (let k = -3; k <= 3; k++) hist[(Math.round(deg) + k + 180) % 180] += 1 - Math.abs(k) / 4
  }
  const peak = (skipAround: number | null) => {
    let best = -1
    let at = 0
    for (let d = 0; d < 180; d++) {
      if (skipAround !== null) {
        const gap = Math.min(Math.abs(d - skipAround), 180 - Math.abs(d - skipAround))
        if (gap < 35) continue
      }
      if (hist[d] > best) {
        best = hist[d]
        at = d
      }
    }
    return at
  }
  const a1 = peak(null)
  const a2 = peak(a1)
  const stepAlong = (deg: number): Vec | null => {
    const dir = { x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) }
    const along = vectors
      .map((v) => {
        const s = v.x * dir.x + v.y * dir.y
        const off = Math.abs(v.x * dir.y - v.y * dir.x)
        return { v: s >= 0 ? v : { x: -v.x, y: -v.y }, len: Math.abs(s), off }
      })
      .filter((o) => o.off < o.len * 0.25)
    if (!along.length) return null
    const shortest = medianOf(along.map((o) => o.len).sort((p, q) => p - q).slice(0, Math.max(1, Math.ceil(along.length / 3))))
    const steps = along.filter((o) => o.len < shortest * 1.35)
    return { x: medianOf(steps.map((o) => o.v.x)), y: medianOf(steps.map((o) => o.v.y)) }
  }
  const u = stepAlong(a1)
  let v = stepAlong(a2)
  if (!u || !v) return null
  if (u.x * v.y - u.y * v.x < 0) v = { x: -v.x, y: -v.y }

  // Grid coordinates of each disc, refined with a homography so perspective doesn't push far bulls off by one.
  const origin = discs.reduce((best, d) => {
    const mx = discs.reduce((s, e) => s + e.x, 0) / n
    const my = discs.reduce((s, e) => s + e.y, 0) / n
    return (d.x - mx) ** 2 + (d.y - my) ** 2 < (best.x - mx) ** 2 + (best.y - my) ** 2 ? d : best
  }, discs[0])
  const det = u.x * v.y - u.y * v.x
  let coords = discs.map((d) => {
    const dx = d.x - origin.x
    const dy = d.y - origin.y
    return { i: (dx * v.y - dy * v.x) / det, j: (u.x * dy - u.y * dx) / det }
  })
  let H: Mat3 | null = null
  for (let round = 0; round < 3; round++) {
    const keep = coords.map((c) => Math.abs(c.i - Math.round(c.i)) < 0.3 && Math.abs(c.j - Math.round(c.j)) < 0.3)
    const from = coords.filter((_, k) => keep[k]).map((c) => ({ x: Math.round(c.i), y: Math.round(c.j) }))
    const to = discs.filter((_, k) => keep[k])
    if (from.length < 4) return null
    H = fitHomography(from, to)
    if (!H) return null
    const inv = invertSafe(H)
    if (!inv) return null
    coords = discs.map((d) => {
      const p = applyH(inv, d)
      return { i: p.x, j: p.y }
    })
  }
  const cells = coords.map((c) => ({ i: Math.round(c.i), j: Math.round(c.j), ok: Math.abs(c.i - Math.round(c.i)) < 0.3 && Math.abs(c.j - Math.round(c.j)) < 0.3 }))
  const used = cells.filter((c) => c.ok)
  if (used.length < 4) return null
  const minI = Math.min(...used.map((c) => c.i))
  const minJ = Math.min(...used.map((c) => c.j))
  const spanI = Math.max(...used.map((c) => c.i)) - minI + 1
  const spanJ = Math.max(...used.map((c) => c.j)) - minJ + 1

  // Which way up the card is: rows run along v (an upright or upside-down card) or along u (a card turned sideways).
  // Of the two ways that keep the card unmirrored, the header (barcode, logo, name line) decides.
  type Orientation = (i: number, j: number) => Vec
  let ways: Orientation[]
  if (spanI <= CARD_COLS && spanJ <= CARD_ROWS && !(spanI === CARD_ROWS && spanJ < CARD_ROWS)) {
    ways = [(i, j) => ({ x: i - minI, y: j - minJ }), (i, j) => ({ x: CARD_COLS - 1 - (i - minI), y: CARD_ROWS - 1 - (j - minJ) })]
  } else if (spanI <= CARD_ROWS && spanJ <= CARD_COLS) {
    ways = [(i, j) => ({ x: CARD_COLS - 1 - (j - minJ), y: i - minI }), (i, j) => ({ x: j - minJ, y: CARD_ROWS - 1 - (i - minI) })]
  } else return null

  let best: { found: Map<string, Disc>; H: Mat3; score: number } | null = null
  for (const way of ways) {
    const found = new Map<string, Disc>()
    const from: Vec[] = []
    const to: Vec[] = []
    cells.forEach((c, k) => {
      if (!c.ok) return
      const cell = way(c.i, c.j)
      if (cell.x < 0 || cell.y < 0 || cell.x >= CARD_COLS || cell.y >= CARD_ROWS) return
      found.set(`${cell.x},${cell.y}`, discs[k])
      from.push(cell)
      to.push(discs[k])
    })
    const Hw = fitHomography(from, to)
    if (!Hw || from.length < 4) continue
    const score = headerEvidence(lum, f, Hw)
    if (!best || score > best.score) best = { found, H: Hw, score }
  }
  if (!best) return null
  return { H: best.H, found: best.found, radius: medianOf(discs.map((d) => d.r)) }
}

function invertSafe(H: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = H
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-15) return null
  const k = 1 / det
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k]
}

/**
 * How much the band above the card's first row looks like its header: printed edges (barcode bars, letters) in the
 * strip between the top edge and the first bulls, against the same strip past the last row. Positive: this way up.
 */
function headerEvidence(lum: Plane, f: number, H: Mat3): number {
  const edges = (rowFrom: number, rowTo: number) => {
    let count = 0
    let total = 0
    for (let a = 0; a <= 40; a++) {
      const col = -0.35 + (a / 40) * (CARD_COLS - 1 + 0.7)
      for (let b = 0; b <= 8; b++) {
        const row = rowFrom + (b / 8) * (rowTo - rowFrom)
        const p = applyH(H, { x: col, y: row })
        const x = (p.x + 0.5) / f - 0.5
        const y = (p.y + 0.5) / f - 0.5
        if (x < 1 || y < 1 || x > lum.width - 2 || y > lum.height - 2) continue
        total++
        const gx = samplePlane(lum, x + 1, y) - samplePlane(lum, x - 1, y)
        const gy = samplePlane(lum, x, y + 1) - samplePlane(lum, x, y - 1)
        if (gx * gx + gy * gy > 30 * 30) count++
      }
    }
    return total ? count / total : 0
  }
  return edges(-0.82, -0.58) - edges(CARD_ROWS - 1 + 0.58, CARD_ROWS - 1 + 0.82)
}

// ---------------------------------------------------------------------------------------------------------------
// One bull's black edge, measured at full resolution: an ellipse, as the circle looks in a photo taken at a slant.

const RAYS = 120

function refineBull(img: RgbaImage, guess: Vec, radius: number): Ellipse | null {
  const rgb = new Float32Array(3)
  const luma = (x: number, y: number) => (sampleRgb(img, x, y, rgb) ? 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] : -1)
  const t0 = 0.55 * radius
  const t1 = 1.5 * radius
  const dt = Math.max(0.5, radius / 120)
  const steps = Math.floor((t1 - t0) / dt) + 1
  const profiles = new Float32Array(RAYS * steps)
  const inner: number[] = []
  const outer: number[] = []
  for (let k = 0; k < RAYS; k++) {
    const phi = (2 * Math.PI * k) / RAYS
    const c = Math.cos(phi)
    const s = Math.sin(phi)
    for (let q = 0; q < steps; q++) {
      const t = t0 + q * dt
      const v = luma(guess.x + c * t, guess.y + s * t)
      profiles[k * steps + q] = v
      if (v < 0) continue
      if (t < 0.75 * radius) inner.push(v)
      else if (t > 1.3 * radius) outer.push(v)
    }
  }
  if (inner.length < RAYS || outer.length < RAYS) return null
  const black = medianOf(inner)
  const paper = medianOf(outer)
  if (paper - black < 25) return null
  const mid = (black + paper) / 2
  const run = Math.max(2, Math.round((0.1 * radius) / dt))
  const xs: number[] = []
  const ys: number[] = []
  for (let k = 0; k < RAYS; k++) {
    const phi = (2 * Math.PI * k) / RAYS
    let bestT = -1
    let bestGap = Infinity
    for (let q = run; q < steps - run; q++) {
      const a = profiles[k * steps + q - 1]
      const b = profiles[k * steps + q]
      if (a < 0 || b < 0 || !(a < mid && b >= mid)) continue
      // Black before, paper after: the bull's edge, not a hole's.
      let ok = true
      for (let z = 1; z <= run && ok; z++) {
        if (profiles[k * steps + q - z] >= mid) ok = false
        if (profiles[k * steps + q + z - 1] < mid) ok = false
      }
      if (!ok) continue
      const t = t0 + (q - 1 + (mid - a) / (b - a)) * dt
      const gap = Math.abs(t - radius)
      if (gap < bestGap) {
        bestGap = gap
        bestT = t
      }
    }
    if (bestT > 0) {
      xs.push(guess.x + Math.cos(phi) * bestT)
      ys.push(guess.y + Math.sin(phi) * bestT)
    }
  }
  if (xs.length < RAYS * 0.4) return null
  let e = fitEllipse(xs, ys, guess, radius)
  const weights = new Float64Array(xs.length).fill(1)
  for (let round = 0; round < 4 && e; round++) {
    const off = xs.map((x, k) => Math.abs(ellipseOffset(e!, x, ys[k])))
    const mad = medianOf(off.slice())
    const limit = Math.max(1, 3 * 1.4826 * mad)
    let kept = 0
    for (let k = 0; k < xs.length; k++) {
      weights[k] = off[k] <= limit ? 1 : 0
      kept += weights[k]
    }
    if (kept < RAYS * 0.4) return null
    e = fitEllipse(xs, ys, { x: e.cx, y: e.cy }, radius, weights)
  }
  if (!e) return null
  const size = Math.sqrt(e.a * e.b)
  if (e.b / e.a < 0.5 || size < 0.6 * radius || size > 1.5 * radius) return null
  if (Math.hypot(e.cx - guess.x, e.cy - guess.y) > 0.5 * radius) return null
  return e
}

/**
 * The bull's millimetre axes in the photo: the measured ellipse is the 15.25 mm black circle seen at a slant; its turn
 * on the card comes from the grid (J: photo pixels per card millimetre, from the homography).
 */
function bullAxes(e: Ellipse, J: [number, number, number, number]): ScannedBull['axes'] {
  const c = Math.cos(e.angle)
  const s = Math.sin(e.angle)
  const ka = e.a / BULL_RADIUS_MM
  const kb = e.b / BULL_RADIUS_MM
  // The card's x direction in the photo, taken back through the ellipse's stretch: its angle on the unit circle.
  const ex = { x: J[0], y: J[2] }
  const wx = (c * ex.x + s * ex.y) / ka
  const wy = (-s * ex.x + c * ex.y) / kb
  const q = Math.atan2(wy, wx)
  const cq = Math.cos(q)
  const sq = Math.sin(q)
  // A = R(angle) · diag(ka, kb) · R(q)
  const m00 = ka * cq
  const m01 = -ka * sq
  const m10 = kb * sq
  const m11 = kb * cq
  return [c * m00 - s * m10, s * m00 + c * m10, c * m01 - s * m11, s * m01 + c * m11]
}

function insidePhoto(img: RgbaImage, c: Vec, axes: ScannedBull['axes']): boolean {
  const r = BULL_RADIUS_MM
  for (const [x, y] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
    const px = c.x + x * axes[0] + y * axes[2]
    const py = c.y + x * axes[1] + y * axes[3]
    if (px < 0 || py < 0 || px > img.width - 1 || py > img.height - 1) return false
  }
  return true
}

/** Above this a mark is surely a hole; between the two, maybe. */
const STRONG = 1.5
const WEAK = 0.3

function countShotsPerBull(reads: (HoleMark[] | null)[]): number {
  const counts = reads.filter((r): r is HoleMark[] => !!r).map((r) => r.filter((c) => c.strength >= STRONG && holeLike(c)).length)
  if (!counts.length) return 1
  const twoOrMore = counts.filter((c) => c >= 2).length
  return twoOrMore >= Math.max(3, counts.length * 0.5) ? 2 : 1
}

function toShot(xDown: number, yDown: number, strength: number, confidence?: number): ScannedShot {
  const x = Math.round(xDown * 100) / 100
  const y = Math.round(-yDown * 100) / 100
  const { value, decimal } = scoreAt(Math.sqrt(x * x + y * y))
  return { x, y, value, decimal, confidence: confidence ?? Math.max(0, Math.min(1, (strength - WEAK) / (STRONG - WEAK))) }
}

/** A hole looks round and stands alone; printed numbers, pen strokes and paper edges look thin or run on. */
const holeLike = (m: HoleMark) => m.l2 >= 0.45 && (m.contained >= 0.75 || (m.bounded >= 0.85 && m.l1 >= 2.5))

function pickShots(read: HoleMark[], expected: number): { shots: ScannedShot[]; extra: ScannedShot[] } {
  const marks = read.filter((c) => c.strength >= WEAK && holeLike(c))
  const shots: ScannedShot[] = []
  const used = new Set<HoleMark>()
  for (const c of marks) {
    if (shots.length >= expected) break
    used.add(c)
    // Two holes that touch read as one long mark: when a shot is still missing, it's split along its length.
    const missing = expected - shots.length
    const others = marks.filter((m) => !used.has(m) && m.strength >= STRONG).length
    if (missing >= 2 && others < missing && c.l1 > 1.6 * c.l2 && c.l1 - c.l2 > 0.8) {
      const half = Math.sqrt(c.l1 - c.l2)
      shots.push(toShot(c.x + c.dir.x * half, c.y + c.dir.y * half, c.strength))
      shots.push(toShot(c.x - c.dir.x * half, c.y - c.dir.y * half, c.strength))
      continue
    }
    shots.push(toShot(c.x, c.y, c.strength))
  }
  // A mark overlapping a counted hole (closer than a pellet across) is its torn edge, not another shot.
  const apart = (m: HoleMark) => shots.every((s) => (s.x - m.x) ** 2 + (-s.y - m.y) ** 2 > 4 * 4)
  const extra = marks.filter((m) => !used.has(m) && m.strength >= STRONG && apart(m)).map((m) => toShot(m.x, m.y, m.strength))
  return { shots, extra }
}

/** The card's step between bulls, in case a caller needs the grid in millimetres. */
export const GRID_STEP_MM = STEP_MM
