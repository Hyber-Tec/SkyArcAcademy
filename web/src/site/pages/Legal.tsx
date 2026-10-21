import type { ReactNode } from 'react'
import { LuArrowRight, LuMail, LuPhone } from 'react-icons/lu'
import { APP_DOMAIN, COMPANY_NAME } from '@shared/brand'
import type { DateKey } from '@shared/time'
import { useSiteData } from '@/site/data'
import { ACADEMY, type L, type Lang, l } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { A, useSite } from '@/site/kit/site'
import { Container } from '../components/bits'
import { FinalCta, PageHero } from '../components/blocks'

/**
 * The privacy policy and Help, as pages of the website (the App Store and Google Play link both: the policy's address
 * and the Support URL; the phone app opens them too). The policy is the academy's, approved by it on 2026-10-20 (the
 * owner); its English is the text in force, so the Korean page shows it in English under a note. Help is translated
 * like the rest of the site (a draft the owner reviews). The academy's email and phone come from Settings → Academy.
 */
const UPDATED: DateKey = '2026-10-20'
const EFFECTIVE: DateKey = '2026-10-20'

const TEXT = {
  privacyKicker: l('Privacy', '개인정보'),
  privacyTitle: l('Privacy Policy', '개인정보 처리방침'),
  inEffect: l('In effect from', '시행일'),
  updated: l('Last updated', '최종 수정일'),
  englishOnly: l('', '이 개인정보 처리방침은 영어로 제공되며, 영어 원문이 기준입니다.'),
  contents: l('On this page', '목차'),
  message: l('Send a message from the website', '웹사이트로 문의하기'),
  helpKicker: l('Help', '도움말'),
  helpTitle: l('How can we help?', '무엇을 도와드릴까요?'),
  helpLead: l(
    'The website and Sky Arc, the academy’s phone app: whom to ask about what, signing in, and your account.',
    '웹사이트와 아카데미의 휴대폰 앱 Sky Arc: 무엇을 누구에게 물어야 하는지, 로그인, 그리고 계정에 대해 안내합니다.',
  ),
}

const dateIn = (key: DateKey, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'ko' ? 'ko-KR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`))

interface Section {
  id: string
  title: string
  body: ReactNode
}

const link = 'font-medium text-ink underline decoration-ink/30 underline-offset-[3px] transition hover:decoration-ink'

/** A page to read: its sections with a list of them beside on wide screens, in the site's type. */
function Document({ sections, lang: textLang }: { sections: Section[]; lang?: Lang }) {
  const { t } = useSite()
  return (
    <section className="py-14 sm:py-20">
      <Container className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
        <nav aria-label={t(TEXT.contents)} className="hidden lg:block">
          <div className="sticky top-28">
            <p className="text-[12px] font-semibold tracking-[0.14em] text-stone uppercase">{t(TEXT.contents)}</p>
            <ol className="mt-4 grid gap-1 border-l border-line">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} lang={textLang} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-[14px] leading-snug text-stone transition hover:border-ink hover:text-ink">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <article lang={textLang} className="max-w-[720px] text-[16px] leading-[1.75] text-ink/85">
          {sections.map((s, i) => (
            <Reveal key={s.id} delay={i === 0 ? 0 : 0.02}>
              <section id={s.id} aria-labelledby={`${s.id}-title`} className="border-t border-line py-9 first:border-t-0 first:pt-0">
                <h2 id={`${s.id}-title`} className="text-[24px] leading-tight font-semibold tracking-tight text-ink sm:text-[26px]">
                  {s.title}
                </h2>
                <div className="mt-4 space-y-4">{s.body}</div>
              </section>
            </Reveal>
          ))}
        </article>
      </Container>
    </section>
  )
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="grid gap-3">
      {items.map((item, i) => (
        <li key={i} className="relative pl-5 before:absolute before:top-[0.72em] before:left-0 before:size-1.5 before:rounded-full before:bg-dot">
          {item}
        </li>
      ))}
    </ul>
  )
}

