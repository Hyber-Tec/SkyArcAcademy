/** The geometry of reading a target: points, the photo's perspective (a homography) and ellipses. */

export interface Vec {
  x: number
  y: number
}

/** A 3 × 3 matrix, row by row. */
export type Mat3 = [number, number, number, number, number, number, number, number, number]

/** Solves A·x = b by Gaussian elimination with partial pivoting; null when A is singular. A and b are changed. */
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r
    if (Math.abs(A[pivot][col]) < 1e-12) return null
    if (pivot !== col) {
      ;[A[pivot], A[col]] = [A[col], A[pivot]]
      ;[b[pivot], b[col]] = [b[col], b[pivot]]
    }
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / A[col][col]
      if (f === 0) continue
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c]
      b[r] -= f * b[col]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r]
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c]
    x[r] = s / A[r][r]
  }
  return x
}

/** Where a homography takes a point. */
export function applyH(H: Mat3, p: Vec): Vec {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

export function multiply3(A: Mat3, B: Mat3): Mat3 {
  const out = new Array<number>(9).fill(0) as Mat3
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]
  return out
}

export function invert3(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-15) return null
  const k = 1 / det
  return [A * k, -(b * i - c * h) * k, (b * f - c * e) * k, B * k, (a * i - c * g) * k, -(a * f - c * d) * k, C * k, -(a * h - b * g) * k, (a * e - b * d) * k]
}

/**
 * The homography taking each `from` point to its `to` point, by least squares over all of them (at least four, not
 * three on a line). Points are normalized first, as Hartley recommends, so pixel and millimetre scales don't matter.
 */
export function fitHomography(from: Vec[], to: Vec[]): Mat3 | null {
  const n = from.length
  if (n < 4 || to.length !== n) return null
  const norm = (pts: Vec[]): Mat3 => {
    let mx = 0
    let my = 0
    for (const p of pts) {
      mx += p.x
      my += p.y
    }
    mx /= pts.length
    my /= pts.length
    let d = 0
    for (const p of pts) d += Math.sqrt((p.x - mx) ** 2 + (p.y - my) ** 2)
    const s = d > 0 ? (Math.SQRT2 * pts.length) / d : 1
    return [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1]
  }
  const Tf = norm(from)
  const Tt = norm(to)
  const f = from.map((p) => applyH(Tf, p))
  const t = to.map((p) => applyH(Tt, p))
  // h33 = 1: eight unknowns, two equations per point; the normal equations of the least-squares problem.
  const AtA = Array.from({ length: 8 }, () => new Array<number>(8).fill(0))
  const Atb = new Array<number>(8).fill(0)
  const add = (row: number[], rhs: number) => {
    for (let r = 0; r < 8; r++) {
      if (row[r] === 0) continue
      Atb[r] += row[r] * rhs
      for (let c = 0; c < 8; c++) AtA[r][c] += row[r] * row[c]
    }
  }
  for (let k = 0; k < n; k++) {
    const { x, y } = f[k]
    const { x: u, y: v } = t[k]
    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u)
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v)
  }
  const h = solve(AtA, Atb)
  if (!h) return null
  const Hn: Mat3 = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1]
  const TtInv = invert3(Tt)
  if (!TtInv) return null
  const H = multiply3(TtInv, multiply3(Hn, Tf))
  const s = H[8]
  return Math.abs(s) > 1e-15 ? (H.map((v) => v / s) as Mat3) : H
}

/** An affine map (a homography whose last row is 0 0 1) fitted by least squares; at least three points. */
export function fitAffine(from: Vec[], to: Vec[]): Mat3 | null {
  const n = from.length
  if (n < 3 || to.length !== n) return null
  const AtA = Array.from({ length: 3 }, () => new Array<number>(3).fill(0))
  const bx = [0, 0, 0]
  const by = [0, 0, 0]
  for (let k = 0; k < n; k++) {
    const row = [from[k].x, from[k].y, 1]
    for (let r = 0; r < 3; r++) {
      bx[r] += row[r] * to[k].x
      by[r] += row[r] * to[k].y
      for (let c = 0; c < 3; c++) AtA[r][c] += row[r] * row[c]
    }
  }
  const px = solve(AtA.map((r) => r.slice()), bx)
  const py = solve(AtA.map((r) => r.slice()), by)
  if (!px || !py) return null
  return [px[0], px[1], px[2], py[0], py[1], py[2], 0, 0, 1]
}

