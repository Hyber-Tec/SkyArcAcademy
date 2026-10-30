import type { AiPrice } from './types'

/** A request's tokens: the prompt, the answer, and the thinking before it (billed as output by every provider). */
export interface AiTokens {
  inputTokens: number
  outputTokens: number
  thinkingTokens: number
}

const count = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0)

/** Dollars, to a millionth: input at the input price, the answer and the thinking at the output price. */
export function aiCostUsd(tokens: AiTokens, price: AiPrice | null): number {
  if (!price) return 0
  const dollars = (count(tokens.inputTokens) * price.inputPerM + (count(tokens.outputTokens) + count(tokens.thinkingTokens)) * price.outputPerM) / 1_000_000
  return Math.round(dollars * 1_000_000) / 1_000_000
}

/** "$12.34", "$0.42", and three figures below 10 cents ("$0.0127", "$0.00042"): what a single request costs. */
export function formatUsd(amount: number): string {
  if (!amount) return '$0.00'
  if (Math.abs(amount) >= 0.1) return `$${amount.toFixed(2)}`
  if (Math.abs(amount) < 0.000001) return '<$0.000001'
  const digits = Math.min(6, 2 - Math.floor(Math.log10(Math.abs(amount))))
  return `$${amount.toFixed(digits).replace(/0+$/, '')}`
}

/** "1,234" tokens. */
export function formatTokens(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** A price per 1M tokens: "$0.10", "$2.50", "$0.075". */
export function formatPrice(n: number): string {
  const cents = n * 100
  return Math.abs(cents - Math.round(cents)) < 1e-9 ? `$${n.toFixed(2)}` : `$${String(Math.round(n * 1e6) / 1e6)}`
}

/** "$0.10 in · $0.40 out per 1M tokens". */
export function priceWords(price: AiPrice | null): string {
  if (!price) return 'No price'
  return `${formatPrice(price.inputPerM)} in · ${formatPrice(price.outputPerM)} out per 1M tokens`
}
