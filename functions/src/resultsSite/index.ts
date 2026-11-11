import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db, LIGHT } from '../app'
import { requireAdmin } from '../contracts'
import { ACADEMY_ID } from '@shared/academy'
import { COL, ROOT } from '@shared/paths'
import { type OnlineAthlete, type ResetCounts, type ResultPreview, type ResultsSiteRun, isScheduledHour, isUnderWay } from '@shared/scores/resultsSite'
import { type ScoposResultCof, athleteName, onlineEvaluation, onlineResults } from '@shared/scores/scopos'
import { POSITIONS, type Position } from '@shared/shooting/evaluation'
import { resolveSettings } from '@shared/settings/resolve'
import { type DateKey, addDays, isDateKey, minutesOf, todayKey } from '@shared/time'
import type { Branch, Student } from '@shared/types'
import { SiteClient, SiteError } from './client'
import { Problem, answerScan, base, bringInFor, holdLock, loadKey, newRun, releaseLock, runCheck, runsOf, startOver, statusRef } from './run'

/**
 * The results site import's functions (shared/src/scores/resultsSite.ts): the academy's schedule (off until it sets
 * one), the page's buttons (Check now, Look back), and a person's answers (an athlete is a student or not; a results
 * sheet's scan that differs from the site's). Only the academy brings results in: the demo academy's people are made
 * up. The site's key is kept on the server (scripts/results-site-key.ts sets it). Confirm all links every athlete whose
 * student is suggested; an athlete's results can be looked at on the page before they're linked; Start over removes
 * everything it brought in (Goo's asks of 2026-11-11).
 */

const onlyTheAcademy = (branchId: unknown) => {
  if (branchId !== ACADEMY_ID) throw new HttpsError('failed-precondition', 'Only the academy brings in results from the results site.')
}

const NO_KEY = 'The results site’s key isn’t set up: ask HyberTec.'

/** A check queued or running (one that stopped without saying so, its function out of time, is marked as stopped). */
async function checkUnderWay(): Promise<boolean> {
  const pending = await runsOf(ACADEMY_ID).where('state', 'in', ['queued', 'running']).limit(10).get()
  const now = Date.now()
  let under = false
  for (const d of pending.docs) {
    if (isUnderWay(d.data() as ResultsSiteRun, now)) under = true
    else await d.ref.update({ state: 'failed', error: 'It stopped before it finished.', finishedAt: FieldValue.serverTimestamp() })
  }
  return under
}

/**
 * Every hour: a check when the academy's schedule says so (its days, its hour, in its time zone; off unless it set
 * one), once in that hour. Early each morning, the checks older than two months go (the page shows the recent ones).
 */
export const resultsSiteScheduled = onSchedule({ schedule: '5 * * * *', timeZone: 'UTC', timeoutSeconds: 120, ...LIGHT }, async () => {
  const branch = (await db.doc(`${ROOT.branches}/${ACADEMY_ID}`).get()).data() as Branch | undefined
  if (branch?.status !== 'active') return
  const tz = branch.timezone || 'America/New_York'
  const now = Date.now()
  if (Math.floor(minutesOf(now, tz) / 60) === 4) {
    const old = await runsOf(ACADEMY_ID).where('requestedAt', '<', Timestamp.fromMillis(now - 60 * 86_400_000)).limit(200).get()
    if (!old.empty) {
      const batch = db.batch()
      for (const d of old.docs) batch.delete(d.ref)
      await batch.commit()
    }
  }
  const settings = resolveSettings(branch.settings).resultsSite
  if (!isScheduledHour(settings.schedule, now, tz)) return
  if (!(await loadKey(ACADEMY_ID))) return logger.warn('The results site’s schedule came, and no key is set up')
  const recent = await runsOf(ACADEMY_ID).where('requestedAt', '>', Timestamp.fromMillis(now - 50 * 60_000)).get()
  if (recent.docs.some((d) => d.get('kind') === 'scheduled') || (await checkUnderWay())) return
  const today = todayKey(tz, now)
  await statusRef(ACADEMY_ID).set({ going: null }, { merge: true })
  await runsOf(ACADEMY_ID).add(newRun('scheduled', 'system', { from: addDays(today, -settings.checkDays), to: today }))
})

