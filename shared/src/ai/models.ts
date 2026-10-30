import { type AiPrice, type AiProvider, THINKING_LEVELS, type ThinkingLevel } from './types'

/**
 * The models the AI page offers (Settings → AI), with their prices. Any other model ID can be typed in, with its
 * prices (`aiConfig/main.prices`), and a price typed for a listed model wins over the list's: providers change prices
 * and add models faster than the app is released.
 */

export interface AiProviderInfo {
  label: string
  /** Where a super admin makes a key. */
  keyUrl: string
  keyWhere: string
  /** Where the provider lists its models and prices, to check this list. */
  pricesUrl: string
}

/** The only place outside the AI page's own text that names providers: the AI page (super admins only). */
export const AI_PROVIDER_INFO: Record<AiProvider, AiProviderInfo> = {
  gemini: {
    label: 'Google Gemini',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyWhere: 'Google AI Studio → Get API key',
    pricesUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
  anthropic: {
    label: 'Anthropic Claude',
    keyUrl: 'https://platform.claude.com/settings/keys',
    keyWhere: 'Claude Console → Settings → API keys',
    pricesUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
  },
  openai: {
    label: 'OpenAI',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyWhere: 'OpenAI Platform → API keys',
    pricesUrl: 'https://platform.openai.com/docs/pricing',
  },
}

export interface AiModel extends AiPrice {
  provider: AiProvider
  /** The provider's model ID, as its API takes it. */
  id: string
  label: string
  /** The thinking levels it takes; empty when it can't be told how much to think. */
  thinking: readonly ThinkingLevel[]
  /**
   * The provider's own value for a level, when it isn't the level's name: Gemini 2.5's thinking budgets (tokens),
   * OpenAI's `none` where a model has no `minimal`.
   */
  wire?: Partial<Record<ThinkingLevel, string | number>>
  /** A good first choice for the app's short texts: cheap, quick and good enough. */
  recommended?: boolean
  note?: string
}

/** When the list's prices were last checked against the providers' pages. */
export const AI_MODELS_CHECKED = '2026-10-30'

const ALL = THINKING_LEVELS
const LMH: readonly ThinkingLevel[] = ['low', 'medium', 'high']

export const AI_MODELS: readonly AiModel[] = [
  // Anthropic Claude: thinking is adaptive, its depth set by the effort ("minimal" asks for low). Sonnet 5.5 at low is the
  // first choice for report text (checked 2026-10-30: plain writing that keeps to the figures, about $6 a month here).
  { provider: 'anthropic', id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', inputPerM: 2, outputPerM: 10, thinking: LMH, recommended: true, note: 'Good writing; about $6 a month here' },
  { provider: 'anthropic', id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', inputPerM: 0.1, outputPerM: 0.5, thinking: LMH, note: 'Cheapest Claude; under $1 a month here' },
  { provider: 'anthropic', id: 'claude-opus-5-5', label: 'Claude Opus 5.5', inputPerM: 4, outputPerM: 20, thinking: LMH, note: 'Best; thinks every time' },
  // Google Gemini (Gemini 3 and later take a thinking level). 3.8 Flash and 4 Argon take no "minimal".
  { provider: 'gemini', id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', inputPerM: 0.3, outputPerM: 2.5, thinking: ALL, recommended: true, note: 'Cheapest Gemini' },
  { provider: 'gemini', id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', inputPerM: 0.75, outputPerM: 3.75, thinking: LMH, note: 'Doubles to $1.50 / $7.50 on Jan 1, 2027' },
  { provider: 'gemini', id: 'gemini-4-argon', label: 'Gemini 4 Argon', inputPerM: 2, outputPerM: 10, thinking: LMH, note: 'Doubles to $4 / $20 on Dec 1, 2026' },
  { provider: 'gemini', id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', inputPerM: 0.25, outputPerM: 1.5, thinking: ALL, note: 'Shuts down May 7, 2027' },
  // OpenAI, through the Responses API: the reasoning effort ("minimal" is their "none" where a model has it).
  { provider: 'openai', id: 'gpt-6-luna', label: 'GPT-6 Luna', inputPerM: 0.1, outputPerM: 0.5, thinking: ALL, wire: { minimal: 'none' }, recommended: true, note: 'Cheapest' },
  { provider: 'openai', id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', inputPerM: 1, outputPerM: 5, thinking: ALL, wire: { minimal: 'none' } },
  { provider: 'openai', id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', inputPerM: 2, outputPerM: 10, thinking: LMH },
]

/** The listed models of a provider, recommended first. */
export function modelsOf(provider: AiProvider): AiModel[] {
  return AI_MODELS.filter((m) => m.provider === provider).sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended))
}

export function findModel(provider: AiProvider, id: string): AiModel | null {
  return AI_MODELS.find((m) => m.provider === provider && m.id === id) ?? null
}

/** The provider's recommended model: where a new feature starts. */
export function recommendedModel(provider: AiProvider): AiModel {
  return modelsOf(provider)[0]
}

/** The thinking levels a model takes: the list's, or all four for a model typed in by hand (its provider decides). */
export function thinkingLevelsOf(provider: AiProvider, id: string): readonly ThinkingLevel[] {
  return findModel(provider, id)?.thinking ?? THINKING_LEVELS
}

/** A model's price: one typed in on the AI page first, else the list's; null when neither has one. */
export function priceOf(provider: AiProvider, id: string, prices: Readonly<Record<string, AiPrice>> = {}): AiPrice | null {
  const typed = prices[id]
  if (typed) return { inputPerM: typed.inputPerM, outputPerM: typed.outputPerM }
  const listed = findModel(provider, id)
  return listed ? { inputPerM: listed.inputPerM, outputPerM: listed.outputPerM } : null
}

/** "gemini-3.5-flash-lite" as the provider's API wants it: trimmed, without Gemini's "models/" prefix. */
export function cleanModelId(id: string): string {
  return id.trim().replace(/^models\//, '')
}

/** Model IDs are short and plain: letters, digits and . _ - : @ only. */
export function isModelId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,99}$/.test(id)
}
