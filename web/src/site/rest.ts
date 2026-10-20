/**
 * The website reads the CRM's public documents over Firestore's REST API and sends messages to the `websiteMessage`
 * function over HTTPS, without the Firebase SDK, so its pages stay small. Only what the security rules let anyone read
 * comes back (shared/src/website/types.ts). Against the emulators (`npm run dev:emulators`) it talks to them instead.
 */
const emulators = import.meta.env.VITE_USE_EMULATORS === '1'

export const PROJECT_ID: string = emulators ? 'demo-skyarc' : (import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '')
export const STORAGE_BUCKET: string = emulators ? 'demo-skyarc.appspot.com' : (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? '')
/** Storage's address for public files. */
export const STORAGE_BASE = emulators ? 'http://127.0.0.1:9199' : 'https://firebasestorage.googleapis.com'

const FIRESTORE = emulators ? 'http://127.0.0.1:8080/v1' : 'https://firestore.googleapis.com/v1'
const DOCUMENTS = `${FIRESTORE}/projects/${PROJECT_ID}/databases/(default)/documents`
const FUNCTIONS = emulators ? `http://127.0.0.1:5001/${PROJECT_ID}/us-central1` : `https://us-central1-${PROJECT_ID}.cloudfunctions.net`

type Value =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { stringValue: string }
  | { bytesValue: string }
  | { referenceValue: string }
  | { geoPointValue: { latitude: number; longitude: number } }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } }

interface RestDoc {
  name: string
  fields?: Record<string, Value>
}

/** A Firestore value as plain data; timestamps become milliseconds. */
function decode(v: Value): unknown {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('timestampValue' in v) return Date.parse(v.timestampValue)
  if ('stringValue' in v) return v.stringValue
  if ('bytesValue' in v) return v.bytesValue
  if ('referenceValue' in v) return v.referenceValue
  if ('geoPointValue' in v) return v.geoPointValue
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(decode)
  if ('mapValue' in v) return fields(v.mapValue.fields)
  return null
}

function fields(f: Record<string, Value> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(f ?? {})) out[k] = decode(v)
  return out
}

export interface Doc<T> {
  id: string
  data: T
}

async function json(res: Response) {
  if (!res.ok) throw new Error(`Firestore answered ${res.status}`)
  return res.json()
}

/** One document by path ("branches/skyarc/public/profile"), or null if it isn't there. */
export async function getDocument<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  const res = await fetch(`${DOCUMENTS}/${path}`, { signal })
  if (res.status === 404) return null
  const doc = (await json(res)) as RestDoc
  return fields(doc.fields) as T
}

export interface Query {
  /** The collection's ID under `parent` ("websitePhotos"). */
  collection: string
  where?: { field: string; op: 'EQUAL'; value: string | boolean | number }[]
  orderBy?: { field: string; direction?: 'ASCENDING' | 'DESCENDING' }[]
  /** Only these fields (smaller answers for lists). */
  select?: string[]
  limit?: number
}

const encode = (v: string | boolean | number) =>
  typeof v === 'string' ? { stringValue: v } : typeof v === 'boolean' ? { booleanValue: v } : Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }

/** A query on a collection under `parent` ("branches/skyarc"). */
export async function runQuery<T>(parent: string, q: Query, signal?: AbortSignal): Promise<Doc<T>[]> {
  const filters = (q.where ?? []).map((w) => ({ fieldFilter: { field: { fieldPath: w.field }, op: w.op, value: encode(w.value) } }))
  const structuredQuery = {
    from: [{ collectionId: q.collection }],
    ...(filters.length === 1 ? { where: filters[0] } : filters.length > 1 ? { where: { compositeFilter: { op: 'AND', filters } } } : {}),
    ...(q.orderBy ? { orderBy: q.orderBy.map((o) => ({ field: { fieldPath: o.field }, direction: o.direction ?? 'ASCENDING' })) } : {}),
    ...(q.select ? { select: { fields: q.select.map((fieldPath) => ({ fieldPath })) } } : {}),
    ...(q.limit ? { limit: q.limit } : {}),
  }
  const res = await fetch(`${DOCUMENTS}/${parent}:runQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
    signal,
  })
  const rows = (await json(res)) as { document?: RestDoc }[]
  return rows.filter((r) => r.document).map((r) => ({ id: r.document!.name.split('/').pop()!, data: fields(r.document!.fields) as T }))
}

/** A function's refusal: its status ("RESOURCE_EXHAUSTED", "INVALID_ARGUMENT", …) says why. */
export class CallError extends Error {
  readonly status: string
  readonly details: unknown
  constructor(message: string, status: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

/** Calls a callable Cloud Function (Firebase's callable protocol, over plain HTTPS). */
export async function callFunction<T>(name: string, data: unknown): Promise<T> {
  const res = await fetch(`${FUNCTIONS}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data }) })
  let body: { result?: T; error?: { message?: string; status?: string; details?: unknown } } = {}
  try {
    body = await res.json()
  } catch {
    // Not JSON: a network or server error, reported below.
  }
  if (!res.ok || body.error) throw new CallError(body.error?.message ?? `The server answered ${res.status}`, body.error?.status ?? 'UNKNOWN', body.error?.details)
  return body.result as T
}
