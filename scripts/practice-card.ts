/**
 * A made-up photo of the academy's paper card, as a PNG, for trying the phone app's Scan tab on a simulator: ten
 * shots, all tens (the scan should read 100), with a slight slant and the coaches' red pen. `npm run phone:test`
 * turns it into a JPEG and adds it to the iPhone Simulator's Photos before the scan flow (mobile/maestro/scan.yaml).
 * Never a real card.
 *   npx tsx scripts/practice-card.ts <out.png>
 */
import { writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { drawSyntheticCard } from '../shared/src/targets/synthetic'

const out = process.argv[2]
if (!out) throw new Error('Usage: npx tsx scripts/practice-card.ts <out.png>')

const shots = Array.from({ length: 10 }, (_, i) => ({
  bull: i + 1,
  x: Math.cos(i * 1.7) * 1.1,
  y: Math.sin(i * 1.7) * 1.1,
  look: i % 3 === 0 ? ('fibres' as const) : ('wall' as const),
}))
const img = drawSyntheticCard({ width: 1500, height: 2000, shots, tilt: { x: 0.0002, y: -0.0002 }, turnDeg: 2, ink: true, noise: 6, seed: 11 })

/** The image as a PNG: 8-bit RGBA rows, each behind a 0 (no filter), deflated, in the usual chunks. */
function png(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray): Buffer {
  const row = width * 4
  const raw = Buffer.alloc((row + 1) * height)
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * row, row).copy(raw, y * (row + 1) + 1)
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bits per channel
  header[9] = 6 // RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

writeFileSync(out, png(img.width, img.height, img.data))
console.log(`Wrote a made-up card (all tens) to ${out}`)
