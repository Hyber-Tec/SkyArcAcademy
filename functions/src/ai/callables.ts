import { FieldValue } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { resolveAiConfig } from '@shared/ai/config'
import { aiCostUsd } from '@shared/ai/cost'
import { AI_PROVIDER_INFO, cleanModelId, isModelId, priceOf } from '@shared/ai/models'
import { AI_COL } from '@shared/ai/paths'
import { numbersNotInFigures, parseReportText, REPORT_TEXT_SCHEMA, reportTextPrompt } from '@shared/ai/reportText'
import { checkAiSettings } from '@shared/ai/settings'
import { type AiFeatureConfig, type AiPerson, type AiUsageFeature, isAiProvider, isThinkingLevel, type ThinkingLevel } from '@shared/ai/types'
import { looksLikeEmail } from '@shared/auth'
import { COL, ROOT, emailKey } from '@shared/paths'
import type { ProgressReportDoc } from '@shared/reports/types'
import { db, LIGHT } from '../app'
import { AiProviderError, askProvider } from './providers'
import { addChanges, checkLimits, configRef, keyRef, loadConfig, loadKey, logUsage, setPublic, superAdminRef } from './store'

/**
 * The AI's callable functions (docs/DECISIONS.md §26). Super admins manage it from Settings → AI: the keys (kept where
 * no browser reads them; the config keeps their last 4 characters), the features' models and the limits, and who the
 * super admins are; every change writes the history. The features run here too, never in a browser or phone:
 * `draftReportText` for the report editor's "Write with AI". Every request to a provider is logged with its tokens and
 * cost, and each is checked against the month's limit and the person's hour first.
 */

type Auth = { uid: string; token: Record<string, unknown> } | undefined

function verifiedEmail(auth: Auth): string {
  if (!auth || typeof auth.token.email !== 'string' || auth.token.email_verified !== true) throw new HttpsError('unauthenticated', 'Sign in first.')
  return emailKey(auth.token.email)
}

async function requireSuperAdmin(auth: Auth): Promise<AiPerson> {
  const email = verifiedEmail(auth)
  if (!(await superAdminRef(email).get()).exists) throw new HttpsError('permission-denied', 'Only super admins can do this.')
  return { uid: auth!.uid, email, name: (auth!.token.name as string) || email }
}

/** An owner or admin of the academy, as functions/src/index.ts checks them. */
async function requireAcademyAdmin(branchId: unknown, auth: Auth): Promise<AiPerson> {
  if (typeof branchId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(branchId)) throw new HttpsError('invalid-argument', 'Missing academy.')
  const email = verifiedEmail(auth)
  const m = (await db.doc(`${ROOT.branches}/${branchId}/${COL.members}/${email}`).get()).data()
  if (!m || m.status !== 'active' || (m.role !== 'owner' && m.role !== 'admin')) throw new HttpsError('permission-denied', 'Only the academy’s owners and admins can do this.')
  return { uid: auth!.uid, email, name: (m.displayName as string) || (auth!.token.name as string) || email }
}

const last4 = (key: string) => key.slice(-4)
const errorWords = (e: unknown) => (e as Error)?.message ?? String(e)

// ------------------------------------------------------------------- keys

/** Adds or replaces a provider's key. The key is kept in aiKeys/{provider}; nothing returns it. */
export const aiSaveKey = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const { provider, key } = (req.data ?? {}) as { provider?: unknown; key?: unknown }
  if (!isAiProvider(provider)) throw new HttpsError('invalid-argument', 'Choose a provider.')
  const k = typeof key === 'string' ? key.trim() : ''
  if (k.length < 8 || k.length > 512 || /\s/.test(k)) throw new HttpsError('invalid-argument', 'That doesn’t look like an API key.')
  const by = await requireSuperAdmin(req.auth)
  const label = AI_PROVIDER_INFO[provider].label
  await db.runTransaction(async (tx) => {
    const config = await loadConfig(tx)
    const before = config.providers[provider]?.keyLast4 ?? null
    const info = { keyLast4: last4(k), keySetAt: FieldValue.serverTimestamp(), keySetBy: by }
    tx.set(keyRef(provider), { key: k, setAt: FieldValue.serverTimestamp(), setBy: by })
    tx.set(configRef(), { providers: { [provider]: info }, updatedAt: FieldValue.serverTimestamp(), updatedBy: by }, { merge: true })
    addChanges(tx, by, [{ action: 'key.set', provider, summary: before ? `Replaced the ${label} key` : `Added the ${label} key`, from: before ? `…${before}` : null, to: `…${last4(k)}` }])
    setPublic(tx, { ...config, providers: { ...config.providers, [provider]: info } })
  })
  return { ok: true, keyLast4: last4(k) }
})

