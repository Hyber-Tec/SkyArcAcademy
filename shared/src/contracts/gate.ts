import { isLinkable } from '../access/onFile'
import type { Lang } from '../i18n'
import type { Role } from '../roles'
import type { StudentStatus } from '../types'

/**
 * Signing before using the app (docs/DECISIONS.md §31: "they have to sign first", and §34): once the office has sent a
 * student's contract, a parent signs it before the rest of the app opens, on the phone or the website, one contract per
 * child (§33); one parent's signature is enough for a child. A student's own login waits for theirs. Nothing is asked
 * before the office sends it. The rules don't need it: it's what the family sees.
 */

export interface GateStudent {
  id: string
  name: string
  status: StudentStatus
}

export interface ContractGate {
  /** Nothing to sign: the app opens. */
  open: boolean
  /** The family's students with a contract the office sent, waiting for a signature, A to Z. */
  toSign: GateStudent[]
}

/** `waiting`: the students with a contract sent and not signed yet. */
export function contractGate(input: { role: Role; students: readonly GateStudent[]; waiting: ReadonlySet<string> }): ContractGate {
  if (input.role !== 'parent' && input.role !== 'student') return { open: true, toSign: [] }
  const toSign = input.students.filter((s) => isLinkable(s.status) && input.waiting.has(s.id)).sort((a, b) => a.name.localeCompare(b.name))
  return { open: toSign.length === 0, toSign }
}

/** "Ava", "Ava and Leo", "Ava, Leo and Mia" (Korean: "Ava, Leo, Mia"): first names, for the signing page's words. */
export function firstNames(names: readonly string[], lang: Lang = 'en'): string {
  const first = names.map((n) => n.trim().split(/\s+/)[0] || n)
  if (lang === 'ko') return first.join(', ')
  return first.length < 2 ? (first[0] ?? '') : `${first.slice(0, -1).join(', ')} and ${first.at(-1)}`
}