/** How a homography stretches the plane at a point: image units per unit along x and along y. */
export function jacobianH(H: Mat3, p: Vec): [number, number, number, number] {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  const u = (H[0] * p.x + H[1] * p.y + H[2]) / w
  const v = (H[3] * p.x + H[4] * p.y + H[5]) / w
  return [(H[0] - u * H[6]) / w, (H[1] - u * H[7]) / w, (H[3] - v * H[6]) / w, (H[4] - v * H[7]) / w]
}

/** An ellipse: centre, semi-axes (a ≥ b) and the direction of the long one (radians). */
export interface Ellipse {
  cx: number
  cy: number
  a: number
  b: number
  angle: number
}

/** The ellipse of a conic A x² + B xy + C y² + D x + E y + F = 0, or null when it isn't one. */
function conicToEllipse(A: number, B: number, C: number, D: number, E: number, F: number): Ellipse | null {
  const det = 4 * A * C - B * B
  if (!(det > 0)) return null
  const cx = (B * E - 2 * C * D) / det
  const cy = (B * D - 2 * A * E) / det
  const F0 = A * cx * cx + B * cx * cy + C * cy * cy + D * cx + E * cy + F
  const tr = A + C
  const diff = Math.sqrt((A - C) * (A - C) + B * B)
  const l1 = (tr - diff) / 2
  const l2 = (tr + diff) / 2
  if (!(l1 * F0 < 0 && l2 * F0 < 0)) return null
  const a = Math.sqrt(-F0 / l1)
  const b = Math.sqrt(-F0 / l2)
  // The long axis lies along the eigenvector of the smaller eigenvalue.
  let angle = Math.abs(B) < 1e-12 ? (A <= C ? 0 : Math.PI / 2) : Math.atan2(l1 - A, B / 2)
  // An axis has no direction: keep it within a half turn.
  if (angle > Math.PI / 2) angle -= Math.PI
  else if (angle <= -Math.PI / 2) angle += Math.PI
  return { cx, cy, a, b, angle }
}

/**
 * The ellipse through points, by least squares on the conic A x² + B xy + C y² + D x + E y = 1, with the points first
 * moved to `around` and scaled (a stable fit when `around` is near the centre, as it is for a bull's edge).
 */
export function fitEllipse(xs: ArrayLike<number>, ys: ArrayLike<number>, around: Vec, scale: number, weights?: ArrayLike<number>): Ellipse | null {
  const n = xs.length
  if (n < 6) return null
  const M = Array.from({ length: 5 }, () => new Array<number>(5).fill(0))
  const r = [0, 0, 0, 0, 0]
  for (let k = 0; k < n; k++) {
    const w = weights ? weights[k] : 1
    if (!(w > 0)) continue
    const x = (xs[k] - around.x) / scale
    const y = (ys[k] - around.y) / scale
    const row = [x * x, x * y, y * y, x, y]
    for (let i = 0; i < 5; i++) {
      r[i] += w * row[i]
      for (let j = 0; j < 5; j++) M[i][j] += w * row[i] * row[j]
    }
  }
  const p = solve(M, r)
  if (!p) return null
  const e = conicToEllipse(p[0], p[1], p[2], p[3], p[4], -1)
  if (!e) return null
  return { cx: around.x + e.cx * scale, cy: around.y + e.cy * scale, a: e.a * scale, b: e.b * scale, angle: e.angle }
}

/** How far a point is outside (+) or inside (−) an ellipse, roughly in pixels along its radius. */
export function ellipseOffset(e: Ellipse, x: number, y: number): number {
  const c = Math.cos(e.angle)
  const s = Math.sin(e.angle)
  const dx = x - e.cx
  const dy = y - e.cy
  const u = (dx * c + dy * s) / e.a
  const v = (-dx * s + dy * c) / e.b
  const rho = Math.sqrt(u * u + v * v)
  return (rho - 1) * Math.sqrt(dx * dx + dy * dy) / Math.max(rho, 1e-9)
}
