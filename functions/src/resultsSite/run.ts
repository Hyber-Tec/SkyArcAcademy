import { type DocumentReference, FieldValue, type Timestamp, type WriteBatch } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from '../app'
import { COL, DOC, ROOT } from '@shared/paths'
import {
  type AthleteResult,
  type Entrant,
  type OnlineAthlete,
  type OnlineMatch,
  type ResetCounts,
  type ResultsSiteRun,
  type ResultsSiteStatus,
  type ResultsSiteUndo,
  type SheetTwin,
  type StudentName,
  CHAMPIONSHIPS_EVERY_DAYS,
  CHAMPIONSHIP_WORDS,
  MAX_TRIES,
  RECHECK_DAYS,
  SEARCH_FROM,
  dueForRecheck,
  entrantOf,
  newestFirst,
  resetWords,
  runSummary,
  studentIndex,
  verdictFor,
  whyWords,
  windowsBack,
} from '@shared/scores/resultsSite'
import {
  type ScoposListItem,
  type ScoposMatch,
  type ScoposMatchItem,
  type ScoposParticipantItem,
  type ScoposResultCof,
  courseName,
  mainList,
  matchUrl,
  onlineEvaluation,
  onlineEvaluationId,
  onlineResults,
  teamLists,
} from '@shared/scores/scopos'
import { type Evaluation, POSITION_LABELS, type Position, per10 } from '@shared/shooting/evaluation'
import type { BranchSettings } from '@shared/settings/defaults'
import { resolveSettings } from '@shared/settings/resolve'
import { type DateKey, addDays, diffDays, formatDateKey, todayKey } from '@shared/time'
import type { Branch, Student } from '@shared/types'
import { SiteClient, SiteError } from './client'

/**
 * One check of the results site (shared/src/scores/resultsSite.ts says what it looks for): find the matches, read who
 * shot in them, note the academy's athletes, and bring each linked athlete's results into their student's scores. A
 * check reads its days two weeks at a time, newest first; it stops starting new work after `WORK_MS` (its function has
 * 9 minutes) or its budget of requests, and goes on from there in a new check.
 */

const WORK_MS = 7 * 60_000
const BUDGET = 380
/** A check waits this long for another to finish before giving up. */
const LOCK_WAIT_MS = 5 * 60_000
/** A lock older than this is a check that died. */
const LOCK_STALE_MS = 12 * 60_000

export const base = (branchId: string) => `${ROOT.branches}/${branchId}`
export const statusRef = (branchId: string) => db.doc(`${base(branchId)}/${COL.resultsSite}/${DOC.resultsSiteStatus}`)
export const keyRef = (branchId: string) => db.doc(`${base(branchId)}/${COL.resultsSiteKey}/${DOC.resultsSiteKey}`)
export const runsOf = (branchId: string) => db.collection(`${base(branchId)}/${COL.resultsSiteRuns}`)
const athletesOf = (branchId: string) => db.collection(`${base(branchId)}/${COL.onlineAthletes}`)
const matchesOf = (branchId: string) => db.collection(`${base(branchId)}/${COL.onlineMatches}`)
const evaluationsOf = (branchId: string) => db.collection(`${base(branchId)}/${COL.evaluations}`)
/** A result's whole JSON from the site (`ResultsSiteRaw`), by its result's ID as a document's. */
const rawRef = (branchId: string, resultCofId: string) => db.doc(`${base(branchId)}/${COL.resultsSiteRaw}/${resultCofId.replace(/[^A-Za-z0-9-]/g, '') || 'unknown'}`)
const undoOf = (branchId: string) => db.collection(`${base(branchId)}/${COL.resultsSiteUndo}`)

/** Who the import is in the audit log and on the results it writes. */
export const SYSTEM = { actorUid: 'system', actorEmail: 'system', actorName: 'Results site', actorRole: 'system', via: 'function' } as const

export async function loadKey(branchId: string): Promise<string | null> {
  const key = (await keyRef(branchId).get()).get('key')
  return typeof key === 'string' && key ? key : null
}

/** What one check keeps while it works. */
interface Ctx {
  branchId: string
  tz: string
  today: DateKey
  settings: BranchSettings['resultsSite']
  client: SiteClient
  status: ResultsSiteStatus
  athletes: Map<string, OnlineAthlete>
  /** The athletes this check changed: their whole record (new), or the results it touched. */
  created: Set<string>
  touched: Map<string, Set<string>>
  students: Map<string, StudentName[]>
  studentName: Map<string, string>
  /** Matches already looked at, from the store, and those this check read. */
  matches: Map<string, OnlineMatch>
  read: Set<string>
  counts: { matches: number; results: number; athletes: number }
  log: string[]
  started: number
  /** When the progress was last written. */
  saved: number
  run: DocumentReference
}

const timeUp = (c: Ctx) => Date.now() - c.started > WORK_MS || c.client.left < 25

/** How far the check got, on its document every 20 seconds or so, for the page to show while it runs. */
async function progress(c: Ctx) {
  if (Date.now() - c.saved < 20_000) return
  c.saved = Date.now()
  await c.run.update({ requests: c.client.requests, ...c.counts, log: c.log }).catch(() => undefined)
}
const note = (c: Ctx, line: string) => {
  c.log.push(line)
  if (c.log.length > 60) c.log.splice(0, c.log.length - 60)
}

const emptyStatus = (): ResultsSiteStatus => ({ keyEnd: null, keySetAt: null, keySetBy: null, running: null, lastRun: null, going: null, hosts: {}, nationalAt: null })

// ------------------------------------------------------------------ the lock: one check at a time

