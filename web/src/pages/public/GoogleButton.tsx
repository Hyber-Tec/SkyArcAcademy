import { useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { useLang, useT } from '@/lib/lang'
import { authErrorIn } from './authText'

export function GoogleSignInButton({
  label,
  size = 'lg',
  className,
  hint,
}: {
  label?: string
  size?: 'default' | 'lg'
  className?: string
  /** Email to pre-select in Google's account chooser. */
  hint?: string | null
}) {
  const { signIn } = useAuth()
  const lang = useLang()
  const t = useT()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      size={size}
      variant="outline"
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await signIn(hint)
        } catch (e) {
          toast.error(t('Sign-in failed', '로그인하지 못했어요'), { description: authErrorIn((e as { code?: string }).code, 'google', lang) })
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? <Spinner /> : <FcGoogle className="size-4" />}
      {label ?? t('Sign in with Google', 'Google로 로그인')}
    </Button>
  )
}
