import { isLinkable } from '../access/onFile'
import type { Role } from '../roles'
import type { StudentStatus } from '../types'

/**
 * Signing before using the app (docs/DECISIONS.md §31: "they have to sign first"): once the academy has a contract
 * (Settings → Enrollment contract), a parent signs it for each of their children at the academy before the rest of the
 * app opens, on the phone or the website; one parent's signature is enough for a child. A student's own login waits for
 * theirs. The rules don't need it: it's what the family sees, and the office marks contracts signed on paper.
 */

export interface GateStudent {
  id: string
  name: string
  status: StudentStatus
}

export interface ContractGate {
  /** Nothing to sign: the app opens. */
  open: boolean
  /** The family's students still without a signed contract, A to Z. */
  toSign: GateStudent[]
}

export function contractGate(input: { role: Role; hasContract: boolean; students: readonly GateStudent[]; signed: ReadonlySet<string> }): ContractGate {
  if ((input.role !== 'parent' && input.role !== 'student') || !input.hasContract) return { open: true, toSign: [] }
  const toSign = input.students.filter((s) => isLinkable(s.status) && !input.signed.has(s.id)).sort((a, b) => a.name.localeCompare(b.name))
  return { open: toSign.length === 0, toSign }
}

/** "Ava", "Ava and Leo", "Ava, Leo and Mia": first names, for the signing page's words. */
export function firstNames(names: readonly string[]): string {
  const first = names.map((n) => n.trim().split(/\s+/)[0] || n)
  return first.length < 2 ? (first[0] ?? '') : `${first.slice(0, -1).join(', ')} and ${first.at(-1)}`
}

/** The most pages the website saves as pictures for the phone (a contract has a few). */
export const PAGE_IMAGES_MAX = 40
/** How wide each page's picture is, in pixels: sharp on a phone, zoomed in. */
export const PAGE_IMAGE_WIDTH = 1400

/** Where the website saves the contract's page `n` (from 1) as a picture, beside its PDF (storage.rules). */
export const templatePagePath = (branchId: string, templateId: string, n: number): string => `branches/${branchId}/contracts/templates/${templateId}-p${n}.jpg`