/** Runs each check as its document is written: by the schedule, the page's buttons, or a check going on. */
export const onResultsSiteRun = onDocumentCreated(
  { document: `${ROOT.branches}/{branchId}/${COL.resultsSiteRuns}/{runId}`, timeoutSeconds: 540, ...LIGHT },
  async (event) => {
    if (event.params.branchId !== ACADEMY_ID) return
    await runCheck(event.params.branchId, event.params.runId)
  },
)

/** The page's buttons: "Check now" (the last month, or the days the academy chose) and "Look back" (from a day). */
export const resultsSiteCheck = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const { branchId, kind, from } = (req.data ?? {}) as { branchId?: unknown; kind?: unknown; from?: unknown }
  const caller = await requireAdmin(branchId, req.auth, 'check the results site')
  onlyTheAcademy(branchId)
  if (!(await loadKey(ACADEMY_ID))) throw new HttpsError('failed-precondition', NO_KEY)
  if (await checkUnderWay()) throw new HttpsError('failed-precondition', 'A check is already under way: its results show here as it goes.')
  const branch = (await db.doc(`${ROOT.branches}/${ACADEMY_ID}`).get()).data() as Branch | undefined
  const today = todayKey(branch?.timezone || 'America/New_York')
  let window: { from: DateKey; to: DateKey }
  if (kind === 'lookBack') {
    if (!isDateKey(from) || from >= today || from < addDays(today, -3 * 366)) throw new HttpsError('invalid-argument', 'Choose a day in the last three years.')
    window = { from: from as DateKey, to: today }
  } else window = { from: addDays(today, -resolveSettings(branch?.settings).resultsSite.checkDays), to: today }
  await statusRef(ACADEMY_ID).set({ going: null }, { merge: true })
  const ref = await runsOf(ACADEMY_ID).add(newRun(kind === 'lookBack' ? 'lookBack' : 'check', caller.email, window))
  return { runId: ref.id }
})

type Action = 'link' | 'ignore' | 'undo' | 'useSite' | 'keepBoth'
const ACTIONS: readonly Action[] = ['link', 'ignore', 'undo', 'useSite', 'keepBoth']

/**
 * A person's answer about an athlete the import found: this is a student (`link`, their results come in at once), not
 * the academy's (`ignore`), or not decided after all (`undo`). Results already brought in stay: a wrong one is deleted
 * from the student's scores, and isn't brought back. Or about one of their results whose results sheet's scan has
 * other numbers (`useSite`: the scan takes the site's result; `keepBoth`).
 */
export const resultsSiteAthlete = onCall({ timeoutSeconds: 300, ...LIGHT }, async (req) => {
  const { branchId, key, action, studentId, resultCofId, position } = (req.data ?? {}) as Record<string, unknown>
  const caller = await requireAdmin(branchId, req.auth, 'link athletes from the results site')
  onlyTheAcademy(branchId)
  if (typeof key !== 'string' || !key || key.includes('/')) throw new HttpsError('invalid-argument', 'Choose an athlete.')
  if (!ACTIONS.includes(action as Action)) throw new HttpsError('invalid-argument', 'Choose what to do.')
  if (action === 'useSite' || action === 'keepBoth') {
    if (typeof resultCofId !== 'string' || !resultCofId || !POSITIONS.includes(position as Position)) throw new HttpsError('invalid-argument', 'Choose the result.')
    const runId = `answer-${key}`
    if (!(await holdLock(ACADEMY_ID, runId))) throw new HttpsError('failed-precondition', 'A check is under way: answer once it’s done.')
    try {
      await answerScan(ACADEMY_ID, key, resultCofId, position as Position, action === 'useSite' ? 'site' : 'both', caller)
    } catch (e) {
      if (e instanceof Problem) throw new HttpsError('failed-precondition', e.message)
      throw e
    } finally {
      await releaseLock(ACADEMY_ID, runId)
    }
    return { ok: true, brought: 0, waiting: 0 }
  }
  const ref = db.doc(`${base(ACADEMY_ID)}/${COL.onlineAthletes}/${key}`)
  let student: Student | null = null
  if (action === 'link') {
    if (typeof studentId !== 'string' || !studentId || studentId.includes('/')) throw new HttpsError('invalid-argument', 'Choose the student.')
    student = ((await db.doc(`${base(ACADEMY_ID)}/${COL.students}/${studentId}`).get()).data() as Student | undefined) ?? null
    if (!student) throw new HttpsError('not-found', 'That student isn’t in the academy.')
  }
  const athlete = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const a = snap.data() as OnlineAthlete | undefined
    if (!a) throw new HttpsError('not-found', 'That athlete isn’t in the list any more.')
    const status = action === 'link' ? 'linked' : action === 'ignore' ? 'ignored' : 'new'
    const patch = { status, studentId: student ? studentId : null, studentName: student?.name ?? null, decidedAt: FieldValue.serverTimestamp(), decidedBy: caller.email }
    tx.update(ref, patch)
    tx.create(db.collection(`${base(ACADEMY_ID)}/${COL.auditLog}`).doc(), {
      at: FieldValue.serverTimestamp(),
      actorUid: caller.uid,
      actorEmail: caller.email,
      actorName: caller.name,
      actorRole: caller.role,
      action: `resultsSite.${action}`,
      category: 'reports',
      entityType: 'onlineAthlete',
      entityId: key,
      summary:
        action === 'link'
          ? `Linked ${a.name} on the results site to ${student?.name}`
          : action === 'ignore'
            ? `Marked ${a.name} on the results site as not the academy’s`
            : `Undid the answer about ${a.name} on the results site`,
      context: 'Settings → Results site',
      dateKey: null,
      studentId: student ? studentId : (a.studentId ?? null),
      studentName: student?.name ?? a.studentName ?? null,
      coachId: null,
      coachName: null,
      changes: [{ field: 'status', label: 'Answer', from: a.status, to: status }],
      via: 'function',
    })
    return { ...a, status, studentId: student ? (studentId as string) : null, studentName: student?.name ?? null } as OnlineAthlete
  })
  if (action !== 'link') return { ok: true, brought: 0, waiting: 0 }
  return bringInNow(key, athlete)
})

