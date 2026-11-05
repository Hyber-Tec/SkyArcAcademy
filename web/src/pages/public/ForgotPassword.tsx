import { useEffect, useState } from 'react'
import { LuMail } from 'react-icons/lu'
import { Link, useSearchParams } from 'react-router'
import { looksLikeEmail } from '@shared/auth'
import { ACADEMY_NAME } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useLang, useT } from '@/lib/lang'
import { AuthShell, useCooldown, useNext, withQuery } from './authParts'
import { authErrorIn } from './authText'

/** "Forgot password?": emails a link to choose a new one. It never says whether the address has an account. */
export function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [params] = useSearchParams()
  const target = useNext()
  const [email, setEmail] = useState(params.get('email')?.trim().toLowerCase() ?? '')
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, startCooldown] = useCooldown()
  const lang = useLang()
  const t = useT()

  useEffect(() => {
    document.title = lang === 'ko' ? `비밀번호 재설정 | ${ACADEMY_NAME}` : `Reset your password | ${ACADEMY_NAME}`
  }, [lang])

  const back = withQuery('/login', { next: target === '/app' ? null : target, email: email.trim() || null })

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    if (!looksLikeEmail(email)) return setError(authErrorIn('invalid-email', 'sign-in', lang))
    setBusy(true)
    try {
      await sendPasswordReset(email, target === '/app' ? null : target)
      setSentTo(email.trim().toLowerCase())
      startCooldown(60)
    } catch (err) {
      setError(authErrorIn((err as { code?: string }).code, 'reset', lang))
    } finally {
      setBusy(false)
    }
  }

  if (sentTo) {
    return (
      <AuthShell
        title={t('Check your email', '이메일을 확인해 주세요')}
        description={
          lang === 'ko' ? (
            <>
              <span className="font-medium wrap-anywhere text-foreground">{sentTo}</span> 주소로 가입한 {ACADEMY_NAME} 계정이 있다면 새 비밀번호를 정하는 링크를
              보냈어요. 링크는 1시간 동안 한 번만 쓸 수 있어요.
            </>
          ) : (
            <>
              If there’s a {ACADEMY_NAME} account for <span className="font-medium wrap-anywhere text-foreground">{sentTo}</span>, we sent it a link to
              choose a new password. The link works once, for an hour.
            </>
          )
        }
        footer={
          <p>
            {t(
              'Not there after a minute? Check your spam folder. Signed up with Google? Then you don’t need a password: use “Continue with Google”.',
              '1분이 지나도 오지 않으면 스팸 메일함을 확인해 주세요. Google로 가입했다면 비밀번호 없이 “Google로 계속하기”로 로그인하면 돼요.',
            )}
          </p>
        }
      >
        <div className="mb-6 flex justify-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-muted">
            <LuMail className="size-7" />
          </div>
        </div>
        <div className="grid gap-2">
          <Button asChild>
            <Link to={back}>{t('Back to sign in', '로그인으로 돌아가기')}</Link>
          </Button>
          <Button variant="outline" onClick={() => void submit()} disabled={busy || cooldown > 0}>
            {busy ? <Spinner /> : null}
            {cooldown > 0 ? t(`Send again in ${cooldown}s`, `${cooldown}초 후 다시 보내기`) : t('Send it again', '다시 보내기')}
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={t('Reset your password', '비밀번호 재설정')}
      description={t('Enter the email you sign in with. We’ll email you a link to choose a new password.', '로그인할 때 쓰는 이메일을 입력해 주세요. 새 비밀번호를 정하는 링크를 보내 드려요.')}
      footer={
        <p>
          {t('Remembered it?', '비밀번호가 생각났나요?')}{' '}
          <Link to={back} className="font-medium text-foreground underline underline-offset-2">
            {t('Back to sign in', '로그인으로 돌아가기')}
          </Link>
          {lang === 'ko' ? null : '.'}
        </p>
      }
    >
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="reset-email">{t('Email', '이메일')}</FieldLabel>
            <Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="you@example.com" />
          </Field>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : null}
            {t('Send reset link', '재설정 링크 보내기')}
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
