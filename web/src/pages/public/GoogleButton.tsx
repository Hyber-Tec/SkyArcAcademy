import { useState } from 'react'
import { FcGoogle } from 'react-icons/fc'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { authErrorMessage } from "@shared/auth";

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
          toast.error('Sign-in failed', { description: authErrorMessage((e as { code?: string }).code, 'google') })
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? <Spinner /> : <FcGoogle className="size-4" />}
      {label ?? 'Sign in with Google'}
    </Button>
  )
}
