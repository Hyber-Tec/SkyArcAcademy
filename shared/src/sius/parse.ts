import { type EvalSeries, type EvalShot, shotGroup, shotTotals } from '../shooting/evaluation'
import { type ShotPoint, groupSizeMm, meanPoint, shotPoint } from '../shooting/target'
import { type DateKey, dateKeyOf, makeDateKey, minutesOf, toInstant, tzOffsetMinutes } from '../time'

/**
 * Reading a SIUS "Results" PDF (printed from the SIUS software through "Microsoft: Print To PDF"). The page has a real
 * text layer: the program and time, the totals, then one block per series with its shots in firing order, each shot
 * followed by a small arrow image showing its direction. Nothing on the page names the position, nor the shooter unless
 * the lane was given a name (the academy can set it, A6; no sample shows where it prints yet).
 *
 * The PDF is opened where it is (pdf.js, in the browser or a script) and handed here as positioned text and image
 * paints, so this file stays pure and testable. Text order in a PDF is not reading order: rows are rebuilt from the
 * baselines, and each label is paired with the value to its right.
 */

/** A run of text: its string, baseline position (points, from the bottom-left), width and font. */
export interface PdfTextItem {
  str: string
  x: number
  y: number
  w: number
  font: string
}

/** An image drawn on the page: its pixel size and where its bottom-left corner landed (points). */
export interface PdfImagePaint {
  id: string
  pw: number
  ph: number
  x: number
  y: number
}

export interface SiusPage {
  items: PdfTextItem[]
  images: PdfImagePaint[]
  /** The direction of each small arrow image, by image ID (sius/arrow.ts). */
  arrowAngles: Record<string, number | null>
  /** The PDF's CreationDate, e.g. `D:20261007152941-07'00'`: its offset is the SIUS computer's time zone. */
  creationDate: string | null
}

export interface SiusShot {
  v: number
  /** Direction in degrees (0 right, 90 up), from its arrow. */
  a: number | null
  /**
   * Whether SIUS printed an arrow after it. A 0.0 without one isn't a shot: one of the range's target sensors records
   * 0.0 for shots that aren't (the academy, A9).
   */
  arrow: boolean
}

export interface SiusSeries {
  n: number
  /** `Series 1P:` — sighters: not counted, unless the result has no match shots (then they're the shots, A8). */
  sighter: boolean
  total: number | null
  mpi: ShotPoint | null
  groupMm: number | null
  shots: SiusShot[]
}

/** What the page says, as printed. */
export interface SiusResult {
  /** The SIUS program, e.g. "Air Rifle 60" (the same for every position). */
  event: string
  /** The result's time as printed by the SIUS computer, e.g. "10/7/2026 6:35:59 PM". */
  printed: string
  /** That time read as a wall clock on the SIUS computer. */
  printedAt: { dateKey: DateKey; minutes: number; seconds: number }
  /** The SIUS computer's UTC offset in minutes (e.g. −420), from the PDF's creation date; null when absent. */
  pcOffsetMin: number | null
  total: number | null
  innerTens: number | null
  seriesTotals: number[] | null
  mpi: ShotPoint | null
  groupMm: number | null
  series: SiusSeries[]
}

const RE = {
  date: /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2}):(\d{2})(?: ?(AM|PM))?$/i,
  series: /^Series (\d+)(P?):$/,
  shot: /^\d{1,2}\.\d$/,
  mpi: /^X: (-?\d+(?:\.\d+)?) mm; Y: (-?\d+(?:\.\d+)?) mm$/,
  group: /^Ø: (\d+(?:\.\d+)?) mm$/,
  number: /^-?\d+(?:\.\d+)?$/,
  creation: /^(?:D:)?(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?(?:(Z)|([+-])(\d{2})'?(\d{2})?'?)?/,
}

/** Two baselines this close are one row (points). */
const ROW_TOL = 2
/** How close an arrow image sits to the end of its shot's text (points). */
const ARROW_TOL = 2.5

const num = (s: string | null | undefined): number | null => (s && RE.number.test(s.trim()) ? Number(s.trim()) : null)

function parseMpi(s: string | null): ShotPoint | null {
  const m = s?.match(RE.mpi)
  return m ? { x: Number(m[1]), y: Number(m[2]) } : null
}

