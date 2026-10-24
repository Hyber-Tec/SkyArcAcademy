/**
 * Synthetic SIUS "Results" PDFs: the same page layout, fonts, arrows and metadata as the PDFs the academy's SIUS
 * computers print (measured from the samples in docs/HYBERCRM_REVIEW.md §8.1), with made-up shots. They feed the
 * sample data and the tests, so no real result is ever committed or uploaded.
 */
import { deflateSync } from 'node:zlib'
import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'
import { groupSizeMm, meanPoint, radiusFromScore, shotPoint } from '../../shared/src/shooting/target'
import type { ShotPoint } from '../../shared/src/shooting/target'

export interface SiusSpecShot {
  v: number
  /** Direction in degrees (0 right, 90 up); null prints no arrow (only for the unexplained 0.0 entries). */
  a: number | null
}

export interface SiusSpec {
  event?: string
  /** The SIUS computer's wall clock when the result was printed. */
  printed: { year: number; month: number; day: number; hour: number; minute: number; second: number }
  /** That computer's UTC offset in minutes (−240 for Eastern daylight time, −420 for Pacific). */
  pcOffsetMin: number
  series: { sighter?: boolean; shots: SiusSpecShot[] }[]
  /** A shooter's name set on the lane, printed under the program (no academy report shows one yet: A6). */
  name?: string
}

const PAGE_W = 595.32
const PAGE_H = 841.92
const SIZE = 9.72
const COLUMN_RIGHT = 213.67
const COLUMN_PITCH = 31.6
const ARROW_PT = 7.2

const round1 = (n: number) => Math.round(n * 10) / 10
const fixed1 = (n: number) => round1(n).toFixed(1)

/** "10/7/2026 6:35:59 PM", as SIUS prints it. */
export function printedLabel(p: SiusSpec['printed']): string {
  const h12 = p.hour % 12 || 12
  return `${p.month}/${p.day}/${p.year} ${h12}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')} ${p.hour < 12 ? 'AM' : 'PM'}`
}

function pdfDate(p: SiusSpec['printed'], offsetMin: number): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const sign = offsetMin < 0 ? '-' : '+'
  const abs = Math.abs(offsetMin)
  return `D:${p.year}${pad(p.month)}${pad(p.day)}${pad(p.hour)}${pad(p.minute)}${pad(p.second)}${sign}${pad(Math.floor(abs / 60))}'${pad(abs % 60)}'`
}

// ------------------------------------------------------------------ arrows

/** A tiny RGBA PNG encoder (no filters), enough for 20 × 20 arrows. */
function png(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Uint8Array) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, data.length)
    out.set(new TextEncoder().encode(type), 4)
    out.set(data, 8)
    view.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)))
    return out
  }
  const ihdr = new Uint8Array(13)
  const hv = new DataView(ihdr.buffer)
  hv.setUint32(0, width)
  hv.setUint32(4, height)
  ihdr.set([8, 6, 0, 0, 0], 8)
  const raw = new Uint8Array(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1)
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

/** SIUS's direction arrow: a black shaft with a wider head, pointing `deg` (0 right, 90 up), on a transparent square. */
export function arrowPng(deg: number): Uint8Array {
  const N = 20
  const a = (deg * Math.PI) / 180
  const dx = Math.cos(a)
  const dy = -Math.sin(a)
  const tail = { x: 10 - dx * 7, y: 10 - dy * 7 }
  const tip = { x: 10 + dx * 7.5, y: 10 + dy * 7.5 }
  const base = { x: tip.x - dx * 5, y: tip.y - dy * 5 }
  const nx = -dy
  const ny = dx
  const inShaft = (x: number, y: number) => {
    const t = ((x - tail.x) * dx + (y - tail.y) * dy) / 9.5
    if (t < 0 || t > 1) return false
    return Math.abs((x - tail.x) * nx + (y - tail.y) * ny) <= 1.3
  }
  const inHead = (x: number, y: number) => {
    const along = (x - base.x) * dx + (y - base.y) * dy
    if (along < 0 || along > 5) return false
    return Math.abs((x - base.x) * nx + (y - base.y) * ny) <= 3.6 * (1 - along / 5)
  }
  const rgba = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let hits = 0
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const px = x + (sx + 0.5) / 4
        const py = y + (sy + 0.5) / 4
        if (inShaft(px, py) || inHead(px, py)) hits++
      }
      rgba[(y * N + x) * 4 + 3] = Math.round((hits / 16) * 255)
    }
  }
  return png(N, N, rgba)
}

