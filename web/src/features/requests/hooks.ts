import { Timestamp, query, where } from 'firebase/firestore'
import { useMemo, useState } from 'react'
import { COL } from '@shared/paths'
import { MAKEUP_LOOKBACK_DAYS } from '@shared/schedule/classes'
import { type ClassRequest, type ClassSeats, type RequestSeat, OPEN_REQUEST_STATUSES, classChoices, isOpenRequest, requestHorizon, requestWaitsOn } from '@shared/schedule/requests'
import { type DateKey, addDays, todayKey } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useFamilySessions, useMergedQueries } from '@/features/family/data'
import { branchCol, branchDocRef, useDoc, useQuery } from '@/lib/firestore'
import { useNow } from '@/lib/useNow'

const millis = (t: unknown) => (t && typeof t === 'object' && 'toMillis' in t ? (t as { toMillis: () => number }).toMillis() : 0)
/** Answered and withdrawn requests stay listed this long. */
export const RECENT_REQUESTS_MS = 14 * 86_400_000

/** Classes between two dates with how many seats are taken (no names: what families may see), by time. */
export function useClassSeats(from: DateKey, to: DateKey, enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo(
    () => (enabled ? query(branchCol(branchId, COL.classSeats), where('dateKey', '>=', from), where('dateKey', '<=', to)) : null),
    [branchId, from, to, enabled],
  )
  const res = useQuery<ClassSeats>(q, `class-seats-${branchId}-${from}-${to}`)
  const data = useMemo(() => res.data.filter((c) => !c.isDeleted).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin), [res.data])
  return { data, loading: res.loading }
}

/** One class's seats taken, live (a request shows whether its class still has room). */
export function useClassSeat(classId: string | null | undefined) {
  const { branchId } = useBranch()
  const ref = useMemo(() => (classId ? branchDocRef(branchId, COL.classSeats, classId) : null), [branchId, classId])
  return useDoc<ClassSeats>(ref)
}

/** A family's requests (one query per child, as the rules require), newest first. */
export function useFamilyRequests(ids: string[]) {
  const { branchId } = useBranch()
  const queries = useMemo(() => ids.map((id) => query(branchCol(branchId, COL.classRequests), where('studentId', '==', id))), [branchId, ids])
  const res = useMergedQueries<ClassRequest>(queries, `family-requests-${branchId}-${ids.join(',')}`)
  const data = useMemo(() => [...res.data].sort((a, b) => millis(b.createdAt) - millis(a.createdAt)), [res.data])
  return { data, loading: res.loading }
}

/**
 * The office's open requests: `pending`, waiting on the office (soonest class first: the sidebar's and the schedule's
 * count), and `offered`, waiting on the family's answer to a class suggested (soonest suggestion first).
 */
export function useOpenRequests(enabled = true) {
  const { branchId } = useBranch()
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.classRequests), where('status', 'in', [...OPEN_REQUEST_STATUSES])) : null), [branchId, enabled])
  const res = useQuery<ClassRequest>(q, `open-requests-${branchId}`)
  return useMemo(() => {
    const soonest = (a: WithId<ClassRequest>, b: WithId<ClassRequest>) => millis(requestWaitsOn(a).startAt) - millis(requestWaitsOn(b).startAt) || millis(a.createdAt) - millis(b.createdAt)
    const all = [...res.data].sort(soonest)
    return { data: all, pending: all.filter((r) => r.status === 'pending'), offered: all.filter((r) => r.status === 'offered'), loading: res.loading }
  }, [res.data, res.loading])
}

/** Requests still waiting for the office, soonest class first. */
export function usePendingRequests(enabled = true) {
  const open = useOpenRequests(enabled)
  return { data: open.pending, loading: open.loading }
}

/** Requests answered or withdrawn in the last two weeks, the latest first (the office's "Decided"). */
export function useRecentRequests(enabled = true) {
  const { branchId } = useBranch()
  const [since] = useState(() => Date.now() - RECENT_REQUESTS_MS)
  const q = useMemo(() => (enabled ? query(branchCol(branchId, COL.classRequests), where('updatedAt', '>=', Timestamp.fromMillis(since))) : null), [branchId, enabled, since])
  const res = useQuery<ClassRequest>(q, `recent-requests-${branchId}-${since}`)
  const data = useMemo(() => res.data.filter((r) => !isOpenRequest(r)).sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt)), [res.data])
  return { data, loading: res.loading }
}

/** One request, live, whatever its state (a notice's link or a list opens it). */
export function useRequest(id: string | null) {
  const { branchId } = useBranch()
  const ref = useMemo(() => (id ? branchDocRef(branchId, COL.classRequests, id) : null), [branchId, id])
  return useDoc<ClassRequest>(ref)
}

const seatOf = (s: WithId<Session>): RequestSeat => ({
  id: s.id,
  classId: s.classId,
  studentId: s.studentId,
  dateKey: s.dateKey,
  startMin: s.startMin,
  endMin: s.endMin,
  status: s.status,
  note: s.note,
  isDeleted: s.isDeleted,
  startMs: millis(s.startAt),
})

/**
 * The classes a student could ask for now, or the office suggest to them (`classChoices`): seats open, ahead within the
 * families' horizon, none they're in or at the same time (the class being moved aside), none another open request asks
 * for (but `requestId`'s own), none in `exclude`. Also gives their seats and requests, read for it.
 */
export function useClassChoices(opts: { studentId: string; forSessionId: string | null; requestId?: string | null; exclude?: readonly (string | null | undefined)[]; seatsUntil?: DateKey }) {
  const { timezone, settings } = useBranch()
  const now = useNow(60_000)
  const today = todayKey(timezone, now)
  const horizon = requestHorizon(today, settings)
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS)
  const ids = useMemo(() => (opts.studentId ? [opts.studentId] : []), [opts.studentId])
  const seats = useFamilySessions(ids, since, opts.seatsUntil && opts.seatsUntil > horizon ? opts.seatsUntil : horizon)
  const requests = useFamilyRequests(ids)
  const classes = useClassSeats(today, horizon)
  const pending = useMemo(() => requests.data.filter((r) => isOpenRequest(r) && r.id !== opts.requestId), [requests.data, opts.requestId])
  const exclude = (opts.exclude ?? []).join('|')
  const choices = useMemo(
    () =>
      classChoices(
        classes.data.map((c) => ({ ...c, startMs: millis(c.startAt) })),
        { seats: seats.data.map(seatOf), pending, forSessionId: opts.forSessionId, nowMs: now, horizon, exclude: exclude.split('|') },
      ),
    [classes.data, seats.data, pending, opts.forSessionId, now, horizon, exclude],
  )
  return { choices, seats, requests, pending, today, since, horizon, loading: seats.loading || classes.loading || requests.loading }
}