function parseGroup(s: string | null): number | null {
  const m = s?.match(RE.group)
  return m ? Number(m[1]) : null
}

/** The UTC offset in minutes of a PDF date string (`D:…-07'00'` → −420); null without one. */
export function pdfDateOffsetMinutes(value: string | null | undefined): number | null {
  const m = value?.trim().match(RE.creation)
  if (!m) return null
  if (m[7] === 'Z') return 0
  if (!m[8]) return null
  const minutes = Number(m[9]) * 60 + Number(m[10] ?? 0)
  return m[8] === '-' ? -minutes : minutes
}

/** Reads one SIUS Results page; null when the page isn't one. */
export function parseSiusPage(page: SiusPage): SiusResult | null {
  const items = page.items.map((i) => ({ ...i, s: i.str.trim() })).filter((i) => i.s)
  const title = items.find((i) => i.s === 'Results')
  const dateItem = items.find((i) => RE.date.test(i.s))
  const totalLabel = items.find((i) => i.s === 'Total:')
  if (!title || !dateItem || !totalLabel) return null
  const bold = title.font
  type Item = (typeof items)[number]
  const sameRow = (a: Item, b: Item) => Math.abs(a.y - b.y) <= ROW_TOL
  const rightOf = (label: Item, pool: Item[]) =>
    pool.filter((i) => i !== label && sameRow(i, label) && i.x > label.x + label.w - 0.5).sort((a, b) => a.x - b.x)[0] ?? null
  const valueOf = (text: string, pool: Item[]) => {
    const label = pool.find((i) => i.s === text)
    return label ? (rightOf(label, pool)?.s ?? null) : null
  }

  const [, mo, d, yr, h, mi, se, ap] = dateItem.s.match(RE.date)!
  const hour = ap ? (Number(h) % 12) + (ap.toUpperCase() === 'PM' ? 12 : 0) : Number(h)
  const event = items.filter((i) => i !== dateItem && sameRow(i, dateItem) && i.x < dateItem.x).sort((a, b) => a.x - b.x)[0]?.s ?? ''

  const labels = items.filter((i) => RE.series.test(i.s)).sort((a, b) => b.y - a.y)
  const firstSeriesY = labels.length ? labels[0].y : -Infinity
  const summary = items.filter((i) => i.y > firstSeriesY + ROW_TOL && i.y < dateItem.y - ROW_TOL)

  const arrows = page.images.filter((im) => im.pw <= 32 && im.ph <= 32 && Math.abs(im.pw - im.ph) <= 2)
  const series: SiusSeries[] = labels.map((label, k) => {
    const nextY = k + 1 < labels.length ? labels[k + 1].y : -Infinity
    const block = items.filter((i) => i.y <= label.y + ROW_TOL && i.y > nextY + ROW_TOL)
    const totalRow = block.find((i) => i.s === 'Series total:')
    const shotItems = block
      .filter((i) => i.font === bold && RE.shot.test(i.s) && i.x > label.x + label.w && (!totalRow || i.y > totalRow.y + ROW_TOL))
      .sort((a, b) => (Math.abs(a.y - b.y) > ROW_TOL ? b.y - a.y : a.x - b.x))
    const shots = shotItems.map((it): SiusShot => {
      const img = arrows.find((a) => Math.abs(a.x - (it.x + it.w)) < ARROW_TOL && Math.abs(a.y - it.y) < ARROW_TOL)
      return { v: Number(it.s), a: img ? (page.arrowAngles[img.id] ?? null) : null, arrow: !!img }
    })
    const [, n, p] = label.s.match(RE.series)!
    return {
      n: Number(n),
      sighter: p === 'P',
      total: num(valueOf('Series total:', block)),
      mpi: parseMpi(valueOf('MPI:', block)),
      groupMm: parseGroup(valueOf('Group size:', block)),
      shots,
    }
  })

  const totalsText = valueOf('Series totals:', summary)
  return {
    event,
    printed: dateItem.s,
    printedAt: { dateKey: makeDateKey(Number(yr), Number(mo), Number(d)), minutes: hour * 60 + Number(mi), seconds: Number(se) },
    pcOffsetMin: pdfDateOffsetMinutes(page.creationDate),
    total: num(valueOf('Total:', summary)),
    innerTens: num(valueOf('Inner tens:', summary)),
    seriesTotals: totalsText ? totalsText.split(/\s+/).map(Number).filter((v) => Number.isFinite(v)) : null,
    mpi: parseMpi(valueOf('MPI:', summary)),
    groupMm: parseGroup(valueOf('Group size:', summary)),
    series,
  }
}

