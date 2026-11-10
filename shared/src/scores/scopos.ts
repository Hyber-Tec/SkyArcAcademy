import { type EvalSeries, type EvalShot, type Evaluation, type Position, shotGroup } from '../shooting/evaluation'
import { type DateKey, isDateKey, minutesOf } from '../time'
import type { AuditStamp } from '../types'

/**
 * Competition results from the tournaments' results site (Scopos "Rezults", the fourth meeting's R1): the shapes of
 * Scopos's public API that the import reads, and one athlete's result (a "ResultCOF") read into the app's results, one
 * per position, as a results sheet's are saved (shared/src/scores/sheetShots.ts). Unlike a sheet, every shot comes
 * with its number in the firing order and its exact place, so the order and the places are certain.
 */

export interface ScoposScore {
  /** Decimal (10.4). */
  D: number
  /** Whole (10). */
  I: number
  /** The official one, by the match's scoring: D in a decimal match, I in a whole-number one. */
  S: number
  /** Inner tens. */
  X: number
}

export interface ScoposShot {
  /** "K1", "P12", "S3". */
  EventName?: string
  /** The series it's in: "KN 1", "PR 2", "ST 6". */
  StageLabel?: string
  /** 1, 2, 3… in the firing order, across the whole match. */
  Sequence: number
  Score: ScoposScore
  /** Millimetres from the centre, x right and y up; missing on a score typed in by hand. */
  Location?: { X: number; Y: number } | null
  TimeScored?: string
  BulletDiameter?: number
}

export interface ScoposEventScore {
  EventName: string
  /** EVENT, STAGE (a position), SERIES or STRING. */
  EventType: string
  NumShotsFired?: number
  Score: ScoposScore
  Status?: string
}

export interface ScoposParticipant {
  GivenName?: string
  FamilyName?: string
  /** "Family, Given". */
  DisplayName?: string
  CompetitorNumber?: string
  TeamName?: string
  ResultCOFID?: string
}

/** A match as `/match/search` lists it. */
export interface ScoposMatchItem {
  MatchID: string
  MatchName: string
  OwnerId?: string
  OwnerName?: string
  StartDate: string
  EndDate: string
  ShootingStyle?: string
  Location?: { City?: string; State?: string; Distance?: number }
  CourseOfFireDef?: string
  ParentID?: string
}

/** One person in `/match/{id}/participant`'s list. */
export interface ScoposParticipantItem {
  LocalDate?: string
  LastUpdated?: string
  Participant: ScoposParticipant & { ResultCOFID?: string }
  MatchParticipantResults?: { EventName?: string; ResultCOFID?: string }[]
}

/** One line of a result list: an athlete, or a team with its members (`Team - All`). */
export interface ScoposListItem {
  ResultCOFID?: string
  LastUpdated?: string
  LocalDate?: string
  Participant?: ScoposParticipant
  TeamMembers?: { ResultCOFID?: string; LastUpdated?: string; Participant?: ScoposParticipant }[]
}

/** A match's own page: its result lists (the main one `Primary`), course and place. */
export interface ScoposMatch {
  MatchID: string
  Name: string
  StartDate: string
  EndDate: string
  OwnerId?: string
  CourseOfFireDef?: string
  ScoreConfigName?: string
  Location?: { City?: string; State?: string }
  ResultEvents?: { EventName?: string; ResultLists?: { ResultName: string; Primary?: boolean; Status?: string }[] }[]
}

export interface ScoposResultCof {
  ResultCOFID: string
  MatchID: string
  MatchName: string
  /** The day it was shot (YYYY-MM-DD). */
  LocalDate: string
  /** FUTURE, INTERMEDIATE, UNOFFICIAL or OFFICIAL. */
  Status?: string
  /** "Integer", "Decimal", "Conventional". */
  ScoreConfigName?: string
  CourseOfFireDef?: string
  LastUpdated?: string
  Participant: ScoposParticipant
  /** By sequence number; a shortened copy may hold a note in place of a shot, which is skipped. */
  Shots: Record<string, ScoposShot | string>
  EventScores?: Record<string, ScoposEventScore>
}

/** The series labels' starts, as the courses of fire name them (KN 1, PR 2, ST 6). Sitting and finals aren't positions here. */
const PREFIXES: Record<string, Position> = { KN: 'kneeling', PR: 'prone', ST: 'standing' }
const STAGES: Record<Position, string> = { kneeling: 'Kneeling', prone: 'Prone', standing: 'Standing' }

/** A series label's position and number: "KN 2" → kneeling, 2; null for anything else (sitting, a final's eliminations). */
export function seriesOf(label: string | undefined): { position: Position; n: number } | null {
  const m = /^\s*([A-Z]{2})\s*(\d+)\s*$/.exec(label ?? '')
  const position = m ? PREFIXES[m[1]] : undefined
  return m && position ? { position, n: Number(m[2]) } : null
}

