import { useEffect } from 'react'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'

// Where the app was opened, before any navigation inside it.
const openedAt = window.location.pathname

/**
 * `/` is the website's own page (index.html, the homepage), not part of the app. The app only lands here by
 * navigating inside itself (signing out, "Go home"), so it loads that page. Opened at `/` itself (offline, from the
 * installed app's cache) it offers the way in instead.
 */
export function RootRoute() {
  const inApp = openedAt !== '/'
  useEffect(() => {
    if (inApp) window.location.assign('/')
  }, [inApp])
  if (inApp) return <FullPageSpinner />
  return <FullPageMessage title="Sky Arc Sports Academy" actions={[{ label: 'Log in', to: '/login' }]} />
}
