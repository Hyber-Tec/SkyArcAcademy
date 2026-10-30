import type { Position } from '../shooting/evaluation'
import type { ShotPoint } from '../shooting/target'
import type { RgbaImage } from '../targets/image'
import type { SheetCentre, SheetReading } from './sheet'
import { type SheetPanel, findSheetPanels, panelToPhoto, sheetLuma } from './sheetPanels'
import { assignMax, placeSheetShots } from './sheetShots'

/**
 * Each series of a results sheet on its target, from the sheet's photo once its text is read (sheet.ts): the series
 * the text lists (K1–K10, K11–K20, P1–P10…; a 60-shot or a 3×10 course the same way) are given the target pictures
 * in reading order, each shot is placed on its picture (sheetShots.ts), and a series' places are kept only when their
 * mean is the group centre printed under its picture (or, when the text has none, the one the picture draws).
 */

export interface SheetSeriesShots {
  position: Position
  /** The series within its position: 1 for K1–K10, 2 for K11–K20. */
  n: number
  /** "K1–K10", as the sheet labels the shots. */
  label: string
  values: number[]
  /**
   * Each shot's place on the target (mm from the centre, x right, y up), in the values' order; null when the picture
   * couldn't be read or its shots' mean isn't the group's centre.
   */
  points: ShotPoint[] | null
  /** How clearly the picture showed every shot, 0–1 (0 when not placed). */
  confidence: number
  /** The group's centre: as printed under the picture, as the placed shots give it, and as the picture draws it. */
  printed: ShotPoint | null
  placed: ShotPoint | null
  drawn: ShotPoint | null
}

export interface SheetShots {
  series: SheetSeriesShots[]
  /** Target pictures found on the photo; the series are given theirs only when the counts agree. */
  panels: number
  /**
   * How the printed centres were matched to the pictures: by where each is printed (under its picture, from the text
   * reader's word boxes), by the shots' own means (when there are no boxes), or not at all.
   */
  centresBy: 'place' | 'mean' | 'none'
}

/** How far a series' mean may be from its group's centre for its places to be kept (mm). */
export const CENTRE_TOLERANCE_MM = 0.3

/** Below this confidence a series' places aren't kept either: some shot sits where the picture shows almost no disc. */
export const MIN_CONFIDENCE = 0.3

const LETTER: Record<Position, string> = { kneeling: 'K', prone: 'P', standing: 'S' }

/** The series the reading lists, in the sheet's order: each position's shots in tens by their labels (11–20 the second). */
export function sheetSeries(reading: SheetReading): Pick<SheetSeriesShots, 'position' | 'n' | 'label' | 'values'>[] {
  const out: Pick<SheetSeriesShots, 'position' | 'n' | 'label' | 'values'>[] = []
  for (const p of reading.positions) {
    const numbers = p.numbers?.length === p.shots.length ? p.numbers : p.shots.map((_, i) => i + 1)
    const groups = new Map<number, { numbers: number[]; values: number[] }>()
    p.shots.forEach((v, i) => {
      const k = Math.floor((numbers[i] - 1) / 10)
      const g = groups.get(k) ?? { numbers: [], values: [] }
      g.numbers.push(numbers[i])
      g.values.push(v)
      groups.set(k, g)
    })
    for (const k of [...groups.keys()].sort((a, b) => a - b)) {
      const g = groups.get(k)!
      const letter = LETTER[p.position]
      out.push({ position: p.position, n: k + 1, label: `${letter}${g.numbers[0]}–${letter}${g.numbers[g.numbers.length - 1]}`, values: g.values })
    }
  }
  return out
}

const mean = (pts: readonly ShotPoint[]): ShotPoint => ({
  x: pts.reduce((n, q) => n + q.x, 0) / pts.length,
  y: pts.reduce((n, q) => n + q.y, 0) / pts.length,
})

/**
 * Which printed centre is each picture's, by where it is printed: the one just below the picture's centre (its
 * "Area · MOA · Center" line sits under the picture). Null when the places don't give one each, plainly: every line
 * below its picture rather than beside it, all about as far down (a photo the reader saw turned or sized differently
 * from this one would put them anywhere).
 */