/** Whether a match counts tenths (a decimal match) or whole numbers. */
export const isDecimal = (cof: Pick<ScoposResultCof, 'ScoreConfigName'>): boolean => /decimal/i.test(cof.ScoreConfigName ?? '')

/** One position of an online result, ready to save as a competition. */
export interface OnlineResult {
  position: Position
  dateKey: DateKey
  /** The first shot's time in the academy's zone; null when the site gives none. */
  timeMin: number | null
  decimal: boolean
  shots: number
  total: number
  wholeTotal: number
  innerTens: number
  series: EvalSeries[]
  mpi: EvalSeries['mpi']
  groupMm: number | null
  /** What a coach should know: not official yet, shots without a place. */
  problems: string[]
}

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * One athlete's result, by position: each series' shots in the order they were fired, at their places, scored as the
 * match scores them (tenths in a decimal match), with the totals and inner tens the site gives. Positions with no shots
 * (a 60-shot standing match has only standing) are left out, and so are stages that aren't positions (sitting, a
 * final's eliminations, a written test).
 */
export function onlineResults(cof: ScoposResultCof, timeZone: string): OnlineResult[] {
  const decimal = isDecimal(cof)
  const shots = Object.values(cof.Shots ?? {}).filter((s): s is ScoposShot => typeof s === 'object' && s !== null && typeof s.Sequence === 'number' && !!s.Score)
  const byPosition = new Map<Position, Map<number, ScoposShot[]>>()
  for (const s of shots) {
    const at = seriesOf(s.StageLabel)
    if (!at) continue
    const series = byPosition.get(at.position) ?? new Map<number, ScoposShot[]>()
    series.set(at.n, [...(series.get(at.n) ?? []), s])
    byPosition.set(at.position, series)
  }
  const scores = cof.EventScores ?? {}
  const dateKey = (isDateKey(cof.LocalDate) ? cof.LocalDate : String(cof.LocalDate ?? '').slice(0, 10)) as DateKey
  const official = (cof.Status ?? '').toUpperCase() === 'OFFICIAL'
  const out: OnlineResult[] = []
  for (const position of ['kneeling', 'prone', 'standing'] as const) {
    const bySeries = byPosition.get(position)
    if (!bySeries) continue
    const series: EvalSeries[] = [...bySeries.entries()]
      .sort(([a], [b]) => a - b)
      .map(([n, list]) => {
        const ordered = [...list].sort((a, b) => a.Sequence - b.Sequence)
        const evalShots: EvalShot[] = ordered.map((s) => {
          const loc = s.Location && Number.isFinite(s.Location.X) && Number.isFinite(s.Location.Y) ? s.Location : null
          return {
            v: decimal ? round1(s.Score.D) : s.Score.I,
            inner: (s.Score.X ?? 0) > 0,
            a: loc ? Math.round((((Math.atan2(loc.Y, loc.X) * 180) / Math.PI + 360) % 360) * 10) / 10 : null,
            ...(loc ? { x: Math.round(loc.X * 100) / 100, y: Math.round(loc.Y * 100) / 100, r: (s.BulletDiameter ?? 4.5) / 2 } : {}),
          }
        })
        const label = `${Object.keys(PREFIXES).find((k) => PREFIXES[k] === position)} ${n}`
        const given = scores[label]?.Score
        const sum = evalShots.reduce((t, x) => t + x.v, 0)
        return { n, total: given ? round1(decimal ? given.D : given.I) : round1(sum), shots: evalShots, ...shotGroup(evalShots) }
      })
    const all = series.flatMap((s) => s.shots)
    const stage = scores[STAGES[position]]?.Score
    const placed = all.filter((s) => typeof s.x === 'number').length
    const problems: string[] = []
    if (!official) problems.push(`Not official yet on the results site${cof.Status ? ` (${cof.Status.toLowerCase()})` : ''}: it may still change.`)
    if (placed < all.length) problems.push(`${all.length - placed} of ${all.length} shots have no place on the target.`)
    const ordered = shots.filter((s) => seriesOf(s.StageLabel)?.position === position).sort((a, b) => a.Sequence - b.Sequence)
    const first = ordered.find((s) => s.TimeScored && Number.isFinite(Date.parse(s.TimeScored)))
    out.push({
      position,
      dateKey,
      timeMin: first ? minutesOf(Date.parse(first.TimeScored as string), timeZone) : null,
      decimal,
      shots: all.length,
      total: stage ? round1(decimal ? stage.D : stage.I) : round1(series.reduce((t, s) => t + s.total, 0)),
      wholeTotal: stage ? stage.I : all.reduce((t, s) => t + Math.floor(s.v), 0),
      innerTens: stage ? stage.X : ordered.filter((s) => s.Score.X > 0).length,
      series,
      ...shotGroup(all),
      problems,
    })
  }
  return out
}

// ------------------------------------------------------------------ athletes

