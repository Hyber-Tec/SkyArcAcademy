import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { LuArrowDownRight, LuArrowRight, LuArrowUpRight, LuTarget, LuTrophy } from 'react-icons/lu'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { type Evaluation, POSITION_LABELS, wholePer10, type ResultKind, kindOf } from '@shared/shooting/evaluation'
import { personalBestIds, positionProgress } from '@shared/shooting/progress'
import { todayKey } from '@shared/time'
import type { WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { PageHeader } from '@/components/app/PageHeader'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { plural } from '@/features/home/parts'
import { one } from '@/features/reports/model'
import { CompareCard } from '@/features/students/scores/CompareCard'
import { ResultKindFilter } from '@/features/scores/kinds'
import { ResultsPanel } from '@/features/students/scores/ResultsPanel'
import { prefersReducedMotion } from '@/features/scores/playback'
import { cn } from '@/lib/utils'
import { useFamily, useFamilyEvaluations } from './data'
import { ContactCard, KidFilter, NotLinked } from './FamilyWidgets'
import { ResultOriginal } from './ResultOriginal'
import { PositionCards, ScoresOverTime, ShotPattern } from './ScoreWidgets'

/**
 * Parent and Student → Scores: every result (SIUS results and paper cards), as staff see them on the student's Scores
 * tab but read-only: each position at a glance, the result picked played back on the target shot by shot with the
 * coach's note, every result with its target in small (personal bests marked), the scores over time, where the shots
 * land, and any two compared. A result's original (the SIUS PDF, the card's picture) opens in place. Parents with more
 * than one child pick whose, one at a time. The child, the result and the open original are in the address
 * (`?child=…&score=…&original=1`), so links, reloads and Back keep them.
 */
export function FamilyScoresPage() {
  const { timezone } = useBranch()
  const family = useFamily()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const { data: all, loading } = useFamilyEvaluations(family.ids)
  const results = useRef<HTMLElement>(null)

  const kids = family.kids
  const linked = useMemo(() => all.filter((e) => kids.some((k) => k.id === e.studentId)), [all, kids])
  const scoreParam = params.get('score')
  const fromScore = scoreParam ? (linked.find((e) => e.id === scoreParam) ?? null) : null
  const childParam = params.get('child')
  // The child of the result in the address, the one picked, or the one who shot last.
  const kid = fromScore?.studentId ?? (childParam && kids.some((k) => k.id === childParam) ? childParam : (linked[linked.length - 1]?.studentId ?? kids[0]?.id ?? null))
  const theirs = useMemo(() => linked.filter((e) => e.studentId === kid), [linked, kid])
  // Practice, competitions (a student's whole competition history, bad days too) or evaluations (§23).
  const kindParam = params.get('kind')
  const kind: ResultKind | 'all' = kindParam === 'practice' || kindParam === 'competition' || kindParam === 'evaluation' ? kindParam : 'all'
  const mine = useMemo(() => (kind === 'all' ? theirs : theirs.filter((e) => kindOf(e) === kind)), [theirs, kind])
  const progress = useMemo(() => positionProgress(mine), [mine])
  const bests = useMemo(() => personalBestIds(mine), [mine])
  const ready = !loading && !family.loading
  const several = kids.length > 1
  const name = kid ? family.firstName(kid) : ''
  const student = family.who === 'student'

  const set = (patch: Record<string, string | null>, opts: { push?: boolean; state?: unknown } = {}) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k)
          else next.set(k, v)
        }
        return next
      },
      { replace: !opts.push, state: opts.state, preventScrollReset: true },
    )

  const select = (id: string) => set({ child: several && kid ? kid : null, score: id, original: null })
  const pickKid = (id: string) => set({ child: id, score: null, original: null })
  /** A position's best or latest, picked above the results: brings the results into view. */
  const show = (id: string) => {
    select(id)
    results.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
  }
  // The original opens as a step of its own, so Back (a phone's too) closes it.
  const openOriginal = (e: WithId<Evaluation>) => set({ child: several ? e.studentId : null, score: e.id, original: '1' }, { push: true, state: { original: true } })
  const closeOriginal = () => {
    if ((location.state as { original?: boolean } | null)?.original) navigate(-1)
    else set({ original: null })
  }
  // Only the result the address names (never the newest standing in for one that isn't there).
  const originalOpen = params.get('original') === '1' && !!fromScore?.fileId

  // The window keeps its scroll from page to page (Home scrolled down to its scores, say): a visit starts at the top…
  useLayoutEffect(() => {
    window.scrollTo({ top: 0 })
  }, [])
  // …or, with a result in the address (Home's latest scores, a shared link), at that result once it's there.
  const arrived = useRef(false)
  useEffect(() => {
    if (arrived.current || !ready) return
    arrived.current = true
    if (fromScore) results.current?.scrollIntoView({ block: 'start' })
  }, [ready, fromScore])

  /** How the result picked compares: against the position's average, and whether it's the best so far. */
  const insight = (e: WithId<Evaluation>) => {
    const p = progress.find((x) => x.position === e.position)
    const v = wholePer10(e)
    if (!p || v === null || p.average === null || p.results < 2) return null
    const diff = Math.round((v - p.average) * 10) / 10
    const pos = POSITION_LABELS[e.position].toLowerCase()
    const Icon = diff > 0 ? LuArrowUpRight : diff < 0 ? LuArrowDownRight : LuArrowRight
    const bestSoFar = p.best?.id === e.id && !bests.has(e.id)
    return (
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" data-testid="result-insight">
        <span className={cn('inline-flex items-center gap-1 font-medium', diff > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>
          <Icon className="size-4 shrink-0" aria-hidden />
          {diff === 0 ? `Right at the ${pos} average of ${one(p.average)}` : `${one(Math.abs(diff))} ${diff > 0 ? 'above' : 'below'} the ${pos} average of ${one(p.average)}`}
        </span>
        {bestSoFar ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <LuTrophy className="size-3.5 text-amber-600 dark:text-amber-400" aria-hidden /> {student ? 'Your' : `${name}’s`} best {pos} result so far
          </span>
        ) : null}
      </p>
    )
  }

  if (family.notLinked) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <PageHeader title="Scores" />
        <NotLinked family={family} />
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader title="Scores" description={ready ? (student ? 'Every result from your classes, newest first.' : `Every result from ${name}’s classes, newest first.`) : ' '} className="mb-4" />
      {several ? (
        <div className="mb-4">
          <KidFilter family={family} value={kid ?? ''} onChange={pickKid} everyone={false} />
        </div>
      ) : null}
      {ready ? (
        <div className="mb-4">
          <ResultKindFilter list={theirs} value={kind} onChange={(k) => set({ kind: k === 'all' ? null : k, score: null, original: null })} />
        </div>
      ) : null}

      {!ready ? (
        <div className="space-y-5" aria-busy="true" aria-label="Loading the scores">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Skeleton className="h-28 rounded-xl lg:h-40" />
            <Skeleton className="h-28 rounded-xl lg:h-40" />
            <Skeleton className="h-28 rounded-xl lg:h-40" />
          </div>
          <Skeleton className="h-[28rem] w-full rounded-xl" />
        </div>
      ) : !theirs.length ? (
        <Empty className="border bg-card py-12" data-testid="no-scores">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <LuTarget />
            </EmptyMedia>
            <EmptyTitle>No scores yet</EmptyTitle>
            <EmptyDescription>
              {student
                ? 'Your results show here after your classes, once your coach adds them: SIUS results and paper cards.'
                : `${name}’s results show here after classes, once the coach adds them: SIUS results and paper cards.`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-5">
          {scoreParam && !fromScore ? (
            <p role="status" className="rounded-lg border bg-muted/40 px-4 py-2.5 text-sm text-muted-foreground" data-testid="score-not-found">
              The result in this link isn’t available any more. Here is the latest one instead.
            </p>
          ) : null}
          <PositionCards evaluations={mine} progress={progress} onPick={show} />
          <section ref={results} className="@container scroll-mt-16 overflow-hidden rounded-xl border bg-card md:scroll-mt-4" aria-label="Results" data-testid="family-results">
            <div className="px-5 pt-5 pb-4">
              <h2 className="text-base font-semibold">Results</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {plural(mine.length, 'result')}. Scores are per 10 shots: whole numbers out of 100, and decimals for SIUS results.
              </p>
            </div>
            <ResultsPanel key={kid} evaluations={mine} mode="family" selectedId={fromScore?.id ?? null} onSelect={select} bests={bests} onOriginal={openOriginal} insight={insight} />
          </section>
          <ScoresOverTime evaluations={mine} today={todayKey(timezone)} label={`${student ? 'Your' : `${name}’s`} scores per 10 shots over time`} />
          <ShotPattern key={`pattern-${kid}`} evaluations={mine} />
          <CompareCard key={`compare-${kid}`} evaluations={mine.filter((e) => e.shots > 0)} />
        </div>
      )}

      <div className="mt-6">
        <ContactCard hint="Questions about a result?" />
      </div>
      {originalOpen && fromScore ? <ResultOriginal key={fromScore.id} e={fromScore} onClose={closeOriginal} /> : null}
    </div>
  )
}
