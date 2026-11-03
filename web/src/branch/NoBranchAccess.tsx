import { doc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ACADEMY_ID } from '@shared/academy'
import { type LinkResult, isHiddenEmail } from '@shared/access/onFile'
import { COL, ROOT } from '@shared/paths'
import type { SignupRequest } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { db, functions } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'
import { signupOpen, usePublicProfile } from '@/lib/publicProfile'

const linkCall = httpsCallable<Record<string, never>, LinkResult>(functions, 'linkMyAccount')

/**
 * Asks the server to link the signed-in account by the email on file (docs/DECISIONS.md §31): `linked` once it's done
 * (the member doc arrives and the portal opens by itself), `not_found` when no student's record has the email.
 */
function useLinkByRecords(email: string | null) {
  const [state, setState] = useState<{ email: string | null; result: 'checking' | 'linked' | 'not_found' | 'error' }>({ email, result: 'checking' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!email) return
    let alive = true
    linkCall({})
      .then((r) => alive && setState({ email, result: r.data.state === 'not_found' ? 'not_found' : 'linked' }))
      .catch(() => alive && setState({ email, result: 'error' }))
    return () => {
      alive = false
    }
  }, [email, attempt])
  const result = state.email === email ? state.result : 'checking'
  return {
    result,
    retry: () => {
      setState({ email, result: 'checking' })
      setAttempt((n) => n + 1)
    },
  }
}

/**
 * Someone signed in whom the academy hasn't given access. A parent or student whose email is on a student's record is
 * linked right here (the portal opens by itself); anyone else sees which account is signed in, whether their request is
 * waiting, and the ways in: asking the academy, or another account.
 */
export function NoBranchAccess() {
  const { email, signOut } = useAuth()
  const { data: profile, loading } = usePublicProfile()
  const request = useDoc<SignupRequest>(email ? doc(db, ROOT.branches, ACADEMY_ID, COL.signupRequests, email) : null)
  const link = useLinkByRecords(email)
  const navigate = useNavigate()
  if (loading || request.loading || link.result === 'checking') return <FullPageSpinner label="Looking for you on the academy’s records…" />
  if (link.result === 'linked') return <FullPageSpinner label="Opening the app…" />

  const name = profile?.name ?? 'the academy'
  const otherAccount = {
    label: 'Use another email',
    variant: 'outline' as const,
    onClick: () => void signOut().then(() => navigate('/login')),
  }
  const account = <span className="font-medium wrap-anywhere text-foreground">{email}</span>

  if (request.data?.status === 'pending') {
    return (
      <FullPageMessage
        title="Waiting for the academy"
        description={
          <>
            You’re signed in as {account}, and you asked {name} to let you in. You’ll get an email once they approve it, and this page opens by itself.
          </>
        }
        actions={[otherAccount]}
      />
    )
  }
  if (link.result === 'error') {
    return (
      <FullPageMessage
        title="We couldn’t check just now"
        description={<>You’re signed in as {account}. Check your connection, then try again.</>}
        actions={[{ label: 'Try again', onClick: link.retry }, otherAccount]}
      />
    )
  }
  return (
    <FullPageMessage
      title="This email isn’t on the academy’s records"
      description={
        <>
          You’re signed in as {account}. Families are found by the email they gave {name}, and no student’s record has this one.{' '}
          {isHiddenEmail(email)
            ? 'You chose to hide your email with Apple, so the academy can’t match it: ask the academy to let you in, or use the email you gave them.'
            : 'Ask the academy to let you in (coaches too), or sign in with the email you gave them.'}
        </>
      }
      actions={[...(signupOpen(profile) ? [{ label: 'Ask the academy', to: '/join' }] : []), otherAccount]}
    />
  )
}
