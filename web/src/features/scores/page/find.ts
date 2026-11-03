import { levelColor } from '@shared/schedule/seatColors'
import { DEFAULT_RANGE, FEED_SORTS, type FeedRange, type FeedSort, RANGE_PRESETS, type RangePreset } from '@shared/scores/feed'
import { POSITIONS, type Position, RESULT_KINDS, type ResultKind } from '@shared/shooting/evaluation'
import { isDateKey } from '@shared/time'

/** What the Scores page is showing: whose, which position, kind and level, which days, in what order. */
export interface Find {
  q: string
  position: Position | 'all'
  kind: ResultKind | 'all'
  /** A level, `NO_LEVEL`, or all of them. */
  level: string
  range: FeedRange
  sort: FeedSort
}

/** The level filter's value for students without a level yet. */
export const NO_LEVEL = '__none'

export const FRESH_FIND: Find = { q: '', position: 'all', kind: 'all', level: 'all', range: DEFAULT_RANGE, sort: 'new' }

/** Anything narrowing the list (the order doesn't). */
export const isFiltered = (f: Find) => !!f.q.trim() || f.position !== 'all' || f.kind !== 'all' || f.level !== 'all' || f.range.preset !== DEFAULT_RANGE.preset

/**
 * The page's find, from its address (`?q=&pos=&kind=&level=&dates=&sort=`), so Back from a student's page comes back
 * to the same list. Anything unknown is left as it starts.
 */
export function findFromParams(p: URLSearchParams): Find {
  const pos = p.get('pos')
  const kind = p.get('kind')
  const sort = p.get('sort')
  const dates = p.get('dates') ?? ''
  let range: FeedRange = DEFAULT_RANGE
  const [a, b] = dates.split('..')
  if (RANGE_PRESETS.some((r) => r.key === dates)) range = { preset: dates as RangePreset }
  else if (isDateKey(a) && isDateKey(b ?? a)) range = { preset: 'custom', from: a, to: b ?? a }
  return {
    q: p.get('q') ?? '',
    position: pos && (POSITIONS as readonly string[]).includes(pos) ? (pos as Position) : 'all',
    kind: kind && (RESULT_KINDS as readonly string[]).includes(kind) ? (kind as ResultKind) : 'all',
    level: p.get('level') || 'all',
    range,
    sort: sort && FEED_SORTS.some((s) => s.key === sort) ? (sort as FeedSort) : 'new',
  }
}

/** The address's query for a find: only what differs from how the page starts. */
export function findParams(f: Find): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q)
  if (f.position !== 'all') p.set('pos', f.position)
  if (f.kind !== 'all') p.set('kind', f.kind)
  if (f.level !== 'all') p.set('level', f.level)
  if (f.range.preset === 'custom') p.set('dates', f.range.from === f.range.to ? f.range.from : `${f.range.from}..${f.range.to}`)
  else if (f.range.preset !== DEFAULT_RANGE.preset) p.set('dates', f.range.preset)
  if (f.sort !== 'new') p.set('sort', f.sort)
  return p
}

/** The level filter's choices, each with its colour: the academy's levels, any other a student still has, and none yet. */
export function levelChoices(ladder: readonly string[], have: readonly (string | null)[]): { value: string; label: string; color?: string }[] {
  const other = [...new Set(have.filter((l): l is string => !!l && !ladder.includes(l)))].sort()
  return [...[...ladder, ...other].map((l) => ({ value: l, label: l, color: levelColor(l, ladder).dot })), { value: NO_LEVEL, label: 'No level yet' }]
}
