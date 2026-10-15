import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ACADEMY_NAME, APP_DOMAIN, COMPANY_NAME } from '@shared/brand'
import { type DateKey, formatDateKey } from '@shared/time'
import { CompanyFooter } from '@/components/app/CompanyFooter'
import { SkyArcLogo } from '@/components/app/SkyArcMark'
import { Button } from '@/components/ui/button'
import { usePublicProfile } from '@/lib/publicProfile'

/**
 * The privacy policy: HyberTec's draft from a template, for the academy to review (docs/DECISIONS.md §6). The academy's
 * name and contact details come from its public profile (Settings → Academy). Set `EFFECTIVE` when the academy
 * approves it (docs/DEPLOY.md, launch); until then the page says it's a draft.
 */
const UPDATED: DateKey = '2026-10-15'
const EFFECTIVE: DateKey | null = null

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

export function PrivacyPage() {
  const { data: profile } = usePublicProfile()
  const name = profile?.name?.trim() || ACADEMY_NAME
  const contact = profile?.contact
  const ways = [
    contact?.email ? (
      <>
        Email:{' '}
        <a href={`mailto:${contact.email}`} className="underline underline-offset-2">
          {contact.email}
        </a>
      </>
    ) : null,
    contact?.phone ? <>Phone: {contact.phone}</> : null,
    contact?.address ? <>Mail: {contact.address}</> : null,
    contact?.website ? <>Website: {contact.website}</> : null,
  ].filter((w): w is NonNullable<typeof w> => w !== null)

  return (
    <div className="min-h-svh bg-muted/40 px-4 py-10">
      <article className="mx-auto w-full max-w-3xl space-y-8 rounded-2xl border bg-card px-5 py-8 text-[15px] leading-7 shadow-sm sm:px-10 sm:py-10">
        <header className="space-y-4">
          <Link to="/" aria-label="Home">
            <SkyArcLogo className="h-12" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">
              {name} · Last updated {formatDateKey(UPDATED, 'long')}
              {EFFECTIVE ? ` · In effect from ${formatDateKey(EFFECTIVE, 'long')}` : ''}
            </p>
          </div>
          {!EFFECTIVE ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Draft for the academy’s review. This policy isn’t in effect yet.
            </p>
          ) : null}
        </header>

        <p>
          {name} (“the academy”, “we”) uses this website and app, at {APP_DOMAIN}, to schedule classes, keep attendance, pay its coaches and share students’
          progress with their families. This policy explains what information we keep, why we keep it, who can see it and the choices you have.
        </p>

        <Section title="Information we keep">
          <List
            items={[
              <>
                <strong>Your account.</strong> Your name and email address. If you sign in with Google, the name and picture on that Google account. If you sign in with
                a password, it’s stored only in scrambled form by our sign-in service; no one at the academy can see it.
              </>,
              <>
                <strong>Parents and guardians.</strong> Your name, email address, phone number and relationship to the student.
              </>,
              <>
                <strong>Students.</strong> Name, grade, school, date of birth, level and program, contact details we’re given, class schedule, attendance, and notes from
                coaches and staff. As the academy adds results to the app: scores, score reports from the range’s electronic scoring system, and photos of paper targets.
              </>,
              <>
                <strong>Coaches and staff.</strong> Name, contact details, date of birth and address, availability, schedule, clock-in and clock-out times, pay rates and
                pay. Time clock PINs are stored only in scrambled form.
              </>,
              <>
                <strong>Messages and activity.</strong> Announcements and comments, notification settings, and a record of changes made in the app (who changed what, and
                when), so mistakes can be found and fixed.
              </>,
              <>
                <strong>Technical information.</strong> Your browser keeps your sign-in and a few display preferences on your device. If you allow notifications on a
                device, we keep a notification token for it. Our cloud provider keeps standard technical logs, such as IP addresses and browser types, for security and
                troubleshooting. We don’t use advertising or analytics cookies.
              </>,
            ]}
          />
        </Section>

        <Section title="How we use it">
          <List
            items={[
              'To run classes: scheduling, attendance, makeup classes and trial visits.',
              'To share students’ progress and results with their own families.',
              'To tell families and staff about classes, changes and news, by email and in the app.',
              'To pay coaches and staff.',
              'To keep the app secure and working.',
            ]}
          />
          <p>We don’t sell or rent personal information, and we don’t use it for advertising.</p>
        </Section>

        <Section title="Who can see it">
          <List
            items={[
              'Parents and guardians see only their own children’s information.',
              'Students with their own login see only their own information.',
              'Coaches see what they need to teach: students’ names, grades, levels, schedules and progress. Contact details and private notes are kept to the academy’s admins.',
              'The academy’s owners and admins see what they need to run the academy. Pay information is seen only by the staff member it belongs to and the people who run payroll.',
              'Reports and results are never posted at public web addresses. They open only for people who are signed in and allowed to see them.',
              <>
                A few service providers run the app for us: a cloud hosting and database provider, our sign-in service and our email service. They use the information
                only to provide their service. {COMPANY_NAME} builds and maintains the app for the academy and uses the information only to support it.
              </>,
              'We may share information when the law requires it, or to protect someone’s safety.',
            ]}
          />
        </Section>

        <Section title="Children">
          <p>
            Most of our students are under 18, and many are under 13. We get children’s information from their parents or guardians, or from the academy’s own records,
            and keep only what we need to teach them and keep families informed. A child under 13 gets their own login only with a parent’s permission. Parents can see
            their child’s information, ask us to correct or delete it, and ask us to stop collecting it, by contacting us below.
          </p>
        </Section>

        <Section title="Keeping it safe, and for how long">
          <p>
            The app’s records and files are stored with our cloud provider in the United States. Information is encrypted on its way to and from the app and while it’s
            stored. Every account needs a verified email address, and what each person can see depends on their role at the academy.
          </p>
          <p>
            We keep information while a student is enrolled or an account is in use, and after that only as long as the academy needs it for its records or the law
            requires it (for example, payroll records). Then we delete it.
          </p>
        </Section>

        <Section title="Your choices">
          <List
            items={[
              'See and correct your information and your children’s, or ask us to.',
              'Ask for a copy of your information, or for it to be deleted, including your login.',
              'Turn notifications on or off in the app.',
            ]}
          />
        </Section>

        <Section title="Changes to this policy">
          <p>
            When we change this policy, we update the date at the top. If a change matters to how we use your information, we tell families and staff in the app or by
            email first.
          </p>
        </Section>

        <Section title="Contact us">
          <p>Questions, or a request about your information or your child’s? Contact {name}:</p>
          {ways.length ? (
            <List items={ways} />
          ) : (
            <p>
              Through the academy’s website,{' '}
              <a href="https://skyarcacademy.com" className="underline underline-offset-2">
                skyarcacademy.com
              </a>
              .
            </p>
          )}
        </Section>

        <footer className="flex flex-wrap gap-2 border-t pt-6">
          <Button variant="outline" asChild>
            <Link to="/">Home</Link>
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/login">Log in</Link>
          </Button>
        </footer>
      </article>
      <CompanyFooter className="mt-6 text-center" />
    </div>
  )
}
