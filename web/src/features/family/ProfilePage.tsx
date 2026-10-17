import { LuBookOpen, LuChevronRight, LuExternalLink, LuKeyRound, LuLifeBuoy, LuShieldCheck, LuSunMoon, LuUserRound } from 'react-icons/lu'
import { Link } from 'react-router'
import { gradeLabel, initials } from '@shared/people'
import { ROLE_LABELS } from '@shared/roles'
import { formatDateKey } from '@shared/time'
import type { Student, WithId } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { useTheme } from '@/components/app/theme'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { ProfileLayout, SectionTitle } from '@/features/profile/ProfileLayout'
import { useIsMobile } from '@/hooks/use-mobile'
import { type Family, useAcademyContactDetails, useFamily } from './data'
import { ContactLinks, KidMark } from './FamilyWidgets'

/**
 * Parent and Student → Profile: the person and the children they see (or the student's own record), how they sign in,
 * the website's look, and how to reach the academy. The coach's Profile, for families: sections in a side list on
 * computers, a list of rows on phones.
 */
export function FamilyProfilePage() {
  const family = useFamily()
  const { theme } = useTheme()
  const base = `/${family.who}/profile`
  const account = { to: 'account', label: 'Account', icon: LuUserRound }
  const security = { to: 'security', label: 'Sign-in & security', icon: LuKeyRound }
  const appearance = { to: 'appearance', label: 'Appearance', icon: LuSunMoon, value: theme[0].toUpperCase() + theme.slice(1) }
  const help = { to: 'help', label: 'Contact & help', icon: LuLifeBuoy }
  return (
    <ProfileLayout
      base={base}
      header={<FamilyHeader family={family} />}
      sections={[account, security, appearance, help]}
      groups={[
        { title: 'Your account', rows: [account] },
        { title: 'Settings', rows: [security, appearance] },
        // The section has the Help page and the privacy policy too.
        { title: 'Help', rows: [help] },
      ]}
    />
  )
}

/** The profile's own address: the account on computers (phones show the list instead). */
export function FamilyProfileIndex() {
  const isMobile = useIsMobile()
  return isMobile ? null : <FamilyAccountSection />
}

