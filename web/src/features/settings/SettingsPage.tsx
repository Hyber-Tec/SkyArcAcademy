import { Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { pageByKey, pageFor } from './pages'
import { SettingsHome } from './SettingsHome'
import { SettingsPageView } from './SettingsPageView'

/**
 * Settings (Goo's pick of 2026-10-28, docs/DECISIONS.md §23): the home of tiles at /admin/settings, and each tile's
 * page at /admin/settings/<key> (the website's tabs after it). Addresses from before the home (/admin/settings/payroll,
 * /admin/settings/schedule?find=…) go to the page their setting is on now.
 */
export function SettingsPage() {
  const { section } = useParams()
  const [params] = useSearchParams()
  const location = useLocation()
  if (!section) return <SettingsHome />
  const key = pageFor(section, params.get('find'))
  if (!key) return <Navigate to="/admin/settings" replace />
  if (key !== section) return <Navigate to={`/admin/settings/${key}${location.search}`} replace />
  // Each page starts afresh: its own draft, its own "More options".
  return <SettingsPageView key={key} page={pageByKey(key)!} />
}
