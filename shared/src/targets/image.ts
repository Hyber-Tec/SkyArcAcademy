/**
 * The pixel work behind reading a paper target from a photo: plain TypeScript on typed arrays, so the same code runs
 * in the phone app, the website and the tests. Kept simple and allocation-light: the phone runs it without a JIT.
 */

/** A photo as 8-bit RGBA, row by row (what a canvas or Skia's readPixels gives). */
export interface RgbaImage {
  width: number
  height: number
  data: Uint8Array | Uint8ClampedArray
}

/** One channel as floats. */
export interface Plane {
  width: number
  height: number
  data: Float32Array
}

export function plane(width: number, height: number): Plane {
  return { width, height, data: new Float32Array(width * height) }
}

/** Luma (Rec. 601) of the image averaged over f × f blocks: the coarse view the bulls are found in. */
export function downscaleLuma(img: RgbaImage, f: number): Plane {
  const w = Math.floor(img.width / f)
  const h = Math.floor(img.height / f)
  const out = plane(w, h)
  const d = img.data
  const stride = img.width * 4
  const norm = 1 / (f * f)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      for (let dy = 0; dy < f; dy++) {
        let i = (y * f + dy) * stride + x * f * 4
        for (let dx = 0; dx < f; dx++, i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      }
      out.data[y * w + x] = sum * norm
    }
  }
  return out
}

/**
 * The red, green and blue of the photo at (x, y), interpolated between pixels, into `out`. False (and `out` left
 * alone) outside the photo.
 */
export function sampleRgb(img: RgbaImage, x: number, y: number, out: Float32Array | number[]): boolean {
  const w = img.width
  const h = img.height
  if (!(x >= 0 && y >= 0 && x <= w - 1 && y <= h - 1)) return false
  let x0 = Math.floor(x)
  let y0 = Math.floor(y)
  if (x0 >= w - 1) x0 = w - 2
  if (y0 >= h - 1) y0 = h - 2
  const fx = x - x0
  const fy = y - y0
  const d = img.data
  const i00 = (y0 * w + x0) * 4
  const i01 = i00 + 4
  const i10 = i00 + w * 4
  const i11 = i10 + 4
  const w00 = (1 - fx) * (1 - fy)
  const w01 = fx * (1 - fy)
  const w10 = (1 - fx) * fy
  const w11 = fx * fy
  out[0] = d[i00] * w00 + d[i01] * w01 + d[i10] * w10 + d[i11] * w11
  out[1] = d[i00 + 1] * w00 + d[i01 + 1] * w01 + d[i10 + 1] * w10 + d[i11 + 1] * w11
  out[2] = d[i00 + 2] * w00 + d[i01 + 2] * w01 + d[i10 + 2] * w10 + d[i11 + 2] * w11
  return true
}

/** A plane's value at (x, y), interpolated; `fallback` outside it. */
export function samplePlane(p: Plane, x: number, y: number, fallback = 0): number {
  const w = p.width
  const h = p.height
  if (!(x >= 0 && y >= 0 && x <= w - 1 && y <= h - 1)) return fallback
  let x0 = Math.floor(x)
  let y0 = Math.floor(y)
  if (x0 >= w - 1) x0 = w - 2
  if (y0 >= h - 1) y0 = h - 2
  const fx = x - x0
  const fy = y - y0
  const i = y0 * w + x0
  const d = p.data
  return (d[i] * (1 - fx) + d[i + 1] * fx) * (1 - fy) + (d[i + w] * (1 - fx) + d[i + w + 1] * fx) * fy
}

/** Otsu's threshold of values in 0–255: the level that best splits them into a dark and a light group. */
export function otsu(values: Float32Array): number {
  const hist = new Float64Array(256)
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    hist[v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v)] += 1
  }
  let total = 0
  let sum = 0
  for (let i = 0; i < 256; i++) {
    total += hist[i]
    sum += i * hist[i]
  }
  let best = 127
  let bestVar = -1
  let wB = 0
  let sumB = 0
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > bestVar) {
      bestVar = between
      best = t
    }
  }
  return best + 0.5
}

