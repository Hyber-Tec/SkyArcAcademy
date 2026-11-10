import type { ReactNode } from 'react'
import { LuArrowRight, LuMail, LuPhone } from 'react-icons/lu'
import { APP_DOMAIN, COMPANY_NAME } from '@shared/brand'
import type { DateKey } from '@shared/time'
import { useSiteData } from '@/site/data'
import { ACADEMY, type L, type Lang, l } from '@/site/kit/content'
import { Reveal } from '@/site/kit/motion'
import { A, useSite } from '@/site/kit/site'
import { Container } from '../components/bits'
import { PageHero } from '../components/blocks'

/**
 * The privacy policy, the terms of service and Help, as pages of the website (the App Store and Google Play link both: the policy's address
 * and the Support URL; the phone app opens them too). The policy is the academy's, approved by it on 2026-10-20 (the
 * owner), and updated on 2026-11-03 for accounts made in the app, Sign in with Apple and the enrollment contract
 * (docs/DECISIONS.md §31), on 2026-11-04 for the details a family fills in on the contract (§33), and on 2026-11-05 for
 * the discounts the office sets and the signed copy emailed to whoever signs (§34, §35); its English is the text in
 * force, so the Korean page shows it in English under a note. Help
 * is translated like the rest of the site (a draft the owner reviews). The academy's email and phone come from
 * Settings → Academy.
 */
const UPDATED: DateKey = '2026-11-05'
const EFFECTIVE: DateKey = '2026-10-20'