/** The academy's email and phone (Settings → Academy), and the Contact page. */
function ContactWays() {
  const { t } = useSite()
  const { contact } = useSiteData()
  return (
    <ul className="grid gap-2.5 not-italic">
      {contact.email ? (
        <li className="flex items-center gap-3">
          <LuMail className="size-[18px] shrink-0 text-ink" aria-hidden="true" />
          <a href={`mailto:${contact.email}`} className={`${link} min-w-0 [overflow-wrap:anywhere]`}>
            {contact.email}
          </a>
        </li>
      ) : null}
      {contact.phone ? (
        <li className="flex items-center gap-3">
          <LuPhone className="size-[18px] shrink-0 text-ink" aria-hidden="true" />
          <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className={`${link} whitespace-nowrap`}>
            {contact.phone}
          </a>
        </li>
      ) : null}
      <li className="flex items-center gap-3">
        <LuArrowRight className="size-[18px] shrink-0 text-ink" aria-hidden="true" />
        <A to="contact" className={link}>
          {t(TEXT.message)}
        </A>
      </li>
    </ul>
  )
}

function Dates() {
  const { t, lang } = useSite()
  return (
    <p className="mt-6 text-[14px] text-stone">
      {t(TEXT.inEffect)} {dateIn(EFFECTIVE, lang)} · {t(TEXT.updated)} {dateIn(UPDATED, lang)}
    </p>
  )
}

