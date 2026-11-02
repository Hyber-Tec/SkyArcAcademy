import { type Evaluation, POSITIONS, type Position, inOrder, per10 } from '../shooting/evaluation'
import { type DateKey, type Weekday, addDays, addMonths, diffDays, endOfMonth, formatDateKey, startOfMonth, startOfWeek } from '../time'
import type { StudentStatus } from '../types'
import { type ResultRow, rowPer10 } from './match'

/**
 * The Scores page (Goo's pick, docs/DECISIONS.md §29): every student's results, newest first, by day; the dates they're
 * found in; and the numbers beside them (the last seven days, who hasn't had a score for a while). Pure, so the page
 * and its tests agree.
 */

// ------------------------------------------------------------------ dates

/** The dates the page shows: one of a few, or days picked on the calendar. */
export type RangePreset = 'today' | '7d' | '30d' | 'month' | 'lastMonth'
export type FeedRange = { preset: RangePreset } | { preset: 'custom'; from: DateKey; to: DateKey }

/** The page opens on the last 30 days. */
export const DEFAULT_RANGE: FeedRange = { preset: '30d' }

export const RANGE_PRESETS: readonly { key: RangePreset; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
]

/** The first and last day a range covers (days picked in either order). */
export function rangeDates(range: FeedRange, today: DateKey): { from: DateKey; to: DateKey } {
  switch (range.preset) {
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case '30d':
      return { from: addDays(today, -29), to: today }
    case 'month':
      return { from: startOfMonth(today), to: today }
    case 'lastMonth': {
      const first = addMonths(startOfMonth(today), -1)
      return { from: first, to: endOfMonth(first) }
    }
    case 'custom':
      return range.from <= range.to ? { from: range.from, to: range.to } : { from: range.to, to: range.from }
  }
}

/** "Oct 12", with the year when it isn't this one. */
export function shortDay(dateKey: DateKey, today: DateKey): string {
  return formatDateKey(dateKey, dateKey.slice(0, 4) === today.slice(0, 4) ? 'monthDay' : 'medium')
}

/** "Today", "Yesterday", or "Sat, Oct 31" (with the year when it isn't this one). */
export function dayWords(dateKey: DateKey, today: DateKey): string {
  const ago = diffDays(dateKey, today)
  if (ago === 0) return 'Today'
  if (ago === 1) return 'Yesterday'
  return dateKey.slice(0, 4) === today.slice(0, 4) ? formatDateKey(dateKey, 'weekdayMedium') : formatDateKey(dateKey, 'medium')
}

/** "Last 30 days", or the days picked: "Oct 12 – Oct 18", "Oct 12". */
export function rangeLabel(range: FeedRange, today: DateKey): string {
  if (range.preset !== 'custom') return RANGE_PRESETS.find((p) => p.key === range.preset)?.label ?? ''
  const { from, to } = rangeDates(range, today)
  return from === to ? shortDay(from, today) : `${shortDay(from, today)} – ${shortDay(to, today)}`
}

/** What a preset covers, beside its name: "Oct 27 – today", "Nov 1 – today", "October". */
export function presetHint(preset: RangePreset, today: DateKey): string {
  const { from, to } = rangeDates({ preset }, today)
  if (preset === 'today') return ''
  if (preset === 'lastMonth') {
    const month = formatDateKey(from, 'monthYear')
    return from.slice(0, 4) === today.slice(0, 4) ? month.split(' ')[0] : month
  }
  return from === to ? 'today' : `${shortDay(from, today)} – today`
}

// ---------------------------------------------------------------- the feed

/** One heading of the feed and the results under it. */
export interface FeedGroup<R> {
  key: string
  /** "Today", "Yesterday", "Saturday", or "Week of October 12". */
  title: string
  /** "Monday, November 2", "October 31 · Fall Junior Open", "Oct 12 – Oct 18". */
  sub: string
  /** One day (a week's group lists each result's day). */
  day: boolean
  rows: R[]
}

/**
 * Results under headings, in the order they come (newest first, or oldest): a heading for each day of this week and
 * last week (the academy's weeks, from `weekStartsOn`), "Today" and "Yesterday" by name and the other days by their
 * weekday, each with its date (and its match's name on a competition's day); further back, a heading for each week.
 */
