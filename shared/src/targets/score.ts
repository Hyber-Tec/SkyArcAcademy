import { PELLET_MM, ringRadiusMm } from '../shooting/target'

/** Beyond this distance from the centre a shot's hole no longer touches ring 1: a miss (0). */
export const MISS_BEYOND_MM = ringRadiusMm(1) + PELLET_MM / 2

/**
 * A shot's score from how far its centre is from the target's centre, by ISSF's rule for paper targets: the hole (a
 * 4.5 mm pellet) touching a ring's line counts that ring. `decimal` is the electronic targets' score for the same
 * point (10.9 at the centre, a tenth less every 0.25 mm), so paper and SIUS results compare.
 */
export function scoreAt(distanceMm: number): { value: number; decimal: number } {
  if (!(distanceMm >= 0) || distanceMm > MISS_BEYOND_MM + 1e-9) return { value: 0, decimal: 0 }
  const decimal = Math.min(10.9, Math.floor((11 - distanceMm / 2.5) * 10 + 1e-6) / 10)
  return { value: Math.floor(decimal + 1e-9), decimal }
}
