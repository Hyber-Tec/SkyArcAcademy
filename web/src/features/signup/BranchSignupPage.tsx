import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { useEffect, useMemo, useState } from 'react'
import { LuCircleCheck, LuClock, LuGraduationCap, LuUserRound, LuUsers } from 'react-icons/lu'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ACADEMY_ID } from '@shared/academy'
import { COL, ROOT } from '@shared/paths'
import { ROLE_LABELS, type Role } from '@shared/roles'
import type { BranchPublicProfile, SignupRequest } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { BrandMark } from '@/components/app/BrandMark'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { UserMenu } from '@/components/app/UserMenu'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'
import { usePublicProfile } from '@/lib/publicProfile'
import { cn } from '@/lib/utils'
import { OrDivider } from '@/pages/public/authParts'
import { GoogleSignInButton } from '@/pages/public/GoogleButton'

const ROLE_CHOICES: { role: Role; title: string; text: string; icon: typeof LuUsers }[] = [
  { role: 'coach', title: 'Coach or employee', text: 'I work at this academy.', icon: LuUserRound },
  { role: 'parent', title: 'Parent or guardian', text: 'My child studies here.', icon: LuUsers },
  { role: 'student', title: 'Student', text: 'I take classes here.', icon: LuGraduationCap },
]

/** `/join`: a signed-in coach or parent asks the academy for access; an admin approves it on the Account page. */
export function BranchSignupPage() {
  const branchId = ACADEMY_ID
  const { status, user, email, membership, needsVerification } = useAuth()
  const { data: profile, loading } = usePublicProfile()
  const requestRef = useMemo(() => (email ? doc(db, ROOT.branches, ACADEMY_ID, COL.signupRequests, email) : null), [email])
  const { data: request, loading: requestLoading } = useDoc<SignupRequest>(requestRef)

  useEffect(() => {
    if (profile) document.title = `Join ${profile.name}`
  }, [profile])

  if (loading || status === 'loading') return <FullPageSpinner />
  if (!profile) {
    return <FullPageMessage title="Sign-up isn’t available" description="The academy isn’t set up for sign-ups yet." actions={[{ label: 'Go home', to: '/' }]} />
  }

  const isMember = membership?.member.status === 'active'
  const open = profile.status === 'active' && profile.signupEnabled && profile.signupRoles.length > 0

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-3">
          <BrandMark name={profile.name} logoUrl={profile.logoUrl} accentColor={profile.accentColor} className="size-10" />
          <div className="font-semibold leading-tight">{profile.name}</div>
        </div>
        {user ? <UserMenu /> : null}
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {!open ? (
            <Message title="Sign-up is closed" text={`${profile.name} isn’t accepting new sign-ups online right now. Please contact the academy.`} />
          ) : status !== 'signedIn' ? (
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Join {profile.name}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {profile.signupMessage || 'Sign in or create an account to request access. The academy will review your request.'}
              </p>
              <GoogleSignInButton className="mt-6 w-full" label="Continue with Google" />
              <OrDivider label="or use your email" />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" asChild>
                  <Link to={`/signup?next=${encodeURIComponent('/join')}`}>Create an account</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to={`/login?next=${encodeURIComponent('/join')}`}>Sign in with email</Link>
                </Button>
              </div>
            </div>
          ) : needsVerification ? (
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight">Confirm your email first</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a link to {user?.email}. Open it, then come back here to send your request.
              </p>
              <Button asChild className="mt-6">
                <Link to={`/verify-email?next=${encodeURIComponent('/join')}`}>Continue</Link>
              </Button>
            </div>
          ) : isMember ? (
            <div className="text-center">
              <LuCircleCheck className="mx-auto mb-3 size-8 text-emerald-600" />
              <h1 className="text-xl font-semibold">You already have access</h1>
              <p className="mt-2 text-sm text-muted-foreground">{email} is a member of {profile.name}.</p>
              <Button asChild className="mt-6">
                <Link to="/app">Open {profile.shortName || profile.name}</Link>
              </Button>
            </div>
          ) : requestLoading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : request?.status === 'pending' ? (
            <Pending request={request} profile={profile} />
          ) : request?.status === 'rejected' ? (
            <Message
              title="Request declined"
              text={`${profile.name} declined the request from ${email}.${request.decisionNote ? ` Note: ${request.decisionNote}` : ''} Please contact the academy if this is a mistake.`}
            />
          ) : request?.status === 'approved' ? (
            <div className="text-center">
              <LuCircleCheck className="mx-auto mb-3 size-8 text-emerald-600" />
              <h1 className="text-xl font-semibold">You’re approved</h1>
              <Button asChild className="mt-6">
                <Link to="/app">Continue</Link>
              </Button>
            </div>
          ) : (
            <SignupForm branchId={branchId} profile={profile} />
          )}
        </div>
        <CompanyFooter className="mt-6 text-center" />
      </main>
    </div>
  )
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

