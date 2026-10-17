import { deflateSync } from 'node:zlib'
import type { RgbaImage } from '../../shared/src/targets/image'

/**
 * A small PNG writer for the sample data's made-up card pictures (scripts/seed-sample.ts), with nothing but zlib:
 * 8-bit RGB (the alpha is dropped), each row filtered the way that leaves the smallest differences (PNG's usual
 * choice), then deflated.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** The CRC-32 PNG chunks carry (over the chunk's type and data). */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

export const PNG_SIGNATURE = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10)

export function encodePng(img: RgbaImage): Uint8Array {
  const { width, height, data } = img
  const stride = width * 3
  const raw = new Uint8Array((stride + 1) * height)
  let prev = new Uint8Array(stride)
  let row = new Uint8Array(stride)
  const tries = Array.from({ length: 5 }, () => new Uint8Array(stride))
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      row[x * 3] = data[i]
      row[x * 3 + 1] = data[i + 1]
      row[x * 3 + 2] = data[i + 2]
    }
    // Filters 0–4 (none, left, up, average, Paeth): the one whose bytes stay nearest zero.
    let best = 0
    let bestSum = Infinity
    for (let f = 0; f < 5; f++) {
      const out = tries[f]
      let sum = 0
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? row[i - 3] : 0
        const b = prev[i]
        const c = i >= 3 ? prev[i - 3] : 0
        const guess = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c)
        const v = (row[i] - guess) & 0xff
        out[i] = v
        sum += v < 128 ? v : 256 - v
      }
      if (sum < bestSum) {
        bestSum = sum
        best = f
      }
    }
    raw[y * (stride + 1)] = best
    raw.set(tries[best], y * (stride + 1) + 1)
    ;[prev, row] = [row, prev]
  }
  const header = new Uint8Array(13)
  const hv = new DataView(header.buffer)
  hv.setUint32(0, width)
  hv.setUint32(4, height)
  header[8] = 8 // bits per channel
  header[9] = 2 // RGB
  const parts = [PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}