export function feedGroups<R>(rows: readonly R[], of: (r: R) => { dateKey: DateKey; match: string | null }, today: DateKey, weekStartsOn: Weekday): FeedGroup<R>[] {
  const lastWeek = addDays(startOfWeek(today, weekStartsOn), -7)
  const groups = new Map<string, FeedGroup<R>>()
  for (const r of rows) {
    const { dateKey } = of(r)
    const byDay = dateKey >= lastWeek
    const key = byDay ? dateKey : `week:${startOfWeek(dateKey, weekStartsOn)}`
    let g = groups.get(key)
    if (!g) {
      if (byDay) {
        const ago = diffDays(dateKey, today)
        const title = ago === 0 ? 'Today' : ago === 1 ? 'Yesterday' : formatDateKey(dateKey, 'weekday')
        g = { key, title, sub: ago === 0 || ago === 1 ? `${formatDateKey(dateKey, 'weekday')}, ${formatDateKey(dateKey, 'monthDayLong')}` : formatDateKey(dateKey, 'monthDayLong'), day: true, rows: [] }
      } else {
        const start = startOfWeek(dateKey, weekStartsOn)
        const end = addDays(start, 6)
        const year = start.slice(0, 4) === today.slice(0, 4) ? '' : `, ${start.slice(0, 4)}`
        g = { key, title: `Week of ${formatDateKey(start, 'monthDayLong')}${year}`, sub: `${shortDay(start, today)} – ${shortDay(end, today)}`, day: false, rows: [] }
      }
      groups.set(key, g)
    }
    g.rows.push(r)
  }
  // A competition's day says which: its match's name (or names) after the date.
  for (const g of groups.values()) {
    if (!g.day) continue
    const matches = [...new Set(g.rows.map((r) => of(r).match?.trim()).filter((m): m is string => !!m))]
    if (matches.length) g.sub = `${g.sub} · ${matches.slice(0, 2).join(', ')}${matches.length > 2 ? ` and ${matches.length - 2} more` : ''}`
  }
  return [...groups.values()]
}

/** How the feed is sorted: by when (the headings), or one list by score or by name. */
export type FeedSort = 'new' | 'old' | 'high' | 'low' | 'name'

export const FEED_SORTS: readonly { key: FeedSort; label: string }[] = [
  { key: 'new', label: 'Newest first' },
  { key: 'old', label: 'Oldest first' },
  { key: 'high', label: 'Highest per 10' },
  { key: 'low', label: 'Lowest per 10' },
  { key: 'name', label: 'Student A–Z' },
]

type Row = ResultRow<Pick<Evaluation, 'dateKey' | 'timeMin' | 'wholeTotal' | 'shots'> & { id: string }>

/**
 * Rows in the order picked. They come newest first (`resultRows`); by score or by name, ties keep that order. A row
 * without a score goes last either way.
 */
export function sortFeed<R extends Row>(rows: readonly R[], sort: FeedSort, nameOf: (r: R) => string): R[] {
  if (sort === 'new') return [...rows]
  if (sort === 'old') return [...rows].reverse()
  const at = new Map(rows.map((r, i) => [r, i]))
  const score = (r: R) => rowPer10(r.results)
  return [...rows].sort((a, b) => {
    if (sort === 'name') return nameOf(a).localeCompare(nameOf(b)) || at.get(a)! - at.get(b)!
    const x = score(a)
    const y = score(b)
    if (x === null || y === null) return x === y ? at.get(a)! - at.get(b)! : x === null ? 1 : -1
    return (sort === 'high' ? y - x : x - y) || at.get(a)! - at.get(b)!
  })
}

// ------------------------------------------------------------ the numbers

type Scored = Pick<Evaluation, 'studentId' | 'position' | 'dateKey' | 'wholeTotal' | 'shots'> & { id: string }

/** A position's average over the last seven days, and the seven before. */
export interface PositionWeek {
  position: Position
  /** Results in it over the last seven days. */
  results: number
  /** Every counted shot's average, per 10 shots, in whole numbers (as the Scores tab's tiles give it); null without results. */
  average: number | null
  before: number | null
  /** The last seven days' average against the seven before, to one decimal; null when either has none. */
  change: number | null
}

