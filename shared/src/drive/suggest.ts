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
 * the only one whose last name is too. A student's other names count as theirs (a nickname, "Jay" for Jiwoo): each is
 * a first name, or a full name. The text is a file name or the words printed on a SIUS report. Finished students
 * are left out. Nothing is trusted without someone seeing it.
 */
export function studentNamedIn(text: string, students: readonly DriveStudent[]): string | null {
  const words = new Set(nameWords(text))
  if (!words.size) return null
  const names = (s: DriveStudent) => [s.name, ...(s.otherNames ?? [])].map(nameWords).filter((w) => w.length)
  const byFirst = students.filter((s) => !s.finished && names(s).some((w) => words.has(w[0])))
  if (byFirst.length === 1) return byFirst[0].id
  const byBoth = byFirst.filter((s) => names(s).some((w) => words.has(w[0]) && (w.length === 1 ? nameWords(s.name).slice(1) : w.slice(1)).some((x) => words.has(x))))
  return byBoth.length === 1 ? byBoth[0].id : null
}

/**
 * Whose a text says a result is, for someone to confirm: the student it names (`studentNamedIn`), or else the students
 * it could mean, best first, a few at most. A printed name (on a report, a results sheet) can mean anyone with a name
 * of its words ("Hwang" for two Hwangs); a file's name only someone whose first name is in it (two Blakes), as its other
 * words ("SIUS lane 4") are rarely names.
 */
export function studentsNamedIn(text: string, students: readonly DriveStudent[], { printed = true, most = 3 }: { printed?: boolean; most?: number } = {}): { id: string | null; candidates: string[] } {
  const id = studentNamedIn(text, students)
  if (id) return { id, candidates: [] }
  const words = new Set(nameWords(text))
  if (!words.size) return { id: null, candidates: [] }
  const scored = students
    .filter((s) => !s.finished)
    .map((s) => {
      const names = [s.name, ...(s.otherNames ?? [])].map(nameWords).filter((w) => w.length)
      const hits = names.map((w) => (printed || words.has(w[0]) ? w.filter((x) => words.has(x)).length : 0))
      return { id: s.id, name: s.name, hits: Math.max(0, ...hits) }
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.name.localeCompare(b.name))
  return { id: null, candidates: scored.slice(0, most).map((s) => s.id) }
}