export function Privacy() {
  const { t, lang } = useSite()
  const { name } = useSiteData()
  const academy = name ?? ACADEMY.name
  const sections: Section[] = [
    {
      id: 'information',
      title: 'Information we keep',
      body: (
        <List
          items={[
            <>
              <strong>Your account.</strong> Your name and email address. If you sign in with Google, the name and picture on that Google account. If you sign in with a
              password, it’s stored only in scrambled form by our sign-in service; no one at the academy can see it.
            </>,
            <>
              <strong>Parents and guardians.</strong> Your name, email address, phone number and relationship to the student.
            </>,
            <>
              <strong>Students.</strong> Name, grade, school, date of birth, level and program, contact details we’re given, class schedule, attendance, and notes from
              coaches and staff. As the academy adds results: scores, score reports from the range’s electronic scoring system, and photos of paper targets.
            </>,
            <>
              <strong>Coaches and staff.</strong> Name, contact details, date of birth and address, availability, schedule, clock-in and clock-out times, pay rates and
              pay. Time clock PINs are stored only in scrambled form.
            </>,
            <>
              <strong>Requests and questions sent from this website.</strong> When you ask for a trial or send us a question: your name, email address and phone number,
              the student’s name, grade and experience, the days that suit you, the language you’d like our reply in, and your message. We use them to answer you and
              arrange the trial. To stop the forms being misused, we count requests by a scrambled form of the sender’s network address and email address.
            </>,
            <>
              <strong>Messages and activity.</strong> Announcements and comments, who has opened an announcement or a progress report and when (the academy’s staff see
              it), notification settings, and a record of changes made in the app (who changed what, and when), so mistakes can be found and fixed.
            </>,
            <>
              <strong>Technical information.</strong> Your browser or phone keeps your sign-in and a few display preferences on your device. If you allow notifications
              on a device, we keep a notification token for it. Our cloud and sign-in providers keep standard technical logs, such as IP addresses, device and browser
              types and error reports, for security, preventing fraud and troubleshooting. We don’t use advertising or analytics cookies.
            </>,
          ]}
        />
      ),
    },
    {
      id: 'phone-app',
      title: 'The phone app',
      body: (
        <List
          items={[
            'You sign in with Google or with an email and a password; the app opens only for an email the academy has added.',
            'Staff can photograph a student’s paper target, or choose a photo of one, to score it. The app asks for the camera or your photos only then, reads the target on the phone, and files a copy of the target and its scores in that student’s records. It doesn’t save anything to your photos and doesn’t look at your other photos.',
            'The app doesn’t collect your location, contacts or microphone, and has no advertising, analytics or tracking.',
          ]}
        />
      ),
    },
    {
      id: 'use',
      title: 'How we use it',
      body: (
        <>
          <List
            items={[
              'To run classes: scheduling, attendance, makeup classes and trial visits.',
              'To record and share students’ progress and results with their own families.',
              'To tell families and staff about classes, changes and news, by email and in the app.',
              'To answer requests and questions sent from this website.',
              'To pay coaches and staff.',
              'To keep the website and app secure and working.',
            ]}
          />
          <p>We don’t sell or rent personal information, and we don’t use it for advertising.</p>
        </>
      ),
    },
    {
      id: 'who-sees',
      title: 'Who can see it',
      body: (
        <List
          items={[
            'Parents and guardians see only their own children’s information: their classes, their scores (with the result each came from) and the progress reports the academy shares.',
            'Students with their own login see only their own information, the same way.',
            'Coaches see what they need to teach: students’ names, grades, levels, schedules and progress, and they record results. Contact details and private notes are kept to the academy’s admins.',
            'The academy’s owners and admins see what they need to run the academy. Pay information is seen only by the staff member it belongs to and the people who run payroll.',
            'Reports and results are never posted at public web addresses. They open only for people who are signed in and allowed to see them.',
            <>
              A few service providers run the website and app for us: a cloud hosting and database provider, our sign-in service and our email service. They use the
              information only to provide their service to us and protect it as this policy does. {COMPANY_NAME} builds and maintains the website and app for the
              academy and uses the information only to support them, under the same protection.
            </>,
            'We may share information when the law requires it, or to protect someone’s safety.',
          ]}
        />
      ),
    },
    {
      id: 'children',
      title: 'Children',
      body: (
        <p>
          Most of our students are under 18, and many are under 13. We get children’s information from their parents or guardians, or from the academy’s own records,
          and keep only what we need to teach them and keep families informed. A child under 13 gets their own login only with a parent’s permission. Parents can see
          their child’s information, ask us to correct or delete it, and ask us to stop collecting it, by contacting us below.
        </p>
      ),
    },
    {
      id: 'safety',
      title: 'Keeping it safe, and for how long',
      body: (
        <>
          <p>
            The records and files are stored with our cloud provider in the United States. Information is encrypted on its way to and from the website and app and
            while it’s stored. Every account needs a verified email address, and what each person can see depends on their role at the academy.
          </p>
          <p>
            We keep information while a student is enrolled or an account is in use, and after that only as long as the academy needs it for its records or the law
            requires it (for example, payroll records). Then we delete it.
          </p>
        </>
      ),
    },
    {
      id: 'choices',
      title: 'Your choices',
      body: (
        <>
          <List
            items={[
              'See and correct your information and your children’s, or ask us to.',
              'Ask for a copy of your information, or for it to be deleted.',
              'Delete your login: yourself in the phone app (More → Delete my account), or by asking us. This removes your sign-in and your access; the academy keeps the records it must keep (a student’s results, payroll), as above, until you ask us to delete them too.',
              'Withdraw your consent at any time by deleting your login or contacting us; it doesn’t affect what was done before.',
              'Turn notifications on or off in the app, and the camera or photo access in your phone’s settings.',
            ]}
          />
          <p>
            Help with the website or the app:{' '}
            <A to="help" className={link}>
              Help
            </A>
            .
          </p>
        </>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to this policy',
      body: (
        <p>
          When we change this policy, we update the date at the top. If a change matters to how we use your information, we tell families and staff in the app or by
          email first.
        </p>
      ),
    },
    {
      id: 'contact',
      title: 'Contact us',
      body: (
        <>
          <p>Questions, or a request about your information or your child’s? Contact {academy}:</p>
          <ContactWays />
        </>
      ),
    },
  ]
  return (
    <>
      <PageHero
        kicker={t(TEXT.privacyKicker)}
        title={t(TEXT.privacyTitle)}
        text={`${academy} (“the academy”, “we”) uses this website, at ${APP_DOMAIN}, and its phone app, Sky Arc, to schedule classes, keep attendance, record students’ results, pay its coaches and share students’ progress with their families. This policy explains what information we keep, why we keep it, who can see it and the choices you have.`}
        textLang="en"
      >
        <Dates />
        {lang === 'ko' ? <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-[14.5px] text-ink/80 shadow-soft">{t(TEXT.englishOnly)}</p> : null}
      </PageHero>
      <Document sections={sections} lang="en" />
      <FinalCta />
    </>
  )
}

const HELP = {
  ask: {
    title: l('Classes, your account, a student’s records', '수업, 계정, 학생 기록'),
    text: l('The academy runs all of it, so ask the academy:', '모두 아카데미가 관리하니, 아카데미에 문의해 주세요.'),
  },
  signIn: {
    title: l('Signing in', '로그인'),
    items: [
      l(
        'The academy gives each person access by their email address: sign in with the email it has for you, with Google or with a password.',
        '아카데미는 이메일 주소로 접근 권한을 드립니다. 아카데미에 등록된 이메일로, Google 또는 비밀번호를 사용해 로그인하세요.',
      ),
      l('Forgot your password?', '비밀번호를 잊으셨나요?'),
      l(
        '“No access yet” means the academy hasn’t added the email you signed in with: ask it to, or sign in with the email its invitation went to.',
        '“아직 접근 권한이 없습니다”는 로그인한 이메일을 아카데미가 아직 등록하지 않았다는 뜻입니다. 등록을 요청하시거나, 초대 메일을 받은 이메일로 로그인하세요.',
      ),
      l(
        'A password account opens once its email is confirmed: look for the email from the academy, or ask for a new one from the sign-in page.',
        '비밀번호 계정은 이메일 확인 후에 열립니다. 아카데미에서 보낸 메일을 확인하시거나, 로그인 화면에서 새 확인 메일을 요청하세요.',
      ),
    ],
    reset: l('Choose a new one', '새 비밀번호 만들기'),
  },
  delete: {
    title: l('Deleting your account', '계정 삭제'),
    text: l(
      'In the phone app: More → Delete my account. Or ask the academy, using the contact details above. What’s deleted and what the academy keeps is in the',
      '휴대폰 앱에서: 더보기 → 내 계정 삭제. 또는 위 연락처로 아카데미에 요청하세요. 무엇이 삭제되고 아카데미가 무엇을 보관하는지는',
    ),
    policy: l('privacy policy', '개인정보 처리방침'),
    after: l('.', '에 안내되어 있습니다.'),
  },
  problem: {
    title: l('A problem with the website or the app', '웹사이트나 앱에 문제가 있을 때'),
    text: l(
      'Something doesn’t work, or looks wrong? Tell the academy, using the contact details above: say what you were doing, on which phone or browser, and what happened.',
      '작동하지 않거나 이상해 보이는 부분이 있나요? 위 연락처로 아카데미에 알려 주세요. 무엇을 하던 중이었는지, 어떤 휴대폰이나 브라우저였는지, 무슨 일이 있었는지 함께 적어 주세요.',
    ),
  },
}

export function Help() {
  const { t } = useSite()
  const tr = (x: L) => t(x)
  const sections: Section[] = [
    {
      id: 'ask',
      title: tr(HELP.ask.title),
      body: (
        <>
          <p>{tr(HELP.ask.text)}</p>
          <ContactWays />
        </>
      ),
    },
    {
      id: 'signing-in',
      title: tr(HELP.signIn.title),
      body: (
        <List
          items={[
            tr(HELP.signIn.items[0]),
            <>
              {tr(HELP.signIn.items[1])}{' '}
              <a href="/forgot-password" className={link}>
                {tr(HELP.signIn.reset)}
              </a>
              .
            </>,
            tr(HELP.signIn.items[2]),
            tr(HELP.signIn.items[3]),
          ]}
        />
      ),
    },
    {
      id: 'delete',
      title: tr(HELP.delete.title),
      body: (
        <p>
          {tr(HELP.delete.text)}{' '}
          <A to="privacy" className={link}>
            {tr(HELP.delete.policy)}
          </A>
          {tr(HELP.delete.after)}
        </p>
      ),
    },
    { id: 'problem', title: tr(HELP.problem.title), body: <p>{tr(HELP.problem.text)}</p> },
  ]
  return (
    <>
      <PageHero kicker={t(TEXT.helpKicker)} title={t(TEXT.helpTitle)} text={t(TEXT.helpLead)} />
      <Document sections={sections} />
      <FinalCta />
    </>
  )
}