function FamilyHeader({ family }: { family: Family }) {
  const { branch, viewAs } = useBranch()
  const { user, email } = useAuth()
  const name = family.personName || (family.who === 'parent' ? 'Parent' : 'Student')
  // Their own photo when it's really them (an owner or admin previewing sees initials).
  const photo = !viewAs ? user?.photoURL : null
  return (
    <header className="flex items-center gap-4">
      <Avatar className="size-16 text-lg">
        {photo ? <AvatarImage src={photo} alt="" referrerPolicy="no-referrer" /> : null}
        <AvatarFallback className="font-semibold">{initials(name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">
          {ROLE_LABELS[family.who]} at {branch.name}
        </p>
        {!viewAs && email ? <p className="truncate text-sm text-muted-foreground">{email}</p> : null}
      </div>
    </header>
  )
}

/** "Google", "Email and password", or both. */
function signInText(methods: { google: boolean; password: boolean }): string {
  if (methods.google && methods.password) return 'Google, or email and password'
  if (methods.google) return 'Google'
  if (methods.password) return 'Email and password'
  return '—'
}

function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y">
      {rows.map(([label, value]) => (
        <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 px-5 py-3 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Profile → Account: the person, and each child they see (a student: their own record), as the academy keeps it. */
export function FamilyAccountSection() {
  const { branch, viewAs } = useBranch()
  const { email, methods } = useAuth()
  const family = useFamily()
  const base = `/${family.who}/profile`
  const you: [string, React.ReactNode][] = [
    ['Name', family.personName || '—'],
    ...(!viewAs ? ([['Email', email ?? '—']] as [string, React.ReactNode][]) : []),
    ['Role', ROLE_LABELS[family.who]],
    ...(!viewAs ? ([['Signs in with', signInText(methods)]] as [string, React.ReactNode][]) : []),
  ]
  return (
    <div>
      <SectionTitle
        title="Account"
        description={family.who === 'parent' ? `You, and the children you see at ${branch.name}.` : `You, and what ${branch.name} has on file for you.`}
      />
      <div className="space-y-6">
        <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="you-title">
          <div className="border-b px-5 py-4">
            <h3 id="you-title" className="text-sm font-semibold">
              Your account
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {viewAs ? (
                'A preview: their email and how they sign in stay private.'
              ) : (
                <>
                  Your access follows this email. Change how you sign in under{' '}
                  <Link to={`${base}/security`} className="font-medium text-foreground underline-offset-4 hover:underline">
                    Sign-in & security
                  </Link>
                  .
                </>
              )}
            </p>
          </div>
          <Facts rows={you} />
        </section>

        {family.loading ? (
          <Skeleton className="h-48 w-full rounded-xl" />
        ) : family.notLinked ? (
          <section className="rounded-xl border bg-card px-5 py-4 text-sm">
            <h3 className="font-semibold">{family.who === 'parent' ? 'Your children' : 'Your student record'}</h3>
            <p className="mt-1 text-muted-foreground">
              {family.who === 'parent'
                ? `No children are linked to your account yet. Ask ${branch.name} to link them.`
                : `Your account isn’t linked to your student record yet. Ask ${branch.name} to link it.`}
            </p>
          </section>
        ) : (
          family.kids.map((k) => <KidCard key={k.id} kid={k} family={family} />)
        )}

        <p className="px-1 text-sm text-muted-foreground">
          Something out of date? The academy keeps these.{' '}
          <Link to={`${base}/help`} className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline">
            Contact {branch.name} <LuChevronRight className="size-3.5" />
          </Link>
        </p>
      </div>
    </div>
  )
}

function KidCard({ kid, family }: { kid: WithId<Student>; family: Family }) {
  const { branch } = useBranch()
  const rows: [string, React.ReactNode][] = [
    ['Grade', kid.grade ? gradeLabel(kid.grade) : '—'],
    ['Level', kid.level || '—'],
    ['Program', kid.program || '—'],
    ['School', kid.school || '—'],
    ['Classes since', kid.firstSessionDate ? formatDateKey(kid.firstSessionDate, 'monthYear') : '—'],
  ]
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label={kid.name} data-testid="profile-kid">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        {family.who === 'parent' ? <KidMark name={family.firstName(kid.id)} tint={family.kids.length > 1 ? family.tint(kid.id) : 'bg-muted text-foreground'} className="size-8 text-sm" /> : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{family.who === 'parent' ? kid.name : `At ${branch.name}`}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{family.who === 'parent' ? 'Your child' : 'Your student record'}</p>
        </div>
      </div>
      <Facts rows={family.who === 'parent' ? rows : [['Name', kid.name], ...rows]} />
    </section>
  )
}

/** Profile → Contact & help: the academy's contact details, the Help page and the privacy policy. */
export function FamilyHelpSection() {
  const { branch } = useBranch()
  const c = useAcademyContactDetails()
  const any = !!(c.phone || c.email || c.address || c.website)
  // The public pages open in a new tab, so the portal stays where it was.
  const link = (to: string, label: string, hint: string, Icon: typeof LuBookOpen) => (
    <Link to={to} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
      <LuExternalLink className="size-4 shrink-0 text-muted-foreground/70" aria-label="Opens in a new tab" />
    </Link>
  )
  return (
    <div>
      <SectionTitle title="Contact & help" description={`Classes, records and reports are kept by ${branch.name}: ask it about any of them.`} />
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-5" aria-labelledby="contact-title" data-testid="profile-contact">
          <h3 id="contact-title" className="text-sm font-semibold">
            Contact {branch.name}
          </h3>
          {any ? (
            <ContactLinks className="mt-3" />
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{branch.name} hasn’t added its contact details here yet.</p>
          )}
        </section>
        <section className="divide-y overflow-hidden rounded-xl border bg-card">
          {link('/help', 'Help', 'Signing in, your account, and who to ask about what', LuBookOpen)}
          {link('/privacy', 'Privacy policy', 'What the academy keeps about you, and why', LuShieldCheck)}
        </section>
      </div>
    </div>
  )
}
