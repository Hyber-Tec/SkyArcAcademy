import { getDocs, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { COL } from '@shared/paths'
import type { Evaluation } from '@shared/shooting/evaluation'
import { type DateKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchCol, useQuery } from '@/lib/firestore'

/**
 * What the Scores page reads: every student's results from a day on, live (one query on the results' day, so no index
 * of its own), and once, the scores of everything older, kept small (no shots): a "New best" is set against the
 * student's own earlier results, and "no score for 30 days" says when the last one was.
 */

/** An older result, as much of it as the page needs. */
export interface EarlierScore {
  id: string
  studentId: string
  position: Evaluation['position']
  dateKey: DateKey
  timeMin: number | null
  wholeTotal: number
  shots: number
  total: number
  /** A SIUS result's printed time: the same result added again is known by it. */
  printed: string | null
}

const slim = (id: string, e: Evaluation): EarlierScore => ({
  id,
  studentId: e.studentId,
  position: e.position,
  dateKey: e.dateKey,
  timeMin: e.timeMin ?? null,
  wholeTotal: e.wholeTotal,
  shots: e.shots,
  total: e.total,
  printed: e.sius?.printed ?? null,
})

/** Older scores already read during this visit: coming back from a student's page doesn't read them again. */
const earlierCache = new Map<string, { at: number; read: Promise<EarlierScore[]> }>()
const EARLIER_FOR_MS = 5 * 60_000

function readEarlier(branchId: string, before: DateKey): Promise<EarlierScore[]> {
  const key = `${branchId}|${before}`
  const hit = earlierCache.get(key)
  if (hit && Date.now() - hit.at < EARLIER_FOR_MS) return hit.read
  const read = getDocs(query(branchCol(branchId, COL.evaluations), where('dateKey', '<', before))).then((snap) => snap.docs.map((d) => slim(d.id, d.data() as Evaluation)))
  earlierCache.set(key, { at: Date.now(), read })
  read.catch(() => earlierCache.delete(key))
  return read
}

/**
 * Every result from `from` on, live, and the scores before it. The live part only reaches further back while the page
 * is open (a shorter range is the same list, filtered), so the older scores read once, before where it first began,
 * always meet it.
 */
export function useScoresData(from: DateKey) {
  const { branchId } = useBranch()
  const [start, setStart] = useState(from)
  if (from < start) setStart(from)
  // Where the live list began when the page opened: everything before it is read once.
  const [before] = useState(from)
  const q = useMemo(() => query(branchCol(branchId, COL.evaluations), where('dateKey', '>=', start)), [branchId, start])
  const live = useQuery<Evaluation>(q, `scores-page-${branchId}-${start}`, { keepPrevious: true })
  const [earlier, setEarlier] = useState<{ key: string; list: EarlierScore[] } | null>(null)
  const earlierKey = `${branchId}|${before}`
  useEffect(() => {
    let alive = true
    readEarlier(branchId, before).then(
      (list) => alive && setEarlier({ key: earlierKey, list }),
      () => alive && setEarlier({ key: earlierKey, list: [] }),
    )
    return () => {
      alive = false
    }
  }, [branchId, before, earlierKey])
  const older = earlier?.key === earlierKey ? earlier.list : null
  return {
    /** Results from `start` on (at least `from`), live. */
    results: live.data as WithId<Evaluation>[],
    loading: live.loading && !live.data.length,
    error: live.error,
    /** The day the live list starts on. */
    start,
    /** Older scores (null while they're read). */
    earlier: older,
  }
}
