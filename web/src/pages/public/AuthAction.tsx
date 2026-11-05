import { applyActionCode, checkActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth'
import { useEffect, useRef, useState } from 'react'
import { LuCircleAlert, LuCircleCheck } from 'react-icons/lu'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ACADEMY_NAME } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { auth } from '@/lib/firebase'
import { useLang, useT } from '@/lib/lang'
import { AuthShell, PasswordInput, StrengthMeter, withQuery } from './authParts'
import { authErrorIn, passwordProblemIn } from './authText'

type State =
  | { step: 'working' }
  | { step: 'verified' }
  | { step: 'reset'; email: string }
  | { step: 'resetDone'; email: string }
  | { step: 'recovered'; email: string }
  /** The error's code, or none for a link that isn't one of ours. */
  | { step: 'failed'; code: string | null }

/** Whether this page was opened on a phone, where the person most likely came from the app. */

/**
 * Where the links in account emails land (`/auth/action?mode=…&oobCode=…`): confirming an email, choosing a new
 * password, or undoing an email change. The links come from the app's emails (functions/src/account.ts) and, as a
 * fallback, from Firebase's own.
 */
export function AuthAction() {
  const [params] = useSearchParams()
  const mode = params.get('mode')
  const code = params.get('oobCode') ?? ''
  const nextParam = params.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/app'
  const { user, checkVerified } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<State>({ step: 'working' })
  const started = useRef(false)
  const lang = useLang()
  const t = useT()

  useEffect(() => {
    document.title = `${mode === 'resetPassword' ? t('Choose a new password', '새 비밀번호 정하기') : t('Confirm your email', '이메일 인증')} | ${ACADEMY_NAME}`
  }, [mode, t])

  useEffect(() => {
    // One-time codes: run once, even in development's double effects.
    if (started.current) return
    started.current = true
    void (async () => {
      try {
        if (!code) throw Object.assign(new Error(), { code: 'auth/invalid-action-code' })
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, code)
          setState({ step: 'verified' })
        } else if (mode === 'resetPassword') {
          setState({ step: 'reset', email: await verifyPasswordResetCode(auth, code) })
        } else if (mode === 'recoverEmail') {
          const info = await checkActionCode(auth, code)
          await applyActionCode(auth, code)
          setState({ step: 'recovered', email: info.data.email ?? '' })
        } else {
          setState({ step: 'failed', code: null })
        }
      } catch (e) {
        setState({ step: 'failed', code: (e as { code?: string }).code ?? '' })
      }
    })()
  }, [code, mode])

  // Confirmed in the browser that's signed in: carry on into the app.
  useEffect(() => {
    if (state.step !== 'verified' || !user) return
    void checkVerified().catch(() => undefined)
  }, [state.step, user, checkVerified])

  if (state.step === 'working') {
    return (
      <AuthShell title={t('One moment…', '잠시만 기다려 주세요…')}>
        <div className="flex justify-center py-6">
          <Spinner className="size-6" />
        </div>
      </AuthShell>
    )
  }

  if (state.step === 'failed') {
    return (
      <AuthShell
        title={t('This link didn’t work', '링크를 열 수 없어요')}
        description={state.code === null ? t('This link isn’t one we recognize.', '알 수 없는 링크예요.') : authErrorIn(state.code, mode === 'resetPassword' ? 'reset' : 'verify', lang)}
      >
        <Icon ok={false} />
        <div className="grid gap-2">
          <Button asChild>
            <Link to={mode === 'resetPassword' ? withQuery('/forgot-password', { next: next === '/app' ? null : next }) : withQuery('/login', { next: next === '/app' ? null : next })}>
              {mode === 'resetPassword' ? t('Ask for a new link', '새 링크 요청하기') : t('Go to sign in', '로그인하러 가기')}
            </Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (state.step === 'verified') {
    return (
      <AuthShell
        title={t('Email confirmed', '이메일을 인증했어요')}
        description={t('Thanks! You can sign in with it now.', '이제 이 이메일로 로그인할 수 있어요.')}
      >
        <Icon ok />
        <Button className="w-full" onClick={() => navigate(user ? next : withQuery('/login', { next: next === '/app' ? null : next }), { replace: true })}>
          {t('Continue', '계속')}
        </Button>
      </AuthShell>
    )
  }

  if (state.step === 'recovered') {
    return (
      <AuthShell
        title={t('Email restored', '이메일을 되돌렸어요')}
        description={t(
          `Your sign-in email is ${state.email} again. If you didn’t ask for the change, reset your password too.`,
          `로그인 이메일이 다시 ${state.email} 주소로 바뀌었어요. 직접 바꾼 게 아니라면 비밀번호도 재설정해 주세요.`,
        )}
      >
        <Icon ok />
        <div className="grid gap-2">
          <Button asChild>
            <Link to={withQuery('/forgot-password', { email: state.email })}>{t('Reset my password', '비밀번호 재설정')}</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/login">{t('Go to sign in', '로그인하러 가기')}</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (state.step === 'resetDone') {
    return (
      <AuthShell
        title={t('Password changed', '비밀번호를 바꿨어요')}
        description={t('Sign in with your new password.', '새 비밀번호로 로그인해 주세요.')}
      >
        <Icon ok />
        <Button className="w-full" asChild>
          <Link to={withQuery('/login', { next: next === '/app' ? null : next, email: state.email })}>{t('Sign in', '로그인')}</Link>
        </Button>
      </AuthShell>
    )
  }

  return <NewPassword email={state.email} code={code} onDone={() => setState({ step: 'resetDone', email: state.email })} />
}

function Icon({ ok }: { ok: boolean }) {
  return (
    <div className="mb-6 flex justify-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        {ok ? <LuCircleCheck className="size-7 text-emerald-600" /> : <LuCircleAlert className="size-7 text-destructive" />}
      </div>
    </div>
  )
}

function NewPassword({ email, code, onDone }: { email: string; code: string; onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lang = useLang()
  const t = useT()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const problem = passwordProblemIn(password, email, lang)
    if (problem) return setError(problem)
    if (password !== confirm) return setError(t('The two passwords don’t match.', '두 비밀번호가 서로 달라요.'))
    setBusy(true)
    try {
      await confirmPasswordReset(auth, code, password)
      onDone()
    } catch (err) {
      setError(authErrorIn((err as { code?: string }).code, 'reset', lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={t('Choose a new password', '새 비밀번호 정하기')}
      description={
        lang === 'ko' ? (
          <>
            <span className="font-medium wrap-anywhere text-foreground">{email}</span> 계정의 비밀번호를 바꿔요.
          </>
        ) : (
          <>
            For <span className="font-medium wrap-anywhere text-foreground">{email}</span>.
          </>
        )
      }
    >
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-4">
          <input type="email" autoComplete="username" value={email} readOnly hidden />
          <Field>
            <FieldLabel htmlFor="new-password">{t('New password', '새 비밀번호')}</FieldLabel>
            <PasswordInput id="new-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder={t('At least 8 characters', '8자 이상')} autoFocus />
            <StrengthMeter password={password} />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirm-password">{t('Type it again', '한 번 더 입력')}</FieldLabel>
            <PasswordInput id="confirm-password" value={confirm} onChange={setConfirm} autoComplete="new-password" />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : null}
            {t('Save new password', '새 비밀번호 저장')}
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
