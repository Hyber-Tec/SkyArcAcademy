import { INACTIVE_STUDENT_STATUSES } from './people'
import { type DateKey, WEEKDAY_SHORT, diffDays, formatDateKey, formatMinutes, weekdayOf } from './time'
import type { Session, Student, StudentStatus } from './types'

/**
 * The Students page (the office's and the coaches'): its status tabs, its search, each student's next and last class
 * as the page words them, its sorting and its level groups. The list and the grid both show these.
 */

// ---------------------------------------------------------------- status tabs

/** The status tabs. Inactive holds Finished, No Answer and Not Interested together: they're looked at least. */
export type StudentTab = 'all' | 'enrolled' | 'signed_up' | 'paused' | 'inactive'

export const STUDENT_TABS: readonly StudentTab[] = ['all', 'enrolled', 'signed_up', 'paused', 'inactive']

export function inStudentTab(status: StudentStatus, tab: StudentTab): boolean {
  if (tab === 'all') return true
  if (tab === 'inactive') return INACTIVE_STUDENT_STATUSES.includes(status)
  return status === tab
}

// --------------------------------------------------------------------- search

/**
 * Whether a search finds a student: by their name, or by one of the other names they go by (a nickname, the name on
 * their SIUS reports). `also` is that other name when only it matched, so the row can say why the student is there.
 */
export function findStudent(s: Pick<Student, 'name' | 'nameLower' | 'otherNames'>, query: string): { found: boolean; also: string | null } {
  const q = query.trim().toLowerCase()
  if (!q || (s.nameLower || s.name.toLowerCase()).includes(q)) return { found: true, also: null }
  const also = (s.otherNames ?? []).find((n) => n.toLowerCase().includes(q)) ?? null
  return { found: also !== null, also }
}

// ------------------------------------------------------- next and last class

/** The days of classes the page reads (today and the 13 after it), for each student's next class and its time. */
export const NEXT_CLASS_DAYS = 14

/** A student's next class: its time once the classes are read, the record's date alone until then (or further off). */
export interface NextClass {
  dateKey: DateKey
  startMin: number | null
  endMin: number | null
}

/** What the coming days' classes say about a student. */
export interface ClassesAhead {
  /** The next class that hasn't ended (one going on counts), with its time. */
  next: { dateKey: DateKey; startMin: number; endMin: number } | null
  /** A class of theirs today has ended: their last class is today, before the night's update says so. */
  endedToday: boolean
}

type Seat = Pick<Session, 'studentId' | 'dateKey' | 'startMin' | 'endMin' | 'status' | 'isDeleted'>

/**
 * Each student's classes from today's and the coming days' seats, counted as the student page counts them: a canceled
 * seat or a no-show isn't a class they come to, and one that has ended today is their last. A student record keeps only
 * the dates (`nextSessionDate`, `lastSessionDate`, from the nightly job), so this is where the time comes from.
 */
export function classesAhead(seats: readonly Seat[], today: DateKey, nowMin: number): Map<string, ClassesAhead> {
  const out = new Map<string, ClassesAhead>()
  for (const s of seats) {
    if (s.isDeleted || !s.studentId || s.dateKey < today || s.status === 'canceled' || s.status === 'no_show') continue
    const cur = out.get(s.studentId) ?? { next: null, endedToday: false }
    if (s.dateKey === today && s.endMin <= nowMin) cur.endedToday = true
    else if (!cur.next || s.dateKey < cur.next.dateKey || (s.dateKey === cur.next.dateKey && s.startMin < cur.next.startMin)) {
      cur.next = { dateKey: s.dateKey, startMin: s.startMin, endMin: s.endMin }
    }
    out.set(s.studentId, cur)
  }
  return out
}

/**
 * A student's next class: the seats' one, with its time, once they're read (`read`); until then, or when it's further
 * off than they reach (`until`), the record's date alone. Read seats with none for the student before `until` mean the
 * record's date is last night's, since changed: no class.
 */
export function nextClassOf(
  student: Pick<Student, 'nextSessionDate'>,
  ahead: ClassesAhead | undefined,
  read: boolean,
  today: DateKey,
  until: DateKey,
): NextClass | null {
  if (ahead?.next) return { ...ahead.next }
  const date = student.nextSessionDate
  if (!date || date < today || (read && date <= until)) return null
  return { dateKey: date, startMin: null, endMin: null }
}

/** A student's last class: today when one has ended today, else the record's. */
export function lastClassOf(student: Pick<Student, 'lastSessionDate'>, ahead: ClassesAhead | undefined, today: DateKey): DateKey | null {
  return ahead?.endedToday ? today : (student.lastSessionDate ?? null)
}

/**
 * The next class in words: "Today, 6:00 PM", "Tomorrow, 5:00 PM", "Thu, 6:00 PM" within the week, "Nov 12, 6:00 PM"
 * further on (the day alone when the time isn't known); `sub` adds "in 3 days" beyond tomorrow, and "first class" for
 * someone who hasn't had one yet.
 */
export function nextClassLabel(next: NextClass, today: DateKey, first: boolean): { when: string; sub: string; isToday: boolean } {
  const n = diffDays(today, next.dateKey)
  const day = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n < 7 ? WEEKDAY_SHORT[weekdayOf(next.dateKey)] : formatDateKey(next.dateKey, 'monthDay')
  const sub = [n > 1 ? `in ${n} days` : '', first ? 'first class' : ''].filter(Boolean).join(' · ')
  return { when: next.startMin === null ? day : `${day}, ${formatMinutes(next.startMin)}`, sub, isToday: n === 0 }
}

