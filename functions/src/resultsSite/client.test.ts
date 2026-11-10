import { afterEach, describe, expect, it, vi } from 'vitest'
import { SITE_API, SiteClient, SiteError } from './client'

// The results site's API, answered here by made-up pages: no request leaves the computer.
const answer = (status: number, body: unknown) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('the results site’s client', () => {
  it('sends the key, and pages through a list until its last page', async () => {
    const seen: string[] = []
    const pages = [
      { MatchParticipantList: { Items: [{ n: 1 }, { n: 2 }], NextToken: 2, LastUpdated: 'first' } },
      { MatchParticipantList: { Items: [{ n: 3 }], NextToken: '' } },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        seen.push(url)
        expect((init.headers as Record<string, string>)['x-api-key']).toBe('made-up-key')
        return answer(200, pages[seen.length - 1])
      }),
    )
    const client = new SiteClient('made-up-key', 10, 0)
    const { items, head } = await client.list<{ n: number }>('/match/m%201/participant', { limit: 100 }, 'MatchParticipantList', 5)
    expect(items.map((i) => i.n)).toEqual([1, 2, 3])
    expect(head?.LastUpdated).toBe('first')
    expect(seen).toEqual([`${SITE_API}/match/m%201/participant?limit=100`, `${SITE_API}/match/m%201/participant?limit=100&token=2`])
    expect(client.requests).toBe(2)
  })

  it('stops on an empty page or a token that repeats', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => answer(200, { ResultList: { Items: [{ n: 1 }], NextToken: 7 } })))
    const client = new SiteClient('made-up-key', 10, 0)
    const { items } = await client.list('/match/m/result-list/Team%20-%20All', {}, 'ResultList', 5)
    // The first page, then the same token again: stop.
    expect(items).toHaveLength(2)
    expect(client.requests).toBe(2)
  })

  it('takes what isn’t there or isn’t public as nothing, and a refused key as a stop', async () => {
    const replies = [answer(404, {}), answer(401, { Message: ['Child has not been approved'] }), answer(500, 'Unable to convert the result'), answer(403, { message: 'Forbidden' })]
    vi.stubGlobal('fetch', vi.fn(async () => replies.shift()))
    const client = new SiteClient('made-up-key', 10, 0)
    expect(await client.get('/match/gone')).toBeNull()
    expect(await client.get('/match/private')).toBeNull()
    expect(await client.get('/resultcof/old')).toBeNull()
    await expect(client.get('/match/search')).rejects.toThrow(SiteError)
  })

  it('tries again when the site falters, and keeps to its budget', async () => {
    vi.useFakeTimers()
    const replies = [answer(503, 'busy'), answer(200, { ok: true })]
    vi.stubGlobal('fetch', vi.fn(async () => replies.shift()))
    const client = new SiteClient('made-up-key', 2, 0)
    const got = client.get<{ ok: boolean }>('/match/search')
    await vi.runAllTimersAsync()
    expect(await got).toEqual({ ok: true })
    await expect(client.get('/match/search')).rejects.toThrow('used all its requests')
  })
})
