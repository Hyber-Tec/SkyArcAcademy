import type { Point } from './trace'

/**
 * A shot's trace, compact enough for a session's every shot in one Firestore document: x and y as 16-bit integers in
 * hundredths of a millimetre (±327 mm, far past the card), little-endian, in base64. Written by hand, so the website,
 * the server and the phone (whose JavaScript has no Buffer) read it the same way.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const LOOKUP = new Map([...ALPHABET].map((c, i) => [c, i]))

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (a << 16) | (b << 8) | c
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '='
  }
  return out
}

function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      ((LOOKUP.get(clean[i]) ?? 0) << 18) |
      ((LOOKUP.get(clean[i + 1]) ?? 0) << 12) |
      ((LOOKUP.get(clean[i + 2]) ?? 0) << 6) |
      (LOOKUP.get(clean[i + 3]) ?? 0)
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (o < out.length && i + 2 < clean.length) out[o++] = (n >> 8) & 255
    if (o < out.length && i + 3 < clean.length) out[o++] = n & 255
  }
  return out.subarray(0, o)
}

const clamp16 = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 100)))

/** Points (mm) as text. */
export function encodeTrace(points: readonly Point[]): string {
  const bytes = new Uint8Array(points.length * 4)
  const view = new DataView(bytes.buffer)
  points.forEach(([x, y], i) => {
    view.setInt16(i * 4, clamp16(x), true)
    view.setInt16(i * 4 + 2, clamp16(y), true)
  })
  return toBase64(bytes)
}

/** Text back to points (mm). */
export function decodeTrace(text: string): Point[] {
  const bytes = fromBase64(text ?? '')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Point[] = []
  for (let i = 0; i + 3 < bytes.length; i += 4) out.push([view.getInt16(i, true) / 100, view.getInt16(i + 2, true) / 100])
  return out
}
