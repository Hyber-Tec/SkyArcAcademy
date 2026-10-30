import { describe, expect, it } from 'vitest'
import type { ShotPoint } from '../shooting/target'
import { scoreAt } from '../targets/score'
import { type SheetWord, printedCentres, readSheetText } from './sheet'
import { findSheetPanels, sheetLuma } from './sheetPanels'
import { readSheetShots, sheetSeries } from './sheetRead'
import { assignMax, placeSheetShots, scoreDistanceMm } from './sheetShots'
import { type SyntheticSheet, drawSyntheticSheet } from './sheetSynthetic'

// Made-up series (mm from the target's centre), drawn on made-up sheets; never a real sheet or shooter.
const P = (x: number, y: number): ShotPoint => ({ x, y })
const SERIES: ShotPoint[][] = [
  // A loose group, a few discs overlapping.
  [P(4.1, -1.2), P(-2.5, 3.3), P(6.8, 2.0), P(-5.9, -4.1), P(1.2, 7.4), P(3.3, -6.2), P(-7.7, 1.5), P(0.4, -2.9), P(8.9, -3.8), P(-3.6, -8.1)],
  // A tight group, drawn large, with two shots in one hole.
  [P(0.6, 1.1), P(-1.4, 0.3), P(1.9, -0.8), P(-0.7, -1.6), P(2.6, 1.9), P(-2.2, 2.1), P(0.6, 1.1), P(1.1, -2.4), P(-2.9, -0.9), P(0.2, 3.1)],
  // One shot far out (a 3.x), so the whole target shows.
  [P(2.0, 1.0), P(-12.5, 15.0), P(5.5, -4.0), P(-3.0, -2.5), P(7.0, 6.0), P(-6.0, 4.5), P(1.5, -8.0), P(9.5, -1.0), P(-1.0, 6.5), P(4.0, 3.5)],
  // A miss (0.0): outside ring 1.
  [P(3.0, -2.0), P(-4.5, 1.5), P(18.4, 18.4), P(6.0, 5.0), P(-8.0, -6.5), P(1.0, 9.0), P(-2.0, -10.5), P(11.0, -4.0), P(-12.0, 3.0), P(5.5, -7.5)],
]
/** Each shot's decimal score, as electronic targets count it from where it is. */
const VALUES = SERIES.map((s) => s.map((p) => scoreAt(Math.hypot(p.x, p.y)).decimal))
const SHEET: SyntheticSheet = { width: 1100, height: 1430, series: SERIES, turnDeg: 2, tilt: { x: 0.0004, y: -0.0006 }, seed: 5 }

const round2 = (n: number) => Math.round(n * 100) / 100
const meanOf = (pts: ShotPoint[]) => ({ x: round2(pts.reduce((n, p) => n + p.x, 0) / pts.length), y: round2(pts.reduce((n, p) => n + p.y, 0) / pts.length) })

/**
 * How far each placed shot is from where it really is. Shots of the same score can't be told apart on a picture (which
 * was fired first isn't drawn), so within each score the placed ones are matched to the real ones first.
 */
function errors(placed: ShotPoint[], real: ShotPoint[], values: number[]): number[] {
  const out: number[] = []
  for (const v of new Set(values)) {
    const idx = values.flatMap((w, i) => (w === v ? [i] : []))
    const cols = assignMax(idx.map((i) => idx.map((j) => 100 - Math.hypot(placed[i].x - real[j].x, placed[i].y - real[j].y))))
    idx.forEach((i, k) => out.push(Math.hypot(placed[i].x - real[idx[cols[k]]].x, placed[i].y - real[idx[cols[k]]].y)))
  }
  return out
}

