import { type ReactNode, useId, useMemo, useState } from 'react'
import { LuCheck, LuCheckCheck, LuChevronDown, LuExternalLink, LuHistory, LuRefreshCw, LuSettings, LuTrophy, LuUndo2, LuUserX } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { DEMO_ACADEMY_ID } from '@shared/academy'
import { namesOf } from '@shared/names'
import { resultRows } from '@shared/scores/match'
import {
  type AthleteResult,
  type OnlineAthlete,
  type OnlineMatch,
  type ResultsSiteRun,
  RESULT_STATE_WORDS,
  RUN_KIND_LABELS,
  checkWindowWords,
  confirmAllPlan,
  isUnderWay,
  nextScheduled,
  resultState,
  scheduleWords,
} from '@shared/scores/resultsSite'
import { resultUrl } from '@shared/scores/scopos'
import { type Evaluation, POSITIONS, POSITION_LABELS, type Position } from '@shared/shooting/evaluation'
import { type DateKey, addMonths, formatDateKey, formatInstant, formatMinutesShort, todayKey } from '@shared/time'
import type { Student, TimestampLike, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useStudentList } from '@/features/data/hooks'
import { ResultListHead, ResultRow, Unfold } from '@/features/scores/ResultRow'
import { useOpenRows } from '@/features/scores/results'
import { useResultActions } from '@/features/scores/useResultActions'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { answerAthlete, checkResultsSite, linkAllAthletes, useResultPreviews, useResultsSite } from './api'
import { ResultsSiteDialog } from './ResultsSiteDialog'

/**
 * Settings → Results site (the fourth meeting's R1, shared/src/scores/resultsSite.ts; simpler at Goo's asks of 2026-11-10
 * and 2026-11-11): the competition results the app brings in from the tournaments' results site, with no link to paste.
 * Check now looks at the last month (Look back, at the months before); the gear holds when it checks on its own, what it
 * looks for, and Start over. Each athlete it finds is a row that opens on their results as the scores show them (read
 * from the site before they're linked), to be sure who they are; Confirm all links each to the student suggested.
 */

const errorText = (e: unknown, fallback: string) => (e as { message?: string }).message?.replace(/^.*?: /, '') || fallback
const ms = (t: TimestampLike | null | undefined) => (t ? t.toDate().getTime() : null)
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

/** How far a look-back goes. */
const LOOK_BACK = [
  { months: 3, label: 'The last 3 months' },
  { months: 6, label: 'The last 6 months' },
  { months: 12, label: 'The last year' },
  { months: 24, label: 'The last 2 years' },
] as const

const STATUS_WORDS: Record<string, string> = { OFFICIAL: 'Official', UNOFFICIAL: 'Unofficial', INTERMEDIATE: 'Under way', FUTURE: 'Not started' }

/** An athlete's results, newest first. */
const resultsOf = (a: OnlineAthlete): [string, AthleteResult][] =>
  Object.entries(a.results ?? {}).sort(([, x], [, y]) => y.dateKey.localeCompare(x.dateKey) || x.matchName.localeCompare(y.matchName))

/** A results sheet's scan of a result that the site has with other numbers, waiting for a person. */
interface ScanToCheck {
  athlete: WithId<OnlineAthlete>
  resultCofId: string
  result: AthleteResult
  position: Position
}

