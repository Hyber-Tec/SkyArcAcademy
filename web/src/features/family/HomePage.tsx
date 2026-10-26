import { useMemo, useState } from 'react'
import { LuArrowRight, LuCalendarClock, LuChartLine, LuMessageSquareQuote, LuPencilLine, LuTarget } from 'react-icons/lu'
import { Link } from 'react-router'
import { attendanceFacts } from '@shared/reports/facts'
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, SOURCE_LABELS, evaluationPoints, per10 } from '@shared/shooting/evaluation'
import { personalBestIds } from '@shared/shooting/progress'
import { addDays, diffDays, formatDateKey, formatDuration, formatMinutes, formatTimeRange, nowMinutes, todayKey, weekdayOf, WEEKDAY_LABELS } from '@shared/time'
import type { Session, WithId } from '@shared/types'
import { useBranch } from '@/branch/BranchProvider'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { untilText } from '@/features/coach/sessionUi'
import { plural } from '@/features/home/parts'
import { useFamilyReports } from '@/features/reports/data'
import { type Report, one } from '@/features/reports/model'
import { MiniTarget } from '@/features/scores/TargetPlot'
import { BestBadge } from '@/features/students/scores/FeaturedResult'
import { useNow } from '@/lib/useNow'
import { cn } from '@/lib/utils'
import { type Family, andList, dayTitle, firstWord, hasEnded, useFamily, useFamilyEvaluations, useFamilySessions, useIsNewReport } from './data'
import { ClassDetails, ClassList, ContactCard, FamilyStatus, FamilyTrend, KidMark, NoteChip, NotLinked } from './FamilyWidgets'
import { useFamilyNews, useIsNewNews } from './news'
import { NewsMeta, NewsTitle } from './NewsWidgets'

/** How far ahead Home looks for each child's next class (four weeks, as the coach's Home). */
const AHEAD_DAYS = 28

/** The academy's posts shown on Home (the rest are on the News page). */
const NEWS_ON_HOME = 3

function greeting(minutes: number) {
  if (minutes < 12 * 60) return 'Good morning'
  if (minutes < 17 * 60) return 'Good afternoon'
  return 'Good evening'
}

/** "tomorrow at 2:00 PM", "on Tuesday at 7:00 PM", "on Tue, Oct 27 at 7:00 PM". */
function whenPhrase(s: Session, today: string): string {
  const at = `at ${formatMinutes(s.startMin)}`
  if (s.dateKey === today) return `today ${at}`
  if (s.dateKey === addDays(today, 1)) return `tomorrow ${at}`
  if (diffDays(today, s.dateKey) < 7) return `on ${WEEKDAY_LABELS[weekdayOf(s.dateKey)]} ${at}`
  return `on ${formatDateKey(s.dateKey, 'weekdayMedium')} ${at}`
}

/** The line under the greeting: the soonest class, and any report not opened yet. */
function summary(f: Family, next: { kidId: string; session: WithId<Session> | null }[], today: string, now: number): string {
  const first = next.find((n) => n.session)?.session
  if (!first) return f.who === 'parent' ? 'No classes booked in the next four weeks.' : 'You have no classes booked in the next four weeks.'
  const on = first.startAt.toMillis() <= now
  if (f.who === 'student') return on ? `Your class is on now, until ${formatMinutes(first.endMin)}.` : `Your next class is ${whenPhrase(first, today)}.`
  // Brothers and sisters in the same class time are named together.
  const together = next.filter((n) => n.session && n.session.startAt.toMillis() === first.startAt.toMillis()).map((n) => f.firstName(n.kidId))
  if (together.length > 1) {
    const names = andList(together)
    return on ? `${names} are in class now, until ${formatMinutes(first.endMin)}.` : `${names} have class ${whenPhrase(first, today)}.`
  }
  const name = f.firstName(first.studentId)
  return on ? `${name}’s class is on now, until ${formatMinutes(first.endMin)}.` : `${name}’s next class is ${whenPhrase(first, today)}.`
}

