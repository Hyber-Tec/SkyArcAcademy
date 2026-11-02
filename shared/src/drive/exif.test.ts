import { describe, expect, it } from 'vitest'
import { dateInName, parseExifTime, photoTakenAt } from './exif'

/**
 * A made-up Exif block: a TIFF header, the first directory with the camera's DateTime and a pointer to the Exif
 * directory, which holds DateTimeOriginal. Little- or big-endian, as cameras write either.
 */
function exifBlock({ big = false, original = '2026:11:02 16:12:45', changed = '2026:11:03 09:00:00' }: { big?: boolean; original?: string | null; changed?: string | null } = {}): number[] {
  const out: number[] = []
  const u16 = (v: number) => (big ? [(v >> 8) & 255, v & 255] : [v & 255, (v >> 8) & 255])
  const u32 = (v: number) => (big ? [(v >>> 24) & 255, (v >> 16) & 255, (v >> 8) & 255, v & 255] : [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255])
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0)).concat(0)
  // Header (8), IFD0 at 8 with 2 entries (2 + 24 + 4), the Exif IFD at 38 with 1 entry (2 + 12 + 4), then the strings.
  const ifd0 = 8
  const exifIfd = ifd0 + 2 + 2 * 12 + 4
  const strings = exifIfd + 2 + 12 + 4
  const changedAt = strings
  const originalAt = strings + 20
  out.push(...(big ? [0x4d, 0x4d, 0, 0x2a] : [0x49, 0x49, 0x2a, 0]), ...u32(ifd0))
  out.push(...u16(2))
  out.push(...u16(0x0132), ...u16(2), ...u32(20), ...u32(changedAt))
  out.push(...u16(0x8769), ...u16(4), ...u32(1), ...u32(exifIfd))
  out.push(...u32(0))
  out.push(...u16(1))
  out.push(...u16(0x9003), ...u16(2), ...u32(20), ...u32(originalAt))
  out.push(...u32(0))
  out.push(...(changed === null ? Array(20).fill(0) : ascii(changed)))
  out.push(...(original === null ? Array(20).fill(0) : ascii(original)))
  return out
}

const EXIF = [0x45, 0x78, 0x69, 0x66, 0, 0]
/** As a JPEG keeps it: the start of the image, then an APP1 segment with "Exif" and the block. */
const jpeg = (block: number[]) => new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, block.length + 8, ...EXIF, ...block, 0xff, 0xd9])
/** As a HEIC file keeps it: its boxes first, then the Exif item (an offset, "Exif" and the block) among the data. */
const heic = (block: number[]) => new Uint8Array([0, 0, 0, 24, ...[...'ftypheic'].map((c) => c.charCodeAt(0)), ...Array(40).fill(7), 0, 0, 0, 6, ...EXIF, ...block, ...Array(64).fill(3)])

describe('when a photo was taken', () => {
  it('reads the time the camera took it, from a JPEG or a HEIC, either byte order', () => {
    expect(photoTakenAt(jpeg(exifBlock()))).toEqual({ dateKey: '2026-11-02', minutes: 16 * 60 + 12 })
    expect(photoTakenAt(jpeg(exifBlock({ big: true })))).toEqual({ dateKey: '2026-11-02', minutes: 972 })
    expect(photoTakenAt(heic(exifBlock({ big: true })))).toEqual({ dateKey: '2026-11-02', minutes: 972 })
  })

  it('falls back on the time it was last saved, and gives nothing without either', () => {
    expect(photoTakenAt(jpeg(exifBlock({ original: null })))).toEqual({ dateKey: '2026-11-03', minutes: 540 })
    expect(photoTakenAt(jpeg(exifBlock({ original: '0000:00:00 00:00:00', changed: null })))).toBeNull()
    expect(photoTakenAt(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull()
  })

  it('stops at a block cut short instead of reading past the file', () => {
    const cut = jpeg(exifBlock()).slice(0, 40)
    expect(photoTakenAt(cut)).toBeNull()
  })

  it('reads a date written in a file’s name', () => {
    expect(dateInName('2026-11-02 Kneeling paper card.jpg')).toBe('2026-11-02')
    expect(dateInName('Prone 2026-10-07.heic')).toBe('2026-10-07')
    expect(dateInName('IMG_4831.jpg')).toBeNull()
    expect(dateInName('2026-02-30 Prone.jpg')).toBeNull()
    expect(dateInName('12026-11-02.jpg')).toBeNull()
  })

  it('takes only real dates', () => {
    expect(parseExifTime('2026:02:28 07:05:00')).toEqual({ dateKey: '2026-02-28', minutes: 425 })
    expect(parseExifTime('2026:02:30 07:05:00')).toBeNull()
    expect(parseExifTime('2026:13:01 07:05:00')).toBeNull()
    expect(parseExifTime('not a date')).toBeNull()
  })
})