async function takeLock(branchId: string, runId: string): Promise<boolean> {
  const until = Date.now() + LOCK_WAIT_MS
  while (Date.now() < until) {
    const got = await db.runTransaction(async (tx) => {
      const s = (await tx.get(statusRef(branchId))).data() as Partial<ResultsSiteStatus> | undefined
      const held = s?.running
      const since = (held?.since as Timestamp | undefined)?.toMillis?.() ?? 0
      if (held && held.runId !== runId && Date.now() - since < LOCK_STALE_MS) return false
      tx.set(statusRef(branchId), { running: { runId, since: FieldValue.serverTimestamp() } }, { merge: true })
      return true
    })
    if (got) return true
    await new Promise((r) => setTimeout(r, 10_000))
  }
  return false
}

/** The lock at once, or false when a check holds it (a person's answer waits for no check). */
export async function holdLock(branchId: string, runId: string): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const s = (await tx.get(statusRef(branchId))).data() as Partial<ResultsSiteStatus> | undefined
    const since = (s?.running?.since as Timestamp | undefined)?.toMillis?.() ?? 0
    if (s?.running && s.running.runId !== runId && Date.now() - since < LOCK_STALE_MS) return false
    tx.set(statusRef(branchId), { running: { runId, since: FieldValue.serverTimestamp() } }, { merge: true })
    return true
  })
}

export async function releaseLock(branchId: string, runId: string) {
  await db.runTransaction(async (tx) => {
    const s = (await tx.get(statusRef(branchId))).data() as Partial<ResultsSiteStatus> | undefined
    if (s?.running?.runId === runId) tx.set(statusRef(branchId), { running: null }, { merge: true })
  })
}

// ------------------------------------------------------------------ a check

/** Runs the check `runId` (queued by the page's buttons, the schedule, or a check going on). */
export async function runCheck(branchId: string, runId: string): Promise<void> {
  const started = Date.now()
  const ref = runsOf(branchId).doc(runId)
  const run = (await ref.get()).data() as ResultsSiteRun | undefined
  if (!run || run.state !== 'queued') return
  if (!(await takeLock(branchId, runId))) {
    await ref.update({ state: 'skipped', error: 'Another check was still running.', finishedAt: FieldValue.serverTimestamp() })
    return
  }
  let ctx: Ctx | null = null
  try {
    await ref.update({ state: 'running', startedAt: FieldValue.serverTimestamp() })
    ctx = await load(branchId, ref, started)
    const window = run.window ?? { from: addDays(ctx.today, -ctx.settings.checkDays), to: ctx.today }
    // Its days first (the nearby matches, newest first), then the academy's matches from before them and the
    // championships (weekly), unless it's a look-back.
    if ((await walk(ctx, run, window)) && run.kind !== 'lookBack') await afterTheDays(ctx, run, window)
    await refreshAnswers(ctx)
    await importPending(ctx)
    await finish(ctx, run, null)
  } catch (e) {
    const message = e instanceof SiteError || e instanceof Problem ? e.message : 'Something went wrong; the next check tries again.'
    if (!(e instanceof SiteError || e instanceof Problem)) logger.error('Results site check failed', { branchId, runId, error: (e as Error)?.stack ?? String(e) })
    if (ctx) await finish(ctx, run, message).catch((err) => logger.error('Saving a failed check', { error: String(err) }))
    else await ref.update({ state: 'failed', error: message, finishedAt: FieldValue.serverTimestamp() })
  } finally {
    await releaseLock(branchId, runId)
  }
}

/** A reason a check, or an answer, can't go on that the page shows as it is. */
export class Problem extends Error {}

async function load(branchId: string, run: DocumentReference, started: number): Promise<Ctx> {
  const [branchSnap, key, statusSnap, athletesSnap, studentsSnap] = await Promise.all([
    db.doc(base(branchId)).get(),
    loadKey(branchId),
    statusRef(branchId).get(),
    athletesOf(branchId).get(),
    db.collection(`${base(branchId)}/${COL.students}`).select('name', 'lastName', 'otherNames').get(),
  ])
  const branch = branchSnap.data() as Branch | undefined
  if (!key) throw new Problem('Add the results site’s key first.')
  const settings = resolveSettings(branch?.settings).resultsSite
  const tz = branch?.timezone || 'America/New_York'
  const today = todayKey(tz)
  const students: StudentName[] = studentsSnap.docs.map((d) => {
    const s = d.data() as Pick<Student, 'name' | 'lastName' | 'otherNames'>
    return { id: d.id, name: s.name ?? '', lastName: s.lastName ?? null, otherNames: s.otherNames ?? [] }
  })
  const recent = await matchesOf(branchId).where('endDate', '>=', addDays(today, -RECHECK_DAYS)).get()
  return {
    branchId,
    tz,
    today,
    settings,
    client: new SiteClient(key, BUDGET),
    status: { ...emptyStatus(), ...(statusSnap.data() as Partial<ResultsSiteStatus> | undefined) },
    athletes: new Map(athletesSnap.docs.map((d) => [d.id, d.data() as OnlineAthlete])),
    created: new Set(),
    touched: new Map(),
    students: studentIndex(students),
    studentName: new Map(students.map((s) => [s.id, s.name])),
    matches: new Map(recent.docs.map((d) => [d.id, d.data() as OnlineMatch])),
    read: new Set(),
    counts: { matches: 0, results: 0, athletes: 0 },
    log: [],
    started,
    saved: started,
    run,
  }
}

/** People's answers given while the check ran (an athlete linked or turned down), so their results come in now. */
async function refreshAnswers(c: Ctx) {
  const snap = await athletesOf(c.branchId).select('status', 'studentId', 'studentName').get()
  for (const d of snap.docs) {
    const a = c.athletes.get(d.id)
    if (!a) continue
    a.status = d.get('status') ?? a.status
    a.studentId = d.get('studentId') ?? null
    a.studentName = d.get('studentName') ?? null
  }
}

