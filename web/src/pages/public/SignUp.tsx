import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { isGoogleMailbox, looksLikeEmail } from '@shared/auth'
import { ACADEMY_NAME } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/components/app/FullPage'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useLang, useT } from '@/lib/lang'
import { AuthShell, OrDivider, PasswordInput, StrengthMeter, useAuthBranch, useNext, withQuery } from './authParts'
import { authErrorIn, passwordProblemIn } from './authText'
import { GoogleSignInButton } from './GoogleButton'

/**
 * A new account with an email and a password (or Google, the quicker way). Once the email is confirmed, an email the
 * academy has on a student's record (a parent's, or the student's own) opens their part of the app by itself
 * (docs/DECISIONS.md §31); anyone else asks the academy, or was invited by it (the account is matched to the email).
 */
export function SignUp() {
  const { status, needsVerification, signUp } = useAuth()
  const [params] = useSearchParams()
  const target = useNext()
  const hint = params.get('email')?.trim().toLowerCase() || null
  const { profile, loading } = useAuthBranch()
  const academy = profile?.name?.trim() || ACADEMY_NAME
  const [name, setName] = useState('')
  const [email, setEmail] = useState(hint ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lang = useLang()
  const t = useT()

  useEffect(() => {
    document.title = lang === 'ko' ? `계정 만들기 | ${academy}` : `Create an account | ${academy}`
  }, [academy, lang])

  if (status === 'loading' || loading) return <FullPageSpinner />
  if (status === 'signedIn') return <Navigate to={needsVerification ? withQuery('/verify-email', { next: target }) : target} replace />

  const query = { next: target === '/app' ? null : target, email: email.trim() || null }
  const gmail = isGoogleMailbox(email)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim()) return setError(t('Enter your name.', '이름을 입력해 주세요.'))
    if (!looksLikeEmail(email)) return setError(authErrorIn('invalid-email', 'sign-in', lang))
    const problem = passwordProblemIn(password, email, lang)
    if (problem) return setError(problem)
    setBusy(true)
    try {
      await signUp({ name, email, password }, target)
    } catch (err) {
      setError(authErrorIn((err as { code?: string }).code, 'sign-up', lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('Create your account', '계정 만들기')}
      description={t(`Use the email you gave ${academy}: that’s how it finds your child’s record.`, `${academy}에 등록한 이메일을 써 주세요. 그 이메일로 자녀 정보를 찾아요.`)}
      footer={
        <p>
          {t('Already have an account?', '이미 계정이 있나요?')}{' '}
          <Link to={withQuery('/login', query)} className="font-medium text-foreground underline underline-offset-2">
            {t('Sign in', '로그인')}
          </Link>
          {lang === 'ko' ? null : '.'}
        </p>
      }
    >
      <GoogleSignInButton className="w-full" label={t('Continue with Google', 'Google로 계속하기')} hint={hint} />
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {t('Quickest if your email is a Google account: no password to remember.', 'Google 계정 이메일이라면 가장 빨라요. 기억할 비밀번호도 없어요.')}
      </p>
      <OrDivider label={t('or create a password', '또는 비밀번호 만들기')} />
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="signup-name">{t('Full name', '이름')}</FieldLabel>
            <Input id="signup-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="signup-email">{t('Email', '이메일')}</FieldLabel>
            <Input id="signup-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            {gmail ? (
              <FieldDescription>
                {t('This is a Gmail address: “Continue with Google” above works without a password.', 'Gmail 주소예요. 위의 “Google로 계속하기”를 누르면 비밀번호 없이 가입할 수 있어요.')}
              </FieldDescription>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="signup-password">{t('Password', '비밀번호')}</FieldLabel>
            <PasswordInput id="signup-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder={t('At least 8 characters', '8자 이상')} />
            <StrengthMeter password={password} />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : null}
            {t('Create account', '계정 만들기')}
          </Button>
          <p className="text-xs text-muted-foreground">{t('We’ll email you a link to confirm the address before you sign in.', '로그인하기 전에 이메일 주소를 확인하는 링크를 보내 드려요.')}</p>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
