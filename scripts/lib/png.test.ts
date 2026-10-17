import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { PNG_SIGNATURE, crc32, encodePng } from './png'

/** Reads a PNG written by encodePng back: its chunks (each CRC checked) and its RGB pixels, unfiltered. */
function decode(png: Uint8Array) {
  expect([...png.subarray(0, 8)]).toEqual([...PNG_SIGNATURE])
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const chunks: { type: string; data: Uint8Array }[] = []
  for (let at = 8; at < png.length; ) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8))
    const data = png.subarray(at + 8, at + 8 + length)
    expect(view.getUint32(at + 8 + length)).toBe(crc32(png.subarray(at + 4, at + 8 + length)))
    chunks.push({ type, data })
    at += 12 + length
  }
  expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'IDAT', 'IEND'])
  const ihdr = new DataView(chunks[0].data.buffer, chunks[0].data.byteOffset, 13)
  const width = ihdr.getUint32(0)
  const height = ihdr.getUint32(4)
  expect([...chunks[0].data.subarray(8)]).toEqual([8, 2, 0, 0, 0])
  const raw = inflateSync(chunks[1].data)
  const stride = width * 3
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)]
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? pixels[y * stride + i - 3] : 0
      const b = y ? pixels[(y - 1) * stride + i] : 0
      const c = i >= 3 && y ? pixels[(y - 1) * stride + i - 3] : 0
      const p = a + b - c
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c
      const guess = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth
      pixels[y * stride + i] = (raw[y * (stride + 1) + 1 + i] + guess) & 0xff
    }
  }
  return { width, height, pixels }
}

describe('the PNG writer', () => {
  it('checks its chunks like any PNG (the CRC of "IEND" is the well-known one)', () => {
    expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082)
  })

  it('writes an image that reads back pixel for pixel', () => {
    const width = 7
    const height = 5
    const data = new Uint8ClampedArray(width * height * 4)
    for (let i = 0; i < width * height; i++) {
      // Flat colour, a gradient and some noise, so every filter gets used somewhere.
      data[i * 4] = i % width < 3 ? 200 : (i * 37) % 256
      data[i * 4 + 1] = Math.floor(i / width) * 40
      data[i * 4 + 2] = (i * i * 13) % 256
      data[i * 4 + 3] = 255
    }
    const back = decode(encodePng({ width, height, data }))
    expect(back.width).toBe(width)
    expect(back.height).toBe(height)
    for (let i = 0; i < width * height; i++) expect([...back.pixels.subarray(i * 3, i * 3 + 3)]).toEqual([data[i * 4], data[i * 4 + 1], data[i * 4 + 2]])
  })
})