export const aiRemoveKey = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const { provider } = (req.data ?? {}) as { provider?: unknown }
  if (!isAiProvider(provider)) throw new HttpsError('invalid-argument', 'Choose a provider.')
  const by = await requireSuperAdmin(req.auth)
  await db.runTransaction(async (tx) => {
    const config = await loadConfig(tx)
    const before = config.providers[provider]?.keyLast4 ?? null
    tx.delete(keyRef(provider))
    tx.set(configRef(), { providers: { [provider]: FieldValue.delete() }, updatedAt: FieldValue.serverTimestamp(), updatedBy: by }, { merge: true })
    if (before) addChanges(tx, by, [{ action: 'key.remove', provider, summary: `Removed the ${AI_PROVIDER_INFO[provider].label} key`, from: `…${before}`, to: null }])
    const providers = { ...config.providers }
    delete providers[provider]
    setPublic(tx, { ...config, providers })
  })
  return { ok: true }
})

// -------------------------------------------------------------- settings

/** The features' models, the limits and the prices typed in (checked by shared/src/ai/settings.ts). */
export const aiSaveSettings = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const by = await requireSuperAdmin(req.auth)
  const changed = await db.runTransaction(async (tx) => {
    const current = await loadConfig(tx)
    const checked = checkAiSettings(req.data, current)
    if (!checked.ok) throw new HttpsError('invalid-argument', checked.error)
    if (!checked.changes.length) return 0
    const { features, monthlyLimitUsd, hourlyLimit, prices } = checked.next
    // Each field whole: a price removed must go, which a merge of the map wouldn't do.
    tx.set(
      configRef(),
      { features, monthlyLimitUsd, hourlyLimit, prices, updatedAt: FieldValue.serverTimestamp(), updatedBy: by },
      { mergeFields: ['features', 'monthlyLimitUsd', 'hourlyLimit', 'prices', 'updatedAt', 'updatedBy'] },
    )
    addChanges(
      tx,
      by,
      checked.changes.map((c) => ({ action: 'settings' as const, feature: c.feature, summary: c.summary, from: c.from, to: c.to })),
    )
    setPublic(tx, { ...current, ...checked.next })
    return checked.changes.length
  })
  return { ok: true, changes: changed }
})

// ----------------------------------------------------------- super admins

export const aiSetSuperAdmin = onCall({ timeoutSeconds: 30, ...LIGHT }, async (req) => {
  const { email: raw, on } = (req.data ?? {}) as { email?: unknown; on?: unknown }
  const email = typeof raw === 'string' ? emailKey(raw) : ''
  if (!looksLikeEmail(email)) throw new HttpsError('invalid-argument', 'That doesn’t look like an email address.')
  if (typeof on !== 'boolean') throw new HttpsError('invalid-argument', 'Add or remove?')
  const by = await requireSuperAdmin(req.auth)
  await db.runTransaction(async (tx) => {
    const ref = superAdminRef(email)
    const snap = await tx.get(ref)
    if (on) {
      if (snap.exists) return
      tx.set(ref, { email, addedAt: FieldValue.serverTimestamp(), addedBy: by })
      addChanges(tx, by, [{ action: 'superAdmin.add', summary: `Made ${email} a super admin`, from: null, to: email }])
      return
    }
    if (!snap.exists) return
    const all = await tx.get(db.collection(AI_COL.superAdmins))
    if (all.size <= 1) throw new HttpsError('failed-precondition', 'There must always be a super admin: add another one first.')
    tx.delete(ref)
    addChanges(tx, by, [{ action: 'superAdmin.remove', summary: `Removed ${email} as a super admin`, from: email, to: null }])
  })
  return { ok: true }
})

