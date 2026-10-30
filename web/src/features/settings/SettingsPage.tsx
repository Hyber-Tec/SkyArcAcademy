import { Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { Spinner } from '@/components/ui/spinner'
import { useIsSuperAdmin } from '@/features/ai/api'
import { type SettingsPageDef, pageByKey, pageFor } from './pages'
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
  const page = pageByKey(key)!
  // Each page starts afresh: its own draft, its own "More options".
  return page.superAdminOnly ? <SuperAdminPage page={page} /> : <SettingsPageView key={key} page={page} />
}

/** The AI page: super admins only; anyone else is sent back to the Settings home. */
function SuperAdminPage({ page }: { page: SettingsPageDef }) {
  const { isSuperAdmin, loading } = useIsSuperAdmin()
  if (loading)
    return (
      <div className="flex justify-center py-16 text-muted-foreground">
        <Spinner className="size-6" />
      </div>
    )
  if (!isSuperAdmin) return <Navigate to="/admin/settings" replace />
  return <SettingsPageView key={page.key} page={page} />
}