// ------------------------------------------------------------------ drawing

function drawTarget(page: PDFPage, cx: number, cy: number, radiusPt: number, points: ShotPoint[], lastRed: boolean) {
  const scale = radiusPt / 25
  page.drawRectangle({ x: cx - radiusPt - 6, y: cy - radiusPt - 6, width: (radiusPt + 6) * 2, height: (radiusPt + 6) * 2, color: rgb(0.96, 0.96, 0.96) })
  for (let ring = 1; ring <= 10; ring++) {
    const r = (0.25 + (10 - ring) * 2.5) * scale
    const black = ring >= 4
    page.drawCircle({ x: cx, y: cy, size: r, color: black ? rgb(0, 0, 0) : rgb(1, 1, 1), borderColor: black ? rgb(1, 1, 1) : rgb(0.6, 0.6, 0.6), borderWidth: 0.4 })
  }
  points.forEach((p, i) => {
    const red = lastRed && i === points.length - 1
    page.drawCircle({ x: cx + p.x * scale, y: cy + p.y * scale, size: 2.25 * scale, color: red ? rgb(0.86, 0.1, 0.1) : rgb(0.1, 0.55, 0.12) })
  })
}

function rightAligned(page: PDFPage, text: string, right: number, y: number, font: PDFFont) {
  page.drawText(text, { x: right - font.widthOfTextAtSize(text, SIZE), y, size: SIZE, font })
}

const mpiText = (p: ShotPoint | null) => `X: ${fixed1(p?.x ?? 0)} mm; Y: ${fixed1(p?.y ?? 0)} mm`
const groupText = (g: number | null) => `Ø: ${fixed1(g ?? 0)} mm`