function centresByPlace(panels: SheetPanel[], centres: readonly SheetCentre[]): (ShotPoint | null)[] | null {
  if (centres.length !== panels.length || centres.some((c) => !c.at)) return null
  // Each line's offset from each picture's centre: down the page (the target's −y on the photo) and across it.
  const offsets = panels.map((p) => {
    const below = panelToPhoto(p, 0, -1)
    const dx = below.x - p.x
    const dy = below.y - p.y
    const dl = Math.hypot(dx, dy)
    return centres.map((c) => {
      const ox = c.at!.x - p.x
      const oy = c.at!.y - p.y
      const down = (ox * dx + oy * dy) / dl
      return { down, across: Math.abs(-ox * dy + oy * dx) / dl }
    })
  })
  // The nearest line below each picture; a line above a picture's centre can't be its.
  const gain = offsets.map((row) => row.map((o) => (o.down > 0 ? 1e6 - Math.hypot(o.down, o.across) : 0)))
  const cols = assignMax(gain)
  if (cols.length !== panels.length || cols.some((c, i) => !(gain[i][c] > 0))) return null
  const taken = cols.map((c, i) => offsets[i][c])
  const downs = taken.map((o) => o.down).sort((a, b) => a - b)
  const median = downs[downs.length >> 1]
  if (taken.some((o) => o.across > 0.8 * o.down || Math.abs(o.down - median) > 0.4 * median)) return null
  return cols.map((c) => ({ x: centres[c].x, y: centres[c].y }))
}

/** Which printed centre is each picture's, by the shots' means: the matching that puts each mean nearest its centre. */
function centresByMean(means: (ShotPoint | null)[], centres: readonly SheetCentre[]): (ShotPoint | null)[] {
  if (!centres.length) return means.map(() => null)
  // Rows (pictures) need columns to spare: a picture with no centre of its own takes one of the "none" columns.
  const gain = means.map((m) => [
    ...centres.map((c) => (m ? Math.max(0, 5 - Math.hypot(m.x - c.x, m.y - c.y)) : 0)),
    ...means.map(() => 0),
  ])
  const cols = assignMax(gain)
  return means.map((_, i) => (cols[i] >= 0 && cols[i] < centres.length && gain[i][cols[i]] > 0 ? { x: centres[cols[i]].x, y: centres[cols[i]].y } : null))
}

/**
 * Each series of a sheet with its shots' places, from the sheet's photo and what its text said: the phone and the
 * website call it after the text is read, and show a placed series on the target with its replay.
 */
export function readSheetShots(img: RgbaImage, reading: SheetReading): SheetShots {
  const series: SheetSeriesShots[] = sheetSeries(reading).map((s) => ({ ...s, points: null, confidence: 0, printed: null, placed: null, drawn: null }))
  if (!series.length) return { series, panels: 0, centresBy: 'none' }
  const L = sheetLuma(img)
  const panels = findSheetPanels(img, L, series.length)
  if (panels.length !== series.length) return { series, panels: panels.length, centresBy: 'none' }
  const centres = reading.centres ?? []
  let printed = centresByPlace(panels, centres)
  let centresBy: SheetShots['centresBy'] = printed ? 'place' : centres.length ? 'mean' : 'none'
  // Without the centres' places, each series is placed first on its own, and the means say which centre is whose.
  const first = printed ? null : series.map((s, i) => placeSheetShots(L, panels[i], s.values))
  if (!printed) printed = centresByMean(first!.map((f) => (f ? mean(f.points) : null)), centres)
  if (centresBy === 'mean' && printed.every((c) => !c)) centresBy = 'none'
  series.forEach((s, i) => {
    const centre = printed![i]
    // A series placed already keeps its places when the printed centre can't change them: none, or the picture's own
    // axes found (they, not the printed centre, settle which disc holds two shots).
    const placed = first && (!centre || first[i]?.drawnCentre) ? first[i] : placeSheetShots(L, panels[i], s.values, centre)
    s.printed = centre
    if (!placed) return
    s.placed = mean(placed.points)
    s.drawn = placed.drawnCentre
    // The check: the shots' mean is the group's centre, as printed or else as drawn; and no shot on next to nothing.
    const against = centre ?? placed.drawnCentre
    if (!against || Math.hypot(s.placed.x - against.x, s.placed.y - against.y) > CENTRE_TOLERANCE_MM) return
    if (placed.confidence < MIN_CONFIDENCE) return
    s.points = placed.points
    s.confidence = placed.confidence
  })
  return { series, panels: panels.length, centresBy }
}
