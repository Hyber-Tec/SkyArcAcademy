import type { EvalSeries, Position } from '../shooting/evaluation'
import type { ShotPoint } from '../shooting/target'
import type { SheetShots } from './sheetRead'

/**
 * A position's shots as the sheet's target pictures place them (sheetRead.ts), for saving: each shot's place in the
 * values' order (null where its picture couldn't be read), and each series' group centre as printed under its picture.
 */
export interface SheetPlaces {
  points: (ShotPoint | null)[]
  centres: (ShotPoint | null)[]
}

/** The places found on a sheet, by position: its series' shots one after another (K1–K10, then K11–K20). */
export function placesByPosition(found: SheetShots): Partial<Record<Position, SheetPlaces>> {
  const out: Partial<Record<Position, SheetPlaces>> = {}
  for (const s of [...found.series].sort((a, b) => a.n - b.n)) {
    const p = (out[s.position] ??= { points: [], centres: [] })
    p.points.push(...(s.points ?? s.values.map(() => null)))
    p.centres[s.n - 1] = s.printed ?? s.placed
  }
  return out
}

/** How many of a sheet's series got their shots' places. */
export function placedSeries(found: SheetShots): { placed: number; of: number } {
  return { placed: found.series.filter((s) => s.points).length, of: found.series.length }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * One position's shots as series of ten (the sheet's), each shot with its place and direction when its picture gave
 * them, and each series with the group centre the sheet printed. Without places (they weren't found, or the shots were
 * typed), the shots keep their scores only.
 */
export function sheetSeriesOf(values: readonly number[], places?: SheetPlaces | null): EvalSeries[] {
  const at = places && places.points.length === values.length ? places.points : null
  return Array.from({ length: Math.ceil(values.length / 10) }, (_, i) => {
    const part = values.slice(i * 10, i * 10 + 10)
    const shots = part.map((v, k) => {
      const p = at?.[i * 10 + k] ?? null
      if (!p) return { v, a: null }
      const a = Math.round((((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360) * 10) / 10
      return { v, a, x: round2(p.x), y: round2(p.y) }
    })
    const c = places?.centres[i] ?? null
    return { n: i + 1, total: Math.round(part.reduce((n, v) => n + v, 0) * 10) / 10, shots, mpi: c ? { x: round2(c.x), y: round2(c.y) } : null, groupMm: null }
  })
}