/**
 * A linked athlete's results, brought in at once when no check is under way (one at a time: a check holds the lock);
 * otherwise the check under way brings them in as it ends.
 */
async function bringInNow(key: string, athlete: OnlineAthlete): Promise<{ ok: true; brought: number; waiting: number }> {
  const ids = Object.values(athlete.results ?? {}).filter((r) => !r.lastUpdated)
  if (!ids.length) return { ok: true, brought: 0, waiting: 0 }
  const runId = `link-${key}`
  if (!(await holdLock(ACADEMY_ID, runId))) return { ok: true, brought: 0, waiting: ids.length }
  try {
    return { ok: true, ...(await bringInFor(ACADEMY_ID, [[key, athlete]], Date.now() + 240_000)) }
  } finally {
    await releaseLock(ACADEMY_ID, runId)
  }
}

const safeId = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9._-]{1,120}$/.test(x)

/**
 * Confirm all (Goo's ask of 2026-11-11): the athletes the page shows to confirm, each linked to the student it suggests
 * for them, as one person's answer each (the activity log has one entry per athlete); then their results come in, as
 * far as the time allows (the rest with the next check). Not while a check is under way: it holds the athletes.
 */
export const resultsSiteLinkAll = onCall({ timeoutSeconds: 540, ...LIGHT }, async (req) => {
  const { branchId, links } = (req.data ?? {}) as { branchId?: unknown; links?: unknown }
  const caller = await requireAdmin(branchId, req.auth, 'link athletes from the results site')
  onlyTheAcademy(branchId)
  const pairs = Array.isArray(links) ? links.filter((l): l is { key: string; studentId: string } => safeId(l?.key) && safeId(l?.studentId)) : []
  if (!pairs.length || pairs.length > 200 || pairs.length !== (links as unknown[]).length) throw new HttpsError('invalid-argument', 'Choose the athletes to link.')
  const runId = 'link-all'
  if (!(await holdLock(ACADEMY_ID, runId))) throw new HttpsError('failed-precondition', 'A check is under way: confirm them once it’s done.')
  try {
    const athleteRefs = pairs.map((p) => db.doc(`${base(ACADEMY_ID)}/${COL.onlineAthletes}/${p.key}`))
    const studentIds = [...new Set(pairs.map((p) => p.studentId))]
    const [athleteSnaps, studentSnaps] = await Promise.all([db.getAll(...athleteRefs), db.getAll(...studentIds.map((id) => db.doc(`${base(ACADEMY_ID)}/${COL.students}/${id}`)))])
    const studentOf = new Map(studentSnaps.filter((d) => d.exists).map((d) => [d.id, d.data() as Student]))
    const linked: [string, OnlineAthlete][] = []
    const batch = db.batch()
    pairs.forEach((p, i) => {
      const a = athleteSnaps[i].data() as OnlineAthlete | undefined
      const student = studentOf.get(p.studentId)
      // Answered meanwhile, or gone: left as it is.
      if (!a || a.status !== 'new' || !student) return
      batch.update(athleteRefs[i], { status: 'linked', studentId: p.studentId, studentName: student.name, decidedAt: FieldValue.serverTimestamp(), decidedBy: caller.email })
      batch.create(db.collection(`${base(ACADEMY_ID)}/${COL.auditLog}`).doc(), {
        at: FieldValue.serverTimestamp(),
        actorUid: caller.uid,
        actorEmail: caller.email,
        actorName: caller.name,
        actorRole: caller.role,
        action: 'resultsSite.link',
        category: 'reports',
        entityType: 'onlineAthlete',
        entityId: p.key,
        summary: `Linked ${a.name} on the results site to ${student.name} (Confirm all)`,
        context: 'Settings → Results site',
        dateKey: null,
        studentId: p.studentId,
        studentName: student.name,
        coachId: null,
        coachName: null,
        changes: [{ field: 'status', label: 'Answer', from: a.status, to: 'linked' }],
        via: 'function',
      })
      linked.push([p.key, { ...a, status: 'linked', studentId: p.studentId, studentName: student.name }])
    })
    if (linked.length) await batch.commit()
    const r = await bringInFor(ACADEMY_ID, linked, Date.now() + 420_000)
    return { linked: linked.length, ...r }
  } finally {
    await releaseLock(ACADEMY_ID, runId)
  }
})

