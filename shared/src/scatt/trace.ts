/**
 * SCATT's own arithmetic, rebuilt from its program (the fourth meeting's R2): how it smooths the sensor's samples into
 * the trace it draws, scores a shot from where the aim was when it went off, and works out the numbers it shows under
 * a shot (aiming time, the aim's speed in its last second, time in the 10, steadiness). Checked against SCATT's own
 * screen on the academy's session file: every shot's numbers matched. Coordinates here are SCATT's: millimetres on the
 * target, x right and y DOWN; `shared/src/scatt/session.ts` turns them the app's way up.
 */

/** A raw sample: x, y (mm), the rifle's tilt (degrees, NaN when not recorded) and its weight flag (-1 when none). */
export type RawPoint = [x: number, y: number, angle: number, w: number]
export type Point = [x: number, y: number]

/** A target face: ring diameters from ring 1 to ring 10 (mm), the black's diameter, and the card's box. */
export interface ScattTarget {
  name: string
  rings: number[]
  black: number
  world: [x: number, y: number, w: number, h: number]
}

/** The targets SCATT names by its id: the 10 m air rifle target (ISSF rings), the one the academy shoots. */
export const SCATT_TARGETS: Record<string, ScattTarget> = {
  '{26044802-5B13-48d6-A5F8-BE777C9BED82}': {
    name: '10m Air Rifle Target',
    rings: [45.5, 40.5, 35.5, 30.5, 25.5, 20.5, 15.5, 10.5, 5.5, 0.5],
    black: 30.5,
    world: [-40, -40, 80, 80],
  },
}

/** SCATT's arrows, by its direction number: 0 the centre, then clockwise from up. */
export const SCATT_ARROWS = ['centre', 'up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'] as const

// ------------------------------------------------------------------ smoothing

/** SCATT's resampler: a quadratic through the last three samples, read at the output rate. */
class Resampler {
  private n = 0
  private t = 0
  private count = 0
  private buf = [0, 0, 0]
  private readonly dtOut: number
  private readonly dtIn: number
  constructor(dtOut: number, dtIn: number) {
    this.dtOut = dtOut
    this.dtIn = dtIn
  }

  push(v: number): number[] {
    const out: number[] = []
    if (this.count === 3) this.buf = [this.buf[1], this.buf[2], v]
    else {
      this.buf[this.count] = v
      this.count += 1
      if (this.count < 3) return out
    }
    const n = this.n
    const dt = this.dtIn
    const tEnd = (n + 2) * dt
    const [y0, y1, y2] = this.buf
    while (this.t <= tEnd) {
      let u = (this.t - n * dt) / (dt + dt)
      u = u + u
      out.push(u * (y1 + y1 + y0 * -1.5 - y2 * 0.5) + (y0 * 0.5 - y1 + y2 * 0.5) * u * u + y0)
      this.t += this.dtOut
    }
    this.n = n + 1
    return out
  }
}