/** A result made ready to save: when it was shot (academy time), the counted shots and what to check. */
export interface SiusReading {
  event: string
  printed: string
  dateKey: DateKey
  timeMin: number
  /** When it was shot, in milliseconds since 1970. */
  instantMs: number
  /** Minutes added to the printed time to reach the academy's time (180 when the SIUS computer is on Pacific time). */
  clockFixMin: number
  /**
   * Shots counted: the match shots (sighters and arrowless 0.0 entries excluded), or the sighters when there are no
   * match shots (`fromSighters`).
   */
  shots: number
  total: number
  wholeTotal: number
  innerTens: number
  mpi: ShotPoint | null
  groupMm: number | null
  /** The series counted, with their shots. */
  series: EvalSeries[]
  /** Sighters left out (none when they are the shots). */
  sighters: number
  /**
   * The shots are the sighters: the session was shot without switching to match mode, so SIUS printed sighters only
   * (Total 0). The academy counts it as an evaluation all the same (A8).
   */
  fromSighters: boolean
  /** Nothing to score (no shots at all): the file is kept without scores. */
  noShots: boolean
  /** Checks that failed: the result should be looked at before it's saved. */
  problems: string[]
  /** Worth knowing, not wrong. */
  notes: string[]
}

const round1 = (n: number) => Math.round(n * 10) / 10
const close = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol

function offsetLabel(min: number): string {
  const sign = min < 0 ? '−' : '+'
  const abs = Math.abs(min)
  return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, '0')}` : ''}`
}

/**
 * Turns a parsed result into what the app keeps. The printed time is the SIUS computer's clock; the PDF's creation
 * date says which time zone that computer is set to, so the time is moved into the academy's zone (one of the
 * academy's computers is set to Pacific time, academy question A7). Every check from the SIUS samples runs here.
 */
