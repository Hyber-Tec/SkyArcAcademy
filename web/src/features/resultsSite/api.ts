import { collection, doc, limit, orderBy, query, where } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { COL, DOC, ROOT } from '@shared/paths'
import type { OnlineAthlete, OnlineMatch, ResetCounts, ResultPreview, ResultsSiteRun, ResultsSiteStatus } from '@shared/scores/resultsSite'
import type { Evaluation, Position } from '@shared/shooting/evaluation'
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
  // The results it brought into the scores (a results sheet's brought up to the site's among them), by ID.
  const resultsQ = useMemo(() => query(collection(db, ROOT.branches, branchId, COL.evaluations), where('source', '==', 'online')), [branchId])
  const results = useQuery<Evaluation>(resultsQ, `online-results-${branchId}`)
  return { status, athletes, matches, runs, results }
}

export const checkResultsSite = httpsCallable<{ branchId: string; kind: 'check' | 'lookBack'; from?: string }, { runId: string }>(functions, 'resultsSiteCheck')

/**
 * A person's answer about an athlete (linking brings their results in, which takes a little while), or about a result
 * whose results sheet's scan has other numbers.
 */
export const answerAthlete = httpsCallable<
  { branchId: string; key: string; action: 'link' | 'ignore' | 'undo' | 'useSite' | 'keepBoth'; studentId?: string; resultCofId?: string; position?: Position },
  { ok: boolean; brought: number; waiting: number }
>(functions, 'resultsSiteAthlete', { timeout: 300_000 })

/** Confirm all: each athlete linked to the student suggested for them; their results come in (a while: up to minutes). */
export const linkAllAthletes = httpsCallable<{ branchId: string; links: { key: string; studentId: string }[] }, { linked: number; brought: number; waiting: number }>(
  functions,
  'resultsSiteLinkAll',
  { timeout: 540_000 },
)

/** Start over: what the results site brought in goes, and the results sheet scans it changed are put back. */
export const resetResultsSite = httpsCallable<{ branchId: string }, ResetCounts>(functions, 'resultsSiteReset', { timeout: 300_000 })

const previewResults = httpsCallable<{ branchId: string; resultCofIds: string[] }, { previews: Record<string, ResultPreview> }>(functions, 'resultsSitePreview', {
  timeout: 120_000,
})

/** Results read for the page this visit, by their ID: opening an athlete again shows them at once. */
const previewCache = new Map<string, ResultPreview>()

/**
 * An athlete's results as the site has them now (`resultsSitePreview`), read when `enabled` (their row is open): to see
 * them before linking, as the scores will show them.
 */
export function useResultPreviews(branchId: string, ids: readonly string[], enabled: boolean) {
  // This page's answers too: the ones not worth keeping for the visit (the site didn't answer).
  const [answers, setAnswers] = useState<Record<string, ResultPreview>>({})
  const [failed, setFailed] = useState<{ key: string; error: string } | null>(null)
  const missing = enabled ? ids.filter((id) => !previewCache.has(id) && !answers[id]) : []
  const missingKey = missing.slice(0, 20).join(',')
  useEffect(() => {
    if (!missingKey) return
    let live = true
    previewResults({ branchId, resultCofIds: missingKey.split(',') })
      .then((r) => {
        for (const [id, p] of Object.entries(r.data.previews)) if (!p.error || /not published|no shots/i.test(p.error)) previewCache.set(id, p)
        if (live) setAnswers((a) => ({ ...a, ...r.data.previews }))
      })
      .catch((e: unknown) => {
        if (live) setFailed({ key: missingKey, error: (e as { message?: string }).message?.replace(/^.*?: /, '') || 'The results site didn’t answer.' })
      })
    return () => {
      live = false
    }
  }, [branchId, missingKey])
  const data = Object.fromEntries(
    ids.flatMap((id) => {
      const p = previewCache.get(id) ?? answers[id]
      return p ? [[id, p] as const] : []
    }),
  )
  const error = failed && failed.key === missingKey ? failed.error : null
  return { data, error, loading: !!missingKey && !error }
}
