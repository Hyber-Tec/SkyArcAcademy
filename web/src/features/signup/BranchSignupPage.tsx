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
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { FullPageMessage, FullPageSpinner } from '@/components/app/FullPage'
import { LangSwitch } from '@/components/app/LangSwitch'
import { UserMenu } from '@/components/app/UserMenu'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { db } from '@/lib/firebase'
import { useDoc } from '@/lib/firestore'
import { useT } from '@/lib/lang'
import { usePublicProfile } from '@/lib/publicProfile'
import { cn } from '@/lib/utils'
import { OrDivider } from '@/pages/public/authParts'
import { GoogleSignInButton } from '@/pages/public/GoogleButton'

const ROLE_CHOICES: { role: Role; title: string; text: string; ko: { title: string; text: string }; icon: typeof LuUsers }[] = [
  { role: 'coach', title: 'Coach or employee', text: 'I work at this academy.', ko: { title: '코치 또는 직원', text: '이 아카데미에서 일해요.' }, icon: LuUserRound },
  { role: 'parent', title: 'Parent or guardian', text: 'My child studies here.', ko: { title: '부모 또는 보호자', text: '자녀가 여기서 배우고 있어요.' }, icon: LuUsers },
  { role: 'student', title: 'Student', text: 'I take classes here.', ko: { title: '학생', text: '여기서 수업을 듣고 있어요.' }, icon: LuGraduationCap },
]

const ROLE_KO: Partial<Record<Role, string>> = { coach: '코치', parent: '학부모', student: '학생' }

/**
 * `/join`: a signed-in coach, parent or student the app couldn't find by their email asks the academy for access
 * (docs/DECISIONS.md §31); the office is told, and an admin approves it on the Account page.
 */
