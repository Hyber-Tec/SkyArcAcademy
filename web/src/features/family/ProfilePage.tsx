import { LuBell, LuBookOpen, LuChevronRight, LuExternalLink, LuKeyRound, LuLanguages, LuLifeBuoy, LuShieldCheck, LuSunMoon, LuUserRound } from 'react-icons/lu'
import { Link } from 'react-router'
import { LANG_NAMES, dateText } from '@shared/i18n'
import { gradeLabel, initials } from '@shared/people'
import { ROLE_LABELS } from '@shared/roles'
import type { Student, WithId } from '@shared/types'
import { useAuth } from '@/auth/AuthProvider'
import { useBranch } from '@/branch/BranchProvider'
import { LangSwitch } from '@/components/app/LangSwitch'
import { useTheme } from '@/components/app/theme'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { FamilyContractFact } from '@/features/contracts/FamilyContractFact'
import { useSignedFor, useWaitingFor } from '@/features/contracts/family'
import { NoticeSwitches } from '@/features/notifications/NoticeSwitches'
import { ProfileLayout, SectionTitle } from '@/features/profile/ProfileLayout'
import { THEME_LABELS_KO } from '@/features/profile/themeText'
import { useIsMobile } from '@/hooks/use-mobile'
import { useLang, useT } from '@/lib/lang'
import { signInWaysIn } from '@/pages/public/authText'
import { type Family, useAcademyContactDetails, useFamily } from './data'
import { ContactLinks, KidMark } from './FamilyWidgets'

const ROLE_KO = { parent: '학부모', student: '학생' } as const

/** "Grade 7", "7학년"; a grade the academy wrote in words stays as written. */
const gradeIn = (grade: string, ko: boolean) => (ko && /^\d+$/.test(grade.trim()) ? `${grade.trim()}학년` : gradeLabel(grade))

/**
 * Parent and Student → Profile: the person and the children they see (or the student's own record), how they sign in,
 * the website's look, and how to reach the academy. The coach's Profile, for families: sections in a side list on
 * computers, a list of rows on phones.
 */
export function FamilyProfilePage() {
  const family = useFamily()
  const { theme } = useTheme()
  const lang = useLang()
  const t = useT()
  const base = `/${family.who}/profile`
  const account = { to: 'account', label: t('Account', '계정'), icon: LuUserRound }
  const notifications = { to: 'notifications', label: t('Notifications', '알림'), icon: LuBell }
  const security = { to: 'security', label: t('Sign-in & security', '로그인 및 보안'), icon: LuKeyRound }
  const appearance = { to: 'appearance', label: t('Appearance', '화면'), icon: LuSunMoon, value: t(theme[0].toUpperCase() + theme.slice(1), THEME_LABELS_KO[theme]) }
  // Parents read the portal in English or Korean; students' is English (docs/DECISIONS.md §36). Both names show, so
  // it's found in either.
  const language = family.who === 'parent' ? { to: 'language', label: t('Language · 언어', '언어 · Language'), icon: LuLanguages, value: LANG_NAMES[lang] } : null
  const help = { to: 'help', label: t('Contact & help', '문의 및 도움말'), icon: LuLifeBuoy }
  const settings = [notifications, security, appearance, ...(language ? [language] : [])]
  return (
    <ProfileLayout
      base={base}
      header={<FamilyHeader family={family} />}
      sections={[account, ...settings, help]}
      groups={[
        { title: t('Your account', '내 계정'), rows: [account] },
        { title: t('Settings', '설정'), rows: settings },
        // The section has the Help page and the privacy policy too.
        { title: t('Help', '도움말'), rows: [help] },
      ]}
    />
  )
}

/** Profile → Notifications: what the family is told about (classes, answers, scores, reports, news). */
export function FamilyNotificationsSection() {
  const t = useT()
  return (
    <div className="space-y-4">
      <SectionTitle title={t('Notifications', '알림')} description={t("What you're told about, in the bell and on your phone.", '알림함과 휴대폰으로 받을 알림을 골라요.')} />
      <NoticeSwitches />
    </div>
  )
}

