import type { DriveStudent } from '../drive/model'
import { studentsNamedIn } from '../drive/suggest'

/**
 * A request to join (`signupRequests`) from someone the app couldn't find by their email (docs/DECISIONS.md §31): the
 * children they typed, matched to the academy's students for the office to approve in one tap. The office always
 * chooses; nothing is linked from a typed name.
 */

/**
 * The names typed in a request, one by one: "Ava Monroe, Leo Monroe", one a line, or "Ava and Leo Monroe", where a
 * first name alone takes the family name another one gives.
 */
export function typedNames(text: string): string[] {
  const parts = text
    .split(/[,;\n&/+]|\band\b/i)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => /[\p{L}\d]/u.test(p))
  const family = [...parts]
    .reverse()
    .map((p) => p.split(' '))
    .find((w) => w.length > 1)
    ?.at(-1)
  return parts.map((p) => (family && !p.includes(' ') ? `${p} ${family}` : p))
}

/**
 * The students a request's typed children could be, best first and each once: for each name, the student it names (by
 * their name or another name they go by), or else those it could mean. Students who left aren't offered.
 */
export function requestedStudents(text: string, students: readonly DriveStudent[]): string[] {
  const out: string[] = []
  for (const name of typedNames(text)) {
    const { id, candidates } = studentsNamedIn(name, students, { printed: true, most: 3 })
    for (const s of id ? [id] : candidates) if (!out.includes(s)) out.push(s)
  }
  return out
}