/** Saves what the check found and how it went. */
async function finish(c: Ctx, run: ResultsSiteRun, error: string | null) {
  await saveAthletes(c)
  const summary = error ? `${error} ${runSummary({ ...c.counts, requests: c.client.requests })}` : runSummary({ ...c.counts, requests: c.client.requests })
  await c.run.update({
    state: error ? 'failed' : 'done',
    error,
    finishedAt: FieldValue.serverTimestamp(),
    requests: c.client.requests,
    ...c.counts,
    log: c.log,
  })
  await statusRef(c.branchId).set(
    {
      lastRun: { runId: c.run.id, kind: run.kind, at: FieldValue.serverTimestamp(), ok: !error, summary },
      hosts: c.status.hosts,
      nationalAt: c.status.nationalAt,
      going: c.status.going,
    },
    { merge: true },
  )
}

// ------------------------------------------------------------------ finding matches

const searchParams = (from: DateKey, to: DateKey) => ({ 'start-date': from, 'end-date': to, limit: 50 })

async function nearby(c: Ctx, from: DateKey, to: DateKey, pages: number): Promise<ScoposMatchItem[]> {
  const { items } = await c.client.list<ScoposMatchItem>(
    '/match/search',
    { ...searchParams(from, to), latitude: SEARCH_FROM.latitude, longitude: SEARCH_FROM.longitude, distance: c.settings.searchKm },
    'MatchSearchList',
    pages,
  )
  return items
}

async function atHosts(c: Ctx, from: DateKey, to: DateKey): Promise<ScoposMatchItem[]> {
  const out: ScoposMatchItem[] = []
  for (const hostId of Object.keys(c.status.hosts)) {
    if (timeUp(c)) break
    const { items } = await c.client.list<ScoposMatchItem>('/match/search', { ...searchParams(from, to), 'owner-id': hostId }, 'MatchSearchList', 3)
    out.push(...items)
  }
  return out
}

/**
 * A check's days, two weeks at a time, newest first, nearby and at the known hosts: true once they're all read; false
 * when its time ran out, and a new check goes on from there (`cursor`).
 */
async function walk(c: Ctx, run: ResultsSiteRun, window: { from: DateKey; to: DateKey }): Promise<boolean> {
  const parts = windowsBack(window.from, run.cursor ?? window.to)
  for (const w of parts) {
    if (timeUp(c)) return goOn(c, run, window, w.to).then(() => false)
    const found = new Map<string, ScoposMatchItem>()
    for (const m of await nearby(c, w.from, w.to, 8)) found.set(m.MatchID, m)
    for (const m of await atHosts(c, w.from, w.to)) found.set(m.MatchID, m)
    note(c, `${formatDateKey(w.from, 'medium')} to ${formatDateKey(w.to, 'medium')}: ${found.size} matches nearby and at ${Object.keys(c.status.hosts).length} known hosts.`)
    if (!(await readMatches(c, [...found.values()]))) return goOn(c, run, window, w.to).then(() => false)
  }
  c.status.going = null
  if (parts.length) note(c, `Read every day back to ${formatDateKey(window.from, 'medium')}.`)
  return true
}

/**
 * After a check's days: the academy's matches from before them, again for corrections and their official status, and
 * once a week the championships anywhere since the last search (the academy's athletes travel to them). When the time
 * runs out, one more check finishes it; the rest waits for the next check after that.
 */
async function afterTheDays(c: Ctx, run: ResultsSiteRun, window: { from: DateKey; to: DateKey }) {
  const finishing = !!run.cursor && run.cursor < window.from
  const more = () => (finishing ? note(c, 'The rest waits for the next check.') : goOn(c, run, window, addDays(window.from, -1)))
  for (const [id, m] of c.matches) {
    if (c.read.has(id) || m.endDate >= window.from || !dueForRecheck(m, c.today)) continue
    if (timeUp(c)) return more()
    await recheck(c, id, m)
  }
  if (c.status.nationalAt && c.status.nationalAt > addDays(c.today, -CHAMPIONSHIPS_EVERY_DAYS)) return
  if (timeUp(c)) return more()
  const since = c.status.nationalAt ? addDays(c.status.nationalAt, -3) : window.from
  const from = since > window.from ? since : window.from
  const { items } = await c.client.list<ScoposMatchItem>('/match/search', searchParams(from, c.today), 'MatchSearchList', 60)
  const champs = items.filter((m) => CHAMPIONSHIP_WORDS.test(m.MatchName ?? ''))
  note(c, `Championships nationwide since ${formatDateKey(from, 'medium')}: ${champs.length} of ${items.length} matches.`)
  if (await readMatches(c, champs)) c.status.nationalAt = c.today
  else return more()
}

/** A check's next part, as a new check from `cursor` (the trigger runs it once this one lets go). */
async function goOn(c: Ctx, run: ResultsSiteRun, window: { from: DateKey; to: DateKey }, cursor: DateKey) {
  c.status.going = { kind: run.kind, from: window.from, to: window.to, cursor }
  note(c, `Going on from ${formatDateKey(cursor, 'medium')} in the next check.`)
  await saveAthletes(c)
  await statusRef(c.branchId).set({ going: c.status.going, hosts: c.status.hosts }, { merge: true })
  await runsOf(c.branchId).add(newRun(run.kind, run.requestedBy, window, (run.part ?? 1) + 1, cursor))
}

/** A check to run, as its document is first written (the trigger runs it). */
export function newRun(
  kind: ResultsSiteRun['kind'],
  requestedBy: string,
  window: { from: DateKey; to: DateKey },
  part = 1,
  cursor: DateKey | null = null,
): Omit<ResultsSiteRun, 'requestedAt'> & { requestedAt: FieldValue } {
  return { kind, state: 'queued', requestedBy, requestedAt: FieldValue.serverTimestamp(), startedAt: null, finishedAt: null, window, part, cursor, requests: 0, matches: 0, results: 0, athletes: 0, log: [], error: null }
}

