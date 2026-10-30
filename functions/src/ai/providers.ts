import type { AiTokens } from '@shared/ai/cost'
import { AI_PROVIDER_INFO, findModel } from '@shared/ai/models'
import type { AiProvider, ThinkingLevel } from '@shared/ai/types'

/**
 * The AI providers, each over its own HTTP API with plain `fetch` (no SDKs): Google's Gemini API (`generateContent`),
 * Anthropic's Messages API and OpenAI's Responses API. Each builds its request from the same parts (instructions, the
 * user's text, the JSON the answer must be, the thinking level, the most it may write), and reads back the text and the
 * tokens used. Server only: the keys never leave Cloud Functions. Pure apart from `askProvider`'s fetch, so the tests
 * check every request and answer without a network.
 */

export interface AiRequest {
  provider: AiProvider
  model: string
  thinking: ThinkingLevel | null
  /** The instructions. */
  system: string
  /** What to write from. */
  user: string
  /** The answer's JSON schema, for the providers that hold an answer to one; the instructions describe it too. */
  schema?: Record<string, unknown> | null
  maxOutputTokens: number
}

export interface AiAnswer extends AiTokens {
  text: string
  /** How the provider said it ended ("STOP", "end_turn", "completed"). */
  finish: string | null
}

/** A provider's refusal, an error, or an answer that can't be used; with the tokens it still cost, when it says. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly tokens: AiTokens | null = null,
  ) {
    super(message)
    this.name = 'AiProviderError'
  }
}

export interface ProviderHttp {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/** The Messages API version this code is written for. */
export const ANTHROPIC_VERSION = '2026-10-21'

/** Gemini 2.5's thinking budgets (tokens) for a model typed in by hand; listed models carry their own. */
const GEMINI_BUDGETS: Record<ThinkingLevel, number> = { minimal: 0, low: 1024, medium: 4096, high: 12288 }

/** A level as the provider's own value: the list's (`wire`) when it has one, else the level's name. */
function wireOf(provider: AiProvider, model: string, level: ThinkingLevel): string | number | null {
  return findModel(provider, model)?.wire?.[level] ?? null
}

/** Gemini: a thinking level (Gemini 3 and later), or a token budget (Gemini 2.5). */
export function geminiThinking(model: string, level: ThinkingLevel | null): Record<string, unknown> | null {
  if (!level) return null
  const wire = wireOf('gemini', model, level)
  if (typeof wire === 'number') return { thinkingBudget: wire }
  if (typeof wire === 'string') return { thinkingLevel: wire }
  if (!findModel('gemini', model) && /^gemini-2\./.test(model)) {
    // Gemini 2.5 Pro can't stop thinking: its smallest budget is 128.
    return { thinkingBudget: level === 'minimal' && /pro/.test(model) ? 128 : GEMINI_BUDGETS[level] }
  }
  return { thinkingLevel: level }
}

/** Claude: adaptive thinking, its depth set by the effort (low, medium or high; "minimal" asks for low). */
export function anthropicEffort(model: string, level: ThinkingLevel | null): string | null {
  if (!level) return null
  const wire = wireOf('anthropic', model, level)
  if (typeof wire === 'string') return wire
  return level === 'minimal' ? 'low' : level
}

/** OpenAI: the reasoning effort, as the level's name unless the list says otherwise. */
export function openaiEffort(model: string, level: ThinkingLevel | null): string | null {
  if (!level) return null
  const wire = wireOf('openai', model, level)
  return typeof wire === 'string' ? wire : level
}

/**
 * A schema without `additionalProperties`, for Gemini: it answers with the properties the schema names anyway, and
 * the keyword isn't one every Gemini model takes. Anthropic and OpenAI (strict) need it.
 */
export function plainSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(plainSchema)
  if (typeof schema !== 'object' || schema === null) return schema
  return Object.fromEntries(Object.entries(schema).filter(([k]) => k !== 'additionalProperties').map(([k, v]) => [k, plainSchema(v)]))
}

