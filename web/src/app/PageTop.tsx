import { useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router'

/** Where each page was left, by its history entry. */
const left = new Map<string, number>()

/**
 * Every page opens at its top, as a new page in a browser does (the window would keep the page before's scroll
 * otherwise), and Back and Forward bring a page back where it was left, once its content is in. A change of the
 * address's query on the same page (a chosen result, a calendar's view) doesn't move it.
 */
export function PageTop() {
  const { key, pathname } = useLocation()
  const how = useNavigationType()
  const current = useRef(key)
  const lastPath = useRef(pathname)

  // The window's scroll belongs to the entry being shown.
  useEffect(() => {
    const save = () => left.set(current.current, window.scrollY)
    window.addEventListener('scroll', save, { passive: true })
    return () => window.removeEventListener('scroll', save)
  }, [])

  useLayoutEffect(() => {
    current.current = key
    const samePage = lastPath.current === pathname
    lastPath.current = pathname
    if (how !== 'POP') {
      if (!samePage) window.scrollTo({ top: 0, left: 0 })
      return
    }
    const to = left.get(key)
    if (to === undefined) return
    // The page fills in as its data arrives: keep trying for a moment until it's tall enough, unless the person
    // scrolls first.
    let tries = 0
    let timer = 0
    const stop = () => {
      tries = Infinity
      window.clearTimeout(timer)
    }
    const go = () => {
      window.scrollTo({ top: to, left: 0 })
      if (Math.abs(window.scrollY - to) > 2 && tries++ < 30) timer = window.setTimeout(go, 50)
    }
    const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const
    events.forEach((e) => window.addEventListener(e, stop, { passive: true, once: true }))
    go()
    return () => {
      stop()
      events.forEach((e) => window.removeEventListener(e, stop))
    }
  }, [key, pathname, how])

  return <Outlet />
}