/** A Chebyshev filter's coefficients (the textbook recursive design SCATT uses): cutoff as a share of the rate. */
function chebCoeffs(fc: number, lh: number, pr: number, np: number): [number[], number[]] {
  const a = new Array<number>(23).fill(0)
  const b = new Array<number>(23).fill(0)
  a[2] = 1
  b[2] = 1
  for (let p = 1; p <= Math.floor(np / 2); p++) {
    const ang = ((p - 1) * Math.PI) / np + Math.PI / (np + np)
    let rp = -Math.cos(ang)
    let ip = Math.sin(ang)
    if (pr !== 0) {
      const es = Math.sqrt((100 / (100 - pr)) ** 2 - 1)
      const vx = (1 / np) * Math.log(1 / es + Math.sqrt(1 / (es * es) + 1))
      let kx = (1 / np) * Math.log(1 / es + Math.sqrt(1 / (es * es) - 1))
      kx = (Math.exp(kx) + Math.exp(-kx)) * 0.5
      rp = (rp * (Math.exp(vx) - Math.exp(-vx)) * 0.5) / kx
      ip = (ip * (Math.exp(vx) + Math.exp(-vx)) * 0.5) / kx
    }
    const t = 2 * Math.tan(0.5)
    const w = 2 * Math.PI * fc
    const m = rp * rp + ip * ip
    let d = 4 - 4 * rp * t + m * t * t
    const x0 = (t * t) / d
    const x1 = (2 * t * t) / d
    const x2 = (t * t) / d
    const y1 = (8 - 2 * m * t * t) / d
    const y2 = (-4 - 4 * rp * t - m * t * t) / d
    const k = lh === 1 ? -Math.cos(w / 2 + 0.5) / Math.cos(w / 2 - 0.5) : Math.sin(0.5 - w / 2) / Math.sin(0.5 + w / 2)
    d = 1 + y1 * k - y2 * k * k
    const a0 = (x0 - x1 * k + x2 * k * k) / d
    let a1 = (-2 * x0 * k + x1 + x1 * k * k - 2 * x2 * k) / d
    const a2 = (x0 * k * k - x1 * k + x2) / d
    let b1 = (2 * k + y1 + y1 * k * k - 2 * y2 * k) / d
    const b2 = (-(k * k) - y1 * k + y2) / d
    if (lh === 1) {
      a1 = -a1
      b1 = -b1
    }
    const ta = a.slice()
    const tb = b.slice()
    for (let i = 2; i < 23; i++) {
      a[i] = a0 * ta[i] + a1 * ta[i - 1] + a2 * ta[i - 2]
      b[i] = tb[i] - b1 * tb[i - 1] - b2 * tb[i - 2]
    }
  }
  b[2] = 0
  for (let i = 0; i < 21; i++) {
    a[i] = a[i + 2]
    b[i] = -b[i + 2]
  }
  let sa = 0
  let sb = 0
  for (let i = 0; i < 21; i++) {
    const s = lh === 0 ? 1 : (-1) ** i
    sa += a[i] * s
    sb += b[i] * s
  }
  const gain = sa / (1 - sb)
  for (let i = 0; i < 21; i++) a[i] /= gain
  return [a, b]
}

/** A 2-pole low-pass Chebyshev filter (0.5% ripple), started on its first sample. */
class ChebFilter {
  private readonly a: number[]
  private readonly b: number[]
  private readonly bypass: boolean
  private primed = false
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0
  constructor(fc: number, pr = 0.5, lh = 0, np = 2) {
    this.bypass = fc === 0.5
    ;[this.a, this.b] = chebCoeffs(fc, lh, pr, np)
  }

  process(v: number): number {
    if (this.bypass) return v
    if (!this.primed) {
      this.x1 = this.x2 = this.y1 = this.y2 = v
      this.primed = true
      return v
    }
    const { a, b } = this
    const out = a[1] * this.x1 + a[0] * v + this.x2 * a[2] + b[1] * this.y1 + this.y2 * b[2]
    this.x2 = this.x1
    this.x1 = v
    this.y2 = this.y1
    this.y1 = out
    return out
  }
}

/** The trace as SCATT draws it: the samples resampled to `resampleRate` and smoothed (cutoff a share of that rate). */
export function processTrace(raw: readonly RawPoint[], sampleRate: number, resampleRate = 200, cutoff = 0.15): Point[] {
  const fx = new ChebFilter(cutoff)
  const fy = new ChebFilter(cutoff)
  const out: Point[] = []
  if (sampleRate === resampleRate) {
    for (const [x, y] of raw) {
      const yy = fy.process(y)
      out.push([fx.process(x), yy])
    }
    return out
  }
  const rx = new Resampler(1000 / resampleRate, 1000 / sampleRate)
  const ry = new Resampler(1000 / resampleRate, 1000 / sampleRate)
  for (const [x, y] of raw) {
    const ox = rx.push(x)
    const oy = ry.push(y)
    for (let k = 0; k < ox.length; k++) {
      const yy = fy.process(oy[k])
      out.push([fx.process(ox[k]), yy])
    }
  }
  return out
}

// ------------------------------------------------------------------ a shot's numbers

/** SCATT's score of a shot at (x, y): tenths, from the pellet's edge to the ring (10.9 at most); 0 off the card. */
export function scattScore(x: number, y: number, t: ScattTarget, caliber: number): number {
  const [wx, wy, ww, wh] = t.world
  const hc = caliber * 0.5
  if (!(wx - hc <= x && x <= wx + ww + hc && wy - hc <= y && y <= wy + wh + hc)) return 0
  const d = Math.hypot(x, y)
  let prev = 0
  for (let ring = 10; ring >= 1; ring--) {
    const r = (t.rings[ring - 1] + caliber) * 0.5
    if (r >= d) return Math.min(10.9, Math.floor((ring + (r - d) / (r - prev)) * 10) / 10)
    prev = r
  }
  return 0
}

