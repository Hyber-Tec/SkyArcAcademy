import { describe, expect, it } from 'vitest'
import { AI_DEFAULTS, featureReady, publicAiDoc, resolveAiConfig } from './config'
import { aiCostUsd, formatPrice, formatUsd } from './cost'
import { HOUR_MS, hourlyCheck, monthlyLimitMessage } from './limits'
import { AI_MODELS, findModel, priceOf, recommendedModel, thinkingLevelsOf } from './models'
import { checkAiSettings } from './settings'
import { spendRange, usageBy, usageTotals, type UsageRow } from './usage'

describe('cost', () => {
  it('prices input at the input rate, and the answer and the thinking at the output rate', () => {
    // 1,000 in at $0.10/1M, 200 out + 800 thinking at $0.40/1M.
    expect(aiCostUsd({ inputTokens: 1000, outputTokens: 200, thinkingTokens: 800 }, { inputPerM: 0.1, outputPerM: 0.4 })).toBe(0.0005)
    expect(aiCostUsd({ inputTokens: 1_000_000, outputTokens: 1_000_000, thinkingTokens: 0 }, { inputPerM: 2, outputPerM: 10 })).toBe(12)
    // Rounded to a millionth of a dollar.
    expect(aiCostUsd({ inputTokens: 1, outputTokens: 1, thinkingTokens: 1 }, { inputPerM: 0.1, outputPerM: 0.4 })).toBe(0.000001)
  })

  it('is 0 without a price, and ignores counts that aren’t counts', () => {
    expect(aiCostUsd({ inputTokens: 1000, outputTokens: 1000, thinkingTokens: 0 }, null)).toBe(0)
    expect(aiCostUsd({ inputTokens: Number.NaN, outputTokens: -5, thinkingTokens: 1000 }, { inputPerM: 1, outputPerM: 1 })).toBe(0.001)
  })

  it('writes dollars for totals and for single requests', () => {
    expect(formatUsd(0)).toBe('$0.00')
    expect(formatUsd(12.345)).toBe('$12.35')
    expect(formatUsd(0.42)).toBe('$0.42')
    expect(formatUsd(0.0127)).toBe('$0.0127')
    expect(formatUsd(0.05)).toBe('$0.05')
    expect(formatUsd(0.0042)).toBe('$0.0042')
    expect(formatUsd(0.000123)).toBe('$0.000123')
    expect(formatPrice(0.1)).toBe('$0.10')
    expect(formatPrice(0.075)).toBe('$0.075')
  })
})

describe('limits', () => {
  it('refuses once the month’s spend reaches the limit; no limit never refuses', () => {
    expect(monthlyLimitMessage(9.99, 10)).toBeNull()
    expect(monthlyLimitMessage(10, 10)).toMatch(/this month’s spending limit \(\$10\.00\)/)
    expect(monthlyLimitMessage(1_000_000, null)).toBeNull()
  })

  it('counts a person’s requests in the last hour, and says when to try again', () => {
    const now = 10 * HOUR_MS
    const times = [now - HOUR_MS - 1, now - 50 * 60_000, now - 10 * 60_000]
    // The one older than an hour is dropped; this request is added.
    expect(hourlyCheck(times, now, 3)).toEqual({ ok: true, keep: [now - 50 * 60_000, now - 10 * 60_000, now], message: null })
    const full = hourlyCheck([now - 50 * 60_000, now - 10 * 60_000], now, 2)
    expect(full.ok).toBe(false)
    expect(full.message).toBe('You’ve asked AI 2 times in the last hour, the most allowed. Try again in 10 minutes.')
  })
})

