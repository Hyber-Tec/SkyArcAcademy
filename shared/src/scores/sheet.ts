import type { Position } from '../shooting/evaluation'
import { wholeScore } from '../shooting/target'
import type { DateKey } from '../time'

/**
 * A match's results sheet, read from the text of its photo or PDF (Google's text reader on the server, the manager's
 * second meeting, docs/DECISIONS.md §23): the shooter, the match, the date, the course of fire, the qualification total
 * with its inner tens ("478 - 13"), and each shot when the sheet lists them ("K1 7.2", "S12 10.4*", the star marking an
 * inner ten), grouped by position (K kneeling, P prone, S standing). What isn't found is left empty for the admin to
 * type: the reader suggests, the admin checks before anything is saved. Made-up sheets in the tests; never a real one.
 */

export interface SheetPosition {
  position: Position
  /** Each shot's score, in the sheet's order. */
  shots: number[]
  /** Shots marked as inner tens. */
  innerTens: number
  /** Whole-number total (each shot rounded down) and decimal total. */
  wholeTotal: number
  decimalTotal: number
}

export interface SheetReading {
  /** "Ian Lee", from "Lee, Ian". */
  name: string
  match: string
  course: string
  dateKey: DateKey | null
  /** The qualification as printed: its total, and its inner tens when printed ("478 - 13"). */
  total: number | null
  innerTens: number | null
  /** Decimal scoring ("587.4"), or whole numbers ("478"). */
  decimal: boolean
  positions: SheetPosition[]
  /** The shots found add up to the printed total. */
  consistent: boolean
  /** Shots each position should have, from the course of fire ("3x20" → 20, "60 Shots" → 60); null when it doesn't say. */
  perPosition: number | null
}

/** Shots a position has in a course of fire: "3x20 Air Rifle" → 20, "60 Shots Air Rifle" → 60. */
export function shotsPerPosition(course: string): number | null {
  const each = /(\d+)\s*[x×]\s*(\d+)/i.exec(course)
  if (each) return Number(each[2])
  const all = /(\d+)\s*shots?/i.exec(course)
  return all ? Number(all[1]) : null
}

const LETTER: Record<string, Position> = { K: 'kneeling', P: 'prone', S: 'standing' }
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const round1 = (n: number) => Math.round(n * 10) / 10

/** "22 Aug 2026", "Aug 22, 2026" or "8/22/2026" → "2026-08-22". */
export function sheetDate(text: string): DateKey | null {
  const pad = (n: number) => String(n).padStart(2, '0')
  const dm = /\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})\b/.exec(text)
  if (dm) {
    const m = MONTHS.indexOf(dm[2].toLowerCase())
    if (m >= 0) return `${dm[3]}-${pad(m + 1)}-${pad(Number(dm[1]))}`
  }
  const md = /\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(text)
  if (md) {
    const m = MONTHS.indexOf(md[1].toLowerCase())
    if (m >= 0) return `${md[3]}-${pad(m + 1)}-${pad(Number(md[2]))}`
  }
  const us = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(text)
  if (us) return `${us[3]}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`
  return null
}

export function readSheetText(text: string): SheetReading {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const qual = /qualification\s*:?\s*(\d{2,4}(?:[.,]\d)?)(?:\s*[-–]\s*(\d{1,3})\s*x?)?/i.exec(text)
  const total = qual ? Number(qual[1].replace(',', '.')) : null
  const innerTens = qual?.[2] ? Number(qual[2]) : null
  const decimal = !!qual && /[.,]\d/.test(qual[1])

  // "Lee, Ian": the first line that is a surname, a comma and a first name.
  const nameLine = lines.find((l) => /^[A-Z][A-Za-z'’-]+(?: [A-Z][A-Za-z'’-]+)?,\s*[A-Z][A-Za-z'’-]+(?: [A-Z][A-Za-z'’-]+)?$/.test(l))
  const name = nameLine ? nameLine.split(',').map((p) => p.trim()).reverse().join(' ') : ''

  // "Walton August 3P | Sat, 22 Aug 2026": the match, then its date.
  const matchLine = lines.find((l) => /\|/.test(l) && sheetDate(l))
  const match = matchLine ? matchLine.split('|')[0].trim() : ''
  const dateKey = sheetDate(matchLine ?? text)
  const course = /course of fire\s*:?\s*(.+)/i.exec(text)?.[1]?.split(/\r?\n/)[0].trim() ?? ''

  // Each shot: a label (K1, P12, S60) and its score ("10.2*" an inner ten), on the same line or the next. A sheet's two
  // columns can come out interleaved ("K8 K18 4.4 7.9"): scores go to the labels waiting, in order. Anything else
  // (a total, a heading) ends the wait, so a score is never given to a label far from it.
  const tokens = text.split(/\s+/).filter(Boolean)
  const shots = new Map<Position, { n: number; v: number; x: boolean }[]>()
  const waiting: { pos: Position; n: number }[] = []
  for (const token of tokens) {
    const label = /^([KPS])(\d{1,2})$/.exec(token)
    if (label) {
      waiting.push({ pos: LETTER[label[1]], n: Number(label[2]) })
      continue
    }
    const value = /^(\d{1,2}[.,]\d)(\*?)$/.exec(token)
    const next = waiting.shift()
    if (!value || !next) {
      waiting.length = 0
      continue
    }
    const v = Number(value[1].replace(',', '.'))
    if (v > 10.9) continue
    const list = shots.get(next.pos) ?? []
    // The same shot read twice (a sheet's two columns overlapping in the text) counts once.
    if (!list.some((s) => s.n === next.n)) list.push({ n: next.n, v, x: value[2] === '*' })
    shots.set(next.pos, list)
  }
  const positions: SheetPosition[] = [...shots.entries()].map(([position, list]) => {
    const sorted = [...list].sort((a, b) => a.n - b.n)
    return {
      position,
      shots: sorted.map((s) => s.v),
      innerTens: sorted.filter((s) => s.x).length,
      wholeTotal: sorted.reduce((n, s) => n + wholeScore(s.v), 0),
      decimalTotal: round1(sorted.reduce((n, s) => n + s.v, 0)),
    }
  })
  const order: Position[] = ['kneeling', 'prone', 'standing']
  positions.sort((a, b) => order.indexOf(a.position) - order.indexOf(b.position))
  const sum = decimal ? round1(positions.reduce((n, p) => n + p.decimalTotal, 0)) : positions.reduce((n, p) => n + p.wholeTotal, 0)
  const tens = positions.reduce((n, p) => n + p.innerTens, 0)
  const consistent = positions.length > 0 && total !== null && Math.abs(sum - total) < 0.05 && (decimal || innerTens === null || tens === innerTens)
  return { name, match, course, dateKey, total, innerTens, decimal, positions, consistent, perPosition: shotsPerPosition(course) }
}
