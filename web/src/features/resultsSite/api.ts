import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL, DOC, ROOT } from '@shared/paths'
import type { OnlineAthlete, OnlineMatch, ResultsSiteRun, ResultsSiteStatus } from '@shared/scores/resultsSite'
import { httpsCallable } from '@/lib/callable'
import { db, functions } from '@/lib/firebase'
import { useDoc, useQuery } from '@/lib/firestore'

/** The results site import's data (shared/src/scores/resultsSite.ts), as owners and admins read it, and its callables. */

export function useResultsSite(branchId: string) {
  const statusRef = useMemo(() => doc(db, ROOT.branches, branchId, COL.resultsSite, DOC.resultsSiteStatus), [branchId])
  const status = useDoc<ResultsSiteStatus>(statusRef)
  const athletesQ = useMemo(() => collection(db, ROOT.branches, branchId, COL.onlineAthletes), [branchId])
  const athletes = useQuery<OnlineAthlete>(athletesQ, `online-athletes-${branchId}`)
  // The academy's matches: those with its athletes, newest first.
  const matchesQ = useMemo(() => query(collection(db, ROOT.branches, branchId, COL.onlineMatches), where('ours', '>', 0)), [branchId])
  const matches = useQuery<OnlineMatch>(matchesQ, `online-matches-${branchId}`)
  const runsQ = useMemo(() => query(collection(db, ROOT.branches, branchId, COL.resultsSiteRuns), orderBy('requestedAt', 'desc'), limit(12)), [branchId])
  const runs = useQuery<ResultsSiteRun>(runsQ, `results-site-runs-${branchId}`)
  return { status, athletes, matches, runs }
}

export const saveResultsSiteKey = httpsCallable<{ branchId: string; key: string }, { ok: boolean; keyEnd: string | null }>(functions, 'resultsSiteKey', { timeout: 60_000 })

export const checkResultsSite = httpsCallable<{ branchId: string; kind: 'check' | 'lookBack'; from?: string }, { runId: string }>(functions, 'resultsSiteCheck')

/** A person's answer about an athlete; linking brings their results in, which takes a little while. */
export const answerAthlete = httpsCallable<
  { branchId: string; key: string; action: 'link' | 'ignore' | 'undo'; studentId?: string },
  { ok: boolean; brought: number; waiting: number }
>(functions, 'resultsSiteAthlete', { timeout: 300_000 })