// ------------------------------------------------------------------ reading a match

/** Reads the matches not read before (or not since they ended); false when the check ran out of time. */
async function readMatches(c: Ctx, items: ScoposMatchItem[]): Promise<boolean> {
  const list = items.filter((m) => m.MatchID && m.StartDate <= c.today).sort((a, b) => b.StartDate.localeCompare(a.StartDate))
  for (const item of list) {
    if (c.read.has(item.MatchID)) continue
    const known = c.matches.get(item.MatchID) ?? (await matchesOf(c.branchId).doc(item.MatchID).get()).data() as OnlineMatch | undefined
    if (known?.settled && known.ours === 0) continue
    // A league or a postal match runs for weeks, and is in every check's search: without the academy's athletes, it's
    // read again once a week.
    if (known && known.ours === 0 && diffDays(known.startDate, known.endDate) > 7 && Date.now() - ((known.checkedAt as Timestamp | undefined)?.toMillis?.() ?? 0) < 7 * 86_400_000) continue
    if (timeUp(c)) return false
    if (known && known.ours > 0) await recheck(c, item.MatchID, known)
    else await readMatch(c, item)
    await progress(c)
  }
  return true
}

/** The first read of a match: who shot in it, the teams when it has the academy's athletes or is at a known host. */
async function readMatch(c: Ctx, item: ScoposMatchItem) {
  const id = item.MatchID
  c.read.add(id)
  c.counts.matches++
  const { items: people } = await c.client.list<ScoposParticipantItem>(`/match/${encodeURIComponent(id)}/participant`, { limit: 100 }, 'MatchParticipantList', 10)
  const entrants = new Map<string, Entrant>()
  for (const p of people) {
    const ids = new Set([p.Participant?.ResultCOFID, ...(p.MatchParticipantResults ?? []).map((r) => r.ResultCOFID)].filter((x): x is string => !!x))
    for (const cof of ids) {
      const e = entrantOf(p.Participant, cof, null, p.LastUpdated)
      if (e) entrants.set(cof, e)
    }
  }
  const verdict = (e: Entrant) => verdictFor(e, c.athletes, c.students, c.settings.teamNames)
  const knownHost = !!item.OwnerId && !!c.status.hosts[item.OwnerId]
  // The teams are read where the academy's athletes may be: at the hosts where they shot, in a match with one of them
  // (by name), and anywhere until the academy's teams have been found once (the first checks: nobody is linked yet).
  const firstFinds = Object.keys(c.status.hosts).length === 0
  let detail: ScoposMatch | null = null
  if (firstFinds || knownHost || [...entrants.values()].some((e) => verdict(e).kind === 'linked' || verdict(e).kind === 'suggest')) {
    detail = (await c.client.get<{ Match?: ScoposMatch }>(`/match/${encodeURIComponent(id)}`))?.Match ?? null
    for (const name of detail ? teamLists(detail).slice(0, 2) : []) {
      const { items: teams } = await c.client.list<ScoposListItem>(`/match/${encodeURIComponent(id)}/result-list/${encodeURIComponent(name)}`, {}, 'ResultList', 15)
      for (const t of teams) {
        const team = (t.Participant?.DisplayName ?? '').trim() || null
        for (const m of t.TeamMembers ?? []) {
          const e = entrantOf(m.Participant, m.ResultCOFID, team, m.LastUpdated)
          if (!e) continue
          const had = entrants.get(e.resultCofId)
          entrants.set(e.resultCofId, had ? { ...had, team: had.team ?? team } : e)
        }
      }
    }
  }
  const match: OnlineMatch = {
    name: (detail?.Name ?? item.MatchName ?? '').trim(),
    hostId: item.OwnerId ?? detail?.OwnerId ?? null,
    hostName: item.OwnerName?.trim() || null,
    place: [item.Location?.City ?? detail?.Location?.City, item.Location?.State ?? detail?.Location?.State].filter(Boolean).join(', '),
    startDate: item.StartDate,
    endDate: item.EndDate || item.StartDate,
    course: courseName(detail?.CourseOfFireDef ?? item.CourseOfFireDef),
    url: matchUrl(id),
    listName: detail ? (mainList(detail)?.name ?? null) : null,
    status: detail ? (mainList(detail)?.status ?? null) : null,
    listUpdated: null,
    athletes: [],
    ours: 0,
    settled: c.today > (item.EndDate || item.StartDate),
  }
  await takeIn(c, id, match, [...entrants.values()])
}

/** A match with the academy's athletes, again: its main list, and what changed in it. */
async function recheck(c: Ctx, id: string, m: OnlineMatch) {
  c.read.add(id)
  c.counts.matches++
  let listName = m.listName
  if (!listName) {
    const detail = (await c.client.get<{ Match?: ScoposMatch }>(`/match/${encodeURIComponent(id)}`))?.Match ?? null
    listName = detail ? (mainList(detail)?.name ?? null) : null
  }
  if (!listName) return saveMatch(c, id, { ...m, settled: c.today > m.endDate })
  const { items, head } = await c.client.list<ScoposListItem>(`/match/${encodeURIComponent(id)}/result-list/${encodeURIComponent(listName)}`, {}, 'ResultList', 10)
  const stamp = typeof head?.LastUpdated === 'string' ? head.LastUpdated : null
  const status = typeof head?.Status === 'string' ? head.Status : m.status
  if (stamp && stamp === m.listUpdated) return saveMatch(c, id, { ...m, listName, status, settled: c.today > m.endDate })
  const entrants = items.map((it) => entrantOf(it.Participant, it.ResultCOFID, null, it.LastUpdated)).filter((e): e is Entrant => e !== null)
  await takeIn(c, id, { ...m, listName, status, listUpdated: stamp, settled: c.today > m.endDate }, entrants, true)
}

