/**
 * The tournaments' results site's public API (Scopos, which publishes the matches scored with Orion on Rezults): one
 * request at a time with a pause between (the shared key is rate limited; the fourth meeting's survey saw no refusal at
 * about 35 a minute), a few tries when the site falters, and a budget per check, so a check never runs away.
 */

export const SITE_API = 'https://api-stage.scopos.tech/production'

/** A refusal that stops the check: the key refused, the site limiting requests or down, the budget spent. */
export class SiteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Params = Record<string, string | number | undefined>

/** A list's page: its items, and the token of the next one. */
interface Page<T> {
  Items?: T[]
  NextToken?: unknown
  [key: string]: unknown
}

export class SiteClient {
  requests = 0
  private last = 0

  constructor(
    private readonly key: string,
    private readonly budget: number,
    private readonly gapMs = 1100,
  ) {}

  /** Requests left in this check's budget. */
  get left(): number {
    return this.budget - this.requests
  }

  /**
   * A GET of `path`. Null when it isn't there (404), isn't public (401, an entry not approved yet) or can't be read
   * (500, the site's old 2019 results); a SiteError when the key is refused or the site keeps refusing.
   */
  async get<T>(path: string, params: Params = {}): Promise<T | null> {
    const query = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') query.set(k, String(v))
    const url = `${SITE_API}${path}${query.size ? `?${query}` : ''}`
    for (let attempt = 0; ; attempt++) {
      if (this.requests >= this.budget) throw new SiteError('This check used all its requests; the next one goes on.', 0)
      const wait = this.last + this.gapMs - Date.now()
      if (wait > 0) await sleep(wait)
      this.requests++
      this.last = Date.now()
      let res: Response
      try {
        res = await fetch(url, { headers: { 'x-api-key': this.key, accept: 'application/json', 'user-agent': 'results-import/1.0' }, signal: AbortSignal.timeout(60_000) })
      } catch (e) {
        if (attempt < 2) {
          await sleep(5_000 * (attempt + 1))
          continue
        }
        throw new SiteError(`The results site didn’t answer (${(e as Error).message}).`, -1)
      }
      if (res.ok) return (await res.json()) as T
      if (res.status === 404 || res.status === 401) return null
      if (res.status === 403) throw new SiteError('The results site refused the key.', 403)
      if (res.status === 429) {
        if (attempt < 2) {
          await sleep(30_000 * (attempt + 1))
          continue
        }
        throw new SiteError('The results site is limiting requests; the next check goes on.', 429)
      }
      if (res.status >= 500) {
        const body = await res.text().catch(() => '')
        if (/unable to convert/i.test(body)) return null
        if (attempt < 1) {
          await sleep(5_000)
          continue
        }
        return null
      }
      throw new SiteError(`The results site answered ${res.status}.`, res.status)
    }
  }

  /**
   * Every page of a list (`listKey`: "MatchSearchList", "MatchParticipantList", "ResultList"), following its
   * `NextToken`, with the first page's own fields (a result list's status and stamp). Stops on an empty page: one list
   * gave the same token forever.
   */
  async list<T>(path: string, params: Params, listKey: string, maxPages: number): Promise<{ items: T[]; head: Record<string, unknown> | null }> {
    const items: T[] = []
    let head: Record<string, unknown> | null = null
    let token: string | undefined
    for (let n = 0; n < maxPages; n++) {
      const body = await this.get<Record<string, Page<T> | undefined>>(path, { ...params, token })
      const page = body?.[listKey]
      if (!page) break
      if (!head) head = page
      const got = Array.isArray(page.Items) ? page.Items : []
      items.push(...got)
      const next = page.NextToken
      if (!got.length || next === undefined || next === null || next === '' || next === 0 || next === '0' || String(next) === token) break
      token = String(next)
    }
    return { items, head }
  }
}
