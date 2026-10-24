import type { DriveStudent } from './model'

/** A text's words: lower case, without accents or punctuation. */
export const nameWords = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)

/**
 * The student a text names: the only one whose first name is a word of it, or, when several share that first name,
 * the only one whose last name is too. The text is a file name or the words printed on a SIUS report. Finished students
 * are left out. Nothing is trusted without someone seeing it.
 */
export function studentNamedIn(text: string, students: readonly DriveStudent[]): string | null {
  const words = new Set(nameWords(text))
  if (!words.size) return null
  const byFirst = students.filter((s) => !s.finished && words.has(nameWords(s.name)[0] ?? ''))
  if (byFirst.length === 1) return byFirst[0].id
  const byBoth = byFirst.filter((s) => nameWords(s.name).slice(1).some((w) => words.has(w)))
  return byBoth.length === 1 ? byBoth[0].id : null
}
