/**
 * The app's AI (docs/DECISIONS.md §26): each feature asks a provider's model of its own (a cheaper model where it does
 * the job), every request runs in Cloud Functions with a key only they can read, and every request's tokens and cost
 * are logged. Super admins manage it all on Settings → AI, the one page that names providers and models: everywhere the
 * academy's people look it is "AI" (CLAUDE.md, "AI naming").
 *
 * Platform-wide, outside every academy (shared/src/ai/paths.ts):
 *   superAdmins/{email}   who may open the AI page (lower-case verified email)
 *   aiConfig/main         the features' models, the keys' last 4 characters, the limits and prices (`AiConfigDoc`)
 *   aiConfig/public       which features are set up and on, for any signed-in member (`AiPublicDoc`)
 *   aiKeys/{provider}     the keys themselves: server only, no browser or phone ever reads one (`AiKeyDoc`)
 *   aiUsage/{id}          one request: its tokens, cost, time and outcome (`AiUsageDoc`)
 *   aiChanges/{id}        the change history (`AiChangeDoc`)
 *   aiLimits/{uid}        server only: each person's requests in the last hour
 */

export type AiProvider = 'gemini' | 'anthropic' | 'openai'

export const AI_PROVIDERS: readonly AiProvider[] = ['gemini', 'anthropic', 'openai']

export function isAiProvider(value: unknown): value is AiProvider {
  return typeof value === 'string' && (AI_PROVIDERS as readonly string[]).includes(value)
}

/** How much a model thinks before it answers: each provider's own setting, in four plain steps. */
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high'

export const THINKING_LEVELS: readonly ThinkingLevel[] = ['minimal', 'low', 'medium', 'high']

export const THINKING_LABELS: Record<ThinkingLevel, string> = { minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High' }

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === 'string' && (THINKING_LEVELS as readonly string[]).includes(value)
}

/** The app's AI features. Each has its own model; more come later. */
export type AiFeature = 'reportText'

export const AI_FEATURES: readonly AiFeature[] = ['reportText']

export const AI_FEATURE_INFO: Record<AiFeature, { label: string; description: string }> = {
  reportText: {
    label: 'Report text',
    description: 'Drafts a progress report’s overview, strengths, focus areas and goals from its figures, when an owner or admin asks (“Write with AI” on a draft report).',
  },
}

/** What a logged request was for: a feature, or the AI page's Test button. */
export type AiUsageFeature = AiFeature | 'test'

export function aiFeatureLabel(feature: string): string {
  return feature === 'test' ? 'Test' : (AI_FEATURE_INFO[feature as AiFeature]?.label ?? feature)
}

export interface AiFeatureConfig {
  provider: AiProvider
  /** The provider's model ID, from the list or typed in (`gemini-3.5-flash-lite`). */
  model: string
  /** Null: the model's own default (or a model that doesn't think). */
  thinking: ThinkingLevel | null
  enabled: boolean
}

/** Who did something: their sign-in's ID, email and name. */
export interface AiPerson {
  uid: string
  email: string
  name: string
}

/** A key as the config shows it: never the key, only its last 4 characters. */
export interface AiKeyInfo {
  keyLast4: string
  keySetAt: unknown
  keySetBy: AiPerson
}

/** Dollars per 1 million tokens. Thinking tokens are billed as output. */
export interface AiPrice {
  inputPerM: number
  outputPerM: number
}

/** `aiConfig/main`: written by Cloud Functions only (aiSaveSettings, aiSaveKey, aiRemoveKey). */
export interface AiConfigDoc {
  features: Partial<Record<AiFeature, AiFeatureConfig>>
  providers: Partial<Record<AiProvider, AiKeyInfo>>
  /** New requests are refused once this month's logged cost reaches it; null: no limit. */
  monthlyLimitUsd: number | null
  /** Requests one person may make in an hour, over every feature. */
  hourlyLimit: number
  /** Prices for models typed in by hand, or corrections to the list's prices. */
  prices: Record<string, AiPrice>
  updatedAt: unknown
  updatedBy: AiPerson | null
}

/** `aiConfig/public`: each feature is set up (a model, its provider's key) and on. Any signed-in member reads it. */
export type AiPublicDoc = Record<AiFeature, boolean>

/** `aiKeys/{provider}`: the key. Only the Admin SDK reads it (firestore.rules denies every client). */
export interface AiKeyDoc {
  key: string
  setAt: unknown
  setBy: AiPerson
}

/** `aiUsage/{id}`: one request to a provider, as it went. */
export interface AiUsageDoc {
  at: unknown
  feature: AiUsageFeature
  provider: AiProvider
  model: string
  thinking: ThinkingLevel | null
  inputTokens: number
  /** The answer's tokens, without the thinking. */
  outputTokens: number
  thinkingTokens: number
  costUsd: number
  /** False when the model had no price (the cost then reads 0). */
  priced: boolean
  ok: boolean
  error: string | null
  ms: number
  by: AiPerson
  /** The academy it was for (null for a test). */
  branchId: string | null
  /** What it was for, e.g. the report's ID. */
  ref: string | null
}

export type AiChangeAction = 'key.set' | 'key.remove' | 'settings' | 'superAdmin.add' | 'superAdmin.remove'

/** `aiChanges/{id}`: one change, in plain words. Keys appear only as their last 4 characters. */
export interface AiChangeDoc {
  at: unknown
  by: AiPerson
  action: AiChangeAction
  provider?: AiProvider | null
  feature?: AiFeature | null
  summary: string
  from?: string | null
  to?: string | null
}

/** `superAdmins/{email}`. */
export interface SuperAdminDoc {
  email: string
  addedAt: unknown
  addedBy: AiPerson
}
