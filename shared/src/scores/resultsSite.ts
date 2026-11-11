import { nameFormsOf } from '../names'
import { isScoreNews } from '../schedule/familyNotices'
import type { Evaluation, Position } from '../shooting/evaluation'
import { type DateKey, addDays, formatMinutesShort, minutesOf, todayKey, weekdayIndex } from '../time'
import type { TimestampLike } from '../types'
import { athleteName, isAcademyTeam, nameKey, type ScoposParticipant } from './scopos'

/**
 * The results site import (the fourth meeting's R1: "there is no page of our own such as ARC 10.9… go around all the
 * results site"): when someone presses Check now, or on the academy's schedule, the server looks for the matches the
 * academy's athletes shot in the last month (`checkDays`), nearby, at the hosts they shot at before and, once a week,
 * the championships anywhere, and brings each linked athlete's results into their student's scores
 * (functions/src/resultsSite). Look back does the same for the months before. Nobody pastes a link. An athlete is
 * linked to a student once, by a person: the import only suggests the athletes on the academy's teams and those named
 * like a student. A results sheet's scan of the same result is brought up to the site's, or shown for a person to
 * decide when its numbers differ. These are the documents it keeps, and the decisions it makes, as pure functions.
 */

// ------------------------------------------------------------------ documents

/** `onlineAthletes/{key}`: new (to confirm), linked to a student, or not the academy's. */
export type AthleteStatus = 'new' | 'linked' | 'ignored'

/** One appearance of an athlete: their result in one match. */
export interface AthleteResult {
  matchId: string
  matchName: string
  dateKey: DateKey
  team: string | null
  host: string | null
  /** The site's stamp of the result's last change, when it was last brought in (null: not brought in yet). */
  lastUpdated: string | null
  /**
   * The student's results made from it, by position. One a person deleted stays here, so it isn't brought back (a
   * results sheet's result of the same match, brought up to the site's, keeps its own ID).
   */
  evaluations: Partial<Record<Position, string>>
  /** Why it couldn't be brought in, when it couldn't. */
  error?: string | null
  /** How many checks asked for it without bringing it in (the site couldn't give it, or it had no shots yet). */
  tries?: number
  /** A results sheet's scan of the same match in the student's scores, by position (`SheetTwin`). */
  sheets?: Partial<Record<Position, SheetTwin>>
}

/**
 * A results sheet's scan of a result the import found: the student's, the same day and position. With as many shots
 * and the same whole total it's brought up to the site's ('upgraded': it keeps its ID, photo and note, and takes every
 * shot's place and order); with other numbers both stay until a person decides ('differs': use the site's, or keep
 * both, 'kept'). Its numbers are the scan's, as they were.
 */
export interface SheetTwin {
  id: string
  state: 'upgraded' | 'differs' | 'kept'
  shots: number
  wholeTotal: number
}

/** A result not brought in is asked for again by this many checks; after, only when its match's list changes. */
export const MAX_TRIES = 10

/** `branches/{b}/onlineAthletes/{key}`: someone the import found, by their name's key (`athleteId`). */
export interface OnlineAthlete {
  /** As the results site writes it: "Avery Stone". */
  name: string
  status: AthleteStatus
  studentId: string | null
  studentName: string | null
  /** How it was found first: "On ARC 10.9 at Walton October 3P", "Named like a student". */
  why: string
  /** The student named the same, offered when confirming. */
  suggestedStudentId: string | null
  /** The teams and hosts seen with them, newest first (a few). */
  teams: string[]
  hosts: string[]
  /** Their results, by the site's result ID. */
  results: Record<string, AthleteResult>
  firstSeen: DateKey
  lastSeen: DateKey
  decidedAt?: TimestampLike | null
  decidedBy?: string | null
  updatedAt?: TimestampLike | null
}

