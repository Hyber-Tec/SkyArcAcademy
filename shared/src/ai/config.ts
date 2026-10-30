import { recommendedModel } from './models'
import { AI_FEATURES, type AiConfigDoc, type AiFeature, type AiFeatureConfig, type AiPublicDoc } from './types'

/**
 * The AI config with its defaults, so code never reads a missing field: `aiConfig/main` keeps what super admins set;
 * every feature starts off, on its provider's recommended model, until a super admin turns it on.
 */

/** A new feature's start: Claude's recommended model with a little thinking, off. */
export function defaultFeature(): AiFeatureConfig {
  return { provider: 'anthropic', model: recommendedModel('anthropic').id, thinking: 'low', enabled: false }
}

/** Until a super admin sets them: $10 a month in all, and 30 requests an hour for each person. */
export const AI_DEFAULTS = {
  monthlyLimitUsd: 10,
  hourlyLimit: 30,
} as const

export type ResolvedAiConfig = Omit<AiConfigDoc, 'features' | 'updatedAt' | 'updatedBy'> & {
  features: Record<AiFeature, AiFeatureConfig>
  updatedAt: unknown
  updatedBy: AiConfigDoc['updatedBy']
}

export function resolveAiConfig(doc: Partial<AiConfigDoc> | null | undefined): ResolvedAiConfig {
  const features = Object.fromEntries(AI_FEATURES.map((f) => [f, { ...defaultFeature(), ...(doc?.features?.[f] ?? {}) }])) as Record<AiFeature, AiFeatureConfig>
  return {
    features,
    providers: { ...(doc?.providers ?? {}) },
    monthlyLimitUsd: doc && 'monthlyLimitUsd' in doc ? (doc.monthlyLimitUsd ?? null) : AI_DEFAULTS.monthlyLimitUsd,
    hourlyLimit: typeof doc?.hourlyLimit === 'number' ? doc.hourlyLimit : AI_DEFAULTS.hourlyLimit,
    prices: { ...(doc?.prices ?? {}) },
    updatedAt: doc?.updatedAt ?? null,
    updatedBy: doc?.updatedBy ?? null,
  }
}

/** A feature is ready when it's on, has a model, and its provider has a key. */
export function featureReady(config: ResolvedAiConfig, feature: AiFeature): boolean {
  const f = config.features[feature]
  return f.enabled && !!f.model && !!config.providers[f.provider]?.keyLast4
}

/** `aiConfig/public`, from the config: what the academy's pages may know. */
export function publicAiDoc(config: ResolvedAiConfig): AiPublicDoc {
  return Object.fromEntries(AI_FEATURES.map((f) => [f, featureReady(config, f)])) as AiPublicDoc
}
