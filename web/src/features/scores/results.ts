import { useCallback, useState } from 'react'
import type { ResultRow } from '@shared/scores/match'
import { type Evaluation, evaluationPoints } from '@shared/shooting/evaluation'
import type { ShotPoint } from '@shared/shooting/target'
import { type DateKey, formatDateKey } from '@shared/time'
import { one } from '@/features/reports/model'

/** What a list of results needs beside its rows (ResultRow.tsx): their columns, which are open, and their words. */

/**
 * The list's columns, by the list's own width (its `@container`): the small target, what the result is, its score per
 * 10 shots, its total (from a tablet's width), and the chevron. On a phone the total sits under the score.
 */
export const RESULT_COLUMNS = 'grid grid-cols-[2.5rem_minmax(0,1fr)_4.25rem_1rem] items-center gap-x-3 @xl:grid-cols-[2.75rem_minmax(0,1fr)_6rem_7.5rem_1.25rem] @xl:gap-x-3.5'

/**
 * Every student's results (the Scores page), by the list's own width: on a phone the small target, whose (with the
 * position, where from and when under the name, the marks under that) and the score; from a tablet's width whose, the
 * position and where from, the marks, the score and the chevron each in a column; and the total too where there's room.
 */
export const FEED_COLUMNS =
  'grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @2xl:grid-cols-[2.75rem_minmax(8rem,1.25fr)_minmax(8.5rem,1fr)_minmax(0,10.5rem)_6rem_1.25rem] @2xl:gap-x-3.5 @4xl:grid-cols-[2.75rem_minmax(9rem,1.25fr)_minmax(10rem,1fr)_minmax(0,11rem)_6rem_7.25rem_1.25rem]'

/** Which rows are open: any number at once, each opened and closed by its own row. `initial`: open from the start. */
export function useOpenRows(initial?: Iterable<string>) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(initial))
  const toggle = useCallback(
    (key: string) =>
      setOpen((cur) => {
        const next = new Set(cur)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      }),
    [],
  )
  /** Opens a row (a link to one result, a result just added); it stays open until closed. */
  const show = useCallback((key: string) => setOpen((cur) => (cur.has(key) ? cur : new Set([...cur, key]))), [])
  return { isOpen: (key: string) => open.has(key), toggle, show, open }
}

/** The row of a result's ID: its own, or its match's when it came from a results sheet. */
export function rowOf<E extends { id: string }>(rows: readonly ResultRow<E>[], id: string): ResultRow<E> | null {
  return rows.find((r) => r.results.some((e) => e.id === id)) ?? null
}

/** "1.5 mm left, 0.7 mm low", or "right in the centre": where the shots' average point is. */
export function averagePointWords(p: ShotPoint): string {
  const parts = [Math.abs(p.x) >= 0.5 ? `${one(Math.abs(p.x))} mm ${p.x < 0 ? 'left' : 'right'}` : null, Math.abs(p.y) >= 0.5 ? `${one(Math.abs(p.y))} mm ${p.y < 0 ? 'low' : 'high'}` : null].filter(Boolean)
  return parts.length ? parts.join(', ') : 'right in the centre'
}

/** Why a result has no shots on the target: typed in, or a results sheet without its pictures. */
export function unplacedText(e: Pick<Evaluation, 'source' | 'series'>): string {
  if (e.source === 'online') return 'From the results site: these shots were typed in there by hand, so where they landed isn’t known.'
  if (e.source === 'sheet') return e.series.length ? 'From the results sheet: every shot’s score, but not where it landed.' : 'From the results sheet: its total only.'
  return e.series.length ? 'Typed in from the paper card, so where the shots landed isn’t recorded.' : 'Only the card’s total was typed in.'
}

/** Under a student's name on the Scores page, where there's no time to give: how the result came. */
export function noTimeWords(e: Pick<Evaluation, 'source' | 'series'>): string {
  if (e.source === 'online') return 'From the results site'
  if (e.source === 'sheet') return 'From the sheet'
  return evaluationPoints(e).length ? 'Scanned card' : 'Typed in'
}

/** "Sep 8", with the year when it isn't this one. */
export function shortDate(dateKey: DateKey, today: DateKey): string {
  return formatDateKey(dateKey, dateKey.slice(0, 4) === today.slice(0, 4) ? 'monthDay' : 'medium')
}
