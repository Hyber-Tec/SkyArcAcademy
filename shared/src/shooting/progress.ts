import type { DateKey } from '../time'
import { type Evaluation, POSITIONS, type Position, inOrder, per10, wholePer10 } from './evaluation'

/**
 * A student's progress from their results, the same on the website and in the phone app, for staff and families:
 * each position at a glance, and which results were a personal best when they were shot. Scores are per 10 shots in
 * whole numbers (a paper card's scale), as the reports give them.
 */

type Scored = Pick<Evaluation, 'position' | 'dateKey' | 'timeMin' | 'wholeTotal' | 'shots'> & { id: string }

export interface ResultMark {
  id: string
  per10: number
  dateKey: DateKey
}

export interface PositionProgress {
  position: Position
  results: number
  /** Every counted shot's average, per 10 shots. */
  average: number | null
  /** The highest result per 10 shots (the earliest, when tied). */
  best: ResultMark | null
  latest: ResultMark | null
}

const mark = (e: Scored): ResultMark | null => {
  const v = wholePer10(e)
  return v === null ? null : { id: e.id, per10: v, dateKey: e.dateKey }
}

/** Each position that has results, in the usual order (standing, kneeling, prone). */
export function positionProgress(evaluations: readonly Scored[]): PositionProgress[] {
  return POSITIONS.map((position) => {
    const list = inOrder(evaluations.filter((e) => e.position === position && e.shots > 0))
    const shots = list.reduce((n, e) => n + e.shots, 0)
    let best: ResultMark | null = null
    for (const e of list) {
      const m = mark(e)
      if (m && (!best || m.per10 > best.per10)) best = m
    }
    return {
      position,
      results: list.length,
      average: per10(
        list.reduce((n, e) => n + e.wholeTotal, 0),
        shots,
      ),
      best,
      latest: list.length ? mark(list[list.length - 1]) : null,
    }
  }).filter((p) => p.results > 0)
}

/**
 * The results that were a personal best when they were shot: higher per 10 shots than every earlier result in their
 * position. A first result in a position sets the mark without being one, and a tie isn't one.
 */
export function personalBestIds(evaluations: readonly Scored[]): Set<string> {
  const ids = new Set<string>()
  for (const position of POSITIONS) {
    let best: number | null = null
    for (const e of inOrder(evaluations.filter((x) => x.position === position && x.shots > 0))) {
      const v = wholePer10(e)
      if (v === null) continue
      if (best !== null && v > best) ids.add(e.id)
      if (best === null || v > best) best = v
    }
  }
  return ids
}