/** The plane averaged over a (2r + 1) square around each point, edges clamped: one pass of a separable box blur. */
export function boxBlur(p: Plane, r: number): Plane {
  const { width: w, height: h } = p
  if (r < 1) return { width: w, height: h, data: p.data.slice() }
  const tmp = new Float32Array(w * h)
  const out = new Float32Array(w * h)
  const n = 2 * r + 1
  const src = p.data
  for (let y = 0; y < h; y++) {
    const row = y * w
    let acc = 0
    for (let k = -r; k <= r; k++) acc += src[row + Math.min(w - 1, Math.max(0, k))]
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / n
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)]
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let k = -r; k <= r; k++) acc += tmp[Math.min(h - 1, Math.max(0, k)) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / n
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]
    }
  }
  return { width: w, height: h, data: out }
}

/** A connected group of marked pixels, with what's needed to fit an ellipse to it (its moments). */
export interface Blob {
  area: number
  /** Centroid. */
  cx: number
  cy: number
  /** Second central moments. */
  mxx: number
  myy: number
  mxy: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  touchesEdge: boolean
}

/** The 8-connected groups of non-zero pixels of a mask, at least `minArea` pixels each. */
export function blobs(mask: Uint8Array, width: number, height: number, minArea: number): Blob[] {
  const labels = new Int32Array(width * height)
  const parent: number[] = [0]
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]]
      a = parent[a]
    }
    return a
  }
  const union = (a: number, b: number) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb)
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!mask[i]) continue
      const left = x > 0 ? labels[i - 1] : 0
      const up = y > 0 ? labels[i - width] : 0
      const upLeft = x > 0 && y > 0 ? labels[i - width - 1] : 0
      const upRight = x < width - 1 && y > 0 ? labels[i - width + 1] : 0
      let l = left || up || upLeft || upRight
      if (!l) {
        l = parent.length
        parent.push(l)
      } else {
        if (left && left !== l) union(l, left)
        if (up && up !== l) union(l, up)
        if (upLeft && upLeft !== l) union(l, upLeft)
        if (upRight && upRight !== l) union(l, upRight)
      }
      labels[i] = l
    }
  }
  const n = parent.length
  const area = new Float64Array(n)
  const sx = new Float64Array(n)
  const sy = new Float64Array(n)
  const sxx = new Float64Array(n)
  const syy = new Float64Array(n)
  const sxy = new Float64Array(n)
  const minX = new Int32Array(n).fill(width)
  const maxX = new Int32Array(n).fill(-1)
  const minY = new Int32Array(n).fill(height)
  const maxY = new Int32Array(n).fill(-1)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (!labels[i]) continue
      const l = find(labels[i])
      area[l] += 1
      sx[l] += x
      sy[l] += y
      sxx[l] += x * x
      syy[l] += y * y
      sxy[l] += x * y
      if (x < minX[l]) minX[l] = x
      if (x > maxX[l]) maxX[l] = x
      if (y < minY[l]) minY[l] = y
      if (y > maxY[l]) maxY[l] = y
    }
  }
  const out: Blob[] = []
  for (let l = 1; l < n; l++) {
    if (find(l) !== l || area[l] < minArea) continue
    const a = area[l]
    const cx = sx[l] / a
    const cy = sy[l] / a
    out.push({
      area: a,
      cx,
      cy,
      mxx: sxx[l] / a - cx * cx,
      myy: syy[l] / a - cy * cy,
      mxy: sxy[l] / a - cx * cy,
      minX: minX[l],
      maxX: maxX[l],
      minY: minY[l],
      maxY: maxY[l],
      touchesEdge: minX[l] === 0 || minY[l] === 0 || maxX[l] === width - 1 || maxY[l] === height - 1,
    })
  }
  return out
}

/** The median of the first `n` values of an array (sorted in place). */
export function medianOf(values: Float32Array | number[], n = values.length): number {
  if (n <= 0) return 0
  const a = values instanceof Float32Array ? values.subarray(0, n).sort() : values.slice(0, n).sort((p, q) => p - q)
  const m = n >> 1
  return n % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}