/**
 * Who of a match's people are the academy's: suggestions noted, linked athletes' results brought in (`again`: those
 * already in, too, since the list changed), and the match saved with them.
 */
async function takeIn(c: Ctx, id: string, match: OnlineMatch, entrants: Entrant[], again = false) {
  const ours = new Set(match.athletes)
  for (const e of entrants) {
    const v = verdictFor(e, c.athletes, c.students, c.settings.teamNames)
    if (v.kind === 'none' || v.kind === 'ignored') continue
    ours.add(e.key)
    noteAppearance(c, e, v, id, match)
    if (v.kind === 'linked') {
      if (timeUp(c)) continue
      const rec = c.athletes.get(e.key)?.results[e.resultCofId]
      if (!rec?.lastUpdated || again) await bringIn(c, e.key, e.resultCofId)
    }
  }
  const out = { ...match, athletes: [...ours], ours: ours.size }
  if (out.ours > 0 && out.hostId) c.status.hosts[out.hostId] = { name: out.hostName ?? out.hostId, lastSeen: out.endDate > (c.status.hosts[out.hostId]?.lastSeen ?? '') ? out.endDate : c.status.hosts[out.hostId].lastSeen }
  if (out.ours > 0) note(c, `${out.name} (${formatDateKey(out.startDate, 'medium')}): ${out.ours} of the academy’s athletes.`)
  await saveMatch(c, id, out)
}

async function saveMatch(c: Ctx, id: string, m: OnlineMatch) {
  c.matches.set(id, m)
  await matchesOf(c.branchId).doc(id).set({ ...m, checkedAt: FieldValue.serverTimestamp() })
}

/** Notes an athlete's appearance: a new suggestion, or one more result for someone known. */
function noteAppearance(c: Ctx, e: Entrant, v: Exclude<ReturnType<typeof verdictFor>, { kind: 'none' | 'ignored' }>, matchId: string, m: OnlineMatch) {
  let a = c.athletes.get(e.key)
  if (!a) {
    if (v.kind !== 'suggest') return
    a = {
      name: e.name,
      status: 'new',
      studentId: null,
      studentName: null,
      why: whyWords(v, e, m.name),
      suggestedStudentId: v.studentId,
      teams: [],
      hosts: [],
      results: {},
      firstSeen: m.startDate,
      lastSeen: m.startDate,
    }
    c.athletes.set(e.key, a)
    c.created.add(e.key)
    c.counts.athletes++
  }
  a.teams = newestFirst(a.teams, e.team)
  a.hosts = newestFirst(a.hosts, m.hostName)
  if (m.startDate > a.lastSeen) a.lastSeen = m.startDate
  if (m.startDate < a.firstSeen) a.firstSeen = m.startDate
  const rec: AthleteResult = a.results[e.resultCofId] ?? { matchId, matchName: m.name, dateKey: m.startDate, team: e.team, host: m.hostName, lastUpdated: null, evaluations: {} }
  a.results[e.resultCofId] = { ...rec, matchName: m.name, team: rec.team ?? e.team, host: rec.host ?? m.hostName }
  touch(c, e.key, e.resultCofId)
}

function touch(c: Ctx, key: string, resultCofId?: string) {
  const set = c.touched.get(key) ?? new Set<string>()
  if (resultCofId) set.add(resultCofId)
  c.touched.set(key, set)
}

/**
 * Saves the athletes this check found or changed: a new one whole, a known one only its teams, hosts, days and the
 * results touched, so a person's answer given meanwhile (linked, not ours) stays as they gave it.
 */
async function saveAthletes(c: Ctx) {
  const writes: [string, Record<string, unknown>, boolean][] = []
  for (const [key, ids] of c.touched) {
    const a = c.athletes.get(key)
    if (!a) continue
    if (c.created.has(key)) writes.push([key, { ...a, updatedAt: FieldValue.serverTimestamp() }, true])
    else {
      const results: Record<string, AthleteResult> = {}
      for (const id of ids) if (a.results[id]) results[id] = a.results[id]
      writes.push([key, { teams: a.teams, hosts: a.hosts, firstSeen: a.firstSeen, lastSeen: a.lastSeen, results, updatedAt: FieldValue.serverTimestamp() }, false])
    }
  }
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch()
    for (const [key, data, whole] of writes.slice(i, i + 400)) batch.set(athletesOf(c.branchId).doc(key), data, { merge: !whole })
    await batch.commit()
  }
  c.created.clear()
  c.touched.clear()
}

// ------------------------------------------------------------------ bringing results in

/** Linked athletes' results not brought in yet: linked since they were found, or the site couldn't give them before. */
async function importPending(c: Ctx) {
  for (const [key, a] of c.athletes) {
    if (a.status !== 'linked' || !a.studentId) continue
    for (const [cof, rec] of Object.entries(a.results)) {
      if (timeUp(c)) return
      if (!rec.lastUpdated && (rec.tries ?? 0) < MAX_TRIES) await bringIn(c, key, cof)
    }
  }
}

const SOURCE_FIELDS = ['source', 'dateKey', 'timeMin', 'shots', 'total', 'wholeTotal', 'innerTens', 'mpi', 'groupMm', 'series', 'problems', 'online'] as const
/** What the site's result changes in a results sheet scan it replaces: the fields above, and the match. */
const REPLACED_FIELDS = [...SOURCE_FIELDS, 'match'] as const

/**
 * A results sheet scan as it is, before the site's result replaces its numbers (`ResultsSiteUndo`): kept once, the
 * first time, for Start over to put back. A scan already brought up to the site's has nothing of its own to keep.
 */