/**
 * Parent and Student → Home: a greeting, each child's next class, the rest of the week, the academy's news, the latest
 * scores, the latest progress reports, attendance over the last 30 days, and how to reach the academy. Two columns on
 * computers, one on phones.
 */
export function FamilyHomePage() {
  const { timezone } = useBranch()
  const family = useFamily()
  const now = useNow(30_000)
  const today = todayKey(timezone, now)
  // The last 30 days (attendance) and the next four weeks (the next classes, the week ahead).
  const { data: sessions, loading } = useFamilySessions(family.ids, addDays(today, -29), addDays(today, AHEAD_DAYS - 1))
  const reports = useFamilyReports(family.ids)
  const scores = useFamilyEvaluations(family.ids)
  const isNew = useIsNewReport()
  const [open, setOpen] = useState<WithId<Session> | null>(null)

  const upcoming = useMemo(() => sessions.filter((s) => !hasEnded(s, now)), [sessions, now])
  // Each child's next class (one that isn't canceled), soonest first; children with none last.
  const next = useMemo(
    () =>
      family.kids
        .map((k) => ({ kidId: k.id, session: upcoming.find((s) => s.studentId === k.id && s.status !== 'canceled') ?? null }))
        .sort((a, b) => (a.session?.startAt.toMillis() ?? Infinity) - (b.session?.startAt.toMillis() ?? Infinity)),
    [family.kids, upcoming],
  )
  const shownIds = new Set(next.map((n) => n.session?.id).filter(Boolean))
  const weekEnd = addDays(today, 6)
  const weekAhead = upcoming.filter((s) => s.dateKey <= weekEnd && !shownIds.has(s.id))
  const newCount = reports.data.filter((r) => isNew(r)).length

  if (family.notLinked) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <Header family={family} today={today} now={now} line="" />
        <div className="mt-6">
          <NotLinked family={family} />
        </div>
      </div>
    )
  }

  const line = loading || family.loading ? null : summary(family, next, today, now)
  return (
    <div className="mx-auto w-full max-w-5xl">
      <Header family={family} today={today} now={now} line={line} newReports={reports.loading ? 0 : newCount} />
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <NextClasses family={family} next={next} loading={loading || family.loading} today={today} now={now} onOpen={setOpen} />
          <WeekAhead family={family} sessions={weekAhead} others={next.some((n) => !!n.session && n.session.dateKey <= weekEnd)} loading={loading || family.loading} today={today} weekEnd={weekEnd} now={now} onOpen={setOpen} />
          <FromTheAcademy family={family} today={today} />
        </div>
        <div className="min-w-0 space-y-6">
          <LatestScores family={family} evaluations={scores.data} loading={scores.loading || family.loading} today={today} />
          <LatestReports family={family} reports={reports.data} loading={reports.loading || family.loading} isNew={isNew} />
          <Attendance family={family} sessions={sessions.filter((s) => hasEnded(s, now))} loading={loading || family.loading} />
          <ContactCard />
        </div>
      </div>
      <ClassDetails session={open} family={family} now={now} onClose={() => setOpen(null)} />
    </div>
  )
}

