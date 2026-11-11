import { useMemo, useState } from 'react'
import { LuCheck, LuChevronDown, LuExternalLink, LuHistory, LuRefreshCw, LuSettings, LuTrophy, LuUndo2, LuUserX } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { DEMO_ACADEMY_ID } from '@shared/academy'
import { namesOf } from '@shared/names'
import {
  type AthleteResult,
  type OnlineAthlete,
  type OnlineMatch,
  type ResultsSiteRun,
  RESULT_STATE_WORDS,
  RUN_KIND_LABELS,
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
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { answerAthlete, checkResultsSite, useResultsSite } from './api'
import { ResultsSiteDialog } from './ResultsSiteDialog'

/**
 * Settings → Results site (the fourth meeting's R1, shared/src/scores/resultsSite.ts; made simpler at Goo's ask of
 * 2026-11-10): the competition results the app brings in from the tournaments' results site, with no link to paste.
 * Check now looks at the last month (Look back, at the months before); the gear holds when it checks on its own and what
 * it looks for. Owners and admins say once which athletes are the academy's, opening each result on the site to be
 * sure, see where each linked athlete's results are, and decide about a results sheet's scan with other numbers.
 */

const errorText = (e: unknown, fallback: string) => (e as { message?: string }).message?.replace(/^.*?: /, '') || fallback
const ms = (t: TimestampLike | null | undefined) => (t ? t.toDate().getTime() : null)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** How far a look-back goes. */
const LOOK_BACK = [
  { months: 3, label: 'The last 3 months' },
  { months: 6, label: 'The last 6 months' },
  { months: 12, label: 'The last year' },
  { months: 24, label: 'The last 2 years' },
] as const

const STATUS_WORDS: Record<string, string> = { OFFICIAL: 'Official', UNOFFICIAL: 'Unofficial', INTERMEDIATE: 'Under way', FUTURE: 'Not started' }

/** A result brought in, in a few words: "Standing 565 (591.6)". */
const scoreWords = (p: Position, e: Pick<Evaluation, 'wholeTotal' | 'total' | 'shots'>) =>
  `${POSITION_LABELS[p]} ${e.wholeTotal}${Number.isInteger(e.total) ? '' : ` (${e.total.toFixed(1)})`}, ${plural(e.shots, 'shot')}`

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
  const now = useNow(60_000)
  const byId = useMemo(() => new Map(results.data.map((e) => [e.id, e])), [results.data])

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
  const toConfirm = athletes.data.filter((a) => a.status === 'new').sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.name.localeCompare(b.name))
  const linked = athletes.data.filter((a) => a.status === 'linked').sort((a, b) => (a.studentName ?? a.name).localeCompare(b.studentName ?? b.name))
  const ignored = athletes.data.filter((a) => a.status === 'ignored').sort((a, b) => a.name.localeCompare(b.name))
  const scans: ScanToCheck[] = linked.flatMap((athlete) =>
    Object.entries(athlete.results ?? {}).flatMap(([resultCofId, result]) =>
      POSITIONS.filter((p) => result.sheets?.[p]?.state === 'differs').map((position) => ({ athlete, resultCofId, result, position })),
    ),
  )

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

  const today = todayKey(timezone)
  const schedule = settings.resultsSite.schedule
  const next = nextScheduled(schedule, now, timezone)
  const lastAt = ms(s?.lastRun?.at)
  const noKey = !status.loading && !s?.keyEnd
  const window = settings.resultsSite.checkDays === 30 ? 'the last month' : `the last ${settings.resultsSite.checkDays} days`

  return (
    <div className="space-y-4" data-testid="results-site">
      <Card data-testid="results-site-status">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2">
              <LuTrophy /> Competition results
            </CardTitle>
            <CardDescription>
              The app finds the academy’s athletes on the tournaments’ results site and brings their results into their scores: every shot where it
              landed, in the order it was fired.
            </CardDescription>
          </div>
          <Button variant="outline" size="icon" aria-label="Results site settings" title="Settings" onClick={() => setSettingsOpen(true)} data-testid="results-site-gear">
            <LuSettings />
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1 text-sm" data-testid="results-site-last">
            {running ? (
              <p className="flex items-center gap-2 font-medium">
                <Spinner /> Checking{running.state === 'queued' ? ' (starting)' : running.matches ? `: ${plural(running.matches, 'match')} read so far` : ''}…
              </p>
            ) : s?.lastRun && lastAt ? (
              <p>
                <span className="font-medium">{s.lastRun.ok ? 'Last checked' : 'The last check stopped'} {formatInstant(lastAt, timezone)}.</span>{' '}
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
            <Button disabled={noKey || !!busy || !!running} onClick={() => void act('check', () => checkResultsSite({ branchId, kind: 'check' }), () => 'Checking the results site: what it finds shows here as it goes.', 'Couldn’t start a check')} data-testid="results-site-check">
              {busy === 'check' ? <Spinner /> : <LuRefreshCw />} Check now
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={noKey || !!busy || !!running} data-testid="results-site-look-back">
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
          </div>
          <p className="text-xs text-muted-foreground">Check now looks at {window}: the matches nearby and at the clubs and schools where the academy’s athletes shot.</p>
        </CardContent>
      </Card>

      {toConfirm.length ? (
        <Card data-testid="results-site-confirm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Who are they? <Badge variant="secondary">{toConfirm.length}</Badge>
            </CardTitle>
            <CardDescription>
              Found on the academy’s teams or named like a student. Open a result on the site to be sure, then say once who each is: their results come in
              from then on. Nobody is linked on their own: two athletes can share a name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y rounded-lg border">
              {toConfirm.map((a) => {
                const suggested = a.suggestedStudentId ? students.data.find((st) => st.id === a.suggestedStudentId) : undefined
                return (
                  <li key={a.id} className="space-y-2 p-3" data-testid={`results-athlete-${a.id}`}>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{a.name}</p>
                        <p className="text-sm text-muted-foreground">{a.why}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {suggested ? (
                          <Button size="sm" disabled={!!busy} onClick={() => void link(a, suggested)} data-testid={`results-link-${a.id}`}>
                            {busy === `athlete-${a.id}` ? <Spinner /> : <LuCheck />} {suggested.name}
                          </Button>
                        ) : null}
                        <StudentPick students={students.data} onPick={(st) => void link(a, st)}>
                          <Button size="sm" variant="outline" disabled={!!busy}>
                            {suggested ? 'Another student' : 'Link to a student'} <LuChevronDown />
                          </Button>
                        </StudentPick>
                        <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void notOurs(a)}>
                          <LuUserX /> Not ours
                        </Button>
                      </div>
                    </div>
                    <ResultLines athlete={a} byId={byId} />
                  </li>
                )
              })}
            </ul>
          </CardContent>
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
                        Results sheet scan: {scan.wholeTotal}, {plural(scan.shots, 'shot')} · the results site: {site ? `${site.wholeTotal}${Number.isInteger(site.total) ? '' : ` (${site.total.toFixed(1)})`}, ${plural(site.shots, 'shot')}` : 'not in the scores any more'}
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

      <Card data-testid="results-site-linked">
        <CardHeader>
          <CardTitle>The academy’s athletes</CardTitle>
          <CardDescription>Linked to a student: their results come into the student’s scores, and again when the site corrects them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {athletes.loading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : linked.length ? (
            <ul className="divide-y rounded-lg border">
              {linked.map((a) => (
                <li key={a.id} className="p-3">
                  <Collapsible>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-2 text-left">
                        <LuChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                        <span className="min-w-0">
                          <span className="font-medium">{a.studentName ?? a.name}</span>
                          {a.studentName && a.studentName !== a.name ? <span className="text-muted-foreground"> · on the site as {a.name}</span> : null}
                          <span className="block text-xs text-muted-foreground">{linkedWords(a)}</span>
                        </span>
                      </CollapsibleTrigger>
                      <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void undo(a)}>
                        <LuUndo2 /> Undo
                      </Button>
                    </div>
                    <CollapsibleContent className="pt-2 pl-6">
                      <ResultLines athlete={a} byId={byId} />
                    </CollapsibleContent>
                  </Collapsible>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No athlete linked yet{toConfirm.length ? ': say who the athletes above are' : ''}.</p>
          )}
          {ignored.length ? (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <LuChevronDown className="size-4" /> Not the academy’s ({ignored.length})
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="mt-2 divide-y rounded-lg border">
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
        </CardContent>
      </Card>

      <MatchesSection matches={matches.data} athletes={athletes.data} />
      <RunsSection runs={runs.data} timezone={timezone} />
      <ResultsSiteDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      {dialog}
    </div>
  )
}

/** "3 results: 2 in the scores, 1 not published yet": a linked athlete's results at a glance. */
function linkedWords(a: OnlineAthlete): string {
  const all = Object.values(a.results ?? {})
  const inScores = all.filter((r) => resultState(r) === 'in').length
  const rest = all.length - inScores
  return `${plural(all.length, 'result')}${all.length ? `: ${inScores} in the scores${rest ? `, ${rest} not yet` : ''}` : ''} · last ${formatDateKey(a.lastSeen, 'medium')}`
}

/**
 * An athlete's results, newest first: each one's match and day, where it is (in the scores, with its numbers and a link
 * to them, or why not yet), and its page on the results site, to check who it is.
 */
function ResultLines({ athlete, byId }: { athlete: WithId<OnlineAthlete>; byId: ReadonlyMap<string, WithId<Evaluation>> }) {
  const list = Object.entries(athlete.results ?? {}).sort(([, a], [, b]) => b.dateKey.localeCompare(a.dateKey) || a.matchName.localeCompare(b.matchName))
  if (!list.length) return null
  const linked = athlete.status === 'linked'
  return (
    <ul className="space-y-1.5 text-sm" data-testid={`results-lines-${athlete.id}`}>
      {list.map(([cof, r]) => {
        const state = resultState(r)
        const scores = POSITIONS.flatMap((p) => {
          const id = r.evaluations?.[p]
          return id ? [{ p, id, e: byId.get(id) }] : []
        })
        return (
          // On a phone: the day and the link over the match, which then has the line's width.
          <li key={cof} className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-x-3">
            <div className="flex items-baseline justify-between gap-3 sm:contents">
              <span className="text-muted-foreground sm:w-24 sm:shrink-0">{formatDateKey(r.dateKey, 'medium')}</span>
              <a
                className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground sm:order-last"
                href={resultUrl(cof)}
                target="_blank"
                rel="noreferrer"
                data-testid={`results-open-${cof}`}
              >
                Open on the site <LuExternalLink className="size-3" />
              </a>
            </div>
            <span className="min-w-0 flex-1">
              <span>{r.matchName}</span>
              {r.team ? <span className="text-muted-foreground"> · {r.team}</span> : null}
              {linked ? (
                <span className="block text-xs text-muted-foreground">
                  {state === 'in'
                    ? scores.map(({ p, id, e }, i) => (
                        <span key={p}>
                          {i ? ' · ' : ''}
                          {e ? (
                            <Link className="text-foreground underline-offset-2 hover:underline" to={`/admin/students/${athlete.studentId}/scores?score=${id}`}>
                              {scoreWords(p, e)}
                            </Link>
                          ) : (
                            `${POSITION_LABELS[p]}: deleted from the scores, not brought back`
                          )}
                          {r.sheets?.[p]?.state === 'upgraded' ? ' (the results sheet’s scan, brought up to the site’s)' : ''}
                          {r.sheets?.[p]?.state === 'kept' ? ' (and the results sheet’s scan, kept)' : ''}
                        </span>
                      ))
                    : RESULT_STATE_WORDS[state]}
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ul>
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
                          ? `${plural(r.matches, 'match')}, ${plural(r.results, 'result')}${r.athletes ? `, ${r.athletes} to confirm` : ''}`
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