/** The sheet's text as a reader returns it: two positions of twenty, and the centres in another order than the series'. */
function sheetText(centres: ShotPoint[], order = [0, 2, 1, 3]): string {
  const shot = (letter: string, n: number, v: number) => `${letter}${n} ${v.toFixed(1)}${v >= 10.2 ? '*' : ''}`
  return [
    'Rowan, Avery',
    'Lakeside Fall 2P | Sat, 12 Sep 2026',
    'Course of Fire: 2x20 Air Rifle',
    ...VALUES[0].map((v, i) => shot('K', i + 1, v)),
    ...VALUES[1].map((v, i) => shot('K', i + 11, v)),
    ...VALUES[2].map((v, i) => shot('P', i + 1, v)),
    ...VALUES[3].map((v, i) => shot('P', i + 11, v)),
    ...order.map((k) => `MOA: 2.10 Center: (${centres[k].x.toFixed(2)}mm, ${centres[k].y.toFixed(2)}mm)`),
  ].join('\n')
}

/** A reader's words for the centre lines, placed where the made-up sheet prints them. */
function centreWords(centres: ShotPoint[], at: { x: number; y: number }[], order = [0, 2, 1, 3]): SheetWord[] {
  return order.flatMap((k) => [
    { text: 'Center:', x: at[k].x - 30, y: at[k].y },
    { text: `(${centres[k].x.toFixed(2)}mm,`, x: at[k].x, y: at[k].y },
    { text: `${centres[k].y.toFixed(2)}mm)`, x: at[k].x + 30, y: at[k].y },
  ])
}

describe('scores and distances', () => {
  it('puts a decimal score at the middle of its quarter-millimetre band', () => {
    expect(scoreDistanceMm(10.9)).toBe(0.125)
    expect(scoreDistanceMm(10.0)).toBeCloseTo(2.375, 9)
    expect(scoreDistanceMm(1.0)).toBeCloseTo(24.875, 9)
    expect(scoreDistanceMm(0)).toBeNull()
    for (let d = 0.05; d < 24.8; d += 0.37) expect(Math.abs(scoreDistanceMm(scoreAt(d).decimal)! - d)).toBeLessThanOrEqual(0.125 + 1e-9)
  })

  it('assigns rows to columns for the largest total', () => {
    expect(assignMax([[1, 5, 2], [4, 6, 0]])).toEqual([1, 0])
    expect(assignMax([[3, 1], [3, 2]])).toEqual([0, 1])
  })
})

describe('reading the printed group centres', () => {
  it('reads them in the text’s order, with their places from the reader’s words', () => {
    const centres = [P(3.12, -1.47), P(-0.58, 2.06)]
    const text = 'MOA: 2.91 Center: (3.12mm, -1.47mm).\nArea: 1.2\nMOA: 3.66 Center: (−0.58mm, 2.06mm)'
    expect(printedCentres(text)).toEqual(centres.map((c) => ({ ...c, at: null })))
    const words: SheetWord[] = [
      { text: 'Center', x: 1010, y: 1350 },
      { text: ':', x: 1020, y: 1350 },
      { text: '(', x: 1025, y: 1350 },
      { text: '-0.58mm', x: 1050, y: 1350 },
      { text: ',', x: 1070, y: 1350 },
      { text: '2.06mm', x: 1090, y: 1350 },
      { text: 'Center:', x: 420, y: 610 },
      { text: '(3.12mm,', x: 450, y: 610 },
      { text: '-1.47mm)', x: 480, y: 610 },
    ]
    expect(printedCentres(text, words)).toEqual([
      { x: 3.12, y: -1.47, at: { x: 420, y: 610 } },
      { x: -0.58, y: 2.06, at: { x: 1010, y: 1350 } },
    ])
  })

  it('keeps every shot’s label number, and splits positions into series of ten by them', () => {
    const r = readSheetText(sheetText(SERIES.map(meanOf)))
    expect(r.positions.map((p) => [p.position, p.numbers[0], p.numbers[19]])).toEqual([
      ['kneeling', 1, 20],
      ['prone', 1, 20],
    ])
    expect(sheetSeries(r).map((s) => [s.label, s.values.length])).toEqual([
      ['K1–K10', 10],
      ['K11–K20', 10],
      ['P1–P10', 10],
      ['P11–P20', 10],
    ])
    // A series one shot short (the sheet printed P11–P19) stays its own.
    const short = readSheetText(['P1 9.5', 'P2 9.8', 'P11 9.1', 'P12 8.8', 'P13 10.1'].join('\n'))
    expect(sheetSeries(short).map((s) => s.label)).toEqual(['P1–P2', 'P11–P13'])
  })
})