export interface WeekNumbers {
  from: DateKey
  to: DateKey
  /** Results (a competition's sheet is one), and whose. */
  results: number
  students: number
  /** Results in the seven days before. */
  before: number
  positions: PositionWeek[]
}

const average = (list: readonly Pick<Evaluation, 'wholeTotal' | 'shots'>[]) =>
  per10(
    list.reduce((n, e) => n + e.wholeTotal, 0),
    list.reduce((n, e) => n + e.shots, 0),
  )

/**
 * The last seven days, today among them, against the seven before: how many results from how many students, and each
 * position's average per 10 shots with its change. Rows count as the feed shows them (a sheet's positions are one
 * result); each position's average is over its own results.
 */
export function lastSevenDays<E extends Scored>(rows: readonly ResultRow<E>[], today: DateKey): WeekNumbers {
  const from = addDays(today, -6)
  const beforeFrom = addDays(today, -13)
  const inWeek = (d: DateKey) => d >= from && d <= today
  const inBefore = (d: DateKey) => d >= beforeFrom && d < from
  const scored = (list: readonly ResultRow<E>[]) => list.filter((r) => r.results.some((e) => e.shots > 0))
  const week = scored(rows.filter((r) => inWeek(r.results[0].dateKey)))
  const before = scored(rows.filter((r) => inBefore(r.results[0].dateKey)))
  const results = (list: readonly ResultRow<E>[]) => list.flatMap((r) => r.results).filter((e) => e.shots > 0)
  const now = results(week)
  const then = results(before)
  const positions = POSITIONS.map((position) => {
    const a = average(now.filter((e) => e.position === position))
    const b = average(then.filter((e) => e.position === position))
    return { position, results: now.filter((e) => e.position === position).length, average: a, before: b, change: a !== null && b !== null ? Math.round((a - b) * 10) / 10 : null }
  })
  return { from, to: today, results: week.length, students: new Set(week.map((r) => r.results[0].studentId)).size, before: before.length, positions }
}

/** Each student's latest scored result's day. */
export function lastScores(evaluations: readonly Scored[]): Map<string, DateKey> {
  const out = new Map<string, DateKey>()
  for (const e of evaluations) {
    if (e.shots <= 0) continue
    const cur = out.get(e.studentId)
    if (!cur || e.dateKey > cur) out.set(e.studentId, e.dateKey)
  }
  return out
}

/** An enrolled student without a score lately: their last one's day (null: none yet), and how long ago. */
export interface QuietStudent {
  id: string
  last: DateKey | null
  days: number | null
}

/**
 * Enrolled students without a scored result in the last `days` days (today among them), longest first, then those
 * without any yet. A student who signed up within those days isn't counted until they've been there that long.
 */
export function quietStudents(students: readonly { id: string; status: StudentStatus; signUpDate?: DateKey | null }[], last: ReadonlyMap<string, DateKey>, today: DateKey, days = 30): QuietStudent[] {
  const out: QuietStudent[] = []
  for (const s of students) {
    if (s.status !== 'enrolled') continue
    const d = last.get(s.id) ?? null
    if (d !== null) {
      const ago = diffDays(d, today)
      if (ago >= days) out.push({ id: s.id, last: d, days: ago })
    } else if (!s.signUpDate || diffDays(s.signUpDate, today) >= days) out.push({ id: s.id, last: null, days: null })
  }
  return out.sort((a, b) => (a.last === null ? (b.last === null ? 0 : 1) : b.last === null ? -1 : a.last.localeCompare(b.last)))
}

/** Results that were a personal best when they were shot, of the last `days` days, newest first. */
export function recentBests<E extends Pick<Evaluation, 'dateKey' | 'timeMin'> & { id: string }>(evaluations: readonly E[], bests: ReadonlySet<string>, today: DateKey, days = 7): E[] {
  const from = addDays(today, -(days - 1))
  return inOrder(evaluations.filter((e) => bests.has(e.id) && e.dateKey >= from && e.dateKey <= today)).reverse()
}
