import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { isGoogleMailbox, looksLikeEmail } from '@shared/auth'
import { ACADEMY_NAME } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/components/app/FullPage'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useLang, useT } from '@/lib/lang'
import { signupOpen } from '@/lib/publicProfile'
import { AuthShell, OrDivider, PasswordInput, useAuthBranch, useNext, withQuery } from './authParts'
import { authErrorIn } from './authText'
import { GoogleSignInButton } from './GoogleButton'

/**
 * Sign-in: Google (the recommended way) or an email and password. Invite emails add `?email=`, which pre-selects that
 * Google account and fills in the email field.
 */
export function Login() {
  const { status, needsVerification, signInWithPassword } = useAuth()
  const [params] = useSearchParams()
  const target = useNext()
  const hint = params.get('email')?.trim().toLowerCase() || null
  const { profile, loading } = useAuthBranch()
  // The academy's full name, as on its logo ("Sky Arc Sports Academy"), never the short one.
  const academy = profile?.name?.trim() || ACADEMY_NAME
  const [email, setEmail] = useState(hint ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lang = useLang()
  const t = useT()

  useEffect(() => {
    document.title = lang === 'ko' ? `로그인 | ${academy}` : `Sign in | ${academy}`
  }, [academy, lang])

  if (status === 'loading' || loading) return <FullPageSpinner />
  if (status === 'signedIn') return <Navigate to={needsVerification ? withQuery('/verify-email', { next: target }) : target} replace />

  const query = { next: target === '/app' ? null : target, email: email.trim() || null }
  const gmail = isGoogleMailbox(email || hint || '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!looksLikeEmail(email)) return setError(authErrorIn('invalid-email', 'sign-in', lang))
    if (!password) return setError(authErrorIn('missing-password', 'sign-in', lang))
    setBusy(true)
    try {
      await signInWithPassword(email, password)
    } catch (err) {
      setError(authErrorIn((err as { code?: string }).code, 'sign-in', lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={lang === 'ko' ? `${academy} 로그인` : `Sign in to ${academy}`}
      description={
        lang === 'ko' ? (
          hint ? (
            <>
              아카데미에 등록된 이메일 <span className="font-medium wrap-anywhere text-foreground">{hint}</span> 계정으로 로그인해 주세요.
            </>
          ) : (
            '아카데미에 등록된 이메일로 로그인해 주세요.'
          )
        ) : hint ? (
          <>
            Use <span className="font-medium wrap-anywhere text-foreground">{hint}</span>, the email the academy has for you.
          </>
        ) : (
          'Use the email the academy has for you.'
        )
      }
      footer={
        lang === 'ko' ? (
          <>
            <p>
              처음이신가요?{' '}
              <Link to={withQuery('/signup', query)} className="font-medium text-foreground underline underline-offset-2">
                계정 만들기
              </Link>
              {profile && signupOpen(profile) ? (
                <>
                  {' '}또는{' '}
                  <Link to="/join" className="font-medium text-foreground underline underline-offset-2">
                    {academy}에 가입 신청
                  </Link>
                </>
              ) : null}
            </p>
            {!profile ? <p>아카데미에서 초대 이메일을 보내거나, 가입 신청 링크를 알려 드려요.</p> : null}
          </>
        ) : (
          <>
            <p>
              New here?{' '}
              <Link to={withQuery('/signup', query)} className="font-medium text-foreground underline underline-offset-2">
                Create an account
              </Link>
              {profile && signupOpen(profile) ? (
                <>
                  {' '}or{' '}
                  <Link to="/join" className="font-medium text-foreground underline underline-offset-2">
                    request access to {academy}
                  </Link>
                </>
              ) : null}
              .
            </p>
            {!profile ? <p>The academy emails you an invitation, or gives you its sign-up link to request access.</p> : null}
          </>
        )
      }
    >
      <GoogleSignInButton className="w-full" label={t('Continue with Google', 'Google로 계속하기')} hint={hint} />
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {gmail ? t('Recommended for Gmail addresses.', 'Gmail 주소라면 이 방법을 추천해요.') : t('Recommended if your email is a Google account.', 'Google 계정 이메일이라면 이 방법을 추천해요.')}
      </p>
      <OrDivider label={t('or sign in with your email', '또는 이메일로 로그인')} />
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="login-email">{t('Email', '이메일')}</FieldLabel>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus={!!hint && !gmail}
            />
          </Field>
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel htmlFor="login-password">{t('Password', '비밀번호')}</FieldLabel>
              <Link to={withQuery('/forgot-password', query)} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline">
                {t('Forgot password?', '비밀번호 찾기')}
              </Link>
            </div>
            <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : null}
            {t('Sign in', '로그인')}
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