async function keepScan(batch: WriteBatch, branchId: string, scan: { id: string; data: Evaluation }, resultCofId: string) {
  if (scan.data.source === 'online') return
  const ref = undoOf(branchId).doc(scan.id)
  if ((await ref.get()).exists) return
  const data = scan.data as unknown as Record<string, unknown>
  const before = Object.fromEntries(REPLACED_FIELDS.filter((f) => data[f] !== undefined).map((f) => [f, data[f]]))
  const absent = REPLACED_FIELDS.filter((f) => data[f] === undefined)
  batch.set(ref, { evaluationId: scan.id, resultCofId, before, absent, at: FieldValue.serverTimestamp() } satisfies Omit<ResultsSiteUndo, 'at'> & { at: FieldValue })
}

const describe = (e: Pick<Evaluation, 'position' | 'dateKey' | 'total' | 'shots'>) =>
  `results site ${POSITION_LABELS[e.position].toLowerCase()} result of ${formatDateKey(e.dateKey, 'medium')} (${e.total} over ${e.shots} shots, ${per10(e.total, e.shots) ?? 0} per 10)`

function audit(batch: WriteBatch, branchId: string, entry: { action: string; entityId: string; summary: string; dateKey: DateKey; studentId: string; studentName: string }) {
  batch.create(db.collection(`${base(branchId)}/${COL.auditLog}`).doc(), {
    at: FieldValue.serverTimestamp(),
    ...SYSTEM,
    category: 'reports',
    entityType: 'evaluation',
    context: 'From the results site',
    coachId: null,
    coachName: null,
    changes: [],
    ...entry,
  })
}

/**
 * One athlete's result, into their student's scores: a result per position, made the first time (or a results sheet's
 * result of the same match brought up to the site's), and changed when the site's result changes. What people change
 * stays: the note, what kind of result it is, whose it is. One a person deleted isn't brought back.
 */
