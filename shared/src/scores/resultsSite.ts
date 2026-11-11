import { nameFormsOf } from '../names'
import type { Position } from '../shooting/evaluation'
import { type DateKey, addDays } from '../time'
import type { TimestampLike } from '../types'
import { athleteName, isAcademyTeam, nameKey, type ScoposParticipant } from './scopos'

/**
 * The results site import (the fourth meeting's R1: "there is no page of our own such as ARC 10.9… go around all the
 * results site"): each night the server looks for the matches the academy's athletes shot, nearby, at the hosts they
 * shot at before and, once a week, the championships anywhere, and brings each linked athlete's results into their
 * student's scores (functions/src/resultsSite). Nobody pastes a link. An athlete is linked to a student once, by a
 * person: the import only suggests the athletes on the academy's teams and those named like a student. These are the
 * documents it keeps, and the decisions it makes, as pure functions.
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

export type RunKind = 'nightly' | 'check' | 'lookBack'
export type RunState = 'queued' | 'running' | 'done' | 'failed' | 'skipped'

/** `branches/{b}/resultsSiteRuns/{id}`: one check of the site, as the page shows it. */
export interface ResultsSiteRun {
  kind: RunKind
  state: RunState
  requestedBy: string
  requestedAt: TimestampLike | null
  startedAt: TimestampLike | null
  finishedAt: TimestampLike | null
  /** A look-back's days, newest first: from `to` back to `from`. */
  window: { from: DateKey; to: DateKey } | null
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
  /** The key's last four characters, and who set it. */
  keyEnd: string | null
  keySetAt: TimestampLike | null
  keySetBy: string | null
  /** The check under way (a lock: one at a time). */
  running: { runId: string; since: TimestampLike } | null
  lastRun: { runId: string; kind: RunKind; at: TimestampLike; ok: boolean; summary: string } | null
  /** A look-back still going: the days from `from` to `cursor` are left. */
  lookBack: { from: DateKey; cursor: DateKey } | null
  /** Where the academy's athletes shot (the site's account IDs), searched each night. */
  hosts: Record<string, { name: string; lastSeen: DateKey }>
  /** The day of the last search for championships nationwide (weekly). */
  nationalAt: DateKey | null
}

// ------------------------------------------------------------------ the search

/** The academy's town (its website: Suwanee, GA), the centre of the nightly search for matches nearby. */
export const SEARCH_FROM = { latitude: 34.05, longitude: -84.07, place: 'Suwanee, GA' } as const

/** How far back each night looks: matches end, results go up and are corrected over days. */
export const NIGHTLY_DAYS = 14

/** How long a match with the academy's athletes is checked again for corrections and its official status. */
export const RECHECK_DAYS = 60

/**
 * Championships worth a nationwide search (weekly): the far-away matches the academy's athletes travel to (the survey's:
 * the Gary Anderson Invitational, Daisy Nationals, the state championships, the Junior Olympics). About 17 of the
 * 1,200 matches of a busy fortnight nationwide; wider words ("state", "CMP", "qualifier") took 150.
 */
export const CHAMPIONSHIP_WORDS = /\b(championships?|nationals?|junior olympics?|invitational|camp perry)\b/i

/** A look-back's windows, newest first: `days` each, from `to` back to `from`. */
export function windowsBack(from: DateKey, to: DateKey, days = NIGHTLY_DAYS): { from: DateKey; to: DateKey }[] {
  const out: { from: DateKey; to: DateKey }[] = []
  let end = to
  while (end >= from && out.length < 400) {
    const start = addDays(end, -(days - 1))
    out.push({ from: start < from ? from : start, to: end })
    end = addDays(start, -1)
  }
  return out
}

/** Whether a match with the academy's athletes is due a check for changes on `today` (daily at first, then weekly). */
export function dueForRecheck(m: Pick<OnlineMatch, 'endDate' | 'ours' | 'status'>, today: DateKey, weekday: number): boolean {
  if (m.ours <= 0) return false
  if (m.endDate >= addDays(today, -NIGHTLY_DAYS)) return true
  if (m.endDate < addDays(today, -RECHECK_DAYS)) return false
  return (m.status ?? '').toUpperCase() !== 'OFFICIAL' || weekday === 0
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
 * their family name, each family name first too (`nameFormsOf`: "Shengzhe Zhou" and "Zhou Shengzhe" for Remi Zhou, who
 * goes by Shengzhe).
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

export const RUN_KIND_LABELS: Record<RunKind, string> = { nightly: 'Nightly check', check: 'Check now', lookBack: 'Look back' }

/** A check still queued or running after this long has stopped (its function ran out of time): it no longer counts. */
export const RUN_STALE_MS = 20 * 60_000

/** Whether a check is under way: queued or running, and not stopped long ago without saying so. */
export function isUnderWay(r: Pick<ResultsSiteRun, 'state' | 'requestedAt'>, now: number): boolean {
  if (r.state !== 'queued' && r.state !== 'running') return false
  const at = r.requestedAt?.toMillis?.() ?? now
  return now - at < RUN_STALE_MS
}