export function readSiusResult(result: SiusResult, timezone: string): SiusReading {
  const { printedAt } = result
  const wall = toInstant(printedAt.dateKey, printedAt.minutes, timezone).getTime() + printedAt.seconds * 1000
  let instantMs = wall
  if (result.pcOffsetMin !== null) {
    const [y, m, d] = printedAt.dateKey.split('-').map(Number)
    instantMs = Date.UTC(y, m - 1, d, 0, printedAt.minutes, printedAt.seconds) - result.pcOffsetMin * 60_000
  }
  const academyOffset = tzOffsetMinutes(instantMs, timezone)
  const clockFixMin = result.pcOffsetMin === null ? 0 : academyOffset - result.pcOffsetMin

  const problems: string[] = []
  const notes: string[] = []
  const counts = (s: SiusSeries) => s.shots.some((t) => t.arrow)
  // A session shot without switching to match mode holds sighters only (Total 0): the academy counts them (A8).
  const fromSighters = !result.series.some((s) => !s.sighter && counts(s)) && result.series.some((s) => s.sighter && counts(s))
  const scored = result.series.filter((s) => s.sighter === fromSighters)
  const sighterShots = fromSighters ? [] : result.series.filter((s) => s.sighter).flatMap((s) => s.shots.filter((t) => t.arrow))
  // The page's own totals, MPI and group are the match's: with sighters only they read 0, so they aren't compared.
  const printedStats = !fromSighters

  for (const s of result.series) {
    const counted = s.shots.filter((t) => t.arrow)
    const sum = round1(counted.reduce((n, t) => n + t.v, 0))
    const label = `Series ${s.n}${s.sighter ? 'P' : ''}`
    if (s.total !== null && !close(sum, s.total)) problems.push(`${label} adds up to ${sum.toFixed(1)}, not the printed ${s.total.toFixed(1)}.`)
    const odd = s.shots.filter((t) => !t.arrow && t.v > 0)
    if (odd.length) problems.push(`${label} has ${odd.length === 1 ? 'a shot' : `${odd.length} shots`} without a direction arrow.`)
    const missingAngle = counted.filter((t) => t.v > 0 && t.a === null)
    if (missingAngle.length) problems.push(`${label}: ${missingAngle.length === 1 ? 'one arrow' : `${missingAngle.length} arrows`} couldn't be read.`)
  }

  const series: EvalSeries[] = scored.map((s, i) => {
    const shots: EvalShot[] = s.shots.filter((t) => t.arrow).map((t) => ({ v: t.v, a: t.a }))
    const group = shotGroup(shots)
    return { n: fromSighters ? i + 1 : s.n, total: s.total ?? shotTotals(shots).total, shots, mpi: s.mpi ?? group.mpi, groupMm: s.groupMm ?? group.groupMm }
  })
  const shots = series.flatMap((s) => s.shots)
  const totals = shotTotals(shots)
  const seriesSum = round1(series.reduce((n, s) => n + s.total, 0))
  if (printedStats && result.total !== null && shots.length && !close(seriesSum, result.total)) {
    problems.push(`The series add up to ${seriesSum.toFixed(1)}, not the printed total ${result.total.toFixed(1)}.`)
  }
  if (printedStats && result.innerTens !== null && shots.length && totals.innerTens !== result.innerTens) {
    problems.push(`Counted ${totals.innerTens} inner tens; the result says ${result.innerTens}.`)
  }
  if (printedStats && result.seriesTotals && shots.length) {
    const printed = result.seriesTotals.filter((v, i, all) => !(v === 0 && i === all.length - 1))
    if (printed.length !== series.length || printed.some((v, i) => !close(v, series[i].total))) {
      problems.push('The series totals line doesn’t match the series.')
    }
  }
  const points = shots.map((t) => shotPoint(t.v, t.a)).filter((p): p is ShotPoint => p !== null)
  const rebuilt = meanPoint(points)
  if (printedStats && result.mpi && rebuilt && points.length >= 2 && Math.hypot(rebuilt.x - result.mpi.x, rebuilt.y - result.mpi.y) > 0.5) {
    problems.push('The shot directions don’t match the printed MPI, so the target picture may be off.')
  }

  const arrowless = result.series.flatMap((s) => s.shots.filter((t) => !t.arrow && t.v === 0))
  if (arrowless.length) notes.push(arrowless.length === 1 ? 'One 0.0 entry without a direction wasn’t counted as a shot.' : `${arrowless.length} entries of 0.0 without a direction weren’t counted as shots.`)
  if (fromSighters) notes.push(`Shot without switching to match mode: its ${shots.length === 1 ? 'one sighter is counted' : `${shots.length} sighters are counted`} as the session's shots.`)
  else if (shots.length && shots.length !== 20 && shots.length % 10 !== 0) notes.push(`${shots.length} match shots, all counted.`)
  if (clockFixMin) {
    const hours = Math.abs(clockFixMin) / 60
    notes.push(`The SIUS computer's clock is on ${offsetLabel(result.pcOffsetMin ?? 0)}: the time was moved ${Number.isInteger(hours) ? hours : hours.toFixed(1)} ${hours === 1 ? 'hour' : 'hours'} ${clockFixMin > 0 ? 'later' : 'earlier'}.`)
  }
  const noShots = shots.length === 0
  if (noShots) notes.push('No shots: the file is kept without scores.')

  return {
    event: result.event,
    printed: result.printed,
    dateKey: dateKeyOf(instantMs, timezone),
    timeMin: minutesOf(instantMs, timezone),
    instantMs,
    clockFixMin,
    shots: shots.length,
    total: printedStats && result.total !== null && shots.length ? result.total : totals.total,
    wholeTotal: totals.wholeTotal,
    innerTens: printedStats ? (result.innerTens ?? totals.innerTens) : totals.innerTens,
    mpi: printedStats && result.mpi && shots.length ? result.mpi : meanPoint(points),
    groupMm: printedStats && result.groupMm !== null && shots.length ? result.groupMm : groupSizeMm(points),
    series,
    sighters: sighterShots.length,
    fromSighters,
    noShots,
    problems,
    notes,
  }
}

/** Words in a SIUS file name that name the position ("Prone", "standing", "kneel…"). */
export function positionFromName(name: string): 'standing' | 'kneeling' | 'prone' | null {
  const n = name.toLowerCase()
  if (/\bprone\b/.test(n)) return 'prone'
  if (/\bkneel/.test(n)) return 'kneeling'
  if (/\bstand/.test(n)) return 'standing'
  return null
}