/** Profile → Language · 언어 (parents): the website's language in this browser; the phone app has its own, in More. */
export function FamilyLanguageSection() {
  const t = useT()
  return (
    <div>
      <SectionTitle
        title={t('Language · 언어', '언어 · Language')}
        description={t('The website’s language in this browser. Emails from the academy stay in English.', '이 브라우저에서 보는 웹사이트의 언어예요. 아카데미에서 보내는 이메일은 영어로 와요.')}
      />
      <section className="rounded-xl border bg-card p-5" data-testid="profile-language">
        <LangSwitch className="text-base" />
        <p className="mt-3 text-sm text-muted-foreground">
          {t(
            'The enrollment contract’s English text is the official one; a Korean translation, when there is one, is there to help you read it.',
            '등록 계약서는 영어 원문이 공식 문서예요. 한국어 번역이 있으면 이해를 돕기 위해 함께 보여 드려요.',
          )}
        </p>
      </section>
    </div>
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
  const t = useT()
  const name = family.personName || (family.who === 'parent' ? t('Parent', '학부모') : t('Student', '학생'))
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
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{t(`${ROLE_LABELS[family.who]} at ${branch.name}`, `${branch.name} ${ROLE_KO[family.who]}`)}</p>
        {!viewAs && email ? <p className="truncate text-sm text-muted-foreground">{email}</p> : null}
      </div>
    </header>
  )
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
  const { map: signed } = useSignedFor(family.ids)
  const { map: waiting } = useWaitingFor(family.ids)
  const lang = useLang()
  const t = useT()
  const base = `/${family.who}/profile`
  const you: [string, React.ReactNode][] = [
    [t('Name', '이름'), family.personName || '—'],
    ...(!viewAs ? ([[t('Email', '이메일'), email ?? '—']] as [string, React.ReactNode][]) : []),
    [t('Role', '역할'), t(ROLE_LABELS[family.who], ROLE_KO[family.who])],
    ...(!viewAs ? ([[t('Signs in with', '로그인 방법'), signInWaysIn(methods, lang)]] as [string, React.ReactNode][]) : []),
  ]
  const securityLink = (label: string) => (
    <Link to={`${base}/security`} className="font-medium text-foreground underline-offset-4 hover:underline">
      {label}
    </Link>
  )
  return (
    <div>
      <SectionTitle
        title={t('Account', '계정')}
        description={
          family.who === 'parent'
            ? t(`You, and the children you see at ${branch.name}.`, `내 계정과 ${branch.name}에 등록된 자녀 정보예요.`)
            : t(`You, and what ${branch.name} has on file for you.`, `내 계정과 ${branch.name}에 등록된 내 정보예요.`)
        }
      />
      <div className="space-y-6">
        <section className="overflow-hidden rounded-xl border bg-card" aria-labelledby="you-title">
          <div className="border-b px-5 py-4">
            <h3 id="you-title" className="text-sm font-semibold">
              {t('Your account', '내 계정')}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {viewAs ? (
                t('A preview: their email and how they sign in stay private.', '미리 보기라서 이메일과 로그인 방법은 보이지 않아요.')
              ) : lang === 'ko' ? (
                <>이 이메일에 연결된 정보를 볼 수 있어요. 로그인 방법은 {securityLink('로그인 및 보안')}에서 바꿀 수 있어요.</>
              ) : (
                <>
                  Your access follows this email. Change how you sign in under{' '}
                  {securityLink('Sign-in & security')}
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
            <h3 className="font-semibold">{family.who === 'parent' ? t('Your children', '자녀') : t('Your student record', '내 학생 정보')}</h3>
            <p className="mt-1 text-muted-foreground">
              {family.who === 'parent'
                ? t(`No children are linked to your account yet. Ask ${branch.name} to link them.`, `아직 계정에 연결된 자녀가 없어요. ${branch.name}에 연결을 요청해 주세요.`)
                : t(`Your account isn’t linked to your student record yet. Ask ${branch.name} to link it.`, `아직 계정이 학생 정보와 연결되지 않았어요. ${branch.name}에 연결을 요청해 주세요.`)}
            </p>
          </section>
        ) : (
          family.kids.map((k) => <KidCard key={k.id} kid={k} family={family} contract={<FamilyContractFact studentId={k.id} signed={signed.get(k.id)} waiting={waiting.get(k.id)} />} />)
        )}

        <p className="px-1 text-sm text-muted-foreground">
          {t('Something out of date? The academy keeps these.', '바뀐 정보가 있으면 아카데미에 알려 주세요.')}{' '}
          <Link to={`${base}/help`} className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-4 hover:underline">
            {t(`Contact ${branch.name}`, `${branch.name}에 문의`)} <LuChevronRight className="size-3.5" />
          </Link>
        </p>
      </div>
    </div>
  )
}

