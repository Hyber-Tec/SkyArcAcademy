import { useMemo, useState } from 'react'
import { LuCheck, LuChevronDown, LuExternalLink, LuKeyRound, LuRefreshCw, LuTrophy, LuUserCheck, LuUserX, LuUndo2 } from 'react-icons/lu'
import { toast } from 'sonner'
import { DEMO_ACADEMY_ID } from '@shared/academy'
import { type OnlineAthlete, type OnlineMatch, type ResultsSiteRun, RUN_KIND_LABELS, SEARCH_FROM, isUnderWay } from '@shared/scores/resultsSite'
import { type DateKey, addMonths, formatDateKey, formatInstant, todayKey } from '@shared/time'
import type { Student, TimestampLike, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { useConfirm } from '@/components/app/useConfirm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { useStudentList } from '@/features/data/hooks'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { answerAthlete, checkResultsSite, saveResultsSiteKey, useResultsSite } from './api'

/**
 * Settings → Results site (the fourth meeting's R1, shared/src/scores/resultsSite.ts): the competition results the app
 * brings in from the tournaments' results site each night, with no link to paste. Owners and admins add the site's key,
 * check now or look back, say which athletes are the academy's (once each), and see the matches it found.
 */

const errorText = (e: unknown, fallback: string) => (e as { message?: string }).message?.replace(/^.*?: /, '') || fallback
const ms = (t: TimestampLike | null | undefined) => (t ? t.toDate().getTime() : null)

/** How far a look-back goes. */
const LOOK_BACK = [
  { months: 3, label: 'The last 3 months' },
  { months: 6, label: 'The last 6 months' },
  { months: 12, label: 'The last year' },
  { months: 24, label: 'The last 2 years' },
] as const

const STATUS_WORDS: Record<string, string> = { OFFICIAL: 'Official', UNOFFICIAL: 'Unofficial', INTERMEDIATE: 'Under way', FUTURE: 'Not started' }

export function ResultsSiteSettings() {
  const { branchId, timezone } = useBranch()
  const { status, athletes, matches, runs } = useResultsSite(branchId)
  const students = useStudentList()
  const { confirm, dialog } = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
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
  const toConfirm = athletes.data.filter((a) => a.status === 'new').sort((a, b) => b.lastSeen.localeCompare(a.lastSeen) || a.name.localeCompare(b.name))
  const linked = athletes.data.filter((a) => a.status === 'linked').sort((a, b) => (a.studentName ?? a.name).localeCompare(b.studentName ?? b.name))
  const ignored = athletes.data.filter((a) => a.status === 'ignored').sort((a, b) => a.name.localeCompare(b.name))

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
          ? `${a.name} is ${student.name}: ${r.brought} result${r.brought === 1 ? '' : 's'} brought in.`
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

  return (
    <div className="space-y-4" data-testid="results-site">
      <SiteCard
        keyEnd={s?.keyEnd ?? null}
        keySet={s?.keySetAt ? `${formatInstant(s.keySetAt.toDate(), timezone)}${s.keySetBy ? ` by ${s.keySetBy}` : ''}` : null}
        lastRun={s?.lastRun ?? null}
        lookBack={s?.lookBack ?? null}
        running={running}
        loading={status.loading}
        busy={busy}
        onKey={(key) => act('key', () => saveResultsSiteKey({ branchId, key }).then((r) => r.data), (r) => (r.keyEnd ? `Key saved: it works. The first check runs tonight, or now.` : 'Key removed.'), 'Couldn’t save the key')}
        onCheck={() => act('check', () => checkResultsSite({ branchId, kind: 'check' }), () => 'Checking the results site: what it finds shows here as it goes.', 'Couldn’t start a check')}
        onLookBack={(from) =>
          act('check', () => checkResultsSite({ branchId, kind: 'lookBack', from }), () => `Looking back to ${formatDateKey(from, 'medium')}: it goes on over a few checks, two weeks at a time.`, 'Couldn’t start the look-back')
        }
      />

      <Card data-testid="results-site-confirm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LuUserCheck /> Athletes to confirm {toConfirm.length ? <Badge variant="secondary">{toConfirm.length}</Badge> : null}
          </CardTitle>
          <CardDescription>
            Found on the academy’s teams or named like a student. Say once who each is: a linked athlete’s results come in every night after. Nobody is
            linked on their own: two athletes can share a name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {athletes.loading ? (
            <Skeleton className="h-24 rounded-lg" />
          ) : toConfirm.length ? (
            <ul className="divide-y rounded-lg border">
              {toConfirm.map((a) => {
                const suggested = a.suggestedStudentId ? students.data.find((st) => st.id === a.suggestedStudentId) : undefined
                return (
                  <li key={a.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center" data-testid={`results-athlete-${a.id}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{a.name}</p>
                      <p className="text-sm text-muted-foreground">{a.why}</p>
                      <p className="text-xs text-muted-foreground">
                        {resultsWords(a)}
                        {a.teams.length ? ` · ${a.teams.slice(0, 3).join(', ')}` : ''}
                      </p>
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
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nobody to confirm{s?.lastRun ? ' since the last check' : ' yet'}.</p>
          )}
        </CardContent>
      </Card>

      <Card data-testid="results-site-linked">
        <CardHeader>
          <CardTitle>Linked athletes</CardTitle>
          <CardDescription>Each one’s results come into their student’s scores: every shot where it landed, in the order it was fired.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {linked.length ? (
            <ul className="divide-y rounded-lg border">
              {linked.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.studentName ?? a.name}</span>
                    {a.studentName && a.studentName !== a.name ? <span className="text-muted-foreground"> · on the site as {a.name}</span> : null}
                    <span className="block text-xs text-muted-foreground">{resultsWords(a)}</span>
                  </span>
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void undo(a)}>
                    <LuUndo2 /> Undo
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No athlete linked yet.</p>
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

      <MatchesCard matches={matches.data} loading={matches.loading} athletes={athletes.data} />
      <RunsCard runs={runs.data} timezone={timezone} />
      {dialog}
    </div>
  )
}

/** "3 results, 2 brought in · last Oct 31": an athlete's results so far. */
function resultsWords(a: OnlineAthlete): string {
  const all = Object.values(a.results ?? {})
  const brought = all.filter((r) => Object.keys(r.evaluations ?? {}).length).length
  const count = `${all.length} result${all.length === 1 ? '' : 's'}`
  return `${a.status === 'linked' ? `${count}, ${brought} brought in` : count} · last ${formatDateKey(a.lastSeen, 'medium')}`
}

function SiteCard(props: {
  keyEnd: string | null
  keySet: string | null
  lastRun: { kind: ResultsSiteRun['kind']; at: TimestampLike; ok: boolean; summary: string } | null
  lookBack: { from: DateKey; cursor: DateKey } | null
  running: WithId<ResultsSiteRun> | null
  loading: boolean
  busy: string | null
  onKey: (key: string) => Promise<void>
  onCheck: () => Promise<void>
  onLookBack: (from: DateKey) => Promise<void>
}) {
  const { timezone } = useBranch()
  const [key, setKey] = useState('')
  const [months, setMonths] = useState('12')
  const today = todayKey(timezone)
  const { keyEnd, lastRun, running, busy } = props
  const at = ms(lastRun?.at)
  return (
    <Card data-testid="results-site-status">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LuTrophy /> Bringing results in
        </CardTitle>
        <CardDescription>
          Each night the app looks on the tournaments’ results site for the matches the academy’s athletes shot: within the distance below of{' '}
          {SEARCH_FROM.place}, at the clubs and schools where they shot before, and once a week the championships anywhere. Each linked athlete’s results
          come into their scores as competitions, every shot where it landed and in the order it was fired, and again when the site corrects them.
          Nobody pastes a link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <LuKeyRound className="size-4" /> The site’s key
            {props.loading ? null : keyEnd ? <Badge variant="secondary">…{keyEnd}</Badge> : <Badge variant="outline">None yet</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {keyEnd
              ? `Saved ${props.keySet ?? ''}. It stays on the server; only its last four characters show.`
              : 'The results site answers apps that send its key. To start, the shared starter key on Scopos’s support pages (Developers → X-API-Key) works; the academy’s own key replaces it once it has one.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="w-80 max-w-full font-mono"
              type="password"
              autoComplete="off"
              aria-label="The results site’s key"
              placeholder={keyEnd ? 'A new key' : 'Paste the key'}
              value={key}
              onChange={(e) => setKey(e.target.value.trim())}
            />
            <Button disabled={!!busy || key.length < 16} onClick={() => void props.onKey(key).then(() => setKey(''))}>
              {busy === 'key' ? <Spinner /> : null} {keyEnd ? 'Replace the key' : 'Save the key'}
            </Button>
            {keyEnd ? (
              <Button variant="ghost" disabled={!!busy} onClick={() => void props.onKey('')}>
                Remove it
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm" data-testid="results-site-last">
            {running ? (
              <span className="flex items-center gap-2 font-medium">
                <Spinner /> {RUN_KIND_LABELS[running.kind]} under way{running.state === 'queued' ? ' (starting)' : running.matches ? `: ${running.matches} matches read so far` : ''}…
              </span>
            ) : lastRun && at ? (
              <>
                <span className="font-medium">
                  {lastRun.ok ? 'Last checked' : 'The last check stopped'} {formatInstant(at, timezone)}:
                </span>{' '}
                <span className="text-muted-foreground">{lastRun.summary}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Not checked yet.</span>
            )}
          </p>
          {props.lookBack ? (
            <p className="text-sm text-muted-foreground">
              Looking back to {formatDateKey(props.lookBack.from, 'medium')}: up to {formatDateKey(props.lookBack.cursor, 'medium')} still to look at.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={!keyEnd || !!busy || !!running} onClick={() => void props.onCheck()} data-testid="results-site-check">
              {busy === 'check' ? <Spinner /> : <LuRefreshCw />} Check now
            </Button>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger className="w-48" aria-label="How far to look back">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LOOK_BACK.map((o) => (
                  <SelectItem key={o.months} value={String(o.months)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" disabled={!keyEnd || !!busy || !!running} onClick={() => void props.onLookBack(addMonths(today, -Number(months)))}>
              Look back
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Looking back finds the matches the academy’s athletes shot before: it goes two weeks at a time, over a few checks, and the athletes it finds wait
            below to be confirmed.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function MatchesCard({ matches, loading, athletes }: { matches: WithId<OnlineMatch>[]; loading: boolean; athletes: WithId<OnlineAthlete>[] }) {
  const [all, setAll] = useState(false)
  const byKey = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes])
  const list = [...matches].sort((a, b) => b.startDate.localeCompare(a.startDate) || a.name.localeCompare(b.name))
  const shown = all ? list : list.slice(0, 12)
  return (
    <Card data-testid="results-site-matches">
      <CardHeader>
        <CardTitle>Matches found</CardTitle>
        <CardDescription>The matches the academy’s athletes shot, newest first, as the results site has them.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : list.length ? (
          <>
            <ul className="divide-y rounded-lg border">
              {shown.map((m) => {
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
                      On the site <LuExternalLink className="size-3" />
                    </a>
                  </li>
                )
              })}
            </ul>
            {list.length > shown.length ? (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setAll(true)}>
                Show all {list.length}
              </Button>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">None yet. A check, or a look-back, fills this in.</p>
        )}
      </CardContent>
    </Card>
  )
}

function RunsCard({ runs, timezone }: { runs: WithId<ResultsSiteRun>[]; timezone: string }) {
  if (!runs.length) return null
  return (
    <Card data-testid="results-site-runs">
      <CardHeader>
        <CardTitle>Recent checks</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {runs.map((r) => {
            const when = ms(r.finishedAt) ?? ms(r.startedAt) ?? ms(r.requestedAt)
            return (
              <li key={r.id} className="p-3 text-sm">
                <Collapsible>
                  <CollapsibleTrigger className="flex w-full items-center gap-3 text-left">
                    <span className="w-40 shrink-0 text-muted-foreground">{when ? formatInstant(when, timezone) : ''}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{RUN_KIND_LABELS[r.kind]}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        ·{' '}
                        {r.state === 'done'
                          ? `${r.matches} matches, ${r.results} results${r.athletes ? `, ${r.athletes} to confirm` : ''}`
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
      </CardContent>
    </Card>
  )
}

/** The academy's students to pick from, searchable (former ones too: their old matches count). */
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
                  value={`${s.name} ${(s.otherNames ?? []).join(' ')} ${s.id}`}
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
