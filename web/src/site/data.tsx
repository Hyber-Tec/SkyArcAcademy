import { type ReactNode, createContext, useContext, useEffect, useMemo, useState } from 'react'
import { ACADEMY_ID } from '@shared/academy'
import { COL, DOC, ROOT } from '@shared/paths'
import type { BranchContact, BranchPublicProfile } from '@shared/types'
import {
  EMPTY_WEBSITE_CONTENT,
  type WebsiteContent,
  type WebsiteImage,
  type WebsiteNewsCategory,
  type WebsitePhoto,
  type WebsitePlace,
} from '@shared/website/types'
import { type Doc, getDocument, runQuery } from './rest'

/**
 * What the website shows from the CRM: the academy's name and contact details (Settings → Academy), the Website page's
 * photos, places, coaches, testimonials and hours, and the news posts. It's read once per visit and kept for the
 * visit, so moving between pages never waits; a later visit shows the kept copy at once and refreshes it.
 */
const BRANCH = `${ROOT.branches}/${ACADEMY_ID}`
const CACHE_KEY = 'skyarc-site-data-v1'

export type SitePhoto = Omit<WebsitePhoto, 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> & { id: string }

export interface SitePost {
  id: string
  slug: string
  title: string
  excerpt: string
  category: WebsiteNewsCategory
  cover: WebsiteImage | null
  pinned: boolean
  /** When it first appeared on the website (milliseconds). */
  publishedAt: number
}

export interface SitePostFull extends SitePost {
  html: string
}

interface SiteData {
  /** The first answer has arrived (from this visit's copy or the server). */
  ready: boolean
  failed: boolean
  name: string | null
  contact: BranchContact
  content: WebsiteContent
  /** The gallery's photos, in its order (hidden ones never arrive). */
  photos: SitePhoto[]
  /** Every post's card, pinned first, then newest first. */
  posts: SitePost[]
}

const EMPTY_CONTACT: BranchContact = { email: '', phone: '', address: '', website: '' }
const EMPTY: SiteData = { ready: false, failed: false, name: null, contact: EMPTY_CONTACT, content: EMPTY_WEBSITE_CONTENT, photos: [], posts: [] }

const POST_CARD_FIELDS = ['slug', 'title', 'excerpt', 'category', 'cover', 'pinned', 'publishedAt']

/** Pinned posts first, then the newest. */
export function sortPosts<T extends Pick<SitePost, 'pinned' | 'publishedAt'>>(posts: T[]): T[] {
  return [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt - a.publishedAt)
}

const asPost = (d: Doc<Record<string, unknown>>): SitePost => ({
  id: d.id,
  slug: String(d.data.slug ?? ''),
  title: String(d.data.title ?? ''),
  excerpt: String(d.data.excerpt ?? ''),
  category: (d.data.category as WebsiteNewsCategory) ?? 'announcements',
  cover: (d.data.cover as WebsiteImage | null) ?? null,
  pinned: d.data.pinned === true,
  publishedAt: Number(d.data.publishedAt ?? 0),
})

async function load(signal: AbortSignal): Promise<SiteData> {
  const [profile, content, photos, posts] = await Promise.all([
    getDocument<BranchPublicProfile>(`${BRANCH}/${COL.public}/${DOC.publicProfile}`, signal),
    getDocument<WebsiteContent>(`${BRANCH}/${COL.public}/${DOC.websiteContent}`, signal),
    runQuery<WebsitePhoto>(BRANCH, { collection: COL.websitePhotos, where: [{ field: 'hidden', op: 'EQUAL', value: false }] }, signal),
    runQuery<Record<string, unknown>>(BRANCH, { collection: COL.websitePosts, orderBy: [{ field: 'publishedAt', direction: 'DESCENDING' }], select: POST_CARD_FIELDS, limit: 300 }, signal),
  ])
  return {
    ready: true,
    failed: false,
    name: profile?.name?.trim() || null,
    contact: { ...EMPTY_CONTACT, ...(profile?.contact ?? {}) },
    content: { ...EMPTY_WEBSITE_CONTENT, ...(content ?? {}), places: content?.places ?? {} },
    photos: photos
      .map(({ id, data }) => ({
        id,
        album: data.album,
        caption: data.caption ?? '',
        alt: data.alt ?? '',
        focus: data.focus || '50% 50%',
        order: Number(data.order ?? 0),
        hidden: false,
        folder: data.folder,
        format: data.format,
        widths: data.widths ?? [],
        width: Number(data.width),
        height: Number(data.height),
        color: data.color ?? '',
        blur: data.blur ?? '',
      }))
      .filter((p) => p.widths.length > 0)
      .sort((a, b) => a.order - b.order),
    posts: sortPosts(posts.map(asPost).filter((p) => p.slug)),
  }
}

function cached(): SiteData | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY) ?? localStorage.getItem(CACHE_KEY)
    return raw ? { ...(JSON.parse(raw) as SiteData), ready: true, failed: false } : null
  } catch {
    return null
  }
}

function keep(data: SiteData) {
  try {
    const raw = JSON.stringify(data)
    sessionStorage.setItem(CACHE_KEY, raw)
    localStorage.setItem(CACHE_KEY, raw)
  } catch {
    // Private windows: read again next time.
  }
}

const Ctx = createContext<SiteData>(EMPTY)

export function SiteDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SiteData>(() => cached() ?? EMPTY)
  useEffect(() => {
    const abort = new AbortController()
    load(abort.signal)
      .then((fresh) => {
        setData(fresh)
        keep(fresh)
      })
      .catch(() => {
        if (!abort.signal.aborted) setData((d) => (d.ready ? d : { ...d, ready: true, failed: true }))
      })
    return () => abort.abort()
  }, [])
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>
}

export function useSiteData(): SiteData {
  return useContext(Ctx)
}

/** The photo chosen for a spot on the site, if any. */
export function usePlacePhoto(place: WebsitePlace): SitePhoto | null {
  const { content, photos } = useSiteData()
  const id = content.places?.[place]
  return useMemo(() => (id ? (photos.find((p) => p.id === id) ?? null) : null), [id, photos])
}

export function usePhotoById(id: string | null | undefined): SitePhoto | null {
  const { photos } = useSiteData()
  return useMemo(() => (id ? (photos.find((p) => p.id === id) ?? null) : null), [id, photos])
}

/** A post with its text, by its address; null while loading, 'missing' if there's none. */
export function usePost(slug: string): SitePostFull | null | 'missing' {
  const [post, setPost] = useState<SitePostFull | null | 'missing'>(null)
  useEffect(() => {
    const abort = new AbortController()
    setPost(null)
    runQuery<Record<string, unknown>>(BRANCH, { collection: COL.websitePosts, where: [{ field: 'slug', op: 'EQUAL', value: slug }], limit: 1 }, abort.signal)
      .then((rows) => setPost(rows[0] ? { ...asPost(rows[0]), html: String(rows[0].data.html ?? '') } : 'missing'))
      .catch(() => {
        if (!abort.signal.aborted) setPost('missing')
      })
    return () => abort.abort()
  }, [slug])
  return post
}