describe('the model list', () => {
  it('has one recommended model per provider, each with a price', () => {
    for (const p of ['gemini', 'anthropic', 'openai'] as const) {
      expect(recommendedModel(p).recommended).toBe(true)
      expect(AI_MODELS.filter((m) => m.provider === p && m.recommended)).toHaveLength(1)
    }
    for (const m of AI_MODELS) {
      expect(m.inputPerM).toBeGreaterThanOrEqual(0)
      expect(m.outputPerM).toBeGreaterThanOrEqual(m.inputPerM)
    }
    expect(new Set(AI_MODELS.map((m) => `${m.provider}:${m.id}`)).size).toBe(AI_MODELS.length)
  })

  it('takes a price typed in over the list’s, and all thinking levels for a model typed in', () => {
    const listed = AI_MODELS[0]
    expect(priceOf(listed.provider, listed.id)).toEqual({ inputPerM: listed.inputPerM, outputPerM: listed.outputPerM })
    expect(priceOf(listed.provider, listed.id, { [listed.id]: { inputPerM: 9, outputPerM: 9 } })).toEqual({ inputPerM: 9, outputPerM: 9 })
    expect(priceOf('openai', 'made-up-model')).toBeNull()
    expect(thinkingLevelsOf('openai', 'made-up-model')).toEqual(['minimal', 'low', 'medium', 'high'])
    expect(findModel('gemini', 'made-up-model')).toBeNull()
  })
})

describe('the config', () => {
  it('starts every feature off, on the recommended model, with the default limits', () => {
    const c = resolveAiConfig(null)
    expect(c.features.reportText).toEqual({ provider: 'anthropic', model: recommendedModel('anthropic').id, thinking: 'low', enabled: false })
    expect(c.monthlyLimitUsd).toBe(AI_DEFAULTS.monthlyLimitUsd)
    expect(c.hourlyLimit).toBe(AI_DEFAULTS.hourlyLimit)
    // A limit taken off stays off.
    expect(resolveAiConfig({ monthlyLimitUsd: null }).monthlyLimitUsd).toBeNull()
  })

  it('is ready for a feature only when it’s on and its provider has a key', () => {
    const on = resolveAiConfig({ features: { reportText: { provider: 'anthropic', model: 'claude-haiku-5-5', thinking: 'low', enabled: true } } })
    expect(featureReady(on, 'reportText')).toBe(false)
    const keyed = { ...on, providers: { anthropic: { keyLast4: 'abcd', keySetAt: null, keySetBy: { uid: 'u', email: 'a@example.test', name: 'A' } } } }
    expect(publicAiDoc(keyed)).toEqual({ reportText: true })
    expect(publicAiDoc({ ...keyed, features: { reportText: { ...keyed.features.reportText, enabled: false } } })).toEqual({ reportText: false })
  })
})