/**
 * An athlete's results, read from the site for the page before they're linked: each result's positions as the scores
 * would show them, its shots on the target. Nothing is saved.
 */
export const resultsSitePreview = onCall({ timeoutSeconds: 120, ...LIGHT }, async (req) => {
  const { branchId, resultCofIds } = (req.data ?? {}) as { branchId?: unknown; resultCofIds?: unknown }
  await requireAdmin(branchId, req.auth, 'look at results on the results site')
  onlyTheAcademy(branchId)
  const ids = Array.isArray(resultCofIds) ? resultCofIds.filter(safeId) : []
  if (!ids.length || ids.length > 20 || ids.length !== (resultCofIds as unknown[]).length) throw new HttpsError('invalid-argument', 'Choose the results.')
  const apiKey = await loadKey(ACADEMY_ID)
  if (!apiKey) throw new HttpsError('failed-precondition', NO_KEY)
  const branch = (await db.doc(`${ROOT.branches}/${ACADEMY_ID}`).get()).data() as Branch | undefined
  const tz = branch?.timezone || 'America/New_York'
  const client = new SiteClient(apiKey, ids.length * 3 + 2)
  const previews: Record<string, ResultPreview> = {}
  for (const id of ids) {
    try {
      const cof = (await client.get<{ ResultCOF?: ScoposResultCof }>(`/resultcof/${encodeURIComponent(id)}`))?.ResultCOF ?? null
      if (!cof?.ResultCOFID) {
        previews[id] = { results: [], error: 'Not published on the results site.' }
        continue
      }
      const name = cof.Participant ? athleteName(cof.Participant) : ''
      const found = onlineResults(cof, tz)
      previews[id] = found.length
        ? { results: found.map((r) => onlineEvaluation(r, cof, { studentId: '', studentName: name, team: null, host: null })), error: null }
        : { results: [], error: 'No shots on the results site yet.' }
    } catch (e) {
      previews[id] = { results: [], error: e instanceof SiteError ? e.message : 'The results site didn’t answer.' }
    }
  }
  return { previews }
})

/**
 * Start over (Goo's ask of 2026-11-11): everything the results site brought in goes, and each results sheet scan it
 * changed is put back (run.ts, `startOver`). Not while a check is under way.
 */
export const resultsSiteReset = onCall({ timeoutSeconds: 300, ...LIGHT }, async (req): Promise<ResetCounts> => {
  const { branchId } = (req.data ?? {}) as { branchId?: unknown }
  const caller = await requireAdmin(branchId, req.auth, 'start the results site over')
  onlyTheAcademy(branchId)
  if (await checkUnderWay()) throw new HttpsError('failed-precondition', 'A check is under way: start over once it’s done.')
  const runId = 'reset'
  if (!(await holdLock(ACADEMY_ID, runId))) throw new HttpsError('failed-precondition', 'A check is under way: start over once it’s done.')
  try {
    return await startOver(ACADEMY_ID, caller)
  } finally {
    await releaseLock(ACADEMY_ID, runId)
  }
})
