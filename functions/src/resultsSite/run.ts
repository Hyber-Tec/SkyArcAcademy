import { type DocumentReference, FieldValue, type Timestamp, type WriteBatch } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { db } from '../app'
import { COL, DOC, ROOT } from '@shared/paths'
import {
  type AthleteResult,
  type Entrant,
  type OnlineAthlete,
  type OnlineMatch,
  type ResultsSiteRun,
  type ResultsSiteStatus,
  type StudentName,
  CHAMPIONSHIP_WORDS,
  NIGHTLY_DAYS,
  MAX_TRIES,
  RECHECK_DAYS,
  SEARCH_FROM,
  dueForRecheck,
  entrantOf,
  newestFirst,
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
import { type DateKey, addDays, diffDays, formatDateKey, todayKey, weekdayIndex } from '@shared/time'
import type { Branch, Student } from '@shared/types'
import { SiteClient, SiteError } from './client'

/**
 * One check of the results site (shared/src/scores/resultsSite.ts says what it looks for): find the matches, read who
 * shot in them, note the academy's athletes, and bring each linked athlete's results into their student's scores. A
 * check stops starting new work after `WORK_MS` (its function has 9 minutes) or its budget of requests; a look-back
 * then goes on in a new check.
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

const emptyStatus = (): ResultsSiteStatus => ({ keyEnd: null, keySetAt: null, keySetBy: null, running: null, lastRun: null, lookBack: null, hosts: {}, nationalAt: null })

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

async function releaseLock(branchId: string, runId: string) {
  await db.runTransaction(async (tx) => {
    const s = (await tx.get(statusRef(branchId))).data() as Partial<ResultsSiteStatus> | undefined
    if (s?.running?.runId === runId) tx.set(statusRef(branchId), { running: null }, { merge: true })
  })
}

// ------------------------------------------------------------------ a check

/** Runs the check `runId` (queued by the page, the nightly job, or a look-back going on). */
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
    if (run.kind === 'lookBack' && run.window) await lookBack(ctx, run.window, run.requestedBy)
    else await nightly(ctx)
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

/** A reason a check can't run that the page shows as it is. */
class Problem extends Error {}

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
      lookBack: c.status.lookBack,
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

/** Each night (and "Check now"): the last two weeks nearby and at the known hosts, championships weekly, then changes. */
async function nightly(c: Ctx) {
  const from = addDays(c.today, -NIGHTLY_DAYS)
  const found = new Map<string, ScoposMatchItem>()
  for (const m of await nearby(c, from, c.today, 8)) found.set(m.MatchID, m)
  for (const m of await atHosts(c, from, c.today)) found.set(m.MatchID, m)
  note(c, `${found.size} matches in the last ${NIGHTLY_DAYS} days nearby and at ${Object.keys(c.status.hosts).length} known hosts.`)
  await readMatches(c, [...found.values()])
  // Once a week, the championships anywhere (the academy's athletes travel to them); done only when all were read.
  if (!timeUp(c) && (!c.status.nationalAt || c.status.nationalAt <= addDays(c.today, -7))) {
    const { items } = await c.client.list<ScoposMatchItem>('/match/search', searchParams(from, c.today), 'MatchSearchList', 30)
    const champs = items.filter((m) => CHAMPIONSHIP_WORDS.test(m.MatchName ?? '') && !found.has(m.MatchID))
    note(c, `Championships nationwide: ${champs.length} of ${items.length} matches.`)
    if (await readMatches(c, champs)) c.status.nationalAt = c.today
  }
  // The academy's matches from before the window: checked again for corrections and their official status.
  const weekday = weekdayIndex(c.today)
  for (const [id, m] of c.matches) {
    if (timeUp(c)) break
    if (!c.read.has(id) && dueForRecheck(m, c.today, weekday)) await recheck(c, id, m)
  }
}

/** A look-back: two weeks at a time, newest first; when the check's time runs out, a new check goes on from there. */
async function lookBack(c: Ctx, window: { from: DateKey; to: DateKey }, requestedBy: string) {
  const going = c.status.lookBack && c.status.lookBack.from === window.from ? c.status.lookBack.cursor : window.to
  for (const w of windowsBack(window.from, going)) {
    if (timeUp(c)) return goOn(c, window, w.to, requestedBy)
    const found = new Map<string, ScoposMatchItem>()
    for (const m of await nearby(c, w.from, w.to, 8)) found.set(m.MatchID, m)
    for (const m of await atHosts(c, w.from, w.to)) found.set(m.MatchID, m)
    note(c, `${formatDateKey(w.from, 'medium')} to ${formatDateKey(w.to, 'medium')}: ${found.size} matches.`)
    const done = await readMatches(c, [...found.values()])
    if (!done) return goOn(c, window, w.to, requestedBy)
  }
  c.status.lookBack = null
  note(c, `Looked back to ${formatDateKey(window.from, 'medium')}.`)
}

/** A look-back's next part, as a new check from `cursor` (the trigger runs it once this one lets go). */
async function goOn(c: Ctx, window: { from: DateKey; to: DateKey }, cursor: DateKey, requestedBy: string) {
  c.status.lookBack = { from: window.from, cursor }
  note(c, `Going on from ${formatDateKey(cursor, 'medium')} in the next check.`)
  await saveAthletes(c)
  await statusRef(c.branchId).set({ lookBack: c.status.lookBack, hosts: c.status.hosts }, { merge: true })
  await runsOf(c.branchId).add(newRun('lookBack', requestedBy, window))
}

/** A check to run, as its document is first written (the trigger runs it). */
export function newRun(kind: ResultsSiteRun['kind'], requestedBy: string, window: ResultsSiteRun['window'] = null): Omit<ResultsSiteRun, 'requestedAt'> & { requestedAt: FieldValue } {
  return { kind, state: 'queued', requestedBy, requestedAt: FieldValue.serverTimestamp(), startedAt: null, finishedAt: null, window, requests: 0, matches: 0, results: 0, athletes: 0, log: [], error: null }
}

// ------------------------------------------------------------------ reading a match

/** Reads the matches not read before (or not since they ended); false when the check ran out of time. */
async function readMatches(c: Ctx, items: ScoposMatchItem[]): Promise<boolean> {
  const list = items.filter((m) => m.MatchID && m.StartDate <= c.today).sort((a, b) => b.StartDate.localeCompare(a.StartDate))
  for (const item of list) {
    if (c.read.has(item.MatchID)) continue
    const known = c.matches.get(item.MatchID) ?? (await matchesOf(c.branchId).doc(item.MatchID).get()).data() as OnlineMatch | undefined
    if (known?.settled && known.ours === 0) continue
    // A league or a postal match runs for weeks, and is in every night's search: without the academy's athletes, it's
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
  const batch = db.batch()
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
    if (twin) {
      const patch = Object.fromEntries(SOURCE_FIELDS.map((f) => [f, data[f]]))
      batch.set(twin, { ...patch, match: data.match, updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system' }, { merge: true })
      audit(batch, c.branchId, { action: 'evaluation.update', entityId: twin.id, summary: `Brought ${studentName}'s results sheet result up to the ${describe(data)}`, dateKey: data.dateKey, studentId: a.studentId, studentName })
      evaluations[r.position] = twin.id
    } else {
      batch.set(ref, { ...data, createdAt: FieldValue.serverTimestamp(), createdBy: 'system', updatedAt: FieldValue.serverTimestamp(), updatedBy: 'system' })
      audit(batch, c.branchId, { action: 'evaluation.add', entityId: id, summary: `Added ${studentName}'s ${describe(data)}`, dateKey: data.dateKey, studentId: a.studentId, studentName })
      evaluations[r.position] = id
    }
    changed++
  }
  if (changed) await batch.commit()
  a.results[resultCofId] = { ...rec, lastUpdated: cof.LastUpdated ?? new Date().toISOString(), evaluations, error: null, tries: 0 }
  touch(c as Ctx, key, resultCofId)
  if (changed) {
    c.counts.results++
    c.log.push(`${studentName}: ${cof.MatchName} (${found.map((r) => POSITION_LABELS[r.position].toLowerCase()).join(', ')}).`)
  }
  return changed > 0
}

/**
 * The student's result this one is already: brought in before under another ID (a results sheet's, brought up to the
 * site's), or a results sheet's result of the same competition saved before the import found it (the same day and
 * position, as many shots and the same whole total), which is brought up to the site's: every shot's place and order.
 */
async function sheetTwin(branchId: string, studentId: string, e: Omit<Evaluation, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>): Promise<DocumentReference | null> {
  const snap = await evaluationsOf(branchId).where('studentId', '==', studentId).where('dateKey', '==', e.dateKey).get()
  const same = (x: Evaluation) => x.position === e.position
  const twin =
    snap.docs.find((d) => same(d.data() as Evaluation) && (d.data() as Evaluation).online?.resultCofId === e.online?.resultCofId) ??
    snap.docs.find((d) => {
      const x = d.data() as Evaluation
      return x.source === 'sheet' && same(x) && x.shots === e.shots && x.wholeTotal === e.wholeTotal
    })
  return twin?.ref ?? null
}
