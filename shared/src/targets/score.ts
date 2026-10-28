import { PELLET_MM, ringRadiusMm } from '../shooting/target'

/** The pellet's radius: the size ISSF's gauge gives a hole, and the one a hole is taken at when it can't be measured. */
export const PELLET_RADIUS_MM = PELLET_MM / 2

/** Beyond this distance from the centre a pellet's hole no longer touches ring 1: a miss (0). */
export const MISS_BEYOND_MM = ringRadiusMm(1) + PELLET_RADIUS_MM

/**
 * A paper card's shot, scored by the matches' rule applied to the hole as the card shows it (docs/DECISIONS.md §23,
 * P1): the hole touching a ring's line counts that ring, its edge being `holeRadiusMm` from its centre. A 4.5 mm
 * pellet tears a hole a little smaller than itself, so it's measured on each card (holes.ts), not assumed.
 *
 * `decimal` is the same rule in tenths, as electronic targets count: 10.9 at the centre and a tenth less every
 * 0.25 mm, here of how far the hole's edge is from the centre, so its whole part is always `value`. With the pellet's
 * radius it is exactly the electronic score for that point (`scoreAt`).
 */
export function scoreHole(distanceMm: number, holeRadiusMm: number = PELLET_RADIUS_MM): { value: number; decimal: number } {
  // Where a pellet-sized hole with the same edge would sit (the distance itself for a pellet-sized hole).
  const shifted = distanceMm + (PELLET_RADIUS_MM - holeRadiusMm)
  if (!(distanceMm >= 0) || !(holeRadiusMm > 0) || shifted > MISS_BEYOND_MM + 1e-9) return { value: 0, decimal: 0 }
  const decimal = Math.min(10.9, Math.floor((11 - shifted / 2.5) * 10 + 1e-6) / 10)
  return { value: Math.floor(decimal + 1e-9), decimal }
}

/**
 * A shot's score from how far its centre is from the target's centre, by ISSF's rule for a 4.5 mm pellet: the
 * electronic targets' decimal and its whole part. SIUS results and the sample data use it; a scanned card's holes use
 * `scoreHole` with their own size.
 */
export function scoreAt(distanceMm: number): { value: number; decimal: number } {
  return scoreHole(distanceMm, PELLET_RADIUS_MM)
}