export async function bringIn(c: Pick<Ctx, 'branchId' | 'tz' | 'client' | 'athletes' | 'counts' | 'touched' | 'studentName'> & { log: string[] }, key: string, resultCofId: string): Promise<boolean> {
  const a = c.athletes.get(key)
  const rec = a?.results[resultCofId]
  if (!a || !rec || a.status !== 'linked' || !a.studentId) return false
  const cof = (await c.client.get<{ ResultCOF?: ScoposResultCof }>(`/resultcof/${encodeURIComponent(resultCofId)}`))?.ResultCOF ?? null
  if (!cof || !cof.ResultCOFID) {
    a.results[resultCofId] = { ...rec, error: 'The results site doesn’t give this result.', tries: (rec.tries ?? 0) + 1 }
    touch(c as Ctx, key, resultCofId)
    return false
  }
  if (rec.lastUpdated && rec.lastUpdated === (cof.LastUpdated ?? null) && Object.keys(rec.evaluations).length) return false
  const found = onlineResults(cof, c.tz)
  if (!found.length) {
    // No shots yet (a match not started, or only a final's eliminations): asked again next time.
    a.results[resultCofId] = { ...rec, error: null, tries: (rec.tries ?? 0) + 1 }
    touch(c as Ctx, key, resultCofId)
    return false
  }
  const studentName = c.studentName.get(a.studentId) ?? a.studentName ?? a.name
  const evaluations: Partial<Record<Position, string>> = { ...rec.evaluations }
  const sheets: Partial<Record<Position, SheetTwin>> = { ...rec.sheets }
  const batch = db.batch()
  // The result whole, as the site gave it: what the scores show, and every other field, kept for later.
  batch.set(rawRef(c.branchId, resultCofId), { resultCofId, json: JSON.stringify(cof), lastUpdated: cof.LastUpdated ?? null, studentId: a.studentId, savedAt: FieldValue.serverTimestamp() })
  let changed = 0
  for (const r of found) {
    const data = onlineEvaluation(r, cof, { studentId: a.studentId, studentName, team: rec.team, host: rec.host })
    const known = evaluations[r.position]
    const id = known ?? onlineEvaluationId(resultCofId, r.position)
    const ref = evaluationsOf(c.branchId).doc(id)
    const snap = await ref.get()
    if (snap.exists) {
      const old = snap.data() as Evaluation
      evaluations[r.position] = id
      if (old.online?.lastUpdated === data.online?.lastUpdated && old.total === data.total && old.shots === data.shots && old.online?.status === data.online?.status) continue
      const patch = Object.fromEntries(SOURCE_FIELDS.map((f) => [f, data[f]]))
      batch.set(ref, { ...patch, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system' }, { merge: true })
      audit(batch, c.branchId, { action: 'evaluation.update', entityId: id, summary: `Updated ${old.studentName}'s ${describe(data)} from the results site`, dateKey: data.dateKey, studentId: old.studentId, studentName: old.studentName })
      changed++
      continue
    }
    if (known) continue // deleted by a person: not brought back
    const twin = await sheetTwin(c.branchId, a.studentId, data)
    if (twin.same) {
      const patch = Object.fromEntries(SOURCE_FIELDS.map((f) => [f, data[f]]))
      await keepScan(batch, c.branchId, { id: twin.same.ref.id, data: twin.same.data }, resultCofId)
      batch.set(twin.same.ref, { ...patch, match: data.match, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system' }, { merge: true })
      audit(batch, c.branchId, { action: 'evaluation.update', entityId: twin.same.ref.id, summary: `Brought ${studentName}'s results sheet result up to the ${describe(data)}`, dateKey: data.dateKey, studentId: a.studentId, studentName })
      evaluations[r.position] = twin.same.ref.id
      if (twin.same.scan) sheets[r.position] = twin.same.scan
    } else {
      batch.set(ref, { ...data, createdAt: FieldValue.serverTimestamp(), createdBy: 'system', updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system' })
      audit(batch, c.branchId, { action: 'evaluation.add', entityId: id, summary: `Added ${studentName}'s ${describe(data)}`, dateKey: data.dateKey, studentId: a.studentId, studentName })
      evaluations[r.position] = id
      if (twin.near) sheets[r.position] = twin.near
    }
    changed++
  }
  await batch.commit()
  a.results[resultCofId] = { ...rec, lastUpdated: cof.LastUpdated ?? new Date().toISOString(), evaluations, sheets, error: null, tries: 0 }
  touch(c as Ctx, key, resultCofId)
  if (changed) {
    c.counts.results++
    c.log.push(`${studentName}: ${cof.MatchName} (${found.map((r) => POSITION_LABELS[r.position].toLowerCase()).join(', ')}).`)
  }
  return changed > 0
}

/**
 * The student's result this one is already, or may be (shared/src/scores/resultsSite.ts, `SheetTwin`): brought in
 * before under another ID (a results sheet's, brought up to the site's), or a results sheet's scan of the same day and
 * position saved before the import found it. With as many shots and the same whole total it's the same (`same`: brought
 * up to the site's, every shot's place and order); with other numbers it may be (`near`: both stay, for a person to
 * decide).
 */
async function sheetTwin(
  branchId: string,
  studentId: string,
  e: Omit<Evaluation, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>,
): Promise<{ same: { ref: DocumentReference; data: Evaluation; scan: SheetTwin | null } | null; near: SheetTwin | null }> {
  const snap = await evaluationsOf(branchId).where('studentId', '==', studentId).where('dateKey', '==', e.dateKey).get()
  const list = snap.docs.map((d) => ({ ref: d.ref, x: d.data() as Evaluation })).filter((d) => d.x.position === e.position)
  const before = list.find((d) => d.x.online?.resultCofId === e.online?.resultCofId)
  if (before) return { same: { ref: before.ref, data: before.x, scan: null }, near: null }
  const scans = list.filter((d) => d.x.source === 'sheet' && !d.x.online)
  const scanOf = (d: (typeof scans)[number], state: SheetTwin['state']): SheetTwin => ({ id: d.ref.id, state, shots: d.x.shots, wholeTotal: d.x.wholeTotal })
  const same = scans.find((d) => d.x.shots === e.shots && d.x.wholeTotal === e.wholeTotal)
  if (same) return { same: { ref: same.ref, data: same.x, scan: scanOf(same, 'upgraded') }, near: null }
  const near = [...scans].sort((a, b) => Math.abs(a.x.shots - e.shots) - Math.abs(b.x.shots - e.shots) || Math.abs(a.x.wholeTotal - e.wholeTotal) - Math.abs(b.x.wholeTotal - e.wholeTotal))[0]
  return { same: null, near: near ? scanOf(near, 'differs') : null }
}

/** Who answers, as the audit log names them. */
export interface Person {
  uid: string
  email: string
  name: string
  role: string
}

/**
 * A person's answer about a results sheet's scan whose numbers differ from the site's result (`SheetTwin`, 'differs'):
 * use the site's (the scan takes the site's result, keeping its ID, photo and note, and the site's own copy goes), or
 * keep both. The caller holds the lock: no check writes the athlete meanwhile.
 */
export async function answerScan(branchId: string, key: string, resultCofId: string, position: Position, use: 'site' | 'both', who: Person): Promise<void> {
  const ref = athletesOf(branchId).doc(key)
  const a = (await ref.get()).data() as OnlineAthlete | undefined
  const rec = a?.results?.[resultCofId]
  const scan = rec?.sheets?.[position]
  if (!a || !rec || !scan || scan.state === 'upgraded' || !a.studentId) throw new Problem('That result isn’t waiting for an answer any more.')
  const studentName = a.studentName ?? a.name
  const day = formatDateKey(rec.dateKey, 'medium')
  const where = `${POSITION_LABELS[position].toLowerCase()}, ${rec.matchName}`
  const batch = db.batch()
  const note = (entry: { action: string; entityId: string; summary: string }) =>
    batch.create(db.collection(`${base(branchId)}/${COL.auditLog}`).doc(), {
      at: FieldValue.serverTimestamp(),
      actorUid: who.uid,
      actorEmail: who.email,
      actorName: who.name,
      actorRole: who.role,
      via: 'function',
      category: 'reports',
      entityType: 'evaluation',
      context: 'Settings → Results site',
      dateKey: rec.dateKey,
      studentId: a.studentId,
      studentName,
      coachId: null,
      coachName: null,
      changes: [],
      ...entry,
    })
  if (use === 'both') {
    batch.set(ref, { results: { [resultCofId]: { sheets: { [position]: { ...scan, state: 'kept' } } } }, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    note({ action: 'evaluation.keep', entityId: scan.id, summary: `Kept both of ${studentName}'s results of ${day} (${where}): the results sheet's and the results site's` })
  } else {
    const siteId = rec.evaluations?.[position]
    const [site, sheet] = await Promise.all([siteId ? evaluationsOf(branchId).doc(siteId).get() : null, evaluationsOf(branchId).doc(scan.id).get()])
    if (!site?.exists) throw new Problem('The results site’s result isn’t in the scores any more.')
    if (!sheet.exists) throw new Problem('The results sheet’s result isn’t in the scores any more.')
    const data = site.data() as Evaluation
    const patch = Object.fromEntries(SOURCE_FIELDS.map((f) => [f, data[f]]))
    await keepScan(batch, branchId, { id: sheet.id, data: sheet.data() as Evaluation }, resultCofId)
    batch.set(sheet.ref, { ...patch, match: data.match ?? null, updatedAt: FieldValue.serverTimestamp(), updatedBy: who.email }, { merge: true })
    batch.delete(site.ref)
    batch.set(ref, { results: { [resultCofId]: { evaluations: { [position]: scan.id }, sheets: { [position]: { ...scan, state: 'upgraded' } } } }, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    note({ action: 'evaluation.update', entityId: scan.id, summary: `Brought ${studentName}'s results sheet result of ${day} (${where}) up to the ${describe(data)}` })
    note({ action: 'evaluation.delete', entityId: site.id, summary: `Removed the results site's copy of ${studentName}'s result of ${day} (${where}): it's in the results sheet's result now` })
  }
  await batch.commit()
}

// ------------------------------------------------------------------ people's answers: many at once, and starting over

/**
 * Linked athletes' results not brought in yet, brought in now, one after another until `until` (the caller holds the
 * lock). What's left comes in with the next check.
 */
export async function bringInFor(branchId: string, list: readonly [string, OnlineAthlete][], until: number): Promise<{ brought: number; waiting: number }> {
  const pending = list.map(([key, a]) => [key, a, Object.entries(a.results ?? {}).filter(([, r]) => !r.lastUpdated).map(([id]) => id)] as const)
  const total = pending.reduce((n, [, , ids]) => n + ids.length, 0)
  const apiKey = await loadKey(branchId)
  if (!total || !apiKey) return { brought: 0, waiting: total }
  const branch = (await db.doc(base(branchId)).get()).data() as Branch | undefined
  const c = {
    branchId,
    tz: branch?.timezone || 'America/New_York',
    client: new SiteClient(apiKey, total * 2 + 10),
    athletes: new Map(list),
    counts: { matches: 0, results: 0, athletes: 0 },
    touched: new Map<string, Set<string>>(),
    studentName: new Map(list.flatMap(([, a]) => (a.studentId && a.studentName ? [[a.studentId, a.studentName] as [string, string]] : []))),
    log: [] as string[],
  }
  let brought = 0
  let tried = 0
  try {
    all: for (const [key, , ids] of pending)
      for (const id of ids) {
        if (Date.now() > until) break all
        tried++
        if (await bringIn(c, key, id)) brought++
      }
  } catch (e) {
    logger.warn('Bringing in linked athletes’ results stopped', { error: (e as Error).message })
  } finally {
    const writes = [...c.touched].flatMap(([key, ids]) => {
      const a = c.athletes.get(key)
      const results = Object.fromEntries([...ids].flatMap((id) => (a?.results[id] ? [[id, a.results[id]]] : [])))
      return Object.keys(results).length ? [[key, results] as const] : []
    })
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch()
      for (const [key, results] of writes.slice(i, i + 400)) batch.set(athletesOf(branchId).doc(key), { results, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
      await batch.commit()
    }
  }
  return { brought, waiting: total - tried }
}

/** Deletes documents, a few hundred at a time. */
async function deleteAll(refs: readonly DocumentReference[]) {
  for (let i = 0; i < refs.length; i += 400) {
    const batch = db.batch()
    for (const r of refs.slice(i, i + 400)) batch.delete(r)
    await batch.commit()
  }
}

/**
 * Start over (Goo's ask of 2026-11-11, to try it and then show it from the beginning): what the results site brought in
 * goes. Each results sheet scan the site's result replaced is put back as it was (`ResultsSiteUndo`); the results it
 * added leave the scores; its athletes and their answers, matches, checks and whole results go, and the status keeps
 * only the key. The settings stay. The families' "new score" notices stay too, so bringing the same results in again
 * doesn't tell them twice. The caller holds the lock.
 */
export async function startOver(branchId: string, who: Person): Promise<ResetCounts> {
  const counts: ResetCounts = { athletes: 0, results: 0, scans: 0, matches: 0, checks: 0 }
  const undos = await undoOf(branchId).get()
  for (let i = 0; i < undos.docs.length; i += 200) {
    const chunk = undos.docs.slice(i, i + 200)
    const scans = await db.getAll(...chunk.map((d) => evaluationsOf(branchId).doc((d.data() as ResultsSiteUndo).evaluationId)))
    const batch = db.batch()
    chunk.forEach((d, k) => {
      const u = d.data() as ResultsSiteUndo
      if (scans[k].exists) {
        batch.update(scans[k].ref, { ...u.before, ...Object.fromEntries(u.absent.map((f) => [f, FieldValue.delete()])), updatedAt: FieldValue.serverTimestamp(), updatedBy: who.email })
        counts.scans++
      }
      batch.delete(d.ref)
    })
    await batch.commit()
  }
  // The results it added (their IDs are the site's: a scan it brought up to the site's, without the note of how it was,
  // stays as it is).
  const added = (await evaluationsOf(branchId).where('source', '==', 'online').get()).docs.filter((d) => d.id.startsWith('online-'))
  counts.results = added.length
  await deleteAll(added.map((d) => d.ref))
  const [athletes, matches, runs, raw] = await Promise.all([athletesOf(branchId).get(), matchesOf(branchId).get(), runsOf(branchId).get(), db.collection(`${base(branchId)}/${COL.resultsSiteRaw}`).get()])
  counts.athletes = athletes.size
  counts.matches = matches.size
  counts.checks = runs.size
  await deleteAll([...athletes.docs, ...matches.docs, ...runs.docs, ...raw.docs].map((d) => d.ref))
  if ((await statusRef(branchId).get()).exists) await statusRef(branchId).update({ lastRun: null, going: null, hosts: {}, nationalAt: null })
  await db.collection(`${base(branchId)}/${COL.auditLog}`).add({
    at: FieldValue.serverTimestamp(),
    actorUid: who.uid,
    actorEmail: who.email,
    actorName: who.name,
    actorRole: who.role,
    via: 'function',
    action: 'resultsSite.reset',
    category: 'reports',
    entityType: 'resultsSite',
    entityId: 'status',
    summary: `Started the results site over. ${resetWords(counts)}`,
    context: 'Settings → Results site',
    dateKey: null,
    studentId: null,
    studentName: null,
    coachId: null,
    coachName: null,
    changes: [],
  })
  return counts
}
