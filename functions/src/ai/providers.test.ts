import { describe, expect, it, vi } from 'vitest'
import { type AiRequest, AiProviderError, ANTHROPIC_VERSION, anthropicEffort, askProvider, buildRequest, errorText, geminiThinking, openaiEffort, parseAnswer, tokensOf } from './providers'

// A made-up key: never a real one (scripts/check-repo.sh looks for key-shaped strings).
const KEY = 'test-key-not-real-1234'

const base = (over: Partial<AiRequest> = {}): AiRequest => ({
  provider: 'gemini',
  model: 'gemini-3.5-flash-lite',
  thinking: 'low',
  system: 'You write report text.',
  user: 'The figures: …',
  schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
  maxOutputTokens: 4096,
  ...over,
})

/** A fetch that answers once, and remembers what it was asked. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  })
  return { fetch: fn as unknown as typeof fetch, calls }
}

describe('Gemini', () => {
  it('sends the instructions, the text, JSON with the schema, the most it may write and the thinking level', () => {
    const http = buildRequest(base(), KEY)
    expect(http.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent')
    expect(http.headers['x-goog-api-key']).toBe(KEY)
    expect(http.body).toEqual({
      systemInstruction: { parts: [{ text: 'You write report text.' }] },
      contents: [{ role: 'user', parts: [{ text: 'The figures: …' }] }],
      generationConfig: {
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
        // Without additionalProperties, which not every Gemini model takes.
        responseJsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        thinkingConfig: { thinkingLevel: 'low' },
      },
    })
  })

  it('gives Gemini 2.5 a thinking budget, and sends no thinking setting for Default', () => {
    expect(geminiThinking('gemini-2.5-flash', 'minimal')).toEqual({ thinkingBudget: 0 })
    expect(geminiThinking('gemini-2.5-flash', 'high')).toEqual({ thinkingBudget: 12288 })
    // Typed in by hand: 2.5 still takes a budget, and Pro never less than 128.
    expect(geminiThinking('gemini-2.5-pro', 'minimal')).toEqual({ thinkingBudget: 128 })
    expect(geminiThinking('gemini-9-ultra', 'medium')).toEqual({ thinkingLevel: 'medium' })
    expect(geminiThinking('gemini-3.5-flash-lite', null)).toBeNull()
    expect((buildRequest(base({ thinking: null }), KEY).body.generationConfig as Record<string, unknown>).thinkingConfig).toBeUndefined()
  })

  it('reads the text without the thoughts, and the thinking tokens apart from the answer', () => {
    const answer = parseAnswer('gemini', {
      candidates: [{ content: { role: 'model', parts: [{ text: 'thinking…', thought: true }, { text: '{"ok":' }, { text: 'true}' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 812, candidatesTokenCount: 140, thoughtsTokenCount: 360, totalTokenCount: 1312 },
    })
    expect(answer).toEqual({ text: '{"ok":true}', finish: 'STOP', inputTokens: 812, outputTokens: 140, thinkingTokens: 360 })
  })

  it('says why there was no answer: blocked, cut off', () => {
    expect(() => parseAnswer('gemini', { promptFeedback: { blockReason: 'SAFETY' }, usageMetadata: { promptTokenCount: 10 } })).toThrow(/blocked \(SAFETY\)/)
    try {
      parseAnswer('gemini', { candidates: [{ content: { parts: [{ text: '{"ok":' }] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 4096 } })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(AiProviderError)
      expect((e as AiProviderError).message).toMatch(/cut off/)
      // What it cost is still known, to log.
      expect((e as AiProviderError).tokens).toEqual({ inputTokens: 10, outputTokens: 4096, thinkingTokens: 0 })
    }
  })
})

describe('Anthropic', () => {
  it('sends the version, the key, adaptive thinking with the effort, and the JSON schema', () => {
    const http = buildRequest(base({ provider: 'anthropic', model: 'claude-haiku-5-5', thinking: 'medium' }), KEY)
    expect(http.url).toBe('https://api.anthropic.com/v1/messages')
    expect(http.headers).toMatchObject({ 'x-api-key': KEY, 'anthropic-version': ANTHROPIC_VERSION })
    expect(http.body).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 4096,
      system: 'You write report text.',
      messages: [{ role: 'user', content: 'The figures: …' }],
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: base().schema } },
    })
    // No sampling settings: the API version refuses them.
    expect(http.body).not.toHaveProperty('temperature')
  })

  it('asks "minimal" as low effort, and Default as the model’s own', () => {
    expect(anthropicEffort('claude-sonnet-5-5', 'minimal')).toBe('low')
    expect(anthropicEffort('claude-sonnet-5-5', 'high')).toBe('high')
    const body = buildRequest(base({ provider: 'anthropic', model: 'claude-opus-5-5', thinking: null }), KEY).body
    expect(body).not.toHaveProperty('thinking')
    expect(body.output_config).toEqual({ format: { type: 'json_schema', schema: base().schema } })
  })

  it('reads the text blocks and counts the thinking inside the output tokens apart', () => {
    const answer = parseAnswer('anthropic', {
      content: [
        { type: 'thinking', thinking: '', signature: 'sig' },
        { type: 'text', text: '{"ok":true}' },
      ],
      stop_reason: 'end_turn',
      usage: { input_tokens: 900, cache_read_input_tokens: 0, output_tokens: 500, output_tokens_details: { thinking_tokens: 320 } },
    })
    expect(answer).toEqual({ text: '{"ok":true}', finish: 'end_turn', inputTokens: 900, outputTokens: 180, thinkingTokens: 320 })
    // Without the breakdown, every output token counts as the answer's.
    expect(tokensOf('anthropic', { usage: { input_tokens: 5, output_tokens: 7 } })).toEqual({ inputTokens: 5, outputTokens: 7, thinkingTokens: 0 })
  })

  it('treats a refusal and a cut-off answer as failures', () => {
    expect(() => parseAnswer('anthropic', { content: [], stop_reason: 'refusal', usage: { input_tokens: 5, output_tokens: 0 } })).toThrow(/declined/)
    expect(() => parseAnswer('anthropic', { content: [{ type: 'text', text: '{"ok":' }], stop_reason: 'max_tokens', usage: {} })).toThrow(/cut off/)
  })
})

describe('OpenAI', () => {
  it('sends the instructions, the text, the reasoning effort and a strict JSON schema, and keeps nothing stored', () => {
    const http = buildRequest(base({ provider: 'openai', model: 'gpt-5-nano', thinking: 'minimal' }), KEY)
    expect(http.url).toBe('https://api.openai.com/v1/responses')
    expect(http.headers.authorization).toBe(`Bearer ${KEY}`)
    expect(http.body).toEqual({
      model: 'gpt-5-nano',
      instructions: 'You write report text.',
      input: 'The figures: …',
      max_output_tokens: 4096,
      store: false,
      reasoning: { effort: 'minimal' },
      text: { format: { type: 'json_schema', name: 'answer', schema: base().schema, strict: true } },
    })
    expect(openaiEffort('gpt-5-mini', null)).toBeNull()
    expect(buildRequest(base({ provider: 'openai', model: 'gpt-5', thinking: null, schema: null }), KEY).body).toMatchObject({ text: { format: { type: 'json_object' } } })
  })

  it('reads the message’s text, and the reasoning tokens apart from the answer', () => {
    const answer = parseAnswer('openai', {
      status: 'completed',
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '{"ok":true}', annotations: [] }] },
      ],
      usage: { input_tokens: 700, input_tokens_details: { cached_tokens: 0 }, output_tokens: 260, output_tokens_details: { reasoning_tokens: 192 }, total_tokens: 960 },
    })
    expect(answer).toEqual({ text: '{"ok":true}', finish: 'completed', inputTokens: 700, outputTokens: 68, thinkingTokens: 192 })
  })

  it('treats an incomplete answer and a refusal as failures', () => {
    expect(() => parseAnswer('openai', { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [], usage: {} })).toThrow(/cut off \(max_output_tokens\)/)
    expect(() =>
      parseAnswer('openai', { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'I can’t help with that.' }] }], usage: {} }),
    ).toThrow(/declined/)
  })
})

describe('askProvider', () => {
  it('posts the request and returns the answer with the time it took', async () => {
    const { fetch, calls } = fakeFetch(200, { candidates: [{ content: { parts: [{ text: '{"ok":true}' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 6 } })
    const answer = await askProvider(base(), KEY, { fetch })
    expect(answer.text).toBe('{"ok":true}')
    expect(answer.inputTokens).toBe(20)
    expect(answer.ms).toBeGreaterThanOrEqual(0)
    expect(calls).toHaveLength(1)
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual(buildRequest(base(), KEY).body)
  })

  it('turns an error answer into the provider’s own words, without the key', async () => {
    const { fetch } = fakeFetch(400, { error: { code: 400, message: `API key not valid: ${KEY}`, status: 'INVALID_ARGUMENT' } })
    const e = await askProvider(base(), KEY, { fetch }).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(AiProviderError)
    expect((e as AiProviderError).status).toBe(400)
    expect((e as AiProviderError).message).toBe('Google Gemini answered 400: INVALID_ARGUMENT: API key not valid: [key]')
  })

  it('gives up after the timeout', async () => {
    const slow = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason))))
    const e = await askProvider(base(), KEY, { fetch: slow as unknown as typeof fetch, timeoutMs: 20 }).catch((x: unknown) => x)
    expect((e as Error).message).toBe('No answer within 1 second.')
  })
})

describe('errorText', () => {
  it('reads each provider’s error shape', () => {
    expect(errorText('anthropic', 401, JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }))).toBe(
      'Anthropic Claude answered 401: authentication_error: invalid x-api-key',
    )
    expect(errorText('openai', 429, JSON.stringify({ error: { message: 'Rate limit reached', type: 'requests', code: 'rate_limit_exceeded' } }))).toBe(
      'OpenAI answered 429: requests: Rate limit reached',
    )
    expect(errorText('gemini', 503, 'Service Unavailable')).toBe('Google Gemini answered 503: Service Unavailable')
  })
})
