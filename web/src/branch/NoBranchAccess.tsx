import { doc } from 'firebase/firestore'
import { httpsCallable } from '@/lib/callable'
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
import { useLang, useT } from '@/lib/lang'
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
  const lang = useLang()
  const t = useT()
  if (loading || request.loading || link.result === 'checking') return <FullPageSpinner label={t('Looking for you on the academy’s records…', '아카데미 기록에서 계정을 찾고 있어요…')} />
  if (link.result === 'linked') return <FullPageSpinner label={t('Opening the app…', '앱을 여는 중…')} />

  const name = profile?.name ?? t('the academy', '아카데미')
  const otherAccount = {
    label: t('Use another email', '다른 이메일 사용'),
    variant: 'outline' as const,
    onClick: () => void signOut().then(() => navigate('/login')),
  }
  const account = <span className="font-medium wrap-anywhere text-foreground">{email}</span>

  if (request.data?.status === 'pending') {
    return (
      <FullPageMessage
        title={t('Waiting for the academy', '아카데미 승인을 기다리고 있어요')}
        description={
          lang === 'ko' ? (
            <>
              {account} 계정으로 로그인했고, {name}에 이용을 신청했어요. 승인되면 이메일로 알려 드리고, 이 페이지도 자동으로 열려요.
            </>
          ) : (
            <>
              You’re signed in as {account}, and you asked {name} to let you in. You’ll get an email once they approve it, and this page opens by itself.
            </>
          )
        }
        actions={[otherAccount]}
      />
    )
  }
  if (link.result === 'error') {
    return (
      <FullPageMessage
        title={t('We couldn’t check just now', '지금은 확인할 수 없어요')}
        description={lang === 'ko' ? <>{account} 계정으로 로그인했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.</> : <>You’re signed in as {account}. Check your connection, then try again.</>}
        actions={[{ label: t('Try again', '다시 시도'), onClick: link.retry }, otherAccount]}
      />
    )
  }
  return (
    <FullPageMessage
      title={t('This email isn’t on the academy’s records', '아카데미 기록에 없는 이메일이에요')}
      description={
        lang === 'ko' ? (
          <>
            {account} 계정으로 로그인했어요. 가족은 {name}에 등록한 이메일로 찾는데, 이 이메일이 등록된 학생 정보가 없어요.{' '}
            {isHiddenEmail(email)
              ? 'Apple의 ‘나의 이메일 가리기’를 써서 아카데미가 이메일을 확인할 수 없어요. 아카데미에 이용을 신청하거나, 아카데미에 알려 준 이메일로 로그인해 주세요.'
              : '아카데미에 이용을 신청하거나(코치도 마찬가지예요), 아카데미에 알려 준 이메일로 로그인해 주세요.'}
          </>
        ) : (
          <>
            You’re signed in as {account}. Families are found by the email they gave {name}, and no student’s record has this one.{' '}
            {isHiddenEmail(email)
              ? 'You chose to hide your email with Apple, so the academy can’t match it: ask the academy to let you in, or use the email you gave them.'
              : 'Ask the academy to let you in (coaches too), or sign in with the email you gave them.'}
          </>
        )
      }
      actions={[...(signupOpen(profile) ? [{ label: t('Ask the academy', '가입 신청하기'), to: '/join' }] : []), otherAccount]}
    />
  )
}
