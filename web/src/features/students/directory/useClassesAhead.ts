import { query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL } from '@shared/paths'
import { NEXT_CLASS_DAYS, classesAhead } from '@shared/studentList'
import { addDays, nowMinutes, todayKey } from '@shared/time'
import type { Session } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { branchCol, useQuery } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'

/**
 * Every student's next class with its time, and whether one of theirs ended today, from the coming two weeks' classes in
 * one query. A student record keeps only the dates (`nextSessionDate`, `lastSessionDate`: the nightly job's), so the
 * Students page reads the seats for the time; `read` is false until they're in (or when they can't be), and the page
 * shows the record's dates meanwhile. The minute ticks on, so a class that ends moves on to the next.
 */
export function useClassesAhead() {
  const { branchId, timezone } = useBranch()
  const now = useNow(60_000)
  const today = todayKey(timezone, now)
  const until = addDays(today, NEXT_CLASS_DAYS - 1)
  const nowMin = nowMinutes(timezone, now)
  const q = useMemo(() => query(branchCol(branchId, COL.sessions), where('dateKey', '>=', today), where('dateKey', '<=', until)), [branchId, today, until])
  // A new day keeps the last one's seats until its own are in.
  const seats = useQuery<Session>(q, `students-ahead-${branchId}-${today}`, { keepPrevious: true })
  const byStudent = useMemo(() => classesAhead(seats.data, today, nowMin), [seats.data, today, nowMin])
  return { byStudent, read: !seats.loading && !seats.error, today, until }
}