/** The HTTP request for a provider: where it goes, its headers (with the key) and its body. */
export function buildRequest(req: AiRequest, key: string): ProviderHttp {
  switch (req.provider) {
    case 'gemini': {
      const thinkingConfig = geminiThinking(req.model, req.thinking)
      return {
        url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model)}:generateContent`,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.user }] }],
          generationConfig: {
            maxOutputTokens: req.maxOutputTokens,
            responseMimeType: 'application/json',
            ...(req.schema ? { responseJsonSchema: plainSchema(req.schema) } : {}),
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        },
      }
    }
    case 'anthropic': {
      const effort = anthropicEffort(req.model, req.thinking)
      const outputConfig = { ...(effort ? { effort } : {}), ...(req.schema ? { format: { type: 'json_schema', schema: req.schema } } : {}) }
      return {
        url: 'https://api.anthropic.com/v1/messages',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': ANTHROPIC_VERSION },
        body: {
          model: req.model,
          max_tokens: req.maxOutputTokens,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
          ...(effort ? { thinking: { type: 'adaptive' } } : {}),
          ...(Object.keys(outputConfig).length ? { output_config: outputConfig } : {}),
        },
      }
    }
    case 'openai': {
      const effort = openaiEffort(req.model, req.thinking)
      return {
        url: 'https://api.openai.com/v1/responses',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: {
          model: req.model,
          instructions: req.system,
          input: req.user,
          max_output_tokens: req.maxOutputTokens,
          // Nothing is kept at OpenAI after the answer: the request holds a student's first name and scores.
          store: false,
          ...(effort ? { reasoning: { effort } } : {}),
          text: { format: req.schema ? { type: 'json_schema', name: 'answer', schema: req.schema, strict: true } : { type: 'json_object' } },
        },
      }
    }
  }
}

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Json) : {})
const list = (v: unknown): Json[] => (Array.isArray(v) ? v.map(obj) : [])
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0)

/** The tokens an answer used, as each provider reports them: thinking apart from the answer. */
export function tokensOf(provider: AiProvider, json: unknown): AiTokens {
  const j = obj(json)
  switch (provider) {
    case 'gemini': {
      // candidatesTokenCount leaves out the thinking, which comes as thoughtsTokenCount.
      const u = obj(j.usageMetadata)
      return { inputTokens: num(u.promptTokenCount), outputTokens: num(u.candidatesTokenCount), thinkingTokens: num(u.thoughtsTokenCount) }
    }
    case 'anthropic': {
      // output_tokens counts the thinking too; its share is in output_tokens_details when the API gives it.
      const u = obj(j.usage)
      const thinking = num(obj(u.output_tokens_details).thinking_tokens)
      return {
        inputTokens: num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens),
        outputTokens: Math.max(0, num(u.output_tokens) - thinking),
        thinkingTokens: thinking,
      }
    }
    case 'openai': {
      // output_tokens counts the reasoning too; its share is output_tokens_details.reasoning_tokens.
      const u = obj(j.usage)
      const reasoning = num(obj(u.output_tokens_details).reasoning_tokens)
      return { inputTokens: num(u.input_tokens), outputTokens: Math.max(0, num(u.output_tokens) - reasoning), thinkingTokens: reasoning }
    }
  }
}

/** The answer's text and tokens; an AiProviderError (with the tokens) when it was refused, cut off or empty. */
export function parseAnswer(provider: AiProvider, json: unknown): AiAnswer {
  const j = obj(json)
  const tokens = tokensOf(provider, json)
  const fail = (message: string): never => {
    throw new AiProviderError(message, null, tokens)
  }
  let text = ''
  let finish: string | null = null
  switch (provider) {
    case 'gemini': {
      const candidate = list(j.candidates)[0]
      if (!candidate) {
        const blocked = obj(j.promptFeedback).blockReason
        return fail(blocked ? `The request was blocked (${String(blocked)}).` : 'The answer had no text.')
      }
      finish = typeof candidate.finishReason === 'string' ? candidate.finishReason : null
      text = list(obj(candidate.content).parts)
        .filter((p) => p.thought !== true && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join('')
      if (finish === 'MAX_TOKENS') fail('The answer was cut off: it reached the most it may write.')
      if (finish && finish !== 'STOP' && !text) fail(`The answer stopped (${finish}).`)
      break
    }
    case 'anthropic': {
      finish = typeof j.stop_reason === 'string' ? j.stop_reason : null
      text = list(j.content)
        .filter((b) => b.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text as string)
        .join('')
      if (finish === 'refusal') fail('The model declined to answer (refusal).')
      if (finish === 'max_tokens') fail('The answer was cut off: it reached the most it may write.')
      break
    }
    case 'openai': {
      finish = typeof j.status === 'string' ? j.status : null
      if (finish === 'failed') fail(String(obj(j.error).message ?? 'The request failed.'))
      if (finish === 'incomplete') fail(`The answer was cut off (${String(obj(j.incomplete_details).reason ?? 'incomplete')}).`)
      const parts = list(j.output)
        .filter((o) => o.type === 'message')
        .flatMap((o) => list(o.content))
      text = parts
        .filter((p) => p.type === 'output_text' && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join('')
      const refusal = parts.find((p) => p.type === 'refusal')
      if (refusal && !text) fail(`The model declined to answer: ${String(refusal.refusal ?? '')}`.trim())
      break
    }
  }
  if (!text.trim()) fail('The answer had no text.')
  return { text, finish, ...tokens }
}

/** A provider's error answer in a line: its status and its own message. */
export function errorText(provider: AiProvider, status: number, body: string): string {
  let message = ''
  try {
    const e = obj(obj(JSON.parse(body)).error)
    message = [e.status ?? e.type ?? e.code, e.message].filter((x) => typeof x === 'string' && x).join(': ')
  } catch {
    // not JSON
  }
  return `${AI_PROVIDER_INFO[provider].label} answered ${status}${message ? `: ${message}` : body.trim() ? `: ${body.trim().slice(0, 300)}` : ''}`.slice(0, 500)
}

/** Takes the key out of any text that might echo it. */
function scrub(text: string, key: string): string {
  return key ? text.split(key).join('[key]') : text
}

export interface AskOptions {
  fetch?: typeof fetch
  timeoutMs?: number
}

/** Sends the request and reads the answer, in at most `timeoutMs`; every failure is an AiProviderError. */
export async function askProvider(req: AiRequest, key: string, opts: AskOptions = {}): Promise<AiAnswer & { ms: number }> {
  const doFetch = opts.fetch ?? fetch
  const timeoutMs = opts.timeoutMs ?? 60_000
  const http = buildRequest(req, key)
  const started = Date.now()
  let res: Response
  try {
    res = await doFetch(http.url, { method: 'POST', headers: http.headers, body: JSON.stringify(http.body), signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    const name = (e as Error)?.name
    const s = Math.max(1, Math.round(timeoutMs / 1000))
    if (name === 'TimeoutError' || name === 'AbortError') throw new AiProviderError(`No answer within ${s} second${s === 1 ? '' : 's'}.`)
    throw new AiProviderError(scrub(`Couldn’t reach ${AI_PROVIDER_INFO[req.provider].label}: ${(e as Error)?.message ?? String(e)}`, key))
  }
  const body = await res.text()
  if (!res.ok) throw new AiProviderError(scrub(errorText(req.provider, res.status, body), key), res.status)
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    throw new AiProviderError(`${AI_PROVIDER_INFO[req.provider].label} answered something that isn’t JSON.`, res.status)
  }
  try {
    return { ...parseAnswer(req.provider, json), ms: Date.now() - started }
  } catch (e) {
    if (e instanceof AiProviderError) throw new AiProviderError(scrub(e.message, key), res.status, e.tokens)
    throw e
  }
}
