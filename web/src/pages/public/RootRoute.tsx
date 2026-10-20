import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { isSitePath } from '@/site/paths'

// Where the app was opened, before any navigation inside it.
const openedAt = window.location.pathname

/**
 * The website's pages (`/`, `/programs`, `/ko/…`; src/site) aren't part of the app. The app only lands on one by
 * navigating inside itself (signing out, "Go home", a link to the website), so it loads that page from the site.
 * Opened at such an address itself (offline, from the installed app's cache) it offers the way in instead. Any other
 * address is a page the app doesn't have.
 */
export function RootRoute() {
  const { pathname, search } = useLocation()
  const site = isSitePath(pathname)
  const inApp = site && openedAt !== pathname
  useEffect(() => {
    if (inApp) window.location.assign(pathname + search)
  }, [inApp, pathname, search])
  if (inApp) return <FullPageSpinner />
  if (site) return <FullPageMessage title="Sky Arc Sports Academy" actions={[{ label: 'Log in', to: '/login' }]} />
  return <FullPageMessage title="Page not found" actions={[{ label: 'Go home', to: '/' }]} />
}