/** `branches/{b}/onlineMatches/{matchId}`: a match the import looked at. */
export interface OnlineMatch {
  name: string
  hostId: string | null
  hostName: string | null
  /** "Monroe, GA". */
  place: string
  startDate: DateKey
  endDate: DateKey
  course: string
  url: string
  /** Its main list, as last read: its name, status (OFFICIAL…) and stamp. */
  listName: string | null
  status: string | null
  listUpdated: string | null
  /** The academy's athletes in it (their keys): linked, and still to confirm. */
  athletes: string[]
  ours: number
  /** Read after its last day: nobody new will join it. */
  settled: boolean
  checkedAt?: TimestampLike | null
}

export type RunKind = 'scheduled' | 'check' | 'lookBack'
export type RunState = 'queued' | 'running' | 'done' | 'failed' | 'skipped'

/** `branches/{b}/resultsSiteRuns/{id}`: one check of the site, as the page shows it. */
export interface ResultsSiteRun {
  kind: RunKind
  state: RunState
  requestedBy: string
  requestedAt: TimestampLike | null
  startedAt: TimestampLike | null
  finishedAt: TimestampLike | null
  /** Its days, newest first: from `to` back to `from` (a check's month, a look-back's months). */
  window: { from: DateKey; to: DateKey } | null
  /** Which part of its check it is (1, then 2… as it goes on), and the day this part starts from (null: `window.to`). */
  part?: number
  cursor?: DateKey | null
  requests: number
  /** Matches read, results brought in or changed, athletes found to confirm. */
  matches: number
  results: number
  athletes: number
  log: string[]
  error: string | null
}

/** `branches/{b}/resultsSite/status`: what the page shows of the import, written by the server. */
export interface ResultsSiteStatus {
  /** The key's last four characters, and who set it (scripts/results-site-key.ts). */
  keyEnd: string | null
  keySetAt: TimestampLike | null
  keySetBy: string | null
  /** The check under way (a lock: one at a time). */
  running: { runId: string; since: TimestampLike } | null
  lastRun: { runId: string; kind: RunKind; at: TimestampLike; ok: boolean; summary: string } | null
  /** A check going on in the next one (its time ran out): its kind and days, the days from `from` to `cursor` left. */
  going: { kind: RunKind; from: DateKey; to: DateKey; cursor: DateKey } | null
  /** Where the academy's athletes shot (the site's account IDs), searched at every check. */
  hosts: Record<string, { name: string; lastSeen: DateKey }>
  /** The day of the last search for championships nationwide (weekly). */
  nationalAt: DateKey | null
}

// ------------------------------------------------------------------ the search

/** The academy's town (its website: Suwanee, GA), the centre of the search for matches nearby. */
export const SEARCH_FROM = { latitude: 34.05, longitude: -84.07, place: 'Suwanee, GA' } as const

/** How far back a check can look (the academy's choice, `checkDays`: a month unless it changes it); past data is Look back's. */
export const CHECK_DAYS_CHOICES = [7, 14, 30, 60] as const

/** A check reads its days this many at a time, newest first, so one that runs out of time goes on from there. */
export const PART_DAYS = 14

/** The championships nationwide are searched again after this many days. */
export const CHAMPIONSHIPS_EVERY_DAYS = 7

/** How long a match with the academy's athletes is checked again for corrections and its official status. */
export const RECHECK_DAYS = 60

/**
 * Championships worth a nationwide search (weekly): the far-away matches the academy's athletes travel to (the survey's:
 * the Gary Anderson Invitational, Daisy Nationals, the state championships, the Junior Olympics). About 17 of the
 * 1,200 matches of a busy fortnight nationwide; wider words ("state", "CMP", "qualifier") took 150.
 */
export const CHAMPIONSHIP_WORDS = /\b(championships?|nationals?|junior olympics?|invitational|camp perry)\b/i

/** A check's parts, newest first: `days` each, from `to` back to `from`. */
export function windowsBack(from: DateKey, to: DateKey, days = PART_DAYS): { from: DateKey; to: DateKey }[] {
  const out: { from: DateKey; to: DateKey }[] = []
  let end = to
  while (end >= from && out.length < 400) {
    const start = addDays(end, -(days - 1))
    out.push({ from: start < from ? from : start, to: end })
    end = addDays(start, -1)
  }
  return out
}