/** A name as the import compares it: letters and digits only, without accents, lowercase ("Jae-Hyun O'Neil" → "jaehyunoneil"). */
export const nameKey = (s: string): string =>
  (s ?? '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/** "Given Family", from the parts or from "Family, Given". */
export function athleteName(p: ScoposParticipant): string {
  const given = (p.GivenName ?? '').trim()
  const family = (p.FamilyName ?? '').trim()
  if (given || family) return `${given} ${family}`.trim()
  const m = /^([^,]+),\s*(.+)$/.exec((p.DisplayName ?? '').trim())
  return m ? `${m[2].trim()} ${m[1].trim()}` : (p.DisplayName ?? '').trim()
}

/** An athlete's ID in the import: their name's key, the same at every host ("given-family" letters only). */
export const athleteId = (p: ScoposParticipant): string => nameKey(athleteName(p)) || 'unknown'

/**
 * Whether a team name is one of the academy's: the patterns are the academy's setting ("ARC 10.9*", "ARC *"), `*`
 * standing for anything, case and spacing not counting.
 */
export function isAcademyTeam(team: string | undefined, patterns: readonly string[]): boolean {
  const name = (team ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  if (!name) return false
  return patterns.some((p) => {
    const re = new RegExp(`^${p.trim().replace(/\s+/g, ' ').toLowerCase().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`)
    return re.test(name)
  })
}

/** The team names the import looks for until the academy changes them: the academy's team on the results site. */
export const DEFAULT_TEAM_PATTERNS: readonly string[] = ['ARC 10.9*', 'ARC *', 'ARC']

/** The results site's own page for one athlete's result. */
export const resultUrl = (resultCofId: string): string => `https://rezults.scopos.tech/ResultCOF/${encodeURIComponent(resultCofId)}`

/** The results site's page for a match. */
export const matchUrl = (matchId: string): string => `https://rezults.scopos.tech/match/${encodeURIComponent(matchId)}/`

/** A course of fire's name from its definition ("v3.0:ntparc:Three-Position Air Rifle 3x20" → "Three-Position Air Rifle 3x20"). */
export const courseName = (def: string | undefined): string => (def ?? '').split(':').slice(2).join(':').trim() || (def ?? '').trim()

/** Whether a list is a team list ("Team - All", "Teams - Sporter"), whose lines are teams with their members. */
export const isTeamList = (name: string): boolean => /^teams?\b/i.test(name.trim())

/** The match's main individual list: the one marked primary, else the first that isn't a team's. */
export function mainList(m: Pick<ScoposMatch, 'ResultEvents'>): { name: string; status: string | null } | null {
  const lists = (m.ResultEvents ?? []).flatMap((e) => e.ResultLists ?? [])
  const pick = lists.find((l) => l.Primary && !isTeamList(l.ResultName)) ?? lists.find((l) => !isTeamList(l.ResultName))
  return pick ? { name: pick.ResultName, status: pick.Status ?? null } : null
}

/** The match's team lists' names. */
export const teamLists = (m: Pick<ScoposMatch, 'ResultEvents'>): string[] =>
  [...new Set((m.ResultEvents ?? []).flatMap((e) => e.ResultLists ?? []).map((l) => l.ResultName).filter(isTeamList))]

/**
 * One position of an athlete's online result as the student's result, ready to save: a competition, with the match's
 * name and course, and where it came from (`online`), so the next night brings it in again when it changes.
 */
export function onlineEvaluation(
  r: OnlineResult,
  cof: Pick<ScoposResultCof, 'ResultCOFID' | 'MatchID' | 'MatchName' | 'CourseOfFireDef' | 'Status' | 'LastUpdated'>,
  who: { studentId: string; studentName: string; team: string | null; host: string | null },
): Omit<Evaluation, keyof AuditStamp> {
  return {
    studentId: who.studentId,
    studentName: who.studentName,
    source: 'online',
    position: r.position,
    dateKey: r.dateKey,
    timeMin: r.timeMin,
    shots: r.shots,
    total: r.total,
    wholeTotal: r.wholeTotal,
    innerTens: r.innerTens,
    mpi: r.mpi,
    groupMm: r.groupMm,
    series: r.series,
    sighters: 0,
    fileId: null,
    note: '',
    problems: r.problems,
    sius: null,
    kind: 'competition',
    match: { name: (cof.MatchName ?? '').trim() || 'Competition', course: courseName(cof.CourseOfFireDef) },
    online: {
      matchId: cof.MatchID,
      resultCofId: cof.ResultCOFID,
      url: resultUrl(cof.ResultCOFID),
      status: (cof.Status ?? '').toUpperCase(),
      lastUpdated: cof.LastUpdated ?? null,
      team: who.team,
      host: who.host,
    },
  }
}

/** The evaluation ID of one position of an online result: the same each night, so it's updated rather than added again. */
export const onlineEvaluationId = (resultCofId: string, position: Position): string => `online-${resultCofId.replace(/[^A-Za-z0-9-]/g, '')}-${position}`
