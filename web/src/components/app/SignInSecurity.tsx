import { useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { LuKeyRound } from 'react-icons/lu'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { useLang, useT } from '@/lib/lang'
import { PasswordInput, StrengthMeter } from '@/pages/public/authParts'
import { authErrorIn, passwordProblemIn } from '@/pages/public/authText'

/** How the account signs in (Google, a password), with "Change password" or "Add a password". */
export function SignInMethodsList({ onPassword }: { onPassword: () => void }) {
  const { methods, email } = useAuth()
  const t = useT()
  return (
    <div className="divide-y rounded-lg border">
      <div className="flex items-center gap-3 px-4 py-3">
        <FcGoogle className="size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Google</div>
          <div className="truncate text-xs text-muted-foreground">{methods.google ? email : t('Not connected', '연결 안 됨')}</div>
        </div>
        {methods.google ? <Badge variant="secondary">{t('Connected', '연결됨')}</Badge> : null}
      </div>
      <div className="flex items-center gap-3 px-4 py-3">
        <LuKeyRound className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{t('Password', '비밀번호')}</div>
          <div className="text-xs text-muted-foreground">
            {methods.password ? t('You can sign in with your email and password.', '이메일과 비밀번호로 로그인할 수 있어요.') : t('Add one to sign in without Google.', '비밀번호를 추가하면 Google 없이도 로그인할 수 있어요.')}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onPassword}>
          {methods.password ? t('Change', '변경') : t('Add', '추가')}
        </Button>
      </div>
    </div>
  )
}

/** Change the password (or add one to a Google account). Confirms the current password first. */
export function PasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { methods, email, changePassword, sendPasswordReset } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const adding = !methods.password
  const lang = useLang()
  const t = useT()

  const close = (o: boolean) => {
    if (!o) {
      setCurrent('')
      setNext('')
      setConfirm('')
      setError(null)
    }
    onOpenChange(o)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!adding && !current) return setError(t('Enter your current password.', '현재 비밀번호를 입력해 주세요.'))
    const problem = passwordProblemIn(next, email, lang)
    if (problem) return setError(problem)
    if (next !== confirm) return setError(t('The two new passwords don’t match.', '새 비밀번호가 서로 달라요.'))
    setBusy(true)
    try {
      await changePassword(adding ? null : current, next)
      toast.success(adding ? t('Password added', '비밀번호를 추가했어요') : t('Password changed', '비밀번호를 바꿨어요'), {
        description: adding ? t('You can now sign in with your email and password too.', '이제 이메일과 비밀번호로도 로그인할 수 있어요.') : undefined,
      })
      close(false)
    } catch (err) {
      setError(authErrorIn((err as { code?: string }).code, 'change-password', lang))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{adding ? t('Add a password', '비밀번호 추가') : t('Change your password', '비밀번호 변경')}</DialogTitle>
            <DialogDescription>
              {adding
                ? t(`Then you can also sign in with ${email} and this password, for example in the phone app.`, `추가하면 휴대폰 앱 등에서 이메일(${email})과 이 비밀번호로도 로그인할 수 있어요.`)
                : t(`For ${email}.`, `${email} 계정의 비밀번호예요.`)}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-6 gap-4">
            <input type="email" autoComplete="username" value={email ?? ''} readOnly hidden />
            {!adding ? (
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="pw-current">{t('Current password', '현재 비밀번호')}</FieldLabel>
                  <button
                    type="button"
                    className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline"
                    onClick={async () => {
                      if (!email) return
                      await sendPasswordReset(email).catch(() => undefined)
                      toast.success(t('Reset link sent', '재설정 링크를 보냈어요'), { description: t(`Check ${email}.`, `${email} 메일함을 확인해 주세요.`) })
                    }}
                  >
                    {t('Forgot it?', '잊으셨나요?')}
                  </button>
                </div>
                <PasswordInput id="pw-current" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="pw-new">{t('New password', '새 비밀번호')}</FieldLabel>
              <PasswordInput id="pw-new" value={next} onChange={setNext} autoComplete="new-password" placeholder={t('At least 8 characters', '8자 이상')} autoFocus={adding} />
              <StrengthMeter password={next} />
            </Field>
            <Field>
              <FieldLabel htmlFor="pw-confirm">{t('Type it again', '한 번 더 입력')}</FieldLabel>
              <PasswordInput id="pw-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {t('Cancel', '취소')}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner /> : null}
              {adding ? t('Add password', '비밀번호 추가') : t('Change password', '비밀번호 변경')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** "Sign-in & security" from the account menu: how the account signs in, and its password. */
export function SignInSecurityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [password, setPassword] = useState(false)
  const t = useT()
  return (
    <>
      <Dialog open={open && !password} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Sign-in & security', '로그인 및 보안')}</DialogTitle>
            <DialogDescription>
              {t('How you sign in to Sky Arc. Your access follows your email, whichever way you sign in.', 'Sky Arc에 로그인하는 방법이에요. 어떤 방법으로 로그인하든 같은 이메일로 연결돼요.')}
            </DialogDescription>
          </DialogHeader>
          <SignInMethodsList onPassword={() => setPassword(true)} />
        </DialogContent>
      </Dialog>
      <PasswordDialog
        open={open && password}
        onOpenChange={(o) => {
          if (!o) {
            setPassword(false)
            onOpenChange(false)
          }
        }}
      />
    </>
  )
}
