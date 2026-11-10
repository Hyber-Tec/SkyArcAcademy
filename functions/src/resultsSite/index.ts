import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { db, LIGHT } from '../app'
import { requireAdmin } from '../contracts'
import { ACADEMY_ID } from '@shared/academy'
import { COL, ROOT } from '@shared/paths'
import { type OnlineAthlete, type ResultsSiteRun, type ResultsSiteStatus, isUnderWay } from '@shared/scores/resultsSite'
import { resolveSettings } from '@shared/settings/resolve'
import { type DateKey, addDays, isDateKey, todayKey } from '@shared/time'
import type { Branch, Student } from '@shared/types'
import { SiteClient, SiteError } from './client'
import { base, bringIn, keyRef, loadKey, newRun, runCheck, runsOf, statusRef } from './run'

/**
 * The results site import's functions (shared/src/scores/resultsSite.ts): the nightly check, the page's buttons (Check
 * now, Look back), the key, and a person's answer about an athlete. Only the academy brings results in: the demo
 * academy's people are made up.
 */

const onlyTheAcademy = (branchId: unknown) => {
  if (branchId !== ACADEMY_ID) throw new HttpsError('failed-precondition', 'Only the academy brings in results from the results site.')
}

const last4 = (k: string) => k.slice(-4)

/** Each night: a check for every academy with the import on and a key (the academy's night, after its matches' days). */
export const resultsSiteNightly = onSchedule({ schedule: '20 7 * * *', timeZone: 'UTC', timeoutSeconds: 120, ...LIGHT }, async () => {
  const branch = (await db.doc(`${ROOT.branches}/${ACADEMY_ID}`).get()).data() as Branch | undefined
  if (branch?.status !== 'active' || !resolveSettings(branch.settings).resultsSite.enabled || !(await loadKey(ACADEMY_ID))) return
  await runsOf(ACADEMY_ID).add(newRun('nightly', 'system'))
  // The page shows the last two months of checks.
  const old = await runsOf(ACADEMY_ID).where('requestedAt', '<', Timestamp.fromMillis(Date.now() - 60 * 86_400_000)).limit(200).get()
  if (!old.empty) {
    const batch = db.batch()
    for (const d of old.docs) batch.delete(d.ref)
    await batch.commit()
  }
})

/** Runs each check as its document is written: by the nightly job, the page's buttons, or a look-back going on. */
export const onResultsSiteRun = onDocumentCreated(
  { document: `${ROOT.branches}/{branchId}/${COL.resultsSiteRuns}/{runId}`, timeoutSeconds: 540, ...LIGHT },
  async (event) => {
    if (event.params.branchId !== ACADEMY_ID) return
    await runCheck(event.params.branchId, event.params.runId)
  },
)

/** The page's buttons: "Check now" (the nightly check, now) and "Look back" (from a day, two weeks at a time). */
export const resultsSiteCheck = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const { branchId, kind, from } = (req.data ?? {}) as { branchId?: unknown; kind?: unknown; from?: unknown }
  const caller = await requireAdmin(branchId, req.auth, 'check the results site')
  onlyTheAcademy(branchId)
  if (!(await loadKey(ACADEMY_ID))) throw new HttpsError('failed-precondition', 'Add the results site’s key first.')
  // One check at a time; one that stopped without saying so (its function ran out of time) is marked as stopped.
  const pending = await runsOf(ACADEMY_ID).where('state', 'in', ['queued', 'running']).limit(10).get()
  const now = Date.now()
  for (const d of pending.docs) {
    if (isUnderWay(d.data() as ResultsSiteRun, now)) throw new HttpsError('failed-precondition', 'A check is already under way: its results show here as it goes.')
    await d.ref.update({ state: 'failed', error: 'It stopped before it finished.', finishedAt: FieldValue.serverTimestamp() })
  }
  const tz = ((await db.doc(`${ROOT.branches}/${ACADEMY_ID}`).get()).data() as Branch | undefined)?.timezone || 'America/New_York'
  const today = todayKey(tz)
  if (kind === 'lookBack') {
    if (!isDateKey(from) || from >= today || from < addDays(today, -3 * 366)) throw new HttpsError('invalid-argument', 'Choose a day in the last three years.')
    const ref = await runsOf(ACADEMY_ID).add(newRun('lookBack', caller.email, { from: from as DateKey, to: today }))
    await statusRef(ACADEMY_ID).set({ lookBack: { from, cursor: today } }, { merge: true })
    return { runId: ref.id }
  }
  const ref = await runsOf(ACADEMY_ID).add(newRun('check', caller.email))
  return { runId: ref.id }
})

