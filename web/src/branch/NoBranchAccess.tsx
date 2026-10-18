import { doc } from 'firebase/firestore'
import { useNavigate } from 'react-router'
import { ACADEMY_ID } from '@shared/academy'
import { COL, ROOT } from '@shared/paths'
import type { SignupRequest } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'
import { signupOpen, usePublicProfile } from '@/lib/publicProfile'

/**
 * Someone signed in whom the academy hasn't given access: says which account is signed in, whether their request is
 * waiting, and the ways in (another account, asking for access).
 */
export function NoBranchAccess() {
  const { email, signOut } = useAuth()
  const { data: profile, loading } = usePublicProfile()
  const request = useDoc<SignupRequest>(email ? doc(db, ROOT.branches, ACADEMY_ID, COL.signupRequests, email) : null)
  const navigate = useNavigate()
  if (loading || request.loading) return <FullPageSpinner />

  const name = profile?.name ?? 'the academy'
  const otherAccount = {
    label: 'Use another account',
    variant: 'outline' as const,
    onClick: () => void signOut().then(() => navigate('/login')),
  }
  const account = <span className="font-medium wrap-anywhere text-foreground">{email}</span>

  if (request.data?.status === 'pending') {
    return (
      <FullPageMessage
        title="Your request is waiting for approval"
        description={
          <>
            You’re signed in as {account}. {name} will review your request; you’ll get an email and can sign in as soon as
            it’s approved.
          </>
        }
        actions={[otherAccount]}
      />
    )
  }
  return (
    <FullPageMessage
      title={`No access to ${name} yet`}
      description={
        <>
          You’re signed in as {account}, which {name} hasn’t given access. If the academy invited you, sign in with the
          address the invitation was sent to. Once the academy adds this address, this page opens by itself.
        </>
      }
      actions={[otherAccount, ...(signupOpen(profile) ? [{ label: 'Request access', to: '/join' }] : [])]}
    />
  )
}
