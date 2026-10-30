import type { ResolvedAiConfig } from './config'
import { formatUsd, priceWords } from './cost'
import { AI_PROVIDER_INFO, cleanModelId, findModel, isModelId, priceOf } from './models'
import {
  AI_FEATURES,
  AI_FEATURE_INFO,
  type AiFeature,
  type AiFeatureConfig,
  type AiPrice,
  THINKING_LABELS,
  type ThinkingLevel,
  isAiProvider,
  isThinkingLevel,
} from './types'

/**
 * What the AI page saves (the aiSaveSettings function checks it here, and the page before sending): the features'
 * models, the limits, and the prices typed in. Each change becomes a line of the change history.
 */

export interface AiSettingsInput {
  features?: Partial<Record<AiFeature, Partial<AiFeatureConfig>>>
  monthlyLimitUsd?: number | null
  hourlyLimit?: number
  /** A model's price, or null to remove one typed in before. */
  prices?: Record<string, AiPrice | null>
}

export interface AiSettingsChange {
  feature: AiFeature | null
  summary: string
  from: string | null
  to: string | null
}

export interface AiSettingsNext {
  features: Record<AiFeature, AiFeatureConfig>
  monthlyLimitUsd: number | null
  hourlyLimit: number
  prices: Record<string, AiPrice>
}

export type CheckedAiSettings = { ok: true; next: AiSettingsNext; changes: AiSettingsChange[] } | { ok: false; error: string }

const MAX_LIMIT_USD = 100_000
const MAX_PRICE = 1_000
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const cents = (n: number) => Math.round(n * 100) / 100

const thinkingWords = (t: ThinkingLevel | null) => (t ? THINKING_LABELS[t] : 'Default')
const modelWords = (f: Pick<AiFeatureConfig, 'provider' | 'model'>) => `${AI_PROVIDER_INFO[f.provider].label} · ${f.model}`
const limitWords = (n: number | null) => (n === null ? 'No limit' : formatUsd(n))

function checkPrice(id: string, v: unknown): AiPrice | string {
  if (!isObject(v)) return `The price for ${id} needs an input and an output price.`
  const { inputPerM, outputPerM } = v
  for (const n of [inputPerM, outputPerM]) {
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > MAX_PRICE) return `The price for ${id} must be between $0 and $${MAX_PRICE} per 1M tokens.`
  }
  return { inputPerM: inputPerM as number, outputPerM: outputPerM as number }
}