describe('finding the shots on a photo of a made-up sheet', () => {
  const photo = drawSyntheticSheet(SHEET)
  const L = sheetLuma(photo.image)

  it('finds each target picture in reading order, its centre to a pixel', () => {
    const panels = findSheetPanels(photo.image, L)
    expect(panels).toHaveLength(4)
    panels.forEach((p, k) => expect(Math.hypot(p.x - photo.centres[k].x, p.y - photo.centres[k].y), `picture ${k + 1}`).toBeLessThan(1))
  })

  it('places every shot within half a millimetre: a miss outside the rings, two shots in one hole', () => {
    const panels = findSheetPanels(photo.image, L)
    panels.forEach((p, k) => {
      const placed = placeSheetShots(L, p, VALUES[k])
      expect(placed, `series ${k + 1}`).not.toBeNull()
      expect(Math.max(...errors(placed!.points, SERIES[k], VALUES[k])), `series ${k + 1}`).toBeLessThan(0.5)
      // The picture's own axes cross at the group's centre.
      const m = meanOf(SERIES[k])
      if (placed!.drawnCentre) expect(Math.hypot(placed!.drawnCentre.x - m.x, placed!.drawnCentre.y - m.y)).toBeLessThan(0.15)
    })
  })

  it('reads the whole sheet: the printed centres matched by where they are printed, or else by the shots’ means', () => {
    const centres = SERIES.map(meanOf)
    const byPlace = readSheetShots(photo.image, readSheetText(sheetText(centres), centreWords(centres, photo.centreWords)))
    expect(byPlace.centresBy).toBe('place')
    const byMean = readSheetShots(photo.image, readSheetText(sheetText(centres)))
    expect(byMean.centresBy).toBe('mean')
    for (const out of [byPlace, byMean]) {
      expect(out.series.map((s) => s.label)).toEqual(['K1–K10', 'K11–K20', 'P1–P10', 'P11–P20'])
      out.series.forEach((s, k) => {
        expect(s.printed).toEqual(centres[k])
        expect(s.points, s.label).not.toBeNull()
        expect(Math.max(...errors(s.points!, SERIES[k], VALUES[k])), s.label).toBeLessThan(0.5)
      })
    }
  })

  it('refuses a series whose shots don’t come out at its printed centre', () => {
    const centres = SERIES.map(meanOf)
    const wrong = centres.map((c, k) => (k === 1 ? { x: c.x + 0.8, y: c.y - 0.6 } : c))
    const out = readSheetShots(photo.image, readSheetText(sheetText(wrong), centreWords(wrong, photo.centreWords)))
    expect(out.series.map((s) => s.points !== null)).toEqual([true, false, true, true])
  })
})

describe('a picture with no shots drawn', () => {
  it('gives no places for it, and still places the others', () => {
    const photo = drawSyntheticSheet({ ...SHEET, blank: [2], turnDeg: -1.5, tilt: { x: -0.0003, y: 0.0004 }, seed: 9 })
    const L = sheetLuma(photo.image)
    const panels = findSheetPanels(photo.image, L)
    expect(panels).toHaveLength(4)
    expect(placeSheetShots(L, panels[2], VALUES[2])).toBeNull()
    const centres = SERIES.map(meanOf)
    const out = readSheetShots(photo.image, readSheetText(sheetText(centres), centreWords(centres, photo.centreWords)))
    expect(out.series.map((s) => s.points !== null)).toEqual([true, true, false, true])
  })
})