function Pending({ request, profile }: { request: SignupRequest; profile: BranchPublicProfile }) {
  return (
    <div className="text-center">
      <LuClock className="mx-auto mb-3 size-8 text-amber-500" />
      <h1 className="text-xl font-semibold tracking-tight">Request sent</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {profile.name} will review your request to join as a {ROLE_LABELS[request.requestedRole].toLowerCase()}. We’ll email {request.email} when it’s
        approved; then sign in with {request.email} and you’ll go straight to your portal.
      </p>
    </div>
  )
}

function SignupForm({ branchId, profile }: { branchId: string; profile: BranchPublicProfile }) {
  const { user, email } = useAuth()
  const [first, ...rest] = (user?.displayName ?? '').split(' ')
  const [role, setRole] = useState<Role | null>(profile.signupRoles.length === 1 ? profile.signupRoles[0] : null)
  const [firstName, setFirstName] = useState(first ?? '')
  const [lastName, setLastName] = useState(rest.join(' '))
  const [phone, setPhone] = useState('')
  const [studentNames, setStudentNames] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const choices = ROLE_CHOICES.filter((c) => profile.signupRoles.includes(c.role))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !email || !role) return
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('Enter your first and last name.')
      return
    }
    if (role === 'parent' && !studentNames.trim()) {
      toast.error('Enter your child’s name.')
      return
    }
    setBusy(true)
    try {
      await setDoc(doc(db, ROOT.branches, branchId, COL.signupRequests, email), {
        email,
        uid: user.uid,
        photoURL: user.photoURL ?? null,
        requestedRole: role,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        message: message.trim(),
        studentNames: studentNames.trim(),
        status: 'pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      toast.success('Request sent')
    } catch (err) {
      toast.error('Could not send the request', { description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h1 className="text-xl font-semibold tracking-tight">Join {profile.name}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{email}</span>
      </p>
      {profile.signupMessage ? <p className="mt-3 text-sm">{profile.signupMessage}</p> : null}
      <FieldGroup className="mt-6">
        <Field>
          <FieldLabel>I am a…</FieldLabel>
          <div className="grid gap-2 sm:grid-cols-3">
            {choices.map((c) => (
              <button
                key={c.role}
                type="button"
                onClick={() => setRole(c.role)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors',
                  role === c.role ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:bg-muted',
                )}
              >
                <c.icon className="size-5 text-muted-foreground" />
                <span className="text-sm font-medium">{c.title}</span>
                <span className="text-xs text-muted-foreground">{c.text}</span>
              </button>
            ))}
          </div>
        </Field>
        {role ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="su-first">First name</FieldLabel>
                <Input id="su-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="su-last">Last name</FieldLabel>
                <Input id="su-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="su-phone">Phone (optional)</FieldLabel>
              <Input id="su-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            {role === 'parent' ? (
              <Field>
                <FieldLabel htmlFor="su-students">Child’s name</FieldLabel>
                <Input id="su-students" value={studentNames} onChange={(e) => setStudentNames(e.target.value)} placeholder="e.g. Ava Patel" />
                <FieldDescription>If you have several children at the academy, list them all.</FieldDescription>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="su-msg">Message (optional)</FieldLabel>
              <Textarea id="su-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? <Spinner /> : null}
              Send request
            </Button>
          </>
        ) : null}
      </FieldGroup>
    </form>
  )
}