export function BranchSignupPage() {
  const branchId = ACADEMY_ID
  const { status, user, email, membership, needsVerification } = useAuth()
  const { data: profile, loading } = usePublicProfile()
  const requestRef = useMemo(() => (email ? doc(db, ROOT.branches, ACADEMY_ID, COL.signupRequests, email) : null), [email])
  const { data: request, loading: requestLoading } = useDoc<SignupRequest>(requestRef)
  const t = useT()

  useEffect(() => {
    if (profile) document.title = t(`Join ${profile.name}`, `${profile.name} 가입 신청`)
  }, [profile, t])

  if (loading || status === 'loading') return <FullPageSpinner />
  if (!profile) {
    return (
      <FullPageMessage
        title={t('Sign-up isn’t available', '가입 신청을 받을 수 없어요')}
        description={t('The academy isn’t set up for sign-ups yet.', '아카데미에서 아직 온라인 가입 신청을 받지 않아요.')}
        actions={[{ label: t('Go home', '홈으로'), to: '/' }]}
      />
    )
  }

  const isMember = membership?.member.status === 'active'
  const open = profile.status === 'active' && profile.signupEnabled && profile.signupRoles.length > 0

  return (
    <div className="min-h-svh bg-muted/40">
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 py-4">
        <SkyArcLogo className="h-12" />
        {user ? <UserMenu /> : null}
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {!open ? (
            <Message
              title={t('Sign-up is closed', '가입 신청이 마감됐어요')}
              text={t(`${profile.name} isn’t accepting new sign-ups online right now. Please contact the academy.`, `지금은 ${profile.name}에서 온라인 가입 신청을 받지 않아요. 아카데미에 문의해 주세요.`)}
            />
          ) : status !== 'signedIn' ? (
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{t(`Join ${profile.name}`, `${profile.name} 가입 신청`)}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {profile.signupMessage ||
                  t(
                    'Sign in or create an account with the email you gave the academy: a parent or student whose email is on file gets in right away. Anyone else asks here, and the academy reviews it.',
                    '아카데미에 등록한 이메일로 로그인하거나 계정을 만들어 주세요. 이메일이 등록된 학부모와 학생은 바로 들어갈 수 있어요. 그 밖의 분은 여기서 신청하면 아카데미가 확인해요.',
                  )}
              </p>
              <GoogleSignInButton className="mt-6 w-full" label={t('Continue with Google', 'Google로 계속하기')} />
              <OrDivider label={t('or use your email', '또는 이메일로')} />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" asChild>
                  <Link to={`/signup?next=${encodeURIComponent('/join')}`}>{t('Create an account', '계정 만들기')}</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to={`/login?next=${encodeURIComponent('/join')}`}>{t('Sign in with email', '이메일로 로그인')}</Link>
                </Button>
              </div>
            </div>
          ) : needsVerification ? (
            <div className="text-center">
              <h1 className="text-xl font-semibold tracking-tight">{t('Confirm your email first', '먼저 이메일을 인증해 주세요')}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(`We sent a link to ${user?.email}. Open it, then come back here to send your request.`, `${user?.email} 주소로 링크를 보냈어요. 링크를 열어 인증한 뒤 여기로 돌아와 신청해 주세요.`)}
              </p>
              <Button asChild className="mt-6">
                <Link to={`/verify-email?next=${encodeURIComponent('/join')}`}>{t('Continue', '계속')}</Link>
              </Button>
            </div>
          ) : isMember ? (
            <div className="text-center">
              <LuCircleCheck className="mx-auto mb-3 size-8 text-emerald-600" />
              <h1 className="text-xl font-semibold">{t('You already have access', '이미 이용할 수 있어요')}</h1>
              <p className="mt-2 text-sm text-muted-foreground">{t(`${email} is a member of ${profile.name}.`, `${email} 계정은 이미 ${profile.name}에 등록돼 있어요.`)}</p>
              <Button asChild className="mt-6">
                <Link to="/app">{t(`Open ${profile.name}`, `${profile.name} 열기`)}</Link>
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
              title={t('Request declined', '신청이 거절됐어요')}
              text={t(
                `${profile.name} declined the request from ${email}.${request.decisionNote ? ` Note: ${request.decisionNote}` : ''} Please contact the academy if this is a mistake.`,
                `${profile.name}에서 ${email} 계정의 신청을 거절했어요.${request.decisionNote ? ` 메모: ${request.decisionNote}` : ''} 잘못된 것 같다면 아카데미에 문의해 주세요.`,
              )}
            />
          ) : request?.status === 'approved' ? (
            <div className="text-center">
              <LuCircleCheck className="mx-auto mb-3 size-8 text-emerald-600" />
              <h1 className="text-xl font-semibold">{t('You’re approved', '신청이 승인됐어요')}</h1>
              <Button asChild className="mt-6">
                <Link to="/app">{t('Continue', '계속')}</Link>
              </Button>
            </div>
          ) : (
            <SignupForm branchId={branchId} profile={profile} />
          )}
        </div>
        <div className="mt-6 flex justify-center">
          <LangSwitch />
        </div>
        <CompanyFooter className="mt-3 text-center" />
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
  const t = useT()
  return (
    <div className="text-center">
      <LuClock className="mx-auto mb-3 size-8 text-amber-500" />
      <h1 className="text-xl font-semibold tracking-tight">{t('Request sent', '신청을 보냈어요')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t(
          `${profile.name} will review your request to join as a ${ROLE_LABELS[request.requestedRole].toLowerCase()}. We’ll email ${request.email} when it’s approved; then sign in with ${request.email} and you’ll go straight to your portal.`,
          `${profile.name}에서 ${ROLE_KO[request.requestedRole] ?? ROLE_LABELS[request.requestedRole]} 가입 신청을 확인할 거예요. 승인되면 ${request.email} 주소로 이메일을 보내 드려요. 그다음 ${request.email} 계정으로 로그인하면 바로 포털로 들어가요.`,
        )}
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
  const t = useT()
  const choices = ROLE_CHOICES.filter((c) => profile.signupRoles.includes(c.role))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !email || !role) return
    if (!firstName.trim() || !lastName.trim()) {
      toast.error(t('Enter your first and last name.', '이름과 성을 입력해 주세요.'))
      return
    }
    if (role === 'parent' && !studentNames.trim()) {
      toast.error(t('Enter your child’s name.', '자녀 이름을 입력해 주세요.'))
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
      toast.success(t('Request sent', '신청을 보냈어요'))
    } catch (err) {
      toast.error(t('Could not send the request', '신청을 보내지 못했어요'), { description: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <h1 className="text-xl font-semibold tracking-tight">{t(`Join ${profile.name}`, `${profile.name} 가입 신청`)}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('Signed in as', '로그인한 계정:')} <span className="font-medium text-foreground">{email}</span>
      </p>
      {profile.signupMessage ? <p className="mt-3 text-sm">{profile.signupMessage}</p> : null}
      <FieldGroup className="mt-6">
        <Field>
          <FieldLabel>{t('I am a…', '가입 유형')}</FieldLabel>
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
                <span className="text-sm font-medium">{t(c.title, c.ko.title)}</span>
                <span className="text-xs text-muted-foreground">{t(c.text, c.ko.text)}</span>
              </button>
            ))}
          </div>
        </Field>
        {role ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="su-first">{t('First name', '이름')}</FieldLabel>
                <Input id="su-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="su-last">{t('Last name', '성')}</FieldLabel>
                <Input id="su-last" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="su-phone">{t('Phone (optional)', '전화번호 (선택)')}</FieldLabel>
              <Input id="su-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            {role === 'parent' ? (
              <Field>
                <FieldLabel htmlFor="su-students">{t('Child’s name', '자녀 이름')}</FieldLabel>
                <Input id="su-students" value={studentNames} onChange={(e) => setStudentNames(e.target.value)} placeholder={t('e.g. Ava Patel', '예: Ava Patel')} />
                <FieldDescription>
                  {t(
                    'If you have several children at the academy, list them all. New to the academy? Say so in the message.',
                    '아카데미에 다니는 자녀가 여러 명이면 모두 적어 주세요. 아카데미가 처음이라면 메시지에 남겨 주세요.',
                  )}
                </FieldDescription>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="su-msg">{t('Message (optional)', '메시지 (선택)')}</FieldLabel>
              <Textarea id="su-msg" value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? <Spinner /> : null}
              {t('Send request', '신청 보내기')}
            </Button>
          </>
        ) : null}
      </FieldGroup>
    </form>
  )
}
