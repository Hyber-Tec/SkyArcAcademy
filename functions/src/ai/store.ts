import { AggregateField, FieldValue, type Transaction } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError } from 'firebase-functions/v2/https'
import { ACADEMY_ID } from '@shared/academy'
import { type ResolvedAiConfig, publicAiDoc, resolveAiConfig } from '@shared/ai/config'
import { hourlyCheck, monthlyLimitMessage } from '@shared/ai/limits'
import { AI_COL, AI_DOC } from '@shared/ai/paths'
import type { AiChangeDoc, AiConfigDoc, AiKeyDoc, AiPerson, AiProvider, AiUsageDoc } from '@shared/ai/types'
import { ROOT } from '@shared/paths'
import { startOfMonth, toInstant, todayKey } from '@shared/time'
import { db } from '../app'

/** The AI's Firestore documents (shared/src/ai/types.ts), read and written with the Admin SDK only. */

export const configRef = () => db.doc(`${AI_COL.aiConfig}/${AI_DOC.config}`)
export const publicRef = () => db.doc(`${AI_COL.aiConfig}/${AI_DOC.public}`)
export const keyRef = (provider: AiProvider) => db.doc(`${AI_COL.aiKeys}/${provider}`)
export const superAdminRef = (email: string) => db.doc(`${AI_COL.superAdmins}/${email}`)

export async function loadConfig(tx?: Transaction): Promise<ResolvedAiConfig> {
  const snap = tx ? await tx.get(configRef()) : await configRef().get()
  return resolveAiConfig(snap.data() as Partial<AiConfigDoc> | undefined)
}

export async function loadKey(provider: AiProvider): Promise<string | null> {
  const key = ((await keyRef(provider).get()).data() as AiKeyDoc | undefined)?.key
  return typeof key === 'string' && key ? key : null
}

/** Change-history lines, in a transaction with the change itself. */
export function addChanges(tx: Transaction, by: AiPerson, entries: Omit<AiChangeDoc, 'at' | 'by'>[]) {
  for (const e of entries) tx.create(db.collection(AI_COL.aiChanges).doc(), { at: FieldValue.serverTimestamp(), by, provider: null, feature: null, from: null, to: null, ...e })
}

/** `aiConfig/public`, from the config as it will be: what the academy's pages may know. */
export function setPublic(tx: Transaction, config: ResolvedAiConfig) {
  tx.set(publicRef(), publicAiDoc(config))
}

export async function logUsage(entry: Omit<AiUsageDoc, 'at'>) {
  await db.collection(AI_COL.aiUsage).add({ at: FieldValue.serverTimestamp(), ...entry })
}

let zone: { value: string; at: number } | null = null

/** The academy's time zone, whose months the spending limit counts (read again every 10 minutes). */
async function academyTimeZone(): Promise<string> {
  if (!zone || Date.now() - zone.at > 600_000) {
    const tz = (await db.doc(`${ROOT.branches}/${ACADEMY_ID}`).get()).get('timezone')
    zone = { value: typeof tz === 'string' && tz ? tz : 'America/New_York', at: Date.now() }
  }
  return zone.value
}

/** gRPC's FAILED_PRECONDITION: what Firestore answers when a query's index is missing or still building. */
const NEEDS_INDEX = 9

/**
 * What this month's requests cost so far, from the log. The sum needs its index (`aiUsage`: `at`, `costUsd`;
 * firestore.indexes.json); until Firestore has built it, the month's requests are added up here instead.
 */
export async function spentThisMonth(): Promise<number> {
  const tz = await academyTimeZone()
  const start = toInstant(startOfMonth(todayKey(tz)), 0, tz)
  const month = db.collection(AI_COL.aiUsage).where('at', '>=', start)
  try {
    const snap = await month.aggregate({ total: AggregateField.sum('costUsd') }).get()
    return Number(snap.data().total ?? 0)
  } catch (e) {
    if ((e as { code?: unknown })?.code !== NEEDS_INDEX) throw e
    logger.warn('The AI spending total has no index yet: adding up the month’s requests instead', { error: (e as Error).message })
    const snap = await month.select('costUsd').get()
    return snap.docs.reduce((n, d) => n + (Number(d.get('costUsd')) || 0), 0)
  }
}

/**
 * The guards before a request: the month's limit (over everyone), then the person's hour, counted in a transaction
 * so that quick repeats can't slip past. Throws `resource-exhausted` with a message the academy's people may read.
 */
export async function checkLimits(config: ResolvedAiConfig, uid: string) {
  const over = monthlyLimitMessage(await spentThisMonth(), config.monthlyLimitUsd)
  if (over) throw new HttpsError('resource-exhausted', over)
  const ref = db.doc(`${AI_COL.aiLimits}/${uid}`)
  const message = await db.runTransaction(async (tx) => {
    const now = Date.now()
    const times = ((await tx.get(ref)).get('times') as number[] | undefined) ?? []
    const check = hourlyCheck(times, now, config.hourlyLimit)
    if (check.ok) tx.set(ref, { times: check.keep, updatedAt: FieldValue.serverTimestamp() })
    return check.message
  })
  if (message) throw new HttpsError('resource-exhausted', message)
}
