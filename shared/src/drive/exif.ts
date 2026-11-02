import type { DateKey } from '../time'

/**
 * When a photo was taken, from its Exif data: the date and time the camera wrote (DateTimeOriginal, else
 * DateTimeDigitized, else DateTime), as the clock read where it was taken. A paper card read from its photo takes this
 * date unless the coach changes it. Phones write it into JPEGs and into HEIC files alike; the Exif block is found by
 * its signature ("Exif", then a TIFF header), wherever the file keeps it. Null when there's none, or it's blank.
 */
export function photoTakenAt(bytes: Uint8Array): { dateKey: DateKey; minutes: number } | null {
  const tiff = findTiff(bytes)
  if (tiff < 0) return null
  const le = bytes[tiff] === 0x49
  const u16 = (at: number) => (at + 2 > bytes.length ? -1 : le ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1])
  const u32 = (at: number) => (at + 4 > bytes.length ? -1 : le ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0 : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0)

  /** A directory's entries by tag: where each value is (its own 4 bytes, or the offset they hold) and how long. */
  const entries = (ifd: number) => {
    const out = new Map<number, { type: number; count: number; at: number }>()
    const n = u16(tiff + ifd)
    if (n < 0 || n > 500) return out
    for (let k = 0; k < n; k++) {
      const e = tiff + ifd + 2 + k * 12
      const tag = u16(e)
      const type = u16(e + 2)
      const count = u32(e + 4)
      if (tag < 0 || type < 0 || count < 0) break
      // Values of more than four bytes sit elsewhere, at an offset from the TIFF header (ASCII is one byte a character).
      out.set(tag, { type, count, at: type === 2 && count > 4 ? tiff + u32(e + 8) : e + 8 })
    }
    return out
  }
  const text = (v: { type: number; count: number; at: number } | undefined) => {
    if (!v || v.type !== 2 || v.at + v.count > bytes.length) return null
    let s = ''
    for (let i = 0; i < v.count && bytes[v.at + i] !== 0; i++) s += String.fromCharCode(bytes[v.at + i])
    return s
  }

  const ifd0 = entries(u32(tiff + 4))
  const pointer = ifd0.get(0x8769)
  const exif = pointer ? entries(u32(pointer.at)) : new Map()
  for (const value of [text(exif.get(0x9003)), text(exif.get(0x9004)), text(ifd0.get(0x0132))]) {
    const when = value ? parseExifTime(value) : null
    if (when) return when
  }
  return null
}

/** "2026:11:02 16:12:45" → its date and minutes; null for a blank or impossible one. */
export function parseExifTime(value: string): { dateKey: DateKey; minutes: number } | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(value.trim())
  if (!m) return null
  const [year, month, day, hour, minute] = m.slice(1).map(Number)
  const real = new Date(Date.UTC(year, month - 1, day))
  if (year < 1990 || real.getUTCMonth() !== month - 1 || real.getUTCDate() !== day || hour > 23 || minute > 59) return null
  return { dateKey: `${m[1]}-${m[2]}-${m[3]}` as DateKey, minutes: hour * 60 + minute }
}

/**
 * A date written in a file's name ("2026-11-02 Kneeling.jpg", as the phone app names a card it saves), or null: for a
 * photo whose own data doesn't say when it was taken.
 */
export function dateInName(name: string): DateKey | null {
  const m = /(?:^|[^0-9])(\d{4})-(\d{2})-(\d{2})(?:[^0-9]|$)/.exec(name)
  if (!m) return null
  return parseExifTime(`${m[1]}:${m[2]}:${m[3]} 00:00`)?.dateKey ?? null
}

/** Where the TIFF header after "Exif\0\0" starts ("II*\0" or "MM\0*"), or -1. */
function findTiff(b: Uint8Array): number {
  for (let i = 0; i + 10 <= b.length; i++) {
    if (b[i] !== 0x45 || b[i + 1] !== 0x78 || b[i + 2] !== 0x69 || b[i + 3] !== 0x66 || b[i + 4] !== 0 || b[i + 5] !== 0) continue
    const t = i + 6
    if ((b[t] === 0x49 && b[t + 1] === 0x49 && b[t + 2] === 0x2a && b[t + 3] === 0) || (b[t] === 0x4d && b[t + 1] === 0x4d && b[t + 2] === 0 && b[t + 3] === 0x2a)) return t
  }
  return -1
}