export function ResultsSiteSettings() {
  const { branchId, timezone, settings } = useBranch()
  const { status, athletes, matches, runs, results } = useResultsSite(branchId)
  const students = useStudentList()
  const { confirm, dialog } = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openAthletes = useOpenRows()
  const now = useNow(60_000)

  if (branchId === DEMO_ACADEMY_ID)
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuTrophy /> Results site
          </CardTitle>
          <CardDescription>The demo academy’s people are made up, so it brings in no results. The academy’s Settings has this page.</CardDescription>
        </CardHeader>
      </Card>
    )

  const s = status.data
  const running = runs.data.find((r) => isUnderWay(r, now)) ?? null
  const today = todayKey(timezone)
  const toConfirm = athletes.data.filter((a) => a.status === 'new').sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.name.localeCompare(b.name))
  const linked = athletes.data.filter((a) => a.status === 'linked').sort((a, b) => (a.studentName ?? a.name).localeCompare(b.studentName ?? b.name))
  const ignored = athletes.data.filter((a) => a.status === 'ignored').sort((a, b) => a.name.localeCompare(b.name))
  const studentById = new Map(students.data.map((st) => [st.id, st]))
  const plan = confirmAllPlan(toConfirm, today, (id) => studentById.has(id))
  const scans: ScanToCheck[] = linked.flatMap((athlete) =>
    Object.entries(athlete.results ?? {}).flatMap(([resultCofId, result]) =>
      POSITIONS.filter((p) => result.sheets?.[p]?.state === 'differs').map((position) => ({ athlete, resultCofId, result, position })),
    ),
  )
  const byId = new Map(results.data.map((e) => [e.id, e]))

  async function act<T>(key: string, run: () => Promise<T>, done: (r: T) => string, fallback: string) {
    setBusy(key)
    try {
      toast.success(done(await run()))
    } catch (e) {
      toast.error(errorText(e, fallback))
    } finally {
      setBusy(null)
    }
  }

  const link = (a: WithId<OnlineAthlete>, student: WithId<Student>) =>
    act(
      `athlete-${a.id}`,
      () => answerAthlete({ branchId, key: a.id, action: 'link', studentId: student.id }).then((r) => r.data),
      (r) =>
        r.brought
          ? `${a.name} is ${student.name}: ${plural(r.brought, 'result')} brought in.`
          : r.waiting
            ? `${a.name} is ${student.name}: their results come in with the check under way.`
            : `${a.name} is ${student.name}. Their results come in as the site has them.`,
      'Couldn’t link the athlete',
    )

  async function confirmAll() {
    const pairs = plan.links.flatMap((l) => {
      const athlete = toConfirm.find((a) => a.id === l.key)
      const student = studentById.get(l.studentId)
      return athlete && student ? [{ key: l.key, athlete, student }] : []
    })
    const left = toConfirm.length - pairs.length
    const ok = await confirm({
      title: `Confirm ${plural(pairs.length, 'athlete')}?`,
      description: (
        <span className="block space-y-3">
          <span className="block">
            Each is linked to the student suggested for them, and their {plural(plan.results, 'result')} come into the students’ scores.
            {plan.news ? ` ${plural(plan.news, 'result is', 'results are')} from the last week: the family hears of ${plan.news === 1 ? 'it' : 'them'}, as of any new score.` : ''}
            {left ? ` ${plural(left, 'athlete')} without a suggestion ${left === 1 ? 'stays' : 'stay'} for you to pick.` : ''}
          </span>
          <span className="block max-h-56 overflow-y-auto rounded-md border text-left text-[13px]">
            <span className="flex justify-between gap-3 border-b bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
              <span>On the results site</span>
              <span>Student</span>
            </span>
            {pairs.map((p) => (
              <span key={p.key} className="flex items-baseline justify-between gap-3 border-b px-3 py-1.5 last:border-b-0">
                <span className="min-w-0 truncate text-muted-foreground">{p.athlete.name}</span>
                <span className="shrink-0 font-medium text-foreground">{p.student.name}</span>
              </span>
            ))}
          </span>
        </span>
      ),
      confirmLabel: `Confirm ${pairs.length}`,
    })
    if (!ok) return
    await act(
      'confirm-all',
      () => linkAllAthletes({ branchId, links: pairs.map((p) => ({ key: p.key, studentId: p.student.id })) }).then((r) => r.data),
      (r) =>
        `${plural(r.linked, 'athlete')} linked${r.brought ? `: ${plural(r.brought, 'result')} brought in` : ''}${r.waiting ? `; ${plural(r.waiting, 'more comes', 'more come')} in with the next check` : ''}.`,
      'Couldn’t confirm them',
    )
  }

  async function notOurs(a: WithId<OnlineAthlete>) {
    const ok = await confirm({
      title: `${a.name} isn’t the academy’s?`,
      description: 'The app stops suggesting them and brings in none of their results. You can undo it below.',
      confirmLabel: 'Not the academy’s',
    })
    if (ok) await act(`athlete-${a.id}`, () => answerAthlete({ branchId, key: a.id, action: 'ignore' }), () => `${a.name} won’t be suggested again.`, 'Couldn’t save the answer')
  }

  const undo = (a: WithId<OnlineAthlete>) =>
    act(`athlete-${a.id}`, () => answerAthlete({ branchId, key: a.id, action: 'undo' }), () => `${a.name} is back with the athletes to confirm. Results already brought in stay.`, 'Couldn’t undo it')

  async function answerScan(x: ScanToCheck, use: 'useSite' | 'keepBoth') {
    const who = x.athlete.studentName ?? x.athlete.name
    if (use === 'useSite') {
      const ok = await confirm({
        title: `Use the results site’s ${POSITION_LABELS[x.position].toLowerCase()} result?`,
        description: `${who}’s results sheet scan of ${formatDateKey(x.result.dateKey, 'medium')} takes the site’s numbers, every shot’s place and order; its photo and note stay. The site’s separate copy goes, so the result shows once.`,
        confirmLabel: 'Use the site’s',
      })
      if (!ok) return
    }
    await act(
      `scan-${x.resultCofId}-${x.position}`,
      () => answerAthlete({ branchId, key: x.athlete.id, action: use, resultCofId: x.resultCofId, position: x.position }),
      () => (use === 'useSite' ? `${who}’s result shows once now, with the site’s numbers.` : `Both of ${who}’s results stay.`),
      'Couldn’t save the answer',
    )
  }

  const schedule = settings.resultsSite.schedule
  const next = nextScheduled(schedule, now, timezone)
  const lastAt = ms(s?.lastRun?.at)
  const noKey = !status.loading && !s?.keyEnd
  const stop = !!busy || !!running

  return (
    <div className="space-y-4" data-testid="results-site">
      <Card data-testid="results-site-status">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <LuTrophy /> Competition results
            </CardTitle>
            <CardDescription>The app finds the academy’s athletes on the tournaments’ results site and brings their results into their scores, every shot where it landed.</CardDescription>
          </div>
          <Button variant="outline" size="icon" aria-label="Results site settings" title="Settings" onClick={() => setSettingsOpen(true)} data-testid="results-site-gear">
            <LuSettings />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm" data-testid="results-site-last">
            {running ? (
              <p className="flex items-center gap-2 font-medium">
                <Spinner /> Checking{running.state === 'queued' ? ' (starting)' : running.matches ? `: ${plural(running.matches, 'match', 'matches')} read so far` : ''}…
              </p>
            ) : busy === 'confirm-all' ? (
              <p className="flex items-center gap-2 font-medium">
                <Spinner /> Linking them and bringing their results in…
              </p>
            ) : s?.lastRun && lastAt ? (
              <p>
                <span className="font-medium">
                  {s.lastRun.ok ? 'Last checked' : 'The last check stopped'} {formatInstant(lastAt, timezone)}.
                </span>{' '}
                <span className="text-muted-foreground">{s.lastRun.summary}</span>
              </p>
            ) : (
              <p className="text-muted-foreground">Not checked yet.</p>
            )}
            {running && s?.going ? (
              <p className="text-muted-foreground">
                {s.going.kind === 'lookBack' ? `Looking back to ${formatDateKey(s.going.from, 'medium')}` : 'It goes on over a few checks'}:{' '}
                {s.going.cursor < s.going.from ? 'the championships and the older matches are next.' : `the days up to ${formatDateKey(s.going.cursor, 'medium')} are next.`}
              </p>
            ) : null}
            <p className="text-muted-foreground">
              Checks on its own:{' '}
              <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setSettingsOpen(true)}>
                {schedule.on ? scheduleWords(schedule) : 'off'}
              </button>
              {next ? ` · next ${formatDateKey(next.dateKey, 'weekdayShort')} at ${formatMinutesShort(next.hour * 60)}` : ''}
            </p>
          </div>
          {noKey ? <p className="text-sm text-amber-700 dark:text-amber-400">The results site’s key isn’t set up: ask HyberTec.</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={noKey || stop}
              onClick={() => void act('check', () => checkResultsSite({ branchId, kind: 'check' }), () => 'Checking the results site: what it finds shows here as it goes.', 'Couldn’t start a check')}
              data-testid="results-site-check"
            >
              {busy === 'check' ? <Spinner /> : <LuRefreshCw />} Check now
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={noKey || stop} data-testid="results-site-look-back">
                  <LuHistory /> Look back <LuChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">The matches from before, two weeks at a time</DropdownMenuLabel>
                {LOOK_BACK.map((o) => {
                  const from: DateKey = addMonths(today, -o.months)
                  return (
                    <DropdownMenuItem
                      key={o.months}
                      onSelect={() =>
                        void act('check', () => checkResultsSite({ branchId, kind: 'lookBack', from }), () => `Looking back to ${formatDateKey(from, 'medium')}: it goes on over a few checks.`, 'Couldn’t start the look-back')
                      }
                    >
                      {o.label}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <span className="text-xs text-muted-foreground">Check now looks at {checkWindowWords(settings.resultsSite.checkDays).toLowerCase()}.</span>
          </div>
        </CardContent>
      </Card>

      {toConfirm.length ? (
        <Card className="gap-0 overflow-hidden pb-0" data-testid="results-site-confirm">
          <CardHeader className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <CardTitle className="flex items-center gap-2">
                To confirm <Badge variant="secondary">{toConfirm.length}</Badge>
              </CardTitle>
              <CardDescription>
                On the academy’s teams, or named like a student. Open one to see their results as the scores will show them, then link them to their
                student: their results come in from then on. Nobody is linked on their own: two athletes can share a name.
              </CardDescription>
            </div>
            {plan.links.length ? (
              <Button className="shrink-0" disabled={stop} onClick={() => void confirmAll()} data-testid="results-site-confirm-all">
                {busy === 'confirm-all' ? <Spinner /> : <LuCheckCheck />} Confirm all ({plan.links.length})
              </Button>
            ) : null}
          </CardHeader>
          <ul className="@container border-t">
            {toConfirm.map((a) => {
              const suggested = a.suggestedStudentId ? studentById.get(a.suggestedStudentId) : undefined
              const list = resultsOf(a)
              return (
                <AthleteRow
                  key={a.id}
                  id={a.id}
                  open={openAthletes.isOpen(a.id)}
                  onToggle={() => openAthletes.toggle(a.id)}
                  title={a.name}
                  sub={`${a.why} · ${plural(list.length, 'result')}`}
                  actions={
                    <>
                      {suggested ? (
                        <Button size="sm" disabled={!!busy} onClick={() => void link(a, suggested)} title={`Link to ${suggested.name}`} data-testid={`results-link-${a.id}`}>
                          {busy === `athlete-${a.id}` ? <Spinner /> : <LuCheck />} {suggested.name}
                        </Button>
                      ) : null}
                      <StudentPick students={students.data} onPick={(st) => void link(a, st)}>
                        <Button size="sm" variant="outline" disabled={!!busy}>
                          {suggested ? 'Another' : 'Link to a student'} <LuChevronDown />
                        </Button>
                      </StudentPick>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void notOurs(a)} title="Not the academy’s">
                        <LuUserX /> Not ours
                      </Button>
                    </>
                  }
                >
                  <SiteResults athlete={a} list={list} />
                </AthleteRow>
              )
            })}
          </ul>
        </Card>
      ) : null}

      {scans.length ? (
        <Card data-testid="results-site-scans">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Results sheet scans to check <Badge variant="secondary">{scans.length}</Badge>
            </CardTitle>
            <CardDescription>
              The same day and position as a result on the site, with other numbers: the same match, read differently, or two matches that day. Use the
              site’s (the scan takes its numbers, every shot’s place and order, and shows once), or keep both.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {scans.map((x) => {
                const scan = x.result.sheets![x.position]!
                const siteId = x.result.evaluations?.[x.position]
                const site = siteId ? byId.get(siteId) : undefined
                const who = x.athlete.studentName ?? x.athlete.name
                const key = `scan-${x.resultCofId}-${x.position}`
                return (
                  <li key={key} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center" data-testid={key}>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-medium">
                        {who} · {formatDateKey(x.result.dateKey, 'medium')} · {POSITION_LABELS[x.position]}
                      </p>
                      <p className="text-muted-foreground">
                        Results sheet scan: {scan.wholeTotal}, {plural(scan.shots, 'shot')} · the results site:{' '}
                        {site ? `${site.wholeTotal}${Number.isInteger(site.total) ? '' : ` (${site.total.toFixed(1)})`}, ${plural(site.shots, 'shot')}` : 'not in the scores any more'}
                      </p>
                      <p className="flex flex-wrap gap-x-3 text-xs">
                        <span className="text-muted-foreground">{x.result.matchName}</span>
                        <Link className="underline-offset-2 hover:underline" to={`/admin/students/${x.athlete.studentId}/scores?score=${scan.id}`}>
                          The scan in the scores
                        </Link>
                        <a className="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={resultUrl(x.resultCofId)} target="_blank" rel="noreferrer">
                          On the results site <LuExternalLink className="size-3" />
                        </a>
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" disabled={!!busy || !site} onClick={() => void answerScan(x, 'useSite')}>
                        {busy === key ? <Spinner /> : null} Use the site’s
                      </Button>
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void answerScan(x, 'keepBoth')}>
                        Keep both
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card className="gap-0 overflow-hidden pb-0" data-testid="results-site-linked">
        <CardHeader className="pb-5">
          <CardTitle className="flex items-center gap-2">
            The academy’s athletes {linked.length ? <Badge variant="secondary">{linked.length}</Badge> : null}
          </CardTitle>
          <CardDescription>Linked to a student: their results are in the student’s scores, and change when the site corrects them. Open one to see them.</CardDescription>
        </CardHeader>
        {athletes.loading ? (
          <div className="border-t p-4">
            <Skeleton className="h-24 rounded-lg" />
          </div>
        ) : linked.length ? (
          <ul className="@container border-t" data-testid="results-site-linked-list">
            {linked.map((a) => (
              <AthleteRow
                key={a.id}
                id={a.id}
                open={openAthletes.isOpen(a.id)}
                onToggle={() => openAthletes.toggle(a.id)}
                title={
                  <>
                    {a.studentName ?? a.name}
                    {a.studentName && a.studentName !== a.name ? <span className="font-normal text-muted-foreground"> · on the site as {a.name}</span> : null}
                  </>
                }
                sub={linkedWords(a)}
                actions={
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void undo(a)} title="Not this student after all">
                    <LuUndo2 /> Undo
                  </Button>
                }
              >
                <LinkedResults athlete={a} evaluations={results.data} />
              </AthleteRow>
            ))}
          </ul>
        ) : (
          <p className="border-t px-6 py-5 text-sm text-muted-foreground">No athlete linked yet{toConfirm.length ? ': confirm the athletes above' : ''}.</p>
        )}
        {ignored.length ? (
          <Collapsible className="border-t px-6 py-3">
            <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <LuChevronDown className="size-4 transition-transform group-data-[state=closed]:-rotate-90" /> Not the academy’s ({ignored.length})
            </CollapsibleTrigger>
            <CollapsibleContent>
              <ul className="mt-2 mb-1 divide-y rounded-lg border">
                {ignored.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 p-2 pl-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {a.name} <span className="text-muted-foreground">· {a.teams[0] ?? a.hosts[0] ?? ''}</span>
                    </span>
                    <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void undo(a)}>
                      <LuUndo2 /> Undo
                    </Button>
                  </li>
                ))}
              </ul>
            </CollapsibleContent>
          </Collapsible>
        ) : null}
      </Card>

      <MatchesSection matches={matches.data} athletes={athletes.data} />
      <RunsSection runs={runs.data} timezone={timezone} />
      <ResultsSiteDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        busy={stop}
        counts={{
          athletes: athletes.data.length,
          results: results.data.filter((e) => e.id.startsWith('online-')).length,
          scans: athletes.data.reduce((n, a) => n + Object.values(a.results ?? {}).reduce((k, r) => k + POSITIONS.filter((p) => r.sheets?.[p]?.state === 'upgraded').length, 0), 0),
          matches: matches.data.length,
          checks: runs.data.length,
        }}
      />
      {dialog}
    </div>
  )
}

/** "3 results: 2 in the scores, 1 not yet · last Oct 31": a linked athlete's results at a glance. */
function linkedWords(a: OnlineAthlete): string {
  const all = Object.values(a.results ?? {})
  const inScores = all.filter((r) => resultState(r) === 'in').length
  const rest = all.length - inScores
  return `${plural(all.length, 'result')}${all.length ? `: ${inScores} in the scores${rest ? `, ${rest} not yet` : ''}` : ''} · last ${formatDateKey(a.lastSeen, 'medium')}`
}

/**
 * An athlete as a row that opens under itself (any number at once), like a result in the scores: who, how they were
 * found or where their results are, the answers on the right (under it on a phone), and opened, their results.
 */
function AthleteRow({
  id,
  open,
  onToggle,
  title,
  sub,
  actions,
  children,
}: {
  id: string
  open: boolean
  onToggle: () => void
  title: ReactNode
  sub: string
  actions: ReactNode
  children: ReactNode
}) {
  const detail = useId()
  return (
    <li className="relative border-b last:border-b-0" data-testid={`results-athlete-${id}`}>
      {open ? <span className="absolute inset-y-0 left-0 z-10 w-0.5 bg-brand-solid" aria-hidden /> : null}
      <div className={cn('flex flex-col gap-2 px-4 py-3 transition-colors @xl:flex-row @xl:items-center @xl:gap-4 @xl:px-6', open ? 'bg-muted/50' : 'hover:bg-muted/30')}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={open ? detail : undefined}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-testid="athlete-toggle"
        >
          <LuChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', open ? 'text-foreground' : '-rotate-90')} aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{title}</span>
            <span className="block text-xs text-muted-foreground">{sub}</span>
          </span>
        </button>
        <div className="flex flex-wrap gap-2 pl-7 @xl:pl-0">{actions}</div>
      </div>
      <Unfold open={open} id={detail}>
        <div className="border-t bg-muted/20">{children}</div>
      </Unfold>
    </li>
  )
}

/** Results as the scores list shows them: a row each, opening on its target, shots and series. */
function ResultList({
  evaluations,
  actions,
  footerOf,
}: {
  evaluations: WithId<Evaluation>[]
  /** Correct and delete, as on the Scores page (results in the scores only). */
  actions?: ReturnType<typeof useResultActions>
  footerOf?: (e: WithId<Evaluation>) => ReactNode
}) {
  const rows = useMemo(() => resultRows(evaluations), [evaluations])
  const open = useOpenRows()
  const none = useMemo(() => new Set<string>(), [])
  if (!rows.length) return null
  return (
    <div className="@container bg-card">
      <ResultListHead />
      <ul className="border-t @xl:border-t-0">
        {rows.map((row) => (
          <ResultRow
            key={row.key}
            row={row}
            mode="admin"
            open={open.isOpen(row.key)}
            onToggle={() => open.toggle(row.key)}
            entries={actions ? actions.entriesOf(row) : []}
            bests={none}
            footer={footerOf?.(row.results[0])}
          />
        ))}
      </ul>
    </div>
  )
}

/** A result that isn't in the scores (or couldn't be read): its day, match, why, and its page on the site. */
function ResultLine({ cof, r, words }: { cof: string; r: AthleteResult; words: ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5 px-4 py-2.5 text-sm sm:flex-row sm:items-baseline sm:gap-x-3 @xl:px-6">
      <span className="text-muted-foreground tabular-nums sm:w-24 sm:shrink-0">{formatDateKey(r.dateKey, 'medium')}</span>
      <span className="min-w-0 flex-1">
        <span>{r.matchName}</span>
        {r.team ? <span className="text-muted-foreground"> · {r.team}</span> : null}
        <span className="block text-xs text-muted-foreground">{words}</span>
      </span>
      <a className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground" href={resultUrl(cof)} target="_blank" rel="noreferrer" data-testid={`results-open-${cof}`}>
        Open on the site <LuExternalLink className="size-3" />
      </a>
    </li>
  )
}

/**
 * An athlete to confirm, opened: their results read from the site now, each a row as the scores will show it (its
 * target, shots and series, and its page on the site), to be sure who they are before linking.
 */
function SiteResults({ athlete, list }: { athlete: WithId<OnlineAthlete>; list: [string, AthleteResult][] }) {
  const { branchId } = useBranch()
  const ids = useMemo(() => list.map(([id]) => id).slice(0, 20), [list])
  const previews = useResultPreviews(branchId, ids, true)
  const shown = useMemo(
    () =>
      list.flatMap(([cof, r]) =>
        (previews.data[cof]?.results ?? []).map(
          (e): WithId<Evaluation> => ({
            ...e,
            id: `${athlete.id}-${cof}-${e.position}`,
            // A row of its own for each athlete, though two shot the same match.
            studentId: `preview-${athlete.id}`,
            online: e.online ? { ...e.online, team: r.team } : e.online,
          }),
        ),
      ),
    [list, previews.data, athlete.id],
  )
  const unread = previews.error ? list : list.filter(([cof]) => previews.data[cof]?.error)
  if (previews.loading && !shown.length)
    return (
      <div className="space-y-2 px-4 py-4 @xl:px-6">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Reading {plural(ids.length, 'result')} from the results site…
        </p>
        <Skeleton className="h-14 rounded-lg" />
      </div>
    )
  return (
    <div data-testid={`results-preview-${athlete.id}`}>
      <ResultList evaluations={shown} />
      {unread.length ? (
        <ul className="divide-y border-t">
          {unread.map(([cof, r]) => (
            <ResultLine key={cof} cof={cof} r={r} words={previews.error ? `Couldn’t be read just now: ${previews.error}` : previews.data[cof]?.error} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** A linked athlete, opened: their results in the student's scores, each a row as there, then those not in yet. */
function LinkedResults({ athlete, evaluations }: { athlete: WithId<OnlineAthlete>; evaluations: WithId<Evaluation>[] }) {
  const actions = useResultActions('admin')
  const theirs = useMemo(() => evaluations.filter((e) => e.studentId === athlete.studentId && !!e.online?.resultCofId && !!athlete.results?.[e.online.resultCofId]), [evaluations, athlete])
  const notIn = resultsOf(athlete).filter(([, r]) => resultState(r) !== 'in')
  return (
    <div data-testid={`results-linked-${athlete.id}`}>
      <ResultList
        evaluations={theirs}
        actions={actions}
        footerOf={(e) => (
          <Link className="inline-flex text-[13px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" to={`/admin/students/${e.studentId}/scores?score=${e.id}`}>
            In {athlete.studentName ?? 'the student'}’s scores
          </Link>
        )}
      />
      {actions.element}
      {notIn.length ? (
        <ul className="divide-y border-t">
          {notIn.map(([cof, r]) => (
            <ResultLine key={cof} cof={cof} r={r} words={RESULT_STATE_WORDS[resultState(r)]} />
          ))}
        </ul>
      ) : null}
      {!theirs.length && !notIn.length ? <p className="px-4 py-3 text-sm text-muted-foreground @xl:px-6">No results yet.</p> : null}
    </div>
  )
}

function MatchesSection({ matches, athletes }: { matches: WithId<OnlineMatch>[]; athletes: WithId<OnlineAthlete>[] }) {
  const byKey = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes])
  if (!matches.length) return null
  const list = [...matches].sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name))
  return (
    <Collapsible className="rounded-xl border bg-card" data-testid="results-site-matches">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 p-4 text-left text-sm font-semibold">
        <LuChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" /> The matches they shot ({list.length})
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <ul className="divide-y rounded-lg border">
          {list.map((m) => {
            const people = m.athletes.map((k) => byKey.get(k)).filter((a): a is WithId<OnlineAthlete> => !!a && a.status !== 'ignored')
            const linkedCount = people.filter((a) => a.status === 'linked').length
            return (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                <span className="w-28 shrink-0 text-muted-foreground">{formatDateKey(m.startDate, 'medium')}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{m.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[m.hostName, m.place, m.course].filter(Boolean).join(' · ')}
                    {people.length ? ` · ${linkedCount} linked${people.length > linkedCount ? `, ${people.length - linkedCount} to confirm` : ''}` : ''}
                  </span>
                </span>
                {m.status ? (
                  <Badge variant={m.status === 'OFFICIAL' ? 'secondary' : 'outline'} className={cn(m.status !== 'OFFICIAL' && 'text-amber-700 dark:text-amber-400')}>
                    {STATUS_WORDS[m.status] ?? m.status}
                  </Badge>
                ) : null}
                <a className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" href={m.url} target="_blank" rel="noreferrer">
                  Open on the site <LuExternalLink className="size-3" />
                </a>
              </li>
            )
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function RunsSection({ runs, timezone }: { runs: WithId<ResultsSiteRun>[]; timezone: string }) {
  if (!runs.length) return null
  return (
    <Collapsible className="rounded-xl border bg-card" data-testid="results-site-runs">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 p-4 text-left text-sm font-semibold">
        <LuChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" /> Recent checks
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <ul className="divide-y rounded-lg border">
          {runs.map((r) => {
            const when = ms(r.finishedAt) ?? ms(r.startedAt) ?? ms(r.requestedAt)
            return (
              <li key={r.id} className="p-3 text-sm">
                <Collapsible>
                  <CollapsibleTrigger className="flex w-full items-center gap-3 text-left">
                    <span className="w-40 shrink-0 text-muted-foreground">{when ? formatInstant(when, timezone) : ''}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">
                        {RUN_KIND_LABELS[r.kind] ?? 'Check'}
                        {(r.part ?? 1) > 1 ? `, part ${r.part}` : ''}
                      </span>
                      <span className="text-muted-foreground">
                        {' '}
                        ·{' '}
                        {r.state === 'done'
                          ? `${plural(r.matches, 'match', 'matches')}, ${plural(r.results, 'result')}${r.athletes ? `, ${r.athletes} to confirm` : ''}`
                          : r.state === 'failed'
                            ? (r.error ?? 'Stopped')
                            : r.state === 'skipped'
                              ? (r.error ?? 'Skipped')
                              : 'Under way'}
                      </span>
                    </span>
                    {r.log?.length ? <LuChevronDown className="size-4 shrink-0 text-muted-foreground" /> : null}
                  </CollapsibleTrigger>
                  {r.log?.length ? (
                    <CollapsibleContent>
                      <ul className="mt-2 space-y-0.5 pl-43 text-xs text-muted-foreground">
                        {r.log.map((line, i) => (
                          <li key={i}>{line}</li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  ) : null}
                </Collapsible>
              </li>
            )
          })}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

/** The academy's students to pick from, searchable by every name they go by (former ones too: their old matches count). */
function StudentPick({ students, onPick, children }: { students: readonly WithId<Student>[]; onPick: (s: WithId<Student>) => void; children: React.ReactElement }) {
  const [open, setOpen] = useState(false)
  const list = useMemo(() => [...students].sort((a, b) => a.name.localeCompare(b.name)), [students])
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <Command>
          <CommandInput placeholder="Search students…" />
          <CommandList>
            <CommandEmpty>No student by that name.</CommandEmpty>
            <CommandGroup>
              {list.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`${namesOf(s).join(' ')} ${s.id}`}
                  onSelect={() => {
                    onPick(s)
                    setOpen(false)
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {s.status === 'finished' ? <span className="text-xs text-muted-foreground">Former</span> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