function KidCard({ kid, family, contract }: { kid: WithId<Student>; family: Family; contract: React.ReactNode }) {
  const { branch } = useBranch()
  const lang = useLang()
  const t = useT()
  const rows: [string, React.ReactNode][] = [
    [t('Grade', '학년'), kid.grade ? gradeIn(kid.grade, lang === 'ko') : '—'],
    [t('Level', '레벨'), kid.level || '—'],
    [t('Program', '프로그램'), kid.program || '—'],
    [t('School', '학교'), kid.school || '—'],
    [t('Classes since', '수업 시작'), kid.firstSessionDate ? dateText(kid.firstSessionDate, 'monthYear', lang) : '—'],
    ...(contract ? ([[t('Enrollment contract', '등록 계약서'), contract]] as [string, React.ReactNode][]) : []),
  ]
  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label={kid.name} data-testid="profile-kid">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        {family.who === 'parent' ? <KidMark name={family.firstName(kid.id)} tint={family.kids.length > 1 ? family.tint(kid.id) : 'bg-muted text-foreground'} className="size-8 text-sm" /> : null}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{family.who === 'parent' ? kid.name : t(`At ${branch.name}`, branch.name)}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{family.who === 'parent' ? t('Your child', '자녀') : t('Your student record', '내 학생 정보')}</p>
        </div>
      </div>
      <Facts rows={family.who === 'parent' ? rows : [[t('Name', '이름'), kid.name], ...rows]} />
    </section>
  )
}

/** Profile → Contact & help: the academy's contact details, the Help page and the privacy policy. */
export function FamilyHelpSection() {
  const { branch } = useBranch()
  const c = useAcademyContactDetails()
  const lang = useLang()
  const t = useT()
  const any = !!(c.phone || c.email || c.address || c.website)
  // The website's own pages, in Korean at /ko/….
  const site = (path: string) => (lang === 'ko' ? `/ko${path}` : path)
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
      <LuExternalLink className="size-4 shrink-0 text-muted-foreground/70" aria-label={t('Opens in a new tab', '새 탭에서 열려요')} />
    </Link>
  )
  return (
    <div>
      <SectionTitle
        title={t('Contact & help', '문의 및 도움말')}
        description={t(`Classes, records and reports are kept by ${branch.name}: ask it about any of them.`, `수업, 기록, 리포트는 ${branch.name}에서 관리해요. 궁금한 점은 언제든 문의해 주세요.`)}
      />
      <div className="space-y-6">
        <section className="rounded-xl border bg-card p-5" aria-labelledby="contact-title" data-testid="profile-contact">
          <h3 id="contact-title" className="text-sm font-semibold">
            {t(`Contact ${branch.name}`, `${branch.name}에 문의`)}
          </h3>
          {any ? (
            <ContactLinks className="mt-3" />
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">{t(`${branch.name} hasn’t added its contact details here yet.`, `${branch.name}에서 아직 연락처를 등록하지 않았어요.`)}</p>
          )}
        </section>
        <section className="divide-y overflow-hidden rounded-xl border bg-card">
          {link(site('/help'), t('Help', '도움말'), t('Signing in, your account, and who to ask about what', '로그인, 계정, 문의할 곳 안내'), LuBookOpen)}
          {link(site('/privacy'), t('Privacy policy', '개인정보 처리방침'), t('What the academy keeps about you, and why', '아카데미가 보관하는 정보와 그 이유'), LuShieldCheck)}
        </section>
      </div>
    </div>
  )
}
