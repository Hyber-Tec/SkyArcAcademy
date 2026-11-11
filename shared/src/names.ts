/**
 * A student's names, wherever the app finds or compares one: a search, the name printed on a results sheet, the
 * results site's lists, a SCATT file's people (the fourth meeting: Remi Zhou is "Shengzhe Zhou" on the results site,
 * with "Shengzhe" among her other names). Their name; each other name they go by (`Student.otherNames`: a nickname, an
 * English name, the legal name, another spelling), a one-word one being a given name, so written with their family
 * name too ("Shengzhe Zhou"); and, to match a printed name, each full name family name first ("Zhou Shengzhe"), as
 * lists and sheets often print it.
 */

export interface Named {
  name: string
  /** Their family name; their name's last word when it isn't given. */
  lastName?: string | null
  otherNames?: readonly string[] | null
}

const clean = (s: string | null | undefined): string => (s ?? '').trim().replace(/\s+/g, ' ')

/** Lower case, without accents: how names are compared ("José" is "jose"). */
export const foldName = (s: string): string =>
  (s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()

/** Their family name: `lastName`, else their name's last word (none for a one-word name). */
export function familyNameOf(s: Named): string {
  const last = clean(s.lastName)
  if (last) return last
  const words = clean(s.name).split(' ')
  return words.length > 1 ? words[words.length - 1] : ''
}

/**
 * The names a student goes by, as they're written, each once: their name first, then each other name, a one-word one
 * (a given name) alone and with their family name ("Shengzhe", "Shengzhe Zhou").
 */
export function namesOf(s: Named): string[] {
  const family = familyNameOf(s)
  const out: string[] = []
  const add = (n: string) => {
    const c = clean(n)
    if (c && !out.some((x) => foldName(x) === foldName(c))) out.push(c)
  }
  add(s.name)
  for (const raw of s.otherNames ?? []) {
    const other = clean(raw)
    add(other)
    if (family && other && !other.includes(' ') && foldName(other) !== foldName(family)) add(`${other} ${family}`)
  }
  return out
}

/** A full name family name first: "Zhou Shengzhe" for "Shengzhe Zhou" (the family name known, else the last word). */
function familyFirst(name: string, family: string): string {
  const f = foldName(family)
  const n = foldName(name)
  if (f && n.endsWith(` ${f}`) && n.length > f.length + 1) return `${name.slice(name.length - family.length)} ${name.slice(0, name.length - family.length - 1)}`
  const w = name.split(' ')
  return [w[w.length - 1], ...w.slice(0, -1)].join(' ')
}

/**
 * Every name a printed one may be of this student, to compare whole: `namesOf`, and each of two words or more family
 * name first too.
 */
export function nameFormsOf(s: Named): string[] {
  const family = familyNameOf(s)
  const out: string[] = []
  for (const n of namesOf(s)) {
    for (const form of n.includes(' ') ? [n, familyFirst(n, family)] : [n]) if (!out.some((x) => foldName(x) === foldName(form))) out.push(form)
  }
  return out
}

/** Whether a search (any case) finds a name: it's part of it, or each of its words starts one of the name's, in any order. */
export function searchFindsName(name: string, query: string): boolean {
  const q = foldName(query.trim())
  if (!q) return true
  const n = foldName(name)
  if (n.includes(q)) return true
  const words = q.split(/\s+/)
  if (words.length < 2) return false
  const own = n.split(/[\s'’.-]+/)
  return words.every((w) => own.some((x) => x.startsWith(w)))
}

/**
 * Whether a search finds a student: by their name, or by another name they go by (with their family name too: a search
 * for "Shengzhe Zhou" finds Remi Zhou). `also` is that other name when only it matched, so the row can say why the
 * student is there.
 */
export function searchFindsStudent(s: Named, query: string): { found: boolean; also: string | null } {
  if (!query.trim()) return { found: true, also: null }
  const [own, ...others] = namesOf(s)
  if (own !== undefined && searchFindsName(own, query)) return { found: true, also: null }
  const also = others.find((n) => searchFindsName(n, query)) ?? null
  return { found: also !== null, also }
}

/** A student's other names as words for a picker's search (its label already holds their name). */
export const otherNamesText = (s: Named): string => namesOf(s).slice(1).join(' ')