/** The last class, quieter: "Today", "Yesterday", "25 days ago", then months, then "Over a year ago". */
export function lastClassLabel(dateKey: DateKey, today: DateKey): string {
  const n = diffDays(dateKey, today)
  if (n <= 0) return 'Today'
  if (n === 1) return 'Yesterday'
  if (n <= 45) return `${n} days ago`
  const months = Math.round(n / 30.44)
  return months < 12 ? `${months} months ago` : 'Over a year ago'
}

// -------------------------------------------------------------------- sorting

export type StudentSortKey = 'name' | 'grade' | 'level' | 'signUp' | 'next' | 'last'

export interface StudentSort {
  key: StudentSortKey
  dir: 'asc' | 'desc'
}

export const STUDENT_SORT_LABELS: Record<StudentSortKey, string> = {
  name: 'Name',
  grade: 'Grade',
  level: 'Level',
  signUp: 'Signed up',
  next: 'Next class',
  last: 'Last class',
}

/** Each sort's first direction: names A to Z, grades and levels from the lowest, the newest sign-ups and the latest class. */
const FIRST_DIR: Record<StudentSortKey, StudentSort['dir']> = { name: 'asc', grade: 'asc', level: 'asc', signUp: 'desc', next: 'asc', last: 'desc' }

/** What each direction means, for the sort menu ("A to Z", "Soonest first"). */
export const STUDENT_SORT_ORDER: Record<StudentSortKey, Record<StudentSort['dir'], string>> = {
  name: { asc: 'A to Z', desc: 'Z to A' },
  grade: { asc: 'Lowest first', desc: 'Highest first' },
  level: { asc: 'Lowest first', desc: 'Highest first' },
  signUp: { asc: 'Oldest first', desc: 'Newest first' },
  next: { asc: 'Soonest first', desc: 'Latest first' },
  last: { asc: 'Longest ago first', desc: 'Most recent first' },
}

/** Picking the sort that's on turns it around; another starts in its first direction. */
export function pickStudentSort(cur: StudentSort, key: StudentSortKey): StudentSort {
  if (cur.key === key) return { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: FIRST_DIR[key] }
}

/** A student as the sorting sees them: their next and last class as the page shows them. */
export interface SortableStudent {
  nameLower: string
  grade: string
  level: string | null
  signUpDate: DateKey | null
  next: NextClass | null
  last: DateKey | null
}

/** Where a value falls in the academy's list (its grades, its levels), anything else after them, and nothing as null. */
function rankIn(list: readonly string[], value: string | null | undefined): number | null {
  const v = (value ?? '').trim()
  if (!v) return null
  const i = list.indexOf(v)
  return i < 0 ? list.length : i
}

/**
 * Sorts students: grades and levels in the academy's own order (Settings), a time unknown after a known one that day.
 * Whatever they don't have (a grade, a level, a class) goes last both ways, and ties go by name.
 */
export function compareStudents(
  a: SortableStudent,
  b: SortableStudent,
  sort: StudentSort,
  order: { levels: readonly string[]; grades: readonly string[] },
): number {
  const dir = sort.dir === 'asc' ? 1 : -1
  const byName = a.nameLower.localeCompare(b.nameLower)
  const last = <T>(x: T | null, y: T | null, cmp: (x: T, y: T) => number) => (x === null && y === null ? 0 : x === null ? 1 : y === null ? -1 : cmp(x, y) * dir)
  const num = (x: number, y: number) => x - y
  const str = (x: string, y: string) => x.localeCompare(y)
  const when = (n: NextClass | null) => (n ? `${n.dateKey} ${String(n.startMin ?? 9999).padStart(4, '0')}` : null)
  switch (sort.key) {
    case 'name':
      return byName * dir
    case 'grade':
      return last(rankIn(order.grades, a.grade), rankIn(order.grades, b.grade), num) || byName
    case 'level':
      return last(rankIn(order.levels, a.level), rankIn(order.levels, b.level), num) || byName
    case 'signUp':
      return last(a.signUpDate || null, b.signUpDate || null, str) || byName
    case 'next':
      return last(when(a.next), when(b.next), str) || byName
    case 'last':
      return last(a.last, b.last, str) || byName
  }
}

// --------------------------------------------------------------------- levels

/**
 * Students by level: the academy's levels lowest first (highest first with `descending`), a level no longer in its list
 * after them, and "No level yet" (null) last. Levels nobody has are left out; each group keeps the rows' order.
 */
export function levelGroups<T>(rows: readonly T[], levelOf: (row: T) => string | null, ladder: readonly string[], descending = false): { level: string | null; rows: T[] }[] {
  const groups = new Map<string | null, T[]>()
  for (const r of rows) {
    const l = levelOf(r) || null
    const g = groups.get(l)
    if (g) g.push(r)
    else groups.set(l, [r])
  }
  const known = ladder.filter((l) => groups.has(l))
  const other = [...groups.keys()].filter((l): l is string => l !== null && !ladder.includes(l)).sort((a, b) => a.localeCompare(b))
  const levels = [...(descending ? [...known].reverse() : known), ...other, ...(groups.has(null) ? [null] : [])]
  return levels.map((level) => ({ level, rows: groups.get(level)! }))
}
