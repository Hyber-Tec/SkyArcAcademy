/**
 * Finding a setting by its words (the Settings home's search). Each place a setting can be found is a `Find`: what it's
 * called, the words it's searched by, and where it opens.
 */

export interface Find {
  key: string
  label: string
  /** Every word it's found by: its label, help, keywords and where it is. */
  text: string
  /** The page it opens (its address under Settings). */
  page: string
  /** The setting to mark there (`?find=`), if any. */
  find: string | null
}

/** Lower case, accents off, punctuation as spaces: "Coaches’ availability" → "coaches availability". */
export function searchWords(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * The finds with every word of the query (a word matches the start of any word of theirs: "cancel" finds
 * "cancellation"), those whose name matches first.
 */
export function searchFinds<T extends Find>(finds: readonly T[], query: string): T[] {
  const words = searchWords(query).split(' ').filter(Boolean)
  if (!words.length) return []
  const hit = (text: string) => {
    const its = ` ${searchWords(text)}`
    return words.every((w) => its.includes(` ${w}`))
  }
  const found = finds.filter((f) => hit(f.text))
  const byName = found.filter((f) => hit(f.label))
  return [...byName, ...found.filter((f) => !byName.includes(f))]
}
