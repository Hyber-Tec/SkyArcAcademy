import { type AnchorHTMLAttributes, type ReactNode, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { PAGE_META, type Page, isSitePath } from '../paths'
import { ACADEMY, TITLES, keepWhole } from './content'

/**
 * The website's pages: `/programs` and the others, a news post at `/news/{slug}`. Firebase Hosting serves each page's own HTML (built with its title and description, for search and
 * link previews), and from there the site moves between its pages without reloading: a click on any link to one of
 * them is handled here, with a short cross-fade where the browser can. `?section=tuition` scrolls to a part of a page.
 * Links to the app (Log in, the privacy policy) load the app as usual.
 */
export interface Route {
  /** "news/match-day-ab12cd", "" for the homepage. */
  path: string
  segments: string[]
  section: string | null
  /** The address's query, without "?". */
  query: string
}

export function parseLocation(pathname: string, search: string): Route {
  const segments = pathname.split('/').filter(Boolean)
  const query = search.replace(/^\?/, '')
  return { path: segments.join('/'), segments, section: new URLSearchParams(query).get('section'), query }
}

export const hrefFor = (path: string): string => `/${path.replace(/^\/+/, '')}`

const firstRoute = (): Route => parseLocation(location.pathname, location.search)

const reducedMotion = () => document.documentElement.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches

interface SiteValue extends Route {
  /** A text as the page shows it: what reads as one kept on one line (`keepWhole`). */
  t: (x: string) => string
  href: (path: string) => string
  go: (path: string) => void
  /** A value from the address's query: `/trial?kind=two` → param('kind'). */
  param: (name: string) => string | null
}

const Ctx = createContext<SiteValue | null>(null)

export function SiteProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(firstRoute)
  // Where to scroll once the next page is drawn: the top, a section, or back to where the reader was (Back).
  const scrollTo = useRef<number | 'top' | 'section' | null>(null)

  useEffect(() => {
    history.scrollRestoration = 'manual'
    const show = (next: Route) => {
      const apply = () => flushSync(() => setRoute(next))
      if ('startViewTransition' in document && !reducedMotion()) document.startViewTransition(apply)
      else apply()
    }

    const navigate = (url: URL) => {
      const target = url.pathname + url.search
      history.replaceState({ ...(history.state ?? {}), scroll: window.scrollY }, '')
      if (target !== location.pathname + location.search) history.pushState({ scroll: 0 }, '', target)
      const next = parseLocation(url.pathname, url.search)
      scrollTo.current = next.section ? 'section' : 'top'
      show(next)
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a')
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download') || !a.href) return
      const url = new URL(a.href, location.href)
      if (url.origin !== location.origin || !isSitePath(url.pathname)) return
      // A link to a part of this same page ("#main") is the browser's.
      if (url.hash && url.pathname === location.pathname && url.search === location.search) return
      e.preventDefault()
      navigate(url)
    }

    const onPop = () => {
      scrollTo.current = typeof history.state?.scroll === 'number' ? history.state.scroll : 'top'
      show(parseLocation(location.pathname, location.search))
    }

    const onGo = (e: Event) => navigate(new URL((e as CustomEvent<string>).detail, location.href))

    document.addEventListener('click', onClick)
    window.addEventListener('popstate', onPop)
    window.addEventListener('site:navigate', onGo)
    return () => {
      document.removeEventListener('click', onClick)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('site:navigate', onGo)
    }
  }, [])

  // A new page starts at its top, a section link scrolls to the section, and Back returns to where the reader was.
  useLayoutEffect(() => {
    const want = scrollTo.current
    scrollTo.current = null
    if (want === 'section' || (want === null && route.section)) {
      const id = route.section
      if (!id) return
      // The page may still be loading (its code, its photos): wait for the section, then settle on it.
      let tries = 0
      let timer = 0
      const find = () => {
        const el = document.getElementById(id)
        if (el) {
          el.scrollIntoView({ behavior: reducedMotion() || want === null ? 'auto' : 'smooth', block: 'start' })
          if (want === null) timer = window.setTimeout(() => el.scrollIntoView({ behavior: 'auto', block: 'start' }), 600)
        } else if (tries++ < 50) timer = window.setTimeout(find, 100)
      }
      timer = window.setTimeout(find, want === null ? 50 : 0)
      return () => clearTimeout(timer)
    } else if (typeof want === 'number') {
      // The page may still be filling in (photos, posts): try again once it has.
      window.scrollTo({ top: want, left: 0, behavior: 'instant' })
      const again = setTimeout(() => window.scrollTo({ top: want, left: 0, behavior: 'instant' }), 350)
      return () => clearTimeout(again)
    } else if (want === 'top') window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [route])

  useEffect(() => {
    const key = route.segments[0] ?? ''
    // A post's page names the post itself once it's read (News sets it).
    if (key === 'news' && route.segments[1]) return
    const meta = isSitePath(`/${route.path}`) ? PAGE_META[key as Page] : null
    document.title = meta ? meta.title : `${TITLES['404']} · ${ACADEMY.name}`
  }, [route.segments, route.path])

  const value = useMemo<SiteValue>(
    () => ({
      ...route,
      t: keepWhole,
      href: hrefFor,
      go: (path) => {
        window.dispatchEvent(new CustomEvent('site:navigate', { detail: hrefFor(path) }))
      },
      param: (name) => new URLSearchParams(route.query).get(name),
    }),
    [route],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSite(): SiteValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSite outside SiteProvider')
  return v
}

/** A link to a page of the site. */
export function A({ to, children, ...rest }: { to: string; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const { href, path } = useSite()
  const target = to.replace(/^\/+/, '').split('?')[0]
  const current = target === path || (target !== '' && path.startsWith(`${target}/`))
  return (
    <a href={href(to)} aria-current={current ? 'page' : undefined} {...rest}>
      {children}
    </a>
  )
}

/** Whether the current page is this one (for navigation highlights). */
export function useIsPage(to: string): boolean {
  const { path } = useSite()
  const target = to.split('?')[0]
  return target === path || (target !== '' && path.startsWith(`${target}/`))
}

export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}