// --------------------------------------------------------------- requests

/** The most a request may write, thinking included: room to think at the higher levels, never unbounded. */
const MAX_OUTPUT: Record<ThinkingLevel | 'none', number> = { none: 2048, minimal: 2048, low: 4096, medium: 8192, high: 16384 }
const TIMEOUT_MS = 90_000

interface RunInput {
  feature: AiUsageFeature
  use: Pick<AiFeatureConfig, 'provider' | 'model' | 'thinking'>
  prices: Record<string, { inputPerM: number; outputPerM: number }>
  system: string
  user: string
  schema: Record<string, unknown> | null
  maxOutputTokens: number
  by: AiPerson
  branchId: string | null
  ref: string | null
  /** Checks the text; a string is why it can't be used (logged as the request's error). */
  check?: (text: string) => string | null
}

/** One request to a provider, logged as it went: its tokens and cost (from the price), its time and its outcome. */
async function run(input: RunInput): Promise<{ ok: true; text: string; ms: number; tokens: { inputTokens: number; outputTokens: number; thinkingTokens: number }; costUsd: number } | { ok: false; error: string; ms: number }> {
  const { provider, model, thinking } = input.use
  const key = await loadKey(provider)
  const price = priceOf(provider, model, input.prices)
  const base = { feature: input.feature, provider, model, thinking, by: input.by, branchId: input.branchId, ref: input.ref, priced: !!price }
  const started = Date.now()
  if (!key) {
    await logUsage({ ...base, inputTokens: 0, outputTokens: 0, thinkingTokens: 0, costUsd: 0, ok: false, error: `No ${AI_PROVIDER_INFO[provider].label} key.`, ms: 0 })
    return { ok: false, error: `There’s no ${AI_PROVIDER_INFO[provider].label} key: add one under Keys.`, ms: 0 }
  }
  try {
    const answer = await askProvider({ provider, model, thinking, system: input.system, user: input.user, schema: input.schema, maxOutputTokens: input.maxOutputTokens }, key, { timeoutMs: TIMEOUT_MS })
    const tokens = { inputTokens: answer.inputTokens, outputTokens: answer.outputTokens, thinkingTokens: answer.thinkingTokens }
    const costUsd = aiCostUsd(tokens, price)
    const problem = input.check?.(answer.text) ?? null
    await logUsage({ ...base, ...tokens, costUsd, ok: !problem, error: problem, ms: answer.ms })
    return problem ? { ok: false, error: problem, ms: answer.ms } : { ok: true, text: answer.text, ms: answer.ms, tokens, costUsd }
  } catch (e) {
    const ms = Date.now() - started
    const error = e instanceof AiProviderError ? e.message : `Unexpected error: ${errorWords(e)}`
    const tokens = e instanceof AiProviderError && e.tokens ? e.tokens : { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 }
    await logUsage({ ...base, ...tokens, costUsd: aiCostUsd(tokens, price), ok: false, error: error.slice(0, 500), ms })
    if (!(e instanceof AiProviderError)) logger.error('AI request failed unexpectedly', { feature: input.feature, provider, model, error })
    return { ok: false, error, ms }
  }
}

/**
 * The AI page's Test button: a tiny request with the model and thinking level on the page (saved or not), so a super
 * admin sees it answer, how long it took, the tokens and the cost, or the provider's own error. Logged as `test`. A
 * failure of the server's own (not a provider's) is shown in its words too, instead of Firebase's bare "INTERNAL".
 */