/** The PDF bytes for a spec, laid out like a SIUS "Results" page. */
export async function siusPdf(spec: SiusSpec): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const arrows = new Map<number, PDFImage>()
  const arrowImage = async (deg: number) => {
    const key = Math.round(deg)
    if (!arrows.has(key)) arrows.set(key, await doc.embedPng(arrowPng(key)))
    return arrows.get(key)!
  }

  const pointsOf = (shots: SiusSpecShot[]) => shots.map((t) => shotPoint(t.v, t.a)).filter((p): p is ShotPoint => p !== null)
  const matchSeries = spec.series.filter((s) => !s.sighter)
  const matchShots = matchSeries.flatMap((s) => s.shots.filter((t) => t.a !== null))
  const matchPoints = pointsOf(matchShots)
  const total = round1(matchShots.reduce((n, t) => n + t.v, 0))
  const innerTens = matchShots.filter((t) => t.v >= 10.2 - 1e-9).length

  let page = doc.addPage([PAGE_W, PAGE_H])
  page.drawText('Results', { x: (PAGE_W - bold.widthOfTextAtSize('Results', 18)) / 2, y: 788.04, size: 18, font: bold })
  page.drawText(spec.event ?? 'Air Rifle 60', { x: 55.44, y: 771, size: SIZE, font: regular })
  if (spec.name) page.drawText(spec.name, { x: 55.44, y: 764.5, size: SIZE, font: regular })
  rightAligned(page, printedLabel(spec.printed), 548, 771, regular)
  page.drawLine({ start: { x: 55.44, y: 760 }, end: { x: 548, y: 760 }, thickness: 1.5 })
  page.drawText('Total:', { x: 62.64, y: 729.36, size: SIZE, font: regular })
  page.drawText(matchShots.length ? fixed1(total) : '0', { x: 136.44, y: 729.24, size: SIZE, font: bold })
  page.drawText('Inner tens:', { x: 236.16, y: 729.36, size: SIZE, font: regular })
  page.drawText(String(innerTens), { x: 299.88, y: 729.36, size: SIZE, font: regular })
  if (matchSeries.length) {
    page.drawText('Series totals:', { x: 62.64, y: 712.8, size: SIZE, font: regular })
    const totals = [...matchSeries.map((s) => fixed1(s.shots.reduce((n, t) => n + t.v, 0))), '0'].join(' ')
    page.drawText(totals, { x: 136.48, y: 712.8, size: SIZE, font: regular })
  }
  page.drawText('MPI:', { x: 62.64, y: 670.2, size: SIZE, font: regular })
  page.drawText(mpiText(meanPoint(matchPoints)), { x: 136.44, y: 670.2, size: SIZE, font: regular })
  page.drawText('Group size:', { x: 62.64, y: 653.64, size: SIZE, font: regular })
  page.drawText(groupText(groupSizeMm(matchPoints)), { x: 136.41, y: 653.64, size: SIZE, font: regular })
  drawTarget(page, 360.72 + 71.28, 597.84 + 71.28, 64, matchPoints, true)

  let y = 573.24
  let number = 0
  for (const series of spec.series) {
    if (!series.sighter) number += 1
    const rows = Math.max(1, Math.ceil(series.shots.length / 10))
    if (y - 18 * (rows - 1) - 60 < 70) {
      page = doc.addPage([PAGE_W, PAGE_H])
      y = 780
    }
    const label = series.sighter ? `Series ${Math.max(1, number)}P:` : `Series ${number}:`
    page.drawText(label, { x: 143.28, y, size: SIZE, font: regular })
    for (let i = 0; i < series.shots.length; i++) {
      const shot = series.shots[i]
      const rowY = y - 0.12 - 18 * Math.floor(i / 10)
      const right = COLUMN_RIGHT + COLUMN_PITCH * (i % 10)
      rightAligned(page, fixed1(shot.v), right, rowY, bold)
      if (shot.a !== null) page.drawImage(await arrowImage(shot.a), { x: right + 0.17, y: rowY - 0.12, width: ARROW_PT, height: ARROW_PT })
    }
    const counted = series.shots.filter((t) => t.a !== null)
    const points = pointsOf(counted)
    const totalY = y - 25.92 - 18 * (rows - 1)
    page.drawText('Series total:', { x: 143.28, y: totalY, size: SIZE, font: regular })
    page.drawText(fixed1(counted.reduce((n, t) => n + t.v, 0)), { x: 213.23, y: totalY, size: SIZE, font: regular })
    page.drawText('MPI:', { x: 143.28, y: totalY - 16.56, size: SIZE, font: regular })
    page.drawText(mpiText(meanPoint(points)), { x: 213.27, y: totalY - 16.56, size: SIZE, font: regular })
    page.drawText('Group size:', { x: 143.28, y: totalY - 33.12, size: SIZE, font: regular })
    page.drawText(groupText(groupSizeMm(points)), { x: 213.26, y: totalY - 33.12, size: SIZE, font: regular })
    drawTarget(page, 54.72 + 40.68, y - 63.24 + 40.68, 36, points, false)
    y = Math.min(y - 86.4, totalY - 33.12 - 23.76)
  }

  const pages = doc.getPages()
  pages.forEach((p, i) => {
    const label = `${i + 1}/${pages.length}`
    p.drawText(label, { x: (PAGE_W - regular.widthOfTextAtSize(label, SIZE)) / 2, y: 42.72, size: SIZE, font: regular })
    p.drawText('SIUS', { x: 452, y: 36, size: 34, font: bold, color: rgb(0.47, 0.29, 0.1) })
  })
  doc.setTitle('Summary')
  doc.setAuthor('ARC Range')
  doc.setProducer('Microsoft: Print To PDF')
  doc.setCreator('')
  // pdf-lib writes dates in UTC; SIUS's carry the computer's own offset, which the app reads.
  const date = PDFString.of(pdfDate(spec.printed, spec.pcOffsetMin))
  const info = (doc as unknown as { getInfoDict(): { set(key: PDFName, value: PDFString): void } }).getInfoDict()
  info.set(PDFName.of('CreationDate'), date)
  info.set(PDFName.of('ModDate'), date)
  return doc.save({ updateFieldAppearances: false })
}

/** A miss is a 0.0 with an arrow pointing off the target; this keeps sample shots on the paper. */
export function clampScore(v: number): number {
  return radiusFromScore(v) === null ? 0 : Math.min(10.9, Math.max(0, round1(v)))
}