/** SCATT's direction number of a shot (SCATT's coordinates, y down): 0 for a 10.9, else 1 (up) to 8, clockwise. */
export function scattDirection(x: number, y: number, score: number): number {
  if (Math.abs(score - 10.9) <= 1e-9) return 0
  let ang: number
  if (Math.abs(x) <= 1e-12) ang = Math.abs(y) <= 1e-12 ? 0 : y > 0 ? Math.PI / 2 : (3 * Math.PI) / 2
  else {
    ang = Math.atan(y / x)
    ang = x > 0 ? (y < 0 ? ang + 2 * Math.PI : ang) : ang + Math.PI
  }
  ang += Math.PI / 2 + Math.PI / 8
  if (ang > 2 * Math.PI) ang -= 2 * Math.PI
  return Math.trunc((ang / (2 * Math.PI)) * 8) + 1
}

/**
 * The aim's movement before a shot: S1 the length of the trace in the last second (mm/s), S2 in the last quarter
 * second (scaled to a second), and the average aiming point over the last second.
 */
export function shotStats(proc: readonly Point[], offset: number, sampleRate: number, resampleRate: number, window = 1.0) {
  const idx = Math.floor((offset * resampleRate) / sampleRate)
  const n1 = Math.trunc(window * resampleRate)
  const n250 = Math.trunc(resampleRate * 0.25)
  const start = Math.max(0, idx - n1)
  const s250 = Math.max(0, idx - n250)
  const end = Math.min(Math.max(0, idx), proc.length - 1)
  if (start >= end) return null
  let [px, py] = proc[start]
  let sx = px
  let sy = py
  let l1 = 0
  let l2 = 0
  for (let i = start + 1; i <= end; i++) {
    const [x, y] = proc[i]
    const h = Math.hypot(x - px, y - py)
    l1 += h
    if (s250 < i) l2 += h
    sx += x
    sy += y
    px = x
    py = y
  }
  const count = end - start
  return {
    s1: (l1 * (n1 / count)) / window,
    s2: end > s250 ? l2 * (n250 / (end - s250)) * 4 : 0,
    // SCATT divides the count+1 points' sum by count.
    aap: [sx / count, sy / count] as Point,
  }
}

/**
 * How the aim held in the last second, in percent of the time: inside the 10 ring around the centre ("10.0") and the
 * half 10 ("10.5"), and around the average aiming point within the 6, 9, 10 and half-10 rings' sizes ("6a0" … "10a5").
 */
export function holdRatios(
  proc: readonly Point[],
  offset: number,
  sampleRate: number,
  resampleRate: number,
  aap: Point,
  t: ScattTarget,
  caliber: number,
  window = 1.0,
): Record<'6a0' | '9a0' | '10.0' | '10.5' | '10a0' | '10a5', number> | null {
  const r6 = (t.rings[5] + caliber) * 0.5
  const r9 = (t.rings[8] + caliber) * 0.5
  const r10 = (t.rings[9] + caliber) * 0.5
  const r105 = r10 * 0.5
  const start = Math.max(0, offset - Math.trunc(sampleRate * window))
  const end = Math.max(0, offset)
  if (start === end || !proc.length) return null
  const c = { '6a0': 0, '9a0': 0, '10.0': 0, '10.5': 0, '10a0': 0, '10a5': 0 }
  for (let i = start; i <= end; i++) {
    const [x, y] = proc[Math.min(Math.floor((i * resampleRate) / sampleRate), proc.length - 1)]
    const dc = x * x + y * y
    const da = (x - aap[0]) ** 2 + (y - aap[1]) ** 2
    if (da <= r6 * r6) c['6a0']++
    if (da <= r9 * r9) c['9a0']++
    if (dc <= r10 * r10) c['10.0']++
    if (dc <= r105 * r105) c['10.5']++
    if (da <= r10 * r10) c['10a0']++
    if (da <= r105 * r105) c['10a5']++
  }
  const n = end - start + 1
  for (const k of Object.keys(c) as (keyof typeof c)[]) c[k] = Math.floor((c[k] * 100) / n)
  return c
}
