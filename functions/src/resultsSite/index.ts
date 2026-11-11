import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db, LIGHT } from '../app'
import { requireAdmin } from '../contracts'
import { ACADEMY_ID } from '@shared/academy'
import { COL, ROOT } from '@shared/paths'
import { type OnlineAthlete, type ResultsSiteRun, isScheduledHour, isUnderWay } from '@shared/scores/resultsSite'
import { POSITIONS, type Position } from '@shared/shooting/evaluation'
import { resolveSettings } from '@shared/settings/resolve'
import { type DateKey, addDays, isDateKey, minutesOf, todayKey } from '@shared/time'
import type { Branch, Student } from '@shared/types'
import { SiteClient } from './client'
import { Problem, answerScan, base, bringIn, holdLock, loadKey, newRun, releaseLock, runCheck, runsOf, statusRef } from './run'

/**
 * The results site import's functions (shared/src/scores/resultsSite.ts): the academy's schedule (off until it sets
 * one), the page's buttons (Check now, Look back), and a person's answers (an athlete is a student or not; a results
 * sheet's scan that differs from the site's). Only the academy brings results in: the demo academy's people are made
 * up. The site's key is kept on the server (scripts/results-site-key.ts sets it).
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
  const ids = Object.entries(athlete.results ?? {})
    .filter(([, r]) => !r.lastUpdated)
    .map(([id]) => id)
  if (!ids.length) return { ok: true, brought: 0, waiting: 0 }
  const apiKey = await loadKey(ACADEMY_ID)
  const runId = `link-${key}`
  if (!apiKey || !(await holdLock(ACADEMY_ID, runId))) return { ok: true, brought: 0, waiting: ids.length }
  const branch = (await db.doc(`${ROOT.branches}/${ACADEMY_ID}`).get()).data() as Branch | undefined
  const c = {
    branchId: ACADEMY_ID,
    tz: branch?.timezone || 'America/New_York',
    client: new SiteClient(apiKey, ids.length * 2 + 5),
    athletes: new Map([[key, athlete]]),
    counts: { matches: 0, results: 0, athletes: 0 },
    touched: new Map<string, Set<string>>(),
    studentName: new Map(athlete.studentId && athlete.studentName ? [[athlete.studentId, athlete.studentName]] : []),
    log: [] as string[],
  }
  let brought = 0
  try {
    for (const id of ids.slice(0, 120)) if (await bringIn(c, key, id)) brought++
  } catch (e) {
    logger.warn('Bringing in a linked athlete’s results stopped', { key, error: (e as Error).message })
  } finally {
    const results = Object.fromEntries([...(c.touched.get(key) ?? [])].map((id) => [id, athlete.results[id]]))
    if (Object.keys(results).length) await db.doc(`${base(ACADEMY_ID)}/${COL.onlineAthletes}/${key}`).set({ results, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    await releaseLock(ACADEMY_ID, runId)
  }
  return { ok: true, brought, waiting: Math.max(0, ids.length - brought) }
}
