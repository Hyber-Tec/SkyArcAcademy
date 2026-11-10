import type { DriveStudent } from '../drive/model'
import { nameWords } from '../drive/suggest'

/**
 * Whose a results sheet is, from the shooter's name printed on it (the manager's third meeting, CP1: "read the
 * student's name from the sheet and pick the student"). A sheet prints the shooter's full name, often their legal one,
 * so a student is found by their name or one of their other names (a legal name or one they go by: `Student.otherNames`), whole:
 * every word of it, in any order, a name's words written together counting too ("Seo-yeon" is "Seoyeon"). The phone's
 * competition scan and the website's Add a competition and Add scores pick the student this finds; whoever adds the
 * result still sees whose it is before saving.
 */

/** Whether every word of a name is among a text's words, a name's next words written together counting as one. */
export function nameIn(name: readonly string[], words: ReadonlySet<string>): boolean {
  if (!name.length) return false
  let i = 0
  while (i < name.length) {
    let j = name.length
    while (j > i && !words.has(name.slice(i, j).join(''))) j--
    if (j === i) return false
    i = j
  }
  return true
}

/** A student's names as words: their name and each other name, those of two words or more (a first name alone isn't one). */
const fullNames = (s: DriveStudent) => [s.name, ...(s.otherNames ?? [])].map(nameWords).filter((w) => w.length >= 2)

/** Whether a printed name is this student's: one of their names is all in it, or it is all in one of their names. */
function isNamed(s: DriveStudent, printed: readonly string[]): boolean {
  const words = new Set(printed)
  return fullNames(s).some((n) => nameIn(n, words) || (printed.length >= 2 && nameIn(printed, new Set(n))))
}

export interface SheetStudent {
  /** The student the sheet names, when only one student has that name. */
  id: string | null
  /** Otherwise the students it could mean, best first (a few at most): several with the name, or a name in common. */
  candidates: string[]
}

/**
 * The student a sheet names: by the shooter's name as the reader found it ("Avery Rowan", from "Rowan, Avery"), or, when
 * it found none or no student has it, by a full name of theirs in the sheet's heading (its first lines). Finished
 * students are left out.
 */
export function sheetStudent(reading: { name: string; header?: string }, students: readonly DriveStudent[]): SheetStudent {
  const active = students.filter((s) => !s.finished)
  const printed = nameWords(reading.name)
  if (printed.length) {
    const named = active.filter((s) => isNamed(s, printed))
    if (named.length === 1) return { id: named[0].id, candidates: [] }
    if (named.length > 1) return { id: null, candidates: named.slice(0, 3).map((s) => s.id) }
  }
  const header = new Set(nameWords(reading.header ?? ''))
  if (header.size) {
    const named = active.filter((s) => fullNames(s).some((n) => nameIn(n, header)))
    if (named.length === 1) return { id: named[0].id, candidates: [] }
    if (named.length > 1) return { id: null, candidates: named.slice(0, 3).map((s) => s.id) }
  }
  if (!printed.length) return { id: null, candidates: [] }
  // Nobody has the whole name: those with a word of it in common (a last name shared by siblings), most words first.
  const words = new Set(printed)
  const scored = active
    .map((s) => ({ s, hits: Math.max(0, ...[s.name, ...(s.otherNames ?? [])].map((n) => nameWords(n).filter((w) => words.has(w)).length)) }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.s.name.localeCompare(b.s.name))
  return { id: null, candidates: scored.slice(0, 3).map((x) => x.s.id) }
}