const TEXT = {
  privacyKicker: l('Privacy', '개인정보'),
  privacyTitle: l('Privacy Policy', '개인정보 처리방침'),
  inEffect: l('In effect from', '시행일'),
  updated: l('Last updated', '최종 수정일'),
  englishOnly: l('', '개인정보 처리방침은 영어 원문으로 제공하며, 효력도 영어 원문을 따릅니다.'),
  termsKicker: l('Terms', '약관'),
  termsTitle: l('Terms of Service', '이용약관'),
  termsEnglishOnly: l('', '이용약관은 영어 원문으로 제공하며, 효력도 영어 원문을 따릅니다.'),
  contents: l('On this page', '목차'),
  message: l('Send a message from the website', '웹사이트에서 메시지 보내기'),
  helpKicker: l('Help', '도움말'),
  helpTitle: l('How can we help?', '무엇을 도와드릴까요?'),
  helpLead: l(
    'The website and Sky Arc, the academy’s phone app: whom to ask about what, signing in, and your account.',
    '웹사이트와 아카데미 앱 Sky Arc 이용 안내예요. 누구에게 무엇을 물어보면 되는지, 로그인하는 법, 계정 관리까지 알려 드려요.',
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

/** When a page's text took effect, and when it last changed (none yet: `updated` null). */
function Dates({ effective = EFFECTIVE, updated = UPDATED }: { effective?: DateKey; updated?: DateKey | null }) {
  const { t, lang } = useSite()
  return (
    <p className="mt-6 text-[14px] text-stone">
      {t(TEXT.inEffect)} {dateIn(effective, lang)}
      {updated ? ` · ${t(TEXT.updated)} ${dateIn(updated, lang)}` : null}
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
              <strong>Your account.</strong> Your name and email address. If you sign in with Google, the name and picture on that Google account. If you sign in with
              Apple, the name and email address Apple shares (which can be an address Apple makes to hide yours). If you sign in with a password, it’s stored only in
              scrambled form by our sign-in service; no one at the academy can see it.
            </>,
            <>
              <strong>Parents and guardians.</strong> Your name, email address, phone number and relationship to the student.
            </>,
            <>
              <strong>The enrollment contract.</strong> When a parent or guardian fills in and signs the academy’s contract, in the app, on this website or from a link
              the academy sends: what they fill in (the program they choose, their initials, the student’s name and date of birth, and their own name, phone number
              and email), their relationship to the student, the signature they draw, the date and time, their network address, their browser or phone, and the email
              they’re signed in with, if they are, with the discounts the academy applies. These make up the signed contract, a PDF kept with the student’s records,
              where only the academy’s owners and admins see it. We email the person who signs their copy, to the email they give on the contract and the one
              they’re signed in with, and the family can download it too.
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
            'You make your account, or sign in, with Google, with Apple (on an iPhone) or with an email and a password. A parent or student whose email is on the academy’s records gets in by it; anyone else asks the academy, which decides. Parents sign the academy’s enrollment contract in the app before using it.',
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
              'To send families the enrollment contract to sign, and whoever signs it their signed copy.',
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
    </>
  )
}

/**
 * The terms of service, from the academy's earlier website's (in effect from 2026-08-27), rewritten for the website and
 * the phone app as they are now: accounts, the enrollment contract, families' requests, students' records and the
 * app's notices (Goo, 2026-11-07: docs/TODO.md). Like the privacy policy, its English is the text in force, so the
 * Korean page shows it in English under a note. `TERMS_EFFECTIVE` is the day they went live.
 */
const TERMS_EFFECTIVE: DateKey = '2026-11-08'

export function Terms() {
  const { t, lang } = useSite()
  const { name } = useSiteData()
  const academy = name ?? ACADEMY.name
  const privacy = (
    <A to="privacy" className={link}>
      Privacy Policy
    </A>
  )
  const sections: Section[] = [
    {
      id: 'agreement',
      title: 'Agreeing to these terms',
      body: (
        <>
          <p>
            These terms (“Terms”) apply to everyone who uses the academy’s website at {APP_DOMAIN}, its forms and the parts you sign in to, and the Sky Arc phone app
            (together, “the services”). By using the services, you agree to these Terms and to our {privacy}. If you don’t agree, please don’t use them.
          </p>
          <p>
            Training at the academy has documents of its own: the enrollment contract a family signs, and any consent or safety rules the academy asks for. These Terms
            don’t replace them.
          </p>
        </>
      ),
    },
    {
      id: 'families',
      title: 'Parents, guardians and students',
      body: (
        <List
          items={[
            'You must be able to agree to these Terms yourself, or use the services with the permission of a parent or guardian who agrees to them for you.',
            'A parent, legal guardian or another adult allowed to act for a student fills in the requests and forms about that student and signs the enrollment contract.',
            'A student under 13 gets their own login only with a parent’s permission.',
            'You’re responsible for the information you give being accurate and current. Tell the academy when it changes.',
          ]}
        />
      ),
    },
    {
      id: 'account',
      title: 'Your account',
      body: (
        <List
          items={[
            'You sign in with Google, with Apple (on an iPhone) or with an email and a password. Access follows the email address on the academy’s records, once it’s confirmed; the academy decides who else gets in.',
            'What you see depends on your role: parents see only their own children, students only themselves, and coaches and staff what their work needs.',
            'Keep your sign-in to yourself: don’t share your password or let anyone else use your account. If you think someone has, change your password and tell the academy.',
            'The academy may change or remove an account’s access, for example when a student leaves the academy.',
            <>
              You can delete your login at any time: in the phone app (More → Delete my account), or by asking the academy. The {privacy} says what the academy keeps.
            </>,
          ]}
        />
      ),
    },
    {
      id: 'information',
      title: 'Information on the website',
      body: (
        <p>
          The website tells you about the academy’s programs, schedules, coaches, prices and news, for general information. We work to keep it accurate, but programs,
          availability, coaches, eligibility, prices and schedules can change. It isn’t a guaranteed offer, a confirmation of enrollment or professional advice, and it
          doesn’t replace a written confirmation from the academy.
        </p>
      ),
    },
    {
      id: 'requests',
      title: 'Trial requests, classes and changes',
      body: (
        <List
          items={[
            'Asking for a trial, or sending a question, doesn’t reserve a time or a place. The academy confirms a trial time by email, Trial One first, and afterwards helps you book Trial Two. It may suggest another time, or decline a request, because of capacity, safety, staffing or eligibility.',
            'In the app, a family can cancel a student’s class or ask for one. A request is confirmed only when the academy accepts it, and the academy’s rules for cancellations apply.',
            'The schedule in the app is the academy’s plan. The academy may move, change or cancel a class when it needs to, and tells families in the app or by email.',
          ]}
        />
      ),
    },
    {
      id: 'contract',
      title: 'The enrollment contract',
      body: (
        <p>
          Before using the app, a parent or guardian signs the academy’s enrollment contract for each child, in the app, on this website or from a link the academy
          sends. The contract covers enrollment, tuition, training and the range; these Terms cover using the services. Where the two differ, the contract governs. The
          contract’s English text is the one in force; its Korean translation is there to help families read it.
        </p>
      ),
    },
    {
      id: 'safety',
      title: 'Safety',
      body: (
        <p>
          Air rifle training requires following the coaches’ instructions, range commands, equipment rules and the academy’s policies at all times. The academy may
          restrict or end a student’s participation when it’s reasonably needed for safety or conduct. Using the website or the app doesn’t by itself allow anyone onto
          the range, and doesn’t replace the enrollment contract or any waiver, medical information, consent or code of conduct the academy requires before training.
          Nothing in these Terms waives a right or a duty that can’t lawfully be waived.
        </p>
      ),
    },
    {
      id: 'records',
      title: 'Students’ records, scores and reports',
      body: (
        <p>
          The academy records attendance, scores and results (from the range’s electronic scoring system and from photos of paper targets) and writes progress reports,
          and shares them with each student’s own family in the app, to follow the student’s progress. The academy checks them, but a score read from a photo, or a
          report, can hold a mistake: if something looks wrong, tell the academy and it will look into it. For a competition, the organizer’s results are the official
          ones.
        </p>
      ),
    },
    {
      id: 'messages',
      title: 'Emails and notifications',
      body: (
        <p>
          When you give the academy your email address or phone number, or sign in to the app, you agree that it may contact you about your requests, classes and their
          changes, contracts, your account, safety and the academy’s news, by email, by phone or in the app. You can turn the app’s notifications on or off in the app
          or in your phone’s settings; messages the services need in order to work, such as a class change or a signed contract, still come by email. Your carrier’s
          usual charges may apply to calls and texts.
        </p>
      ),
    },
    {
      id: 'use',
      title: 'Using the services fairly',
      body: (
        <>
          <p>You may not:</p>
          <List
            items={[
              'Use the services unlawfully, fraudulently, or in a way that threatens anyone’s safety or rights.',
              'Give false information, pretend to be someone else, or use another person’s account.',
              'Try to see information that isn’t yours, or get around the sign-in or the limits on what each role can see.',
              'Probe, disrupt, overload, scrape or reverse engineer the services, or interfere with their security.',
              'Upload harmful code, or use automated means to send requests or copy content without permission.',
              'Post comments or send messages that are abusive, harassing or unsuitable for a youth academy.',
              'Copy or use the academy’s content except as the law allows or the academy agrees in writing.',
            ]}
          />
        </>
      ),
    },
    {
      id: 'content',
      title: 'The academy’s content',
      body: (
        <p>
          The services and their text, photos, graphics, logos, designs, program materials and other content belong to the academy or to those who license them to it,
          and are protected by intellectual-property laws. The academy gives you a limited, revocable, non-exclusive and non-transferable right to use the services for
          your own or your family’s personal, non-commercial purposes. No other rights are granted. The Sky Arc name and logo may not be used without the academy’s
          written permission.
        </p>
      ),
    },
    {
      id: 'submissions',
      title: 'What you send us',
      body: (
        <p>
          You keep ownership of what you send through the services, such as forms, messages, comments and signatures. You allow the academy to use it as reasonably
          needed to answer you, run its classes and services, protect the academy and its students, and do what you sent it for. If you send ideas or feedback, the
          academy may use them without restriction or payment. Personal information is always handled as the {privacy} says.
        </p>
      ),
    },
    {
      id: 'others',
      title: 'Other companies’ services',
      body: (
        <p>
          The services run on other companies’ services, such as cloud hosting, sign-in (Google and Apple), email and the app stores, and may link to others, such as
          Instagram. Their own terms and policies apply when you use them directly; the App Store’s or Google Play’s terms apply to downloading the phone app. The
          academy doesn’t control, and isn’t responsible for, other companies’ content, availability or practices.
        </p>
      ),
    },
    {
      id: 'disclaimers',
      title: 'No guarantees',
      body: (
        <p>
          To the fullest extent the law allows, the services are provided “as is” and “as available”. The academy disclaims implied warranties of merchantability,
          fitness for a particular purpose, title and non-infringement. We don’t promise that the services will always be available, uninterrupted, error-free or
          secure, or that the information in them will always be complete or current. Some places don’t allow certain disclaimers, so parts of this section may not
          apply to you.
        </p>
      ),
    },
    {
      id: 'liability',
      title: 'Limits on liability',
      body: (
        <p>
          To the fullest extent the law allows, the academy and its owners, coaches, staff, contractors and service providers aren’t liable for indirect, incidental,
          special, consequential, exemplary or punitive damages, or for loss of data, profits, goodwill or use, arising from or related to the services. Where
          liability can’t be excluded, total liability arising from the use of the services won’t exceed the greater of what you paid specifically for the online
          service the claim is about, or one hundred U.S. dollars. This limit doesn’t apply where the law forbids it, and doesn’t change liability under the enrollment
          contract or another agreement you signed with the academy.
        </p>
      ),
    },
    {
      id: 'indemnification',
      title: 'Indemnification',
      body: (
        <p>
          To the extent the law allows, you agree to defend, indemnify and hold harmless the academy and its owners, staff, coaches, contractors and service providers
          from claims, losses, liabilities and reasonable costs arising from your unlawful misuse of the services, your material breach of these Terms, or information
          you submit without the right to. This doesn’t apply to the extent a claim results from the academy’s own unlawful conduct.
        </p>
      ),
    },
    {
      id: 'ending',
      title: 'Suspending or ending access',
      body: (
        <p>
          The academy may suspend, restrict or end access to the services, or to an account, when it’s reasonably needed to protect users, security, safety, legal
          compliance or the academy’s operations, or when a student is no longer with the academy. The parts of these Terms that by their nature should last, including
          the academy’s content, the disclaimers, the limits on liability, indemnification and disputes, still apply after your access ends.
        </p>
      ),
    },
    {
      id: 'law',
      title: 'Governing law and disputes',
      body: (
        <p>
          These Terms are governed by the laws that apply where {academy} is established, without regard to conflict-of-law rules, except where consumer-protection law
          requires otherwise. Before filing a formal claim, you and the academy agree to try in good faith to settle the issue by written notice. A dispute that isn’t
          settled may be brought in a court with jurisdiction, as the law allows.
        </p>
      ),
    },
    {
      id: 'general',
      title: 'General terms',
      body: (
        <p>
          If a part of these Terms is found unenforceable, it’s limited or removed only as much as needed, and the rest stays in force. Not enforcing a part isn’t a
          waiver of it. You may not transfer these Terms without the academy’s consent; the academy may transfer them if it’s reorganized or transferred. These Terms,
          the {privacy} and any agreement you signed with the academy, such as the enrollment contract, are the whole agreement about using the services. These Terms
          are written in English, and the English text is the one in force.
        </p>
      ),
    },
    {
      id: 'changes',
      title: 'Changes to these terms',
      body: (
        <p>
          The academy may change these Terms when the services, its programs or the law change. The new Terms are posted here, with a new date at the top. If a change
          matters to how you use the services, the academy tells families and staff in the app or by email. Using the services after a change means you accept the new
          Terms, as far as the law allows.
        </p>
      ),
    },
    {
      id: 'contact',
      title: 'Contact us',
      body: (
        <>
          <p>Questions, or a notice about these Terms? Contact {academy}:</p>
          <ContactWays />
        </>
      ),
    },
  ]
  return (
    <>
      <PageHero
        kicker={t(TEXT.termsKicker)}
        title={t(TEXT.termsTitle)}
        text={`${academy} (“the academy”, “we”) runs this website, at ${APP_DOMAIN}, and its phone app, Sky Arc, for its families, students and staff. These are the rules for using them, beside our privacy policy and, for training at the academy, the enrollment contract.`}
        textLang="en"
      >
        <Dates effective={TERMS_EFFECTIVE} updated={null} />
        {lang === 'ko' ? <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-[14.5px] text-ink/80 shadow-soft">{t(TEXT.termsEnglishOnly)}</p> : null}
      </PageHero>
      <Document sections={sections} lang="en" />
    </>
  )
}

const HELP = {
  ask: {
    title: l('Classes, your account, a student’s records', '수업, 계정, 학생 기록'),
    text: l('The academy runs all of it, so ask the academy:', '모두 아카데미에서 관리해요. 아카데미에 문의해 주세요:'),
  },
  signIn: {
    title: l('Signing in', '로그인'),
    items: [
      l(
        'Make your account, or sign in, with the email you gave the academy, with Google, Apple (on an iPhone) or a password: a parent or student whose email is on the academy’s records gets in right away.',
        '아카데미에 알려 주신 이메일로 계정을 만들거나 로그인하세요. Google, Apple(iPhone), 비밀번호 중 편한 방법을 쓰면 돼요. 아카데미 기록에 이메일이 있는 학부모와 학생은 바로 들어갈 수 있어요.',
      ),
      l('Forgot your password?', '비밀번호를 잊으셨나요?'),
      l(
        '“This email isn’t on the academy’s records” means no student’s record has the email you signed in with: tap “Ask the academy”, or sign in with the email you gave it.',
        '로그인했는데 아카데미 기록에 없는 이메일이라고 나오면, 그 이메일이 어느 학생 기록에도 없다는 뜻이에요. 화면에서 아카데미에 문의하거나, 아카데미에 알려 주신 이메일로 다시 로그인하세요.',
      ),
      l(
        'A password account opens once its email is confirmed: look for the email from the academy, or ask for a new one from the sign-in page.',
        '비밀번호로 만든 계정은 이메일 인증을 마쳐야 열려요. 아카데미에서 보낸 메일을 확인하거나, 로그인 화면에서 인증 메일을 다시 요청하세요.',
      ),
      l(
        'Before using the app, a parent signs the academy’s enrollment contract for each child, in the app or on this website. One parent’s signature is enough.',
        '앱을 쓰기 전에 학부모가 자녀마다 아카데미 등록 계약서에 서명해요. 앱이나 이 웹사이트에서 할 수 있고, 부모님 중 한 분만 서명하면 돼요.',
      ),
    ],
    reset: l('Choose a new one', '새 비밀번호 만들기'),
  },
  delete: {
    title: l('Deleting your account', '계정 삭제'),
    text: l(
      'In the phone app: More → Delete my account. Or ask the academy, using the contact details above. What’s deleted and what the academy keeps is in the',
      '앱에서는 더보기 → 계정 삭제에서 할 수 있어요. 위 연락처로 아카데미에 요청해도 돼요. 무엇이 삭제되고 아카데미가 무엇을 보관하는지는',
    ),
    policy: l('privacy policy', '개인정보 처리방침'),
    after: l('.', '에 나와 있어요.'),
  },
  problem: {
    title: l('A problem with the website or the app', '웹사이트나 앱에 문제가 있을 때'),
    text: l(
      'Something doesn’t work, or looks wrong? Tell the academy, using the contact details above: say what you were doing, on which phone or browser, and what happened.',
      '안 되는 기능이나 이상해 보이는 화면이 있나요? 위 연락처로 아카데미에 알려 주세요. 무엇을 하던 중이었는지, 어떤 휴대폰이나 브라우저였는지, 어떤 일이 있었는지 같이 적어 주시면 좋아요.',
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
            tr(HELP.signIn.items[4]),
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
    </>
  )
}
