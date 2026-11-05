import { useCallback, useEffect, useRef, useState } from 'react'
import { LuMailCheck } from 'react-icons/lu'
import { Navigate, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ACADEMY_NAME, SENDER_EMAIL } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/components/app/FullPage'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useLang, useT } from '@/lib/lang'
import { AuthShell, useCooldown, useNext } from './authParts'
import { authErrorIn } from './authText'

/**
 * "Check your email": a new password account waits here until its address is confirmed. It checks by itself every
 * few seconds and when the tab comes back to the front, so opening the link (here, on the phone, anywhere) is enough.
 */
export function VerifyEmail() {
  const { status, user, needsVerification, sendVerification, checkVerified, signOut } = useAuth()
  const target = useNext()
  const navigate = useNavigate()
  const [checking, setChecking] = useState(false)
  const [sending, setSending] = useState(false)
  const [cooldown, startCooldown] = useCooldown()
  const busy = useRef(false)
  const lang = useLang()
  const t = useT()

  useEffect(() => {
    document.title = lang === 'ko' ? `이메일 인증 | ${ACADEMY_NAME}` : `Confirm your email | ${ACADEMY_NAME}`
  }, [lang])

  const check = useCallback(
    async (quiet: boolean) => {
      if (busy.current) return
      busy.current = true
      if (!quiet) setChecking(true)
      try {
        const ok = await checkVerified()
        if (ok) navigate(target, { replace: true })
        else if (!quiet) toast.info(t('Not confirmed yet', '아직 인증되지 않았어요'), { description: t('Open the link in the email, then try again.', '이메일의 링크를 연 뒤 다시 시도해 주세요.') })
      } catch (e) {
        if (!quiet) toast.error(authErrorIn((e as { code?: string }).code, 'verify', lang))
      } finally {
        busy.current = false
        if (!quiet) setChecking(false)
      }
    },
    [checkVerified, navigate, target, t, lang],
  )

  useEffect(() => {
    if (!needsVerification) return
    const t = setInterval(() => void check(true), 5000)
    const onFocus = () => void check(true)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [needsVerification, check])

  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedOut') return <Navigate to="/login" replace />
  if (!needsVerification) return <Navigate to={target} replace />

  async function resend() {
    setSending(true)
    try {
      const r = await sendVerification(target)
      if (r === 'verified') return void check(false)
      if (r === 'throttled') toast.info(t('Already sent', '이미 보냈어요'), { description: t('Give it a minute, and check your spam folder too.', '잠시 기다려 주세요. 스팸 메일함도 확인해 주세요.') })
      else toast.success(t('Email sent', '이메일을 보냈어요'), { description: t(`Check ${user?.email}.`, `${user?.email} 메일함을 확인해 주세요.`) })
      startCooldown(60)
    } catch (e) {
      toast.error(authErrorIn((e as { code?: string }).code, 'verify', lang))
    } finally {
      setSending(false)
    }
  }

  return (
    <AuthShell
      title={t('Confirm your email', '이메일을 인증해 주세요')}
      description={
        lang === 'ko' ? (
          <>
            <span className="font-medium wrap-anywhere text-foreground">{user?.email}</span> 주소로 링크를 보냈어요. 링크를 열어 이메일을 인증해 주세요. 인증하면
            이 페이지가 자동으로 넘어가요.
          </>
        ) : (
          <>
            We sent a link to <span className="font-medium wrap-anywhere text-foreground">{user?.email}</span>. Open it to confirm the address. This page
            moves on by itself once you have.
          </>
        )
      }
      footer={
        <>
          <p>
            {t(
              `The email comes from ${ACADEMY_NAME} (${SENDER_EMAIL}). Not there after a minute? Check your spam folder, or send it again.`,
              `이메일은 ${ACADEMY_NAME}(${SENDER_EMAIL})에서 보내요. 1분이 지나도 오지 않으면 스팸 메일함을 확인하거나 다시 보내 주세요.`,
            )}
          </p>
          <p>
            {t('Wrong email?', '이메일이 틀렸나요?')}{' '}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-2"
              onClick={async () => {
                await signOut()
                navigate('/signup', { replace: true })
              }}
            >
              {t('Start over with another one', '다른 이메일로 다시 시작하기')}
            </button>
            {lang === 'ko' ? null : '.'}
          </p>
        </>
      }
    >
      <div className="mb-6 flex justify-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <LuMailCheck className="size-7" />
        </div>
      </div>
      <div className="grid gap-2">
        <Button onClick={() => void check(false)} disabled={checking}>
          {checking ? <Spinner /> : null}
          {t('I’ve confirmed it', '인증했어요')}
        </Button>
        <Button variant="outline" onClick={() => void resend()} disabled={sending || cooldown > 0}>
          {sending ? <Spinner /> : null}
          {cooldown > 0 ? t(`Send again in ${cooldown}s`, `${cooldown}초 후 다시 보내기`) : t('Send the email again', '이메일 다시 보내기')}
        </Button>
      </div>
    </AuthShell>
  )
}