/** Checks a save against the config it changes; the next state and its history lines, or what's wrong in plain words. */
export function checkAiSettings(input: unknown, current: ResolvedAiConfig): CheckedAiSettings {
  if (!isObject(input)) return { ok: false, error: 'Nothing to save.' }
  const changes: AiSettingsChange[] = []

  // Prices first: a feature's model needs one.
  const prices: Record<string, AiPrice> = { ...current.prices }
  if (input.prices !== undefined) {
    if (!isObject(input.prices)) return { ok: false, error: 'The prices aren’t readable.' }
    for (const [rawId, v] of Object.entries(input.prices)) {
      const id = cleanModelId(rawId)
      if (!isModelId(id)) return { ok: false, error: `“${rawId}” isn’t a model ID.` }
      const before = prices[id] ?? null
      if (v === null) {
        if (!before) continue
        delete prices[id]
        changes.push({ feature: null, summary: `Removed the price typed for ${id}`, from: priceWords(before), to: null })
        continue
      }
      const price = checkPrice(id, v)
      if (typeof price === 'string') return { ok: false, error: price }
      if (before && before.inputPerM === price.inputPerM && before.outputPerM === price.outputPerM) continue
      prices[id] = price
      changes.push({ feature: null, summary: `Price for ${id}`, from: before ? priceWords(before) : null, to: priceWords(price) })
    }
  }

  const features = { ...current.features }
  if (input.features !== undefined) {
    if (!isObject(input.features)) return { ok: false, error: 'The features aren’t readable.' }
    for (const [key, raw] of Object.entries(input.features)) {
      if (!(AI_FEATURES as readonly string[]).includes(key)) return { ok: false, error: `Unknown feature: ${key}.` }
      if (!isObject(raw)) return { ok: false, error: 'The features aren’t readable.' }
      const feature = key as AiFeature
      const label = AI_FEATURE_INFO[feature].label
      const before = current.features[feature]
      const next: AiFeatureConfig = { ...before }
      if (raw.provider !== undefined) {
        if (!isAiProvider(raw.provider)) return { ok: false, error: 'Choose a provider.' }
        next.provider = raw.provider
      }
      if (raw.model !== undefined) {
        if (typeof raw.model !== 'string') return { ok: false, error: 'Type the model’s ID.' }
        next.model = cleanModelId(raw.model)
      }
      if (!isModelId(next.model)) return { ok: false, error: next.model ? `“${next.model}” isn’t a model ID.` : `Choose or type the model for ${label}.` }
      if (raw.thinking !== undefined) {
        if (raw.thinking !== null && !isThinkingLevel(raw.thinking)) return { ok: false, error: 'Choose a thinking level.' }
        next.thinking = raw.thinking as ThinkingLevel | null
      }
      const listed = findModel(next.provider, next.model)
      if (listed && next.thinking && !listed.thinking.includes(next.thinking)) {
        return { ok: false, error: listed.thinking.length ? `${listed.label} doesn’t take the “${THINKING_LABELS[next.thinking]}” thinking level.` : `${listed.label} can’t be told how much to think: choose Default.` }
      }
      if (raw.enabled !== undefined) {
        if (typeof raw.enabled !== 'boolean') return { ok: false, error: 'Turn the feature on or off.' }
        next.enabled = raw.enabled
      }
      if (!priceOf(next.provider, next.model, prices)) return { ok: false, error: `Type the prices for ${next.model} (dollars per 1M tokens): it isn’t in the list.` }

      if (next.provider !== before.provider || next.model !== before.model) changes.push({ feature, summary: `${label}: model`, from: modelWords(before), to: modelWords(next) })
      if (next.thinking !== before.thinking) changes.push({ feature, summary: `${label}: thinking`, from: thinkingWords(before.thinking), to: thinkingWords(next.thinking) })
      if (next.enabled !== before.enabled) changes.push({ feature, summary: `${label}: turned ${next.enabled ? 'on' : 'off'}`, from: before.enabled ? 'On' : 'Off', to: next.enabled ? 'On' : 'Off' })
      features[feature] = next
    }
  }

  // A price removed can't leave a feature's model without one.
  for (const f of AI_FEATURES) {
    const c = features[f]
    if (!priceOf(c.provider, c.model, prices)) return { ok: false, error: `${AI_FEATURE_INFO[f].label} uses ${c.model}, which needs a price: keep it, or choose another model first.` }
  }

  let monthlyLimitUsd = current.monthlyLimitUsd
  if (input.monthlyLimitUsd !== undefined) {
    const v = input.monthlyLimitUsd
    if (v !== null && (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > MAX_LIMIT_USD)) {
      return { ok: false, error: `The monthly limit must be more than $0 and at most $${MAX_LIMIT_USD.toLocaleString('en-US')}, or no limit.` }
    }
    monthlyLimitUsd = v === null ? null : cents(v)
    if (monthlyLimitUsd !== current.monthlyLimitUsd) changes.push({ feature: null, summary: 'Monthly limit', from: limitWords(current.monthlyLimitUsd), to: limitWords(monthlyLimitUsd) })
  }

  let hourlyLimit = current.hourlyLimit
  if (input.hourlyLimit !== undefined) {
    const v = input.hourlyLimit
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 1000) return { ok: false, error: 'Requests an hour must be a whole number from 1 to 1,000.' }
    hourlyLimit = v
    if (v !== current.hourlyLimit) changes.push({ feature: null, summary: 'Requests per person an hour', from: String(current.hourlyLimit), to: String(v) })
  }

  return { ok: true, next: { features, monthlyLimitUsd, hourlyLimit, prices }, changes }
}
