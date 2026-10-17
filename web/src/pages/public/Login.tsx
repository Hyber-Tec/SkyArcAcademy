import { useEffect, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router'
import { authErrorMessage, isGoogleMailbox, looksLikeEmail } from '@shared/auth'
import { ACADEMY_NAME } from '@shared/brand'
import { useAuth } from '@/auth/AuthProvider'
import { FullPageSpinner } from '@/components/app/FullPage'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { signupOpen } from '@/lib/publicProfile'
import { AuthShell, OrDivider, PasswordInput, useAuthBranch, useNext, withQuery } from './authParts'
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

  useEffect(() => {
    document.title = `Sign in | ${academy}`
  }, [academy])

  if (status === 'loading' || loading) return <FullPageSpinner />
  if (status === 'signedIn') return <Navigate to={needsVerification ? withQuery('/verify-email', { next: target }) : target} replace />

  const query = { next: target === '/app' ? null : target, email: email.trim() || null }
  const gmail = isGoogleMailbox(email || hint || '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!looksLikeEmail(email)) return setError(authErrorMessage('invalid-email'))
    if (!password) return setError(authErrorMessage('missing-password'))
    setBusy(true)
    try {
      await signInWithPassword(email, password)
    } catch (err) {
      setError(authErrorMessage((err as { code?: string }).code, 'sign-in'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title={`Sign in to ${academy}`}
      description={
        hint ? (
          <>
            Use <span className="font-medium wrap-anywhere text-foreground">{hint}</span>, the email the academy has for you.
          </>
        ) : (
          'Use the email the academy has for you.'
        )
      }
      footer={
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
      }
    >
      <GoogleSignInButton className="w-full" label="Continue with Google" hint={hint} />
      <p className="mt-2 text-center text-xs text-muted-foreground">
        {gmail ? 'Recommended for Gmail addresses.' : 'Recommended if your email is a Google account.'}
      </p>
      <OrDivider label="or sign in with your email" />
      <form onSubmit={submit} noValidate>
        <FieldGroup className="gap-4">
          <Field>
            <FieldLabel htmlFor="login-email">Email</FieldLabel>
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
              <FieldLabel htmlFor="login-password">Password</FieldLabel>
              <Link to={withQuery('/forgot-password', query)} className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline">
                Forgot password?
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
            Sign in
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  )
}
