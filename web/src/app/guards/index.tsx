import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import type { Portal, RestrictablePage } from '@shared/roles'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { FullPageSpinner } from '@/components/app/FullPage'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, needsVerification } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  const next = encodeURIComponent(location.pathname + location.search)
  if (status === 'signedOut') return <Navigate to={`/login?next=${next}`} replace />
  // A password account reaches nothing until its email is confirmed (the rules trust verified emails only).
  if (needsVerification) return <Navigate to={`/verify-email?next=${next}`} replace />
  return children
}

/** One role per person, so one portal: anyone else is sent to their own. */
export function RequirePortal({ role, children }: { role: Portal; children: ReactNode }) {
  const { portal } = useBranch()
  if (portal !== role) return <Navigate to={`/${portal}`} replace />
  return children
}

/** `/app` → the person's portal (or the one an admin is previewing). */
export function PortalHomeRedirect() {
  const { portal } = useBranch()
  return <Navigate to={`/${portal}`} replace />
}

/** Hides a page from admins an owner restricted (Access Control). */
export function RequirePage({ page, children }: { page: RestrictablePage; children: ReactNode }) {
  const { can } = useBranch()
  if (!can(page)) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        You don’t have access to this page. Ask the academy’s owner if you need it.
      </div>
    )
  }
  return children
}