export const aiTest = onCall({ timeoutSeconds: 120, ...LIGHT }, async (req) => {
  const { provider, model, thinking } = (req.data ?? {}) as { provider?: unknown; model?: unknown; thinking?: unknown }
  if (!isAiProvider(provider)) throw new HttpsError('invalid-argument', 'Choose a provider.')
  if (typeof model !== 'string' || !model.trim()) throw new HttpsError('invalid-argument', 'Choose or type a model.')
  if (thinking !== null && thinking !== undefined && !isThinkingLevel(thinking)) throw new HttpsError('invalid-argument', 'Choose a thinking level.')
  const by = await requireSuperAdmin(req.auth)
  const level = (thinking ?? null) as ThinkingLevel | null
  const id = cleanModelId(model)
  if (!isModelId(id)) throw new HttpsError('invalid-argument', `“${id}” isn’t a model ID.`)
  try {
    const config = await loadConfig()
    await checkLimits(config, by.uid)
    const result = await run({
      feature: 'test',
      use: { provider, model: id, thinking: level },
      prices: config.prices,
      system: 'You check that an app can reach you. Reply with JSON only.',
      user: 'Reply with this JSON and nothing else: {"ok": true, "word": "ready"}',
      schema: { type: 'object', properties: { ok: { type: 'boolean' }, word: { type: 'string' } }, required: ['ok', 'word'], additionalProperties: false },
      maxOutputTokens: MAX_OUTPUT[level ?? 'none'],
      by,
      branchId: null,
      ref: null,
    })
    if (!result.ok) return { ok: false, error: result.error, ms: result.ms }
    return { ok: true, ms: result.ms, ...result.tokens, costUsd: result.costUsd, priced: !!priceOf(provider, id, config.prices), text: result.text.slice(0, 200) }
  } catch (e) {
    if (e instanceof HttpsError) throw e
    logger.error('AI test failed unexpectedly', { provider, model: id, error: errorWords(e) })
    return { ok: false, error: `The server couldn’t run the test: ${errorWords(e)}`.slice(0, 500), ms: 0 }
  }
})

/**
 * "Write with AI" on a draft report (owners and admins): a draft of its overview, strengths, focus areas and goals,
 * from its figures and the student's first name only. The editor shows it as changes to review and save; nothing is
 * written to the report here. Errors say only that AI couldn't write it (the page words them; this page never names a
 * provider), except the limits', whose messages the person can act on.
 */
export const draftReportText = onCall({ timeoutSeconds: 120, ...LIGHT }, async (req) => {
  const { branchId, reportId } = (req.data ?? {}) as { branchId?: unknown; reportId?: unknown }
  const by = await requireAcademyAdmin(branchId, req.auth)
  if (typeof reportId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(reportId)) throw new HttpsError('invalid-argument', 'Missing report.')
  const snap = await db.doc(`${ROOT.branches}/${branchId as string}/${COL.progressReports}/${reportId}`).get()
  const report = snap.data() as ProgressReportDoc | undefined
  if (!report) throw new HttpsError('not-found', 'Report not found.')
  if (report.status !== 'draft') throw new HttpsError('failed-precondition', 'Shared reports are locked: stop sharing it first.')

  const config = resolveAiConfig((await configRef().get()).data())
  const use = config.features.reportText
  if (!use.enabled) throw new HttpsError('failed-precondition', 'AI isn’t on for report text.')

  const prompt = reportTextPrompt(report)
  const firstName = report.student?.firstName ?? ''
  let result: Awaited<ReturnType<typeof run>>
  try {
    await checkLimits(config, by.uid)
    result = await run({
      feature: 'reportText',
      use,
      prices: config.prices,
      system: prompt.system,
      user: prompt.user,
      schema: REPORT_TEXT_SCHEMA as unknown as Record<string, unknown>,
      maxOutputTokens: MAX_OUTPUT[use.thinking ?? 'none'],
      by,
      branchId: branchId as string,
      ref: reportId,
      // An answer that isn't the report's shape is logged as failed, with why.
      check: (text) => {
        const p = parseReportText(text, firstName)
        return p.ok ? null : p.error
      },
    })
  } catch (e) {
    if (e instanceof HttpsError) throw e
    logger.error('AI report text failed unexpectedly', { branchId, reportId, error: errorWords(e) })
    throw new HttpsError('unavailable', 'AI couldn’t write this just now.')
  }
  const parsed = result.ok ? parseReportText(result.text, firstName) : null
  if (!parsed?.ok) {
    logger.warn('AI report text failed', { branchId, reportId, error: result.ok ? 'invalid answer' : result.error })
    throw new HttpsError('unavailable', 'AI couldn’t write this just now.')
  }
  return { narrative: parsed.value, check: numbersNotInFigures(parsed.value, prompt) }
})
