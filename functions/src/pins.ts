import { createHash } from 'node:crypto'

/** Kiosk PINs are stored only as hashes, keyed per branch. */
export function pinHash(branchId: string, pin: string): string {
  return createHash('sha256').update(`skyarc-kiosk:${branchId}:${pin}`).digest('hex')
}