describe('saving the settings', () => {
  const current = resolveAiConfig(null)

  it('changes a feature’s model, thinking and switch, with a history line for each', () => {
    const r = checkAiSettings({ features: { reportText: { provider: 'gemini', model: ' gemini-3.5-flash-lite ', thinking: 'medium', enabled: true } } }, current)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.next.features.reportText).toEqual({ provider: 'gemini', model: 'gemini-3.5-flash-lite', thinking: 'medium', enabled: true })
    expect(r.changes.map((c) => c.summary)).toEqual(['Report text: model', 'Report text: thinking', 'Report text: turned on'])
    expect(r.changes[0]).toMatchObject({ feature: 'reportText', from: `Anthropic Claude · ${recommendedModel('anthropic').id}`, to: 'Google Gemini · gemini-3.5-flash-lite' })
  })

  it('needs prices for a model typed in, and keeps them', () => {
    expect(checkAiSettings({ features: { reportText: { provider: 'openai', model: 'made-up-model' } } }, current)).toEqual({
      ok: false,
      error: 'Type the prices for made-up-model (dollars per 1M tokens): it isn’t in the list.',
    })
    const r = checkAiSettings({ prices: { 'made-up-model': { inputPerM: 1, outputPerM: 4 } }, features: { reportText: { provider: 'openai', model: 'made-up-model', thinking: 'low' } } }, current)
    expect(r.ok && r.next.prices['made-up-model']).toEqual({ inputPerM: 1, outputPerM: 4 })
    expect(r.ok && r.changes[0]).toMatchObject({ summary: 'Price for made-up-model', from: null, to: '$1.00 in · $4.00 out per 1M tokens' })
  })

  it('won’t remove the price of the model a feature uses', () => {
    const withPrice = resolveAiConfig({ prices: { 'made-up-model': { inputPerM: 1, outputPerM: 4 } }, features: { reportText: { provider: 'openai', model: 'made-up-model', thinking: null, enabled: true } } })
    const r = checkAiSettings({ prices: { 'made-up-model': null } }, withPrice)
    expect(r).toEqual({ ok: false, error: 'Report text uses made-up-model, which needs a price: keep it, or choose another model first.' })
  })

  it('refuses a thinking level the listed model doesn’t take, and odd values', () => {
    const pro = AI_MODELS.find((m) => m.provider === 'gemini' && !m.thinking.includes('minimal'))!
    expect(checkAiSettings({ features: { reportText: { provider: 'gemini', model: pro.id, thinking: 'minimal' } } }, current).ok).toBe(false)
    expect(checkAiSettings({ features: { reportText: { model: 'bad id with spaces' } } }, current).ok).toBe(false)
    expect(checkAiSettings({ features: { other: {} } }, current).ok).toBe(false)
    expect(checkAiSettings({ monthlyLimitUsd: -1 }, current).ok).toBe(false)
    expect(checkAiSettings({ hourlyLimit: 2.5 }, current).ok).toBe(false)
    expect(checkAiSettings('nope', current).ok).toBe(false)
  })

  it('sets the limits, and saves nothing when nothing changed', () => {
    const r = checkAiSettings({ monthlyLimitUsd: 25.456, hourlyLimit: 50 }, current)
    expect(r.ok && r.next.monthlyLimitUsd).toBe(25.46)
    expect(r.ok && r.changes.map((c) => [c.summary, c.from, c.to])).toEqual([
      ['Monthly limit', '$10.00', '$25.46'],
      ['Requests per person an hour', '30', '50'],
    ])
    expect(checkAiSettings({ monthlyLimitUsd: null }, current)).toMatchObject({ ok: true, changes: [{ summary: 'Monthly limit', to: 'No limit' }] })
    expect(checkAiSettings({ hourlyLimit: 30, features: { reportText: {} } }, current)).toMatchObject({ ok: true, changes: [] })
  })
})

describe('spend', () => {
  const by = (email: string, name: string) => ({ uid: email, email, name })
  const row = (over: Partial<UsageRow>): UsageRow => ({
    feature: 'reportText',
    provider: 'gemini',
    model: recommendedModel('gemini').id,
    inputTokens: 1000,
    outputTokens: 300,
    thinkingTokens: 200,
    costUsd: 0.0003,
    ok: true,
    by: by('a@example.test', 'Ann'),
    ...over,
  })

  it('adds up the requests, the failed ones, the tokens and the dollars', () => {
    const rows = [row({}), row({ ok: false, costUsd: 0.0001, outputTokens: 0 }), row({ feature: 'test', provider: 'anthropic', model: 'claude-haiku-5-5', costUsd: 0.002, by: by('b@example.test', 'Ben') })]
    expect(usageTotals(rows)).toEqual({ requests: 3, failed: 1, inputTokens: 3000, outputTokens: 600, thinkingTokens: 600, costUsd: 0.0024 })
    expect(usageBy(rows, 'feature').map((l) => [l.label, l.requests, l.costUsd])).toEqual([
      ['Test', 1, 0.002],
      ['Report text', 2, 0.0004],
    ])
    expect(usageBy(rows, 'model').map((l) => l.label)).toEqual(['Claude Haiku 5.5', recommendedModel('gemini').label])
    expect(usageBy(rows, 'person').map((l) => [l.label, l.detail])).toEqual([
      ['Ben', 'b@example.test'],
      ['Ann', 'a@example.test'],
    ])
  })

  it('works out the date ranges', () => {
    expect(spendRange('this_month', '2026-10-29')).toEqual({ from: '2026-10-01', to: '2026-10-29' })
    expect(spendRange('last_month', '2026-10-29')).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(spendRange('last_30', '2026-10-29')).toEqual({ from: '2026-09-30', to: '2026-10-29' })
  })
})