/** The date, the greeting, and a line about what's next (`null` while it loads, empty for none). */
function Header({ family, today, now, line, newReports = 0 }: { family: Family; today: string; now: number; line: string | null; newReports?: number }) {
  const { timezone } = useBranch()
  const name = firstWord(family.personName)
  const base = `/${family.who}`
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{formatDateKey(today, 'weekdayLong').replace(/, \d{4}$/, '')}</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">
        {greeting(nowMinutes(timezone, now))}
        {name ? `, ${name}` : ''}
      </h1>
      {line === null ? (
        <Skeleton className="mt-2.5 h-4 w-72 max-w-full" />
      ) : line ? (
        <p className="mt-1.5 text-sm text-muted-foreground" data-testid="home-summary">
          {line}{' '}
          {newReports ? (
            <Link to={`${base}/reports`} className="font-medium text-foreground underline-offset-4 hover:underline">
              {newReports === 1 ? 'A new progress report is ready.' : `${newReports} new progress reports are ready.`}
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  )
}

function CardHead({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {aside}
    </div>
  )
}

function SeeAll({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link to={to} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
      {children} <LuArrowRight className="size-3" />
    </Link>
  )
}

/** Each child's next class (the student's own): the day, the time, the status and the note. */
function NextClasses({
  family,
  next,
  loading,
  today,
  now,
  onOpen,
}: {
  family: Family
  next: { kidId: string; session: WithId<Session> | null }[]
  loading: boolean
  today: string
  now: number
  onOpen: (s: WithId<Session>) => void
}) {
  const { branch } = useBranch()
  const several = family.kids.length > 1
  const base = `/${family.who}`
  if (loading) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-5 h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-72 max-w-full" />
      </section>
    )
  }
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label={several ? 'Next classes' : 'Next class'} data-testid="next-classes">
      <CardHead title={several ? 'Next classes' : 'Next class'} aside={<SeeAll to={`${base}/classes`}>All classes</SeeAll>} />
      <ul className="divide-y">
        {next.map(({ kidId, session: s }) => (
          <li key={kidId}>
            {s ? (
              <NextClass s={s} family={family} showKid={several} today={today} now={now} onOpen={onOpen} />
            ) : (
              <div className="flex items-center gap-3 px-5 py-5">
                {several ? <KidMark name={family.firstName(kidId)} tint={family.tint(kidId)} /> : <LuCalendarClock className="size-5 shrink-0 text-muted-foreground" />}
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{several ? `${family.firstName(kidId)}: no classes booked` : 'No classes booked'}</p>
                  <p className="text-muted-foreground">Nothing in the next four weeks. To book one, contact {branch.name}.</p>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function NextClass({ s, family, showKid, today, now, onOpen }: { s: WithId<Session>; family: Family; showKid: boolean; today: string; now: number; onOpen: (s: WithId<Session>) => void }) {
  const startMs = s.startAt.toMillis()
  const on = startMs <= now
  const days = diffDays(today, s.dateKey)
  const when = on ? 'On now' : s.dateKey === today ? untilText((startMs - now) / 60_000) : days > 1 ? `in ${days} days` : null
  return (
    <button type="button" onClick={() => onOpen(s)} className="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/40" data-testid="next-class">
      {showKid ? <KidMark name={family.firstName(s.studentId)} tint={family.tint(s.studentId)} className="mt-0.5 size-8 text-sm" /> : null}
      <div className="min-w-0 flex-1">
        {showKid ? <p className="text-sm font-medium">{family.firstName(s.studentId)}</p> : null}
        <p className={cn('font-semibold tracking-tight', showKid ? 'text-base' : 'text-lg')}>{dayTitle(s.dateKey, today)}</p>
        <p className="mt-0.5 flex flex-wrap gap-x-1.5 text-sm text-muted-foreground">
          <span className="whitespace-nowrap tabular-nums">{formatTimeRange(s.startMin, s.endMin)}</span>
          <span className="text-muted-foreground/50" aria-hidden>
            ·
          </span>
          <span className="whitespace-nowrap">{formatDuration(s.endMin - s.startMin)}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FamilyStatus session={s} now={now} />
          {s.note ? <NoteChip note={s.note} /> : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xl font-semibold tracking-tight tabular-nums">{formatMinutes(s.startMin)}</p>
        {when ? <p className={cn('mt-0.5 text-xs font-medium', on ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground')}>{when}</p> : null}
      </div>
    </button>
  )
}

/** The other classes of the next seven days, by day. */
function WeekAhead({
  family,
  sessions,
  others,
  loading,
  today,
  weekEnd,
  now,
  onOpen,
}: {
  family: Family
  sessions: WithId<Session>[]
  /** A next class shown above falls in these days (so this lists the others). */
  others: boolean
  loading: boolean
  today: string
  weekEnd: string
  now: number
  onOpen: (s: WithId<Session>) => void
}) {
  const range = today.slice(0, 7) === weekEnd.slice(0, 7) ? `${formatDateKey(today, 'monthDay')} – ${Number(weekEnd.slice(8))}` : `${formatDateKey(today, 'monthDay')} – ${formatDateKey(weekEnd, 'monthDay')}`
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="The week ahead" data-testid="week-ahead">
      <CardHead title="The week ahead" aside={<span className="text-xs text-muted-foreground tabular-nums">{range}</span>} />
      {loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : sessions.length ? (
        <ClassList sessions={sessions} family={family} showKid={family.kids.length > 1} now={now} today={today} onOpen={onOpen} bare empty={null} />
      ) : (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{others ? 'Nothing else booked in the next seven days.' : 'Nothing booked in the next seven days.'}</p>
      )}
    </section>
  )
}

/**
 * The academy's news for families: the latest few posts (pinned first), each "New" until the person opens it, opening
 * on its own page. Nothing at all when the academy has none; "All news" when there are more than shown.
 */
function FromTheAcademy({ family, today }: { family: Family; today: string }) {
  const { timezone } = useBranch()
  const news = useFamilyNews()
  const isNew = useIsNewNews()
  const base = `/${family.who}`
  if (news.loading) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-5 h-4 w-3/4" />
        <Skeleton className="mt-2 h-3 w-40 max-w-full" />
      </section>
    )
  }
  if (!news.data.length) return null
  const shown = news.data.slice(0, NEWS_ON_HOME)
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="From the academy" data-testid="family-news">
      <CardHead title="From the academy" aside={news.data.length > shown.length ? <SeeAll to={`${base}/news`}>All news</SeeAll> : null} />
      <ul className="divide-y">
        {shown.map((a) => (
          <li key={a.id}>
            <Link to={`${base}/news/${a.id}`} state={{ from: 'home' }} className="block px-4 py-3.5 transition-colors hover:bg-muted/40" data-testid="family-news-item">
              <NewsTitle a={a} isNew={isNew(a.id)} className="text-sm font-medium" />
              <NewsMeta a={a} timezone={timezone} today={today} className="mt-1" />
              {/* A line of it on computers (Home is a summary), two on phones where a line holds fewer words. */}
              {a.contentText ? <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground lg:line-clamp-1">{a.contentText}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Each child's last few results (the student's own), newest first: the target in small, the day, the position, the
 * score per 10 shots and a personal best's badge. Each opens on the Scores page.
 */
function LatestScores({ family, evaluations, loading, today }: { family: Family; evaluations: WithId<Evaluation>[]; loading: boolean; today: string }) {
  const several = family.kids.length > 1
  const base = `/${family.who}`
  // Two each for brothers and sisters, so the card stays about as tall as the classes beside it.
  const count = several ? 2 : 3
  const latest = family.kids.map((k) => {
    const list = evaluations.filter((e) => e.studentId === k.id)
    return { kidId: k.id, list: list.slice(-count).reverse(), bests: personalBestIds(list) }
  })
  const none = latest.every((l) => !l.list.length)
  const to = (kidId: string, id: string) => `${base}/scores?${new URLSearchParams(several ? { child: kidId, score: id } : { score: id })}`
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Latest scores" data-testid="latest-scores">
      <CardHead title="Latest scores" aside={none ? null : <SeeAll to={`${base}/scores`}>All scores</SeeAll>} />
      {loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : none ? (
        <div className="flex items-start gap-3 px-4 py-5 text-sm">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <LuTarget className="size-4" />
          </span>
          <div>
            <p className="font-medium">No scores yet</p>
            <p className="mt-0.5 text-muted-foreground">Results show here after classes, once the coach adds them.</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y">
          {latest.map(({ kidId, list, bests }) =>
            list.length ? (
              <li key={kidId} className={cn(several && 'pt-2.5')}>
                {several ? (
                  <p className="flex items-center gap-2 px-4 pb-0.5 text-xs font-medium text-muted-foreground">
                    <KidMark name={family.firstName(kidId)} tint={family.tint(kidId)} className="size-5 text-[10px]" />
                    {family.firstName(kidId)}
                  </p>
                ) : null}
                <ul className="py-1">
                  {list.map((e) => (
                    <li key={e.id}>
                      <LatestScore e={e} best={bests.has(e.id)} to={to(kidId, e.id)} today={today} />
                    </li>
                  ))}
                </ul>
              </li>
            ) : (
              <li key={kidId}>
                <p className="flex items-center gap-2 px-4 py-3.5 text-sm text-muted-foreground">
                  <KidMark name={family.firstName(kidId)} tint={family.tint(kidId)} className="size-5 text-[10px]" />
                  {family.firstName(kidId)}: no scores yet
                </p>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  )
}

function LatestScore({ e, best, to, today }: { e: WithId<Evaluation>; best: boolean; to: string; today: string }) {
  const color = POSITION_COLORS[e.position]
  const points = evaluationPoints(e)
  const whole = per10(e.wholeTotal, e.shots)
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-1.5 transition-colors hover:bg-muted/40"
      aria-label={`${formatDateKey(e.dateKey, 'medium')}, ${POSITION_LABELS[e.position]}: ${whole !== null ? one(whole) : 'no score'} per 10 shots${best ? ', a new personal best' : ''}${e.note ? ', with a coach’s note' : ''}`}
      data-testid="latest-score"
    >
      {points.length ? (
        <MiniTarget points={points} color={color} size={36} className="shrink-0" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed text-muted-foreground" title="Typed in: no places on the target">
          <LuPencilLine className="size-3.5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{dayTitle(e.dateKey, today, false)}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
          <span className="truncate">
            {POSITION_LABELS[e.position]} · {SOURCE_LABELS[e.source]}
          </span>
          {best ? <BestBadge position={e.position} size="sm" /> : null}
          {e.note ? <LuMessageSquareQuote className="size-3.5 shrink-0" aria-hidden /> : null}
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block text-lg leading-tight font-semibold tabular-nums">{whole !== null ? one(whole) : '—'}</span>
        <span className="block text-[11px] leading-tight text-muted-foreground">per 10</span>
      </span>
    </Link>
  )
}

/** Each child's newest shared report: what it covers, the average, the trend (when the report shows it), and "New". */
function LatestReports({ family, reports, loading, isNew }: { family: Family; reports: Report[]; loading: boolean; isNew: (r: Report) => boolean }) {
  const { branch } = useBranch()
  const several = family.kids.length > 1
  const base = `/${family.who}`
  const latest = family.kids.map((k) => ({ kidId: k.id, report: reports.find((r) => r.studentId === k.id) ?? null }))
  const none = latest.every((l) => !l.report)
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Progress reports" data-testid="latest-reports">
      <CardHead title={several ? 'Latest reports' : 'Latest report'} aside={none ? null : <SeeAll to={`${base}/reports`}>All reports</SeeAll>} />
      {loading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : none ? (
        <div className="flex items-start gap-3 px-4 py-5 text-sm">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <LuChartLine className="size-4" />
          </span>
          <div>
            <p className="font-medium">No reports yet</p>
            <p className="mt-0.5 text-muted-foreground">{branch.name} shares a progress report here when one is ready.</p>
          </div>
        </div>
      ) : (
        <ul className="divide-y">
          {latest.map(({ kidId, report: r }) => (
            <li key={kidId}>
              {r ? (
                <Link to={`/report/${r.id}`} className="block px-4 py-3.5 transition-colors hover:bg-muted/40" data-testid="latest-report">
                  <div className="flex items-center gap-2">
                    {several ? <KidMark name={family.firstName(kidId)} tint={family.tint(kidId)} className="size-5 text-[10px]" /> : null}
                    <span className="min-w-0 truncate text-sm font-medium">{several ? `${family.firstName(kidId)} · ` : ''}{r.customName || 'Progress report'}</span>
                    {isNew(r) ? <Badge className="bg-brand-solid text-white">New</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{r.period.label}</p>
                  <div className="mt-2.5 flex flex-wrap items-end justify-between gap-2">
                    {r.facts?.average != null ? (
                      <p className="flex items-baseline gap-1.5">
                        <span className="text-xl font-semibold tabular-nums">{one(r.facts.average)}</span>
                        <span className="text-xs text-muted-foreground">average per 10 shots</span>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{plural(r.evaluationCount, 'scored evaluation')}</p>
                    )}
                    {r.options?.showStatus !== false && r.facts?.trend?.level ? <FamilyTrend level={r.facts.trend.level} /> : null}
                  </div>
                </Link>
              ) : (
                <p className="flex items-center gap-2 px-4 py-3.5 text-sm text-muted-foreground">
                  <KidMark name={family.firstName(kidId)} tint={family.tint(kidId)} className="size-5 text-[10px]" />
                  {family.firstName(kidId)}: no report yet
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** "8 of 9 classes attended · 1 missed · 1 canceled". */
function attendanceLine(a: ReturnType<typeof attendanceFacts>): string {
  const counted = a.attended + a.missed
  return (
    [
      counted ? `${a.attended} of ${plural(counted, 'class')} attended` : '',
      a.missed ? `${a.missed} missed` : '',
      a.canceled ? `${a.canceled} canceled` : '',
      a.unmarked ? `${a.unmarked} not marked yet` : '',
    ]
      .filter(Boolean)
      .join(' · ') || 'No classes in the last 30 days'
  )
}

/** Attended against missed over the last 30 days (canceled classes don't count), per child. */
function Attendance({ family, sessions, loading }: { family: Family; sessions: WithId<Session>[]; loading: boolean }) {
  const several = family.kids.length > 1
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Attendance" data-testid="attendance">
      <CardHead title="Attendance" aside={<span className="text-xs text-muted-foreground">Last 30 days</span>} />
      {loading ? (
        <div className="p-4">
          <Skeleton className="h-8 w-full" />
        </div>
      ) : (
        <ul className="divide-y">
          {family.kids.map((k) => {
            const a = attendanceFacts(sessions.filter((s) => s.studentId === k.id).map((s) => ({ dateKey: s.dateKey, status: s.status, past: true })))
            const counted = a.attended + a.missed
            return (
              <li key={k.id} className="px-4 py-3.5">
                {several ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <KidMark name={family.firstName(k.id)} tint={family.tint(k.id)} className="size-5 text-[10px]" />
                      <span className="truncate">{family.firstName(k.id)}</span>
                    </span>
                    {a.percent !== null ? <span className="text-sm font-semibold tabular-nums">{a.percent}%</span> : null}
                  </div>
                ) : a.percent !== null ? (
                  <p className="text-2xl font-semibold tracking-tight tabular-nums">{a.percent}%</p>
                ) : null}
                {counted ? (
                  <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${a.attended} attended, ${a.missed} missed`}>
                    <span className="bg-sky-500" style={{ width: `${(a.attended / counted) * 100}%` }} />
                    <span className="bg-amber-400" style={{ width: `${(a.missed / counted) * 100}%` }} />
                  </div>
                ) : null}
                <p className={cn('text-xs text-muted-foreground', (several || a.percent !== null || counted > 0) && 'mt-1.5')}>{attendanceLine(a)}</p>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
