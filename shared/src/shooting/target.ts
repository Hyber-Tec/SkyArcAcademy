/**
 * The ISSF 10 m air rifle target, as SIUS results describe it. Distances are millimetres from the centre, x to the
 * right and y up.
 */

/** A shot's centre, or a mean point of impact. */
export interface ShotPoint {
  x: number
  y: number
}

/** The pellet (4.5 mm): group sizes are measured centre to centre plus one pellet. */
export const PELLET_MM = 4.5

/** Outer radius of ring 1–10: the 10 is a 0.5 mm dot and each ring is 2.5 mm wider. */
export function ringRadiusMm(ring: number): number {
  return 0.25 + (10 - ring) * 2.5
}

/** The black aiming mark: rings 4 to 10 (30.5 mm across). */
export const BLACK_RADIUS_MM = ringRadiusMm(4)

/** Inner tens: 10.2 or better, as SIUS counts them. */
export const INNER_TEN = 10.2

const round1 = (n: number) => Math.round(n * 10) / 10
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * How far a shot's centre is from the target's centre, from its decimal score (10.9 is dead centre, each tenth is
 * 0.25 mm). Null for a miss (0.0). Rebuilt this way, the samples' printed MPIs come back within 0.1 mm.
 */
export function radiusFromScore(score: number): number | null {
  if (!(score > 0)) return null
  return score >= 10.9 ? 0.125 : (10.95 - score) * 2.5
}

/** A shot's position from its score and direction (degrees: 0 right, 90 up). Null without either. */
export function shotPoint(score: number, angleDeg: number | null | undefined): ShotPoint | null {
  const r = radiusFromScore(score)
  if (r === null || angleDeg === null || angleDeg === undefined || !Number.isFinite(angleDeg)) return null
  const a = (angleDeg * Math.PI) / 180
  return { x: round2(r * Math.cos(a)), y: round2(r * Math.sin(a)) }
}

/** Mean point of impact, to 0.1 mm. */
export function meanPoint(points: readonly ShotPoint[]): ShotPoint | null {
  if (!points.length) return null
  const x = points.reduce((n, p) => n + p.x, 0) / points.length
  const y = points.reduce((n, p) => n + p.y, 0) / points.length
  return { x: round1(x), y: round1(y) }
}

/** Group size as SIUS prints it: the widest centre-to-centre distance plus a pellet; 0 for fewer than two shots. */
export function groupSizeMm(points: readonly ShotPoint[]): number | null {
  if (!points.length) return null
  if (points.length < 2) return 0
  let widest = 0
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) widest = Math.max(widest, Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y))
  }
  return round1(widest + PELLET_MM)
}

/** Whole-number score of a decimal shot (10.4 → 10, 9.9 → 9). */
export function wholeScore(value: number): number {
  return Math.floor(value + 1e-9)
}

export function isInnerTen(value: number): boolean {
  return value >= INNER_TEN - 1e-9
}

/**
 * Where a group sits, in words, when it's clearly off centre: "low left", "high", "right". Null within `withinMm` of
 * the centre on both axes (default 1.5 mm, a little over half a ring).
 */
export function offsetWords(mpi: ShotPoint | null, withinMm = 1.5): string | null {
  if (!mpi) return null
  const v = Math.abs(mpi.y) >= withinMm ? (mpi.y > 0 ? 'high' : 'low') : ''
  const h = Math.abs(mpi.x) >= withinMm ? (mpi.x > 0 ? 'right' : 'left') : ''
  const words = [v, h].filter(Boolean).join(' ')
  return words || null
}
