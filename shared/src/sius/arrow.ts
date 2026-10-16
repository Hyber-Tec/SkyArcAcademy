/**
 * SIUS prints a small arrow after every shot (a 20 × 20 pixel image) pointing from the target's centre towards where
 * the shot landed. Its direction, with the shot's score, places the shot on the target (shooting/target.ts).
 */

/** Decoded image pixels: RGBA (4 bytes per pixel), RGB (3) or gray (1). */
export interface ArrowPixels {
  width: number
  height: number
  data: ArrayLike<number>
}

/**
 * The arrow's direction in degrees (0 right, 90 up), or null when the image holds no shape. The shape is read from
 * the alpha channel when the image has one, else from how dark each pixel is. The shaft gives the line; the end with
 * the wider spread is the head.
 */
export function arrowAngle(img: ArrowPixels): number | null {
  const { width: W, height: H, data } = img
  const n = W * H
  if (!n) return null
  const channels = Math.round(data.length / n)
  if (channels !== 1 && channels !== 3 && channels !== 4) return null
  let alphaUsed = false
  if (channels === 4) for (let i = 0; i < n && !alphaUsed; i++) if (data[i * 4 + 3] < 250) alphaUsed = true
  const ink = (i: number) => {
    if (channels === 4 && alphaUsed) return data[i * 4 + 3] / 255
    const o = i * channels
    const lum = channels === 1 ? data[o] : 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]
    return 1 - lum / 255
  }
  const px: [number, number, number][] = []
  let m = 0
  let sx = 0
  let sy = 0
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = ink(y * W + x)
      if (a > 0.04) {
        px.push([x + 0.5, y + 0.5, a])
        m += a
        sx += a * (x + 0.5)
        sy += a * (y + 0.5)
      }
    }
  }
  if (m < 1) return null
  const cx = sx / m
  const cy = sy / m
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const [x, y, a] of px) {
    sxx += a * (x - cx) ** 2
    syy += a * (y - cy) ** 2
    sxy += a * (x - cx) * (y - cy)
  }
  const phi = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const ux = Math.cos(phi)
  const uy = Math.sin(phi)
  // The head is the end whose pixels spread furthest from the shaft.
  let tmin = Infinity
  let tmax = -Infinity
  for (const [x, y, a] of px) {
    if (a <= 0.5) continue
    const t = (x - cx) * ux + (y - cy) * uy
    tmin = Math.min(tmin, t)
    tmax = Math.max(tmax, t)
  }
  if (!Number.isFinite(tmin)) return null
  const span = tmax - tmin
  let wPos = 0
  let wNeg = 0
  for (const [x, y, a] of px) {
    if (a <= 0.5) continue
    const t = (x - cx) * ux + (y - cy) * uy
    const across = Math.abs(-(x - cx) * uy + (y - cy) * ux)
    if (t > tmax - 0.35 * span) wPos = Math.max(wPos, across)
    if (t < tmin + 0.35 * span) wNeg = Math.max(wNeg, across)
  }
  const sign = wPos >= wNeg ? 1 : -1
  // Image rows run downwards; the target's y runs up.
  let deg = (Math.atan2(-sign * uy, sign * ux) * 180) / Math.PI
  if (deg < 0) deg += 360
  return Math.round(deg * 10) / 10
}