/**
 * Whether a match with the academy's athletes, from before a check's days, is looked at again for corrections and its
 * official status: for two months after it ends (one request when its list hasn't changed).
 */
export function dueForRecheck(m: Pick<OnlineMatch, 'endDate' | 'ours'>, today: DateKey): boolean {
  return m.ours > 0 && m.endDate >= addDays(today, -RECHECK_DAYS)
}

// ------------------------------------------------------------------ who is the academy's

export interface StudentName {
  id: string
  name: string
  lastName?: string | null
  otherNames?: string[]
}

/**
 * Each name key with the students who have it: a student's name and the other names they go by, a given name with
 * their family name, each family name first too (`nameFormsOf`: "Lianhua Rowan" and "Rowan Lianhua" for Ivy Rowan, who
 * goes by Lianhua).
 */
export function studentIndex(students: readonly StudentName[]): Map<string, StudentName[]> {
  const out = new Map<string, StudentName[]>()
  for (const s of students) {
    for (const n of nameFormsOf(s)) {
      const key = nameKey(n)
      if (!key) continue
      const list = out.get(key) ?? []
      if (!list.some((x) => x.id === s.id)) list.push(s)
      out.set(key, list)
    }
  }
  return out
}

/** What the import does with someone in a match's list. */
export type Verdict =
  /** Linked: their results are brought into the student's scores. */
  | { kind: 'linked'; studentId: string }
  /** Not the academy's (a person said so). */
  | { kind: 'ignored' }
  /** To confirm: on one of the academy's teams, or named like a student (`studentId`, when only one is). */
  | { kind: 'suggest'; why: 'team' | 'name'; studentId: string | null }
  /** Nobody of the academy's. */
  | { kind: 'none' }

/**
 * Whether someone in a match is the academy's: linked or turned down before (by their name's key), on one of the
 * academy's teams, or named exactly like a student (their name or another name they go by). Near spellings are never
 * suggested: they may be brothers and sisters, or another athlete.
 */
export function verdictFor(
  p: { key: string; team: string | null },
  athletes: ReadonlyMap<string, Pick<OnlineAthlete, 'status' | 'studentId'>>,
  students: ReadonlyMap<string, readonly StudentName[]>,
  teamNames: readonly string[],
): Verdict {
  const known = athletes.get(p.key)
  if (known?.status === 'linked' && known.studentId) return { kind: 'linked', studentId: known.studentId }
  if (known?.status === 'ignored') return { kind: 'ignored' }
  const named = students.get(p.key) ?? []
  if (p.team && isAcademyTeam(p.team, teamNames)) return { kind: 'suggest', why: 'team', studentId: named.length === 1 ? named[0].id : null }
  if (named.length) return { kind: 'suggest', why: 'name', studentId: named.length === 1 ? named[0].id : null }
  if (known?.status === 'new') return { kind: 'suggest', why: 'team', studentId: null }
  return { kind: 'none' }
}

/** A person in a list, as the import compares them: their name, its key, their result and team. */
export interface Entrant {
  key: string
  name: string
  resultCofId: string
  team: string | null
  lastUpdated: string | null
}

/** Someone from a participant or result list, or a team's member (with their team's name). */
export function entrantOf(p: ScoposParticipant | undefined, resultCofId: string | undefined, team: string | null, lastUpdated?: string): Entrant | null {
  if (!p || !resultCofId) return null
  const name = athleteName(p)
  const key = nameKey(name)
  return key ? { key, name, resultCofId, team, lastUpdated: lastUpdated ?? null } : null
}

/** How the page says why an athlete was suggested. */
export function whyWords(v: Extract<Verdict, { kind: 'suggest' }>, e: Pick<Entrant, 'team'>, matchName: string): string {
  return v.why === 'team' && e.team ? `On ${e.team} at ${matchName}` : `Named like a student, at ${matchName}`
}