/** The results site's key (the shared starter key, or the academy's own once it has one): kept on the server only. */
export const resultsSiteKey = onCall({ timeoutSeconds: 60, ...LIGHT }, async (req) => {
  const { branchId, key } = (req.data ?? {}) as { branchId?: unknown; key?: unknown }
  const caller = await requireAdmin(branchId, req.auth, 'change the results site’s key')
  onlyTheAcademy(branchId)
  const k = typeof key === 'string' ? key.trim() : ''
  const before = ((await statusRef(ACADEMY_ID).get()).data() as Partial<ResultsSiteStatus> | undefined)?.keyEnd ?? null
  if (!k) {
    await keyRef(ACADEMY_ID).delete()
    await statusRef(ACADEMY_ID).set({ keyEnd: null, keySetAt: FieldValue.serverTimestamp(), keySetBy: caller.email }, { merge: true })
    await keyAudit(caller, before ? 'Removed the results site’s key' : 'Removed the results site’s key (there was none)', before, null)
    return { ok: true, keyEnd: null }
  }
  if (k.length < 16 || k.length > 200 || /\s/.test(k)) throw new HttpsError('invalid-argument', 'That doesn’t look like the results site’s key.')
  // One small request, so a wrong key is said now rather than at night.
  try {
    await new SiteClient(k, 1, 0).get('/match/search', { 'start-date': todayKey('UTC'), 'end-date': todayKey('UTC'), limit: 1 })
  } catch (e) {
    throw new HttpsError('failed-precondition', e instanceof SiteError && e.status === 403 ? 'The results site refused this key.' : 'The results site didn’t answer; try again in a minute.')
  }
  await keyRef(ACADEMY_ID).set({ key: k, setAt: FieldValue.serverTimestamp(), setBy: caller.email })
  await statusRef(ACADEMY_ID).set({ keyEnd: last4(k), keySetAt: FieldValue.serverTimestamp(), keySetBy: caller.email }, { merge: true })
  await keyAudit(caller, before ? 'Replaced the results site’s key' : 'Added the results site’s key', before, last4(k))
  return { ok: true, keyEnd: last4(k) }
})

async function keyAudit(caller: Awaited<ReturnType<typeof requireAdmin>>, summary: string, from: string | null, to: string | null) {
  await db.collection(`${ROOT.branches}/${ACADEMY_ID}/${COL.auditLog}`).add({
    at: FieldValue.serverTimestamp(),
    actorUid: caller.uid,
    actorEmail: caller.email,
    actorName: caller.name,
    actorRole: caller.role,
    action: 'resultsSite.key',
    category: 'settings',
    entityType: 'resultsSite',
    entityId: 'key',
    summary,
    context: 'Settings → Results site',
    dateKey: null,
    studentId: null,
    studentName: null,
    coachId: null,
    coachName: null,
    changes: [{ field: 'key', label: 'Key', from: from ? `…${from}` : null, to: to ? `…${to}` : null }],
    via: 'function',
  })
}

/**
 * A person's answer about an athlete the import found: this is a student (`link`, their results come in at once), not
 * the academy's (`ignore`), or not decided after all (`undo`). Results already brought in stay: a wrong one is deleted
 * from the student's scores, and isn't brought back.
 */
export const resultsSiteAthlete = onCall({ timeoutSeconds: 300, ...LIGHT }, async (req) => {
  const { branchId, key, action, studentId } = (req.data ?? {}) as { branchId?: unknown; key?: unknown; action?: unknown; studentId?: unknown }
  const caller = await requireAdmin(branchId, req.auth, 'link athletes from the results site')
  onlyTheAcademy(branchId)
  if (typeof key !== 'string' || !key || key.includes('/')) throw new HttpsError('invalid-argument', 'Choose an athlete.')
  if (action !== 'link' && action !== 'ignore' && action !== 'undo') throw new HttpsError('invalid-argument', 'Choose what to do.')
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
  const got = apiKey
    ? await db.runTransaction(async (tx) => {
        const s = (await tx.get(statusRef(ACADEMY_ID))).data() as Partial<ResultsSiteStatus> | undefined
        const since = (s?.running?.since as Timestamp | undefined)?.toMillis?.() ?? 0
        if (s?.running && Date.now() - since < 12 * 60_000) return false
        tx.set(statusRef(ACADEMY_ID), { running: { runId, since: FieldValue.serverTimestamp() } }, { merge: true })
        return true
      })
    : false
  if (!got || !apiKey) return { ok: true, brought: 0, waiting: ids.length }
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
    await db.runTransaction(async (tx) => {
      const s = (await tx.get(statusRef(ACADEMY_ID))).data() as Partial<ResultsSiteStatus> | undefined
      if (s?.running?.runId === runId) tx.set(statusRef(ACADEMY_ID), { running: null }, { merge: true })
    })
  }
  return { ok: true, brought, waiting: Math.max(0, ids.length - brought) }
}