/** A few of the newest first, without repeats: an athlete's teams and hosts. */
export const newestFirst = (list: readonly string[], add: string | null | undefined, max = 6): string[] =>
  add ? [add, ...list.filter((x) => x !== add)].slice(0, max) : [...list].slice(0, max)

/** "Checked 214 requests: 12 matches, 3 results, 2 athletes to confirm." — a run in a line, for the page. */
export function runSummary(r: Pick<ResultsSiteRun, 'matches' | 'results' | 'athletes' | 'requests'>): string {
  const parts = [
    `${r.matches} match${r.matches === 1 ? '' : 'es'} read`,
    `${r.results} result${r.results === 1 ? '' : 's'} brought in or updated`,
    r.athletes ? `${r.athletes} athlete${r.athletes === 1 ? '' : 's'} to confirm` : null,
  ].filter(Boolean)
  return `${parts.join(', ')} (${r.requests} request${r.requests === 1 ? '' : 's'} to the site).`
}

export const RUN_KIND_LABELS: Record<RunKind, string> = { scheduled: 'Scheduled check', check: 'Check now', lookBack: 'Look back' }

/** A check still queued or running after this long has stopped (its function ran out of time): it no longer counts. */
export const RUN_STALE_MS = 20 * 60_000

/** Whether a check is under way: queued or running, and not stopped long ago without saying so. */
export function isUnderWay(r: Pick<ResultsSiteRun, 'state' | 'requestedAt'>, now: number): boolean {
  if (r.state !== 'queued' && r.state !== 'running') return false
  const at = r.requestedAt?.toMillis?.() ?? now
  return now - at < RUN_STALE_MS
}

// ------------------------------------------------------------------ when it checks on its own

/** The academy's schedule (`settings.resultsSite.schedule`): on these days (0 Sunday to 6 Saturday), at this hour. */
export interface CheckSchedule {
  on: boolean
  days: readonly number[]
  hour: number
}

/** Whether the hour of `now`, in the academy's time, is one the schedule checks in. */
export function isScheduledHour(s: CheckSchedule, now: Date | number, tz: string): boolean {
  return s.on && s.days.includes(weekdayIndex(todayKey(tz, now))) && Math.floor(minutesOf(now, tz) / 60) === s.hour
}

/** The next check the schedule makes after `now`: its day and hour, in the academy's time. Null when it's off. */
export function nextScheduled(s: CheckSchedule, now: Date | number, tz: string): { dateKey: DateKey; hour: number } | null {
  if (!s.on || !s.days.length) return null
  const today = todayKey(tz, now)
  const hourNow = Math.floor(minutesOf(now, tz) / 60)
  for (let i = 0; i <= 7; i++) {
    const day = addDays(today, i)
    if (s.days.includes(weekdayIndex(day)) && (i > 0 || s.hour > hourNow)) return { dateKey: day, hour: s.hour }
  }
  return null
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** "Every Sunday at 10 PM", "Mondays and Thursdays at 8 AM", "Every day at 10 PM"; "Off" when it's off. */
export function scheduleWords(s: CheckSchedule): string {
  const days = [...new Set(s.days)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (!s.on || !days.length) return 'Off'
  const at = formatMinutesShort(s.hour * 60)
  if (days.length === 7) return `Every day at ${at}`
  if (days.length === 1) return `Every ${DAY_NAMES[days[0]]} at ${at}`
  const names = days.map((d) => `${DAY_NAMES[d]}s`)
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} at ${at}`
}

// ------------------------------------------------------------------ what became of a result

/** One of an athlete's results, as the page tells it. */
export type ResultState = 'in' | 'notPublished' | 'noShots' | 'waiting' | 'stopped'

/** Where a result of a linked athlete is: in the scores, or why not yet. */
export function resultState(r: Pick<AthleteResult, 'evaluations' | 'error' | 'tries'>): ResultState {
  if (Object.keys(r.evaluations ?? {}).length) return 'in'
  if ((r.tries ?? 0) >= MAX_TRIES) return 'stopped'
  if (r.error) return 'notPublished'
  return r.tries ? 'noShots' : 'waiting'
}

export const RESULT_STATE_WORDS: Record<ResultState, string> = {
  in: 'In the scores',
  notPublished: 'Not published on the results site: asked again at each check',
  noShots: 'No shots on the results site yet: asked again at each check',
  waiting: 'Comes in with the next check',
  stopped: `Not on the results site after ${MAX_TRIES} checks: asked again if its match changes`,
}

// ------------------------------------------------------------------ the whole result, and putting a scan back

/** `branches/{b}/resultsSiteRaw/{id}` (server only): a result brought in, whole, as the site gave it. */
export interface ResultsSiteRaw {
  resultCofId: string
  /**
   * The site's JSON of the result, unchanged: every field, the ones the app shows and the rest (each shot's time, the
   * firing point, the course of fire, the remarks), kept for later.
   */
  json: string
  lastUpdated: string | null
  studentId: string
  savedAt: TimestampLike | null
}

/**
 * `branches/{b}/resultsSiteUndo/{evaluationId}` (server only): a results sheet scan as it was before the site's result
 * replaced its numbers (brought up to the site's, or "Use the site's"). Start over puts it back.
 */
export interface ResultsSiteUndo {
  evaluationId: string
  resultCofId: string
  /** The fields the site's result changed, as the scan had them, and those it didn't have. */
  before: Record<string, unknown>
  absent: string[]
  at: TimestampLike | null
}

/** What Start over took away and put back, for its message and the activity log. */
export interface ResetCounts {
  athletes: number
  results: number
  scans: number
  matches: number
  checks: number
}

/** "Removed 18 athletes, 31 results from the scores, 244 matches looked at and 3 checks; 24 results sheet scans are as they were." */
export function resetWords(c: ResetCounts): string {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`
  const removed = [n(c.athletes, 'athlete'), `${n(c.results, 'result')} from the scores`, n(c.matches, 'match looked at', 'matches looked at'), n(c.checks, 'check')]
  const list = `${removed.slice(0, -1).join(', ')} and ${removed[removed.length - 1]}`
  return `Removed ${list}${c.scans ? `; ${n(c.scans, 'results sheet scan')} ${c.scans === 1 ? 'is' : 'are'} as ${c.scans === 1 ? 'it was' : 'they were'}` : ''}.`
}

// ------------------------------------------------------------------ the page

/** "The last month": how far back a check looks (`checkDays`). */
export function checkWindowWords(days: number): string {
  if (days === 7) return 'The last week'
  if (days === 30) return 'The last month'
  if (days % 30 === 0) return `The last ${days / 30} months`
  if (days % 7 === 0) return `The last ${days / 7} weeks`
  return `The last ${days} days`
}

/** A result of the site, read for the page before its athlete is linked: its positions as the scores would show them. */
export interface ResultPreview {
  results: Omit<Evaluation, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>[]
  /** Why there's nothing to show: not published, or no shots yet. */
  error: string | null
}

/**
 * Confirm all: each athlete still to confirm whose student is suggested (and still in the academy), linked to them.
 * With how many results that brings in, and how many of them are recent enough that the family hears of them, as of any
 * new score (`isScoreNews`).
 */
export function confirmAllPlan(
  athletes: readonly (Pick<OnlineAthlete, 'status' | 'suggestedStudentId' | 'results'> & { id: string })[],
  today: DateKey,
  isStudent: (id: string) => boolean,
): { links: { key: string; studentId: string }[]; results: number; news: number } {
  const ready = athletes.filter((a) => a.status === 'new' && a.suggestedStudentId && isStudent(a.suggestedStudentId))
  const results = ready.flatMap((a) => Object.values(a.results ?? {}))
  return {
    links: ready.map((a) => ({ key: a.id, studentId: a.suggestedStudentId as string })),
    results: results.length,
    news: results.filter((r) => isScoreNews(r.dateKey, today)).length,
  }
}
