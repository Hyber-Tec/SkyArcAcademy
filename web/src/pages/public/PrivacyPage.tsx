import { Link } from 'react-router'
import { APP_DOMAIN, COMPANY_NAME } from '@shared/brand'
import { type DateKey, formatDateKey } from '@shared/time'
import { useAcademyContact } from './academyContact'
import { AcademyContact, DocList, DocSection, PublicDoc } from './publicDoc'

/**
 * The privacy policy: HyberTec's draft from a template, for the academy to review (docs/DECISIONS.md §6), covering the
 * website and the phone app as the App Store and Google Play ask (docs/publishing.md). The academy's name and contact
 * details come from its public profile (Settings → Academy). Set `EFFECTIVE` when the academy approves it
 * (docs/DEPLOY.md, launch); until then the page says it's a draft.
 */
const UPDATED: DateKey = '2026-10-18'
const EFFECTIVE: DateKey | null = null

export function PrivacyPage() {
  const { name, ways } = useAcademyContact()
  return (
    <PublicDoc
      title="Privacy Policy"
      subtitle={
        <>
          {name} · Last updated {formatDateKey(UPDATED, 'long')}
          {EFFECTIVE ? ` · In effect from ${formatDateKey(EFFECTIVE, 'long')}` : ''}
        </>
      }
      notice={
        !EFFECTIVE ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Draft for the academy’s review. This policy isn’t in effect yet.
          </p>
        ) : null
      }
    >
      <p>
        {name} (“the academy”, “we”) uses this website, at {APP_DOMAIN}, and its phone app, Sky Arc, to schedule classes, keep attendance, record students’ results,
        pay its coaches and share students’ progress with their families. This policy explains what information we keep, why we keep it, who can see it and the
        choices you have.
      </p>

      <DocSection title="Information we keep">
        <DocList
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
              <strong>Messages and activity.</strong> Announcements and comments, who has opened an announcement or a progress report and when (the academy’s
              staff see it), notification settings, and a record of changes made in the app (who changed what, and when), so mistakes can be found and fixed.
            </>,
            <>
              <strong>Technical information.</strong> Your browser or phone keeps your sign-in and a few display preferences on your device. If you allow notifications
              on a device, we keep a notification token for it. Our cloud and sign-in providers keep standard technical logs, such as IP addresses, device and browser
              types and error reports, for security, preventing fraud and troubleshooting. We don’t use advertising or analytics cookies.
            </>,
          ]}
        />
      </DocSection>

      <DocSection title="The phone app">
        <DocList
          items={[
            'You sign in with Google or with an email and a password; the app opens only for an email the academy has added.',
            'Staff can photograph a student’s paper target, or choose a photo of one, to score it. The app asks for the camera or your photos only then, reads the target on the phone, and files a copy of the target and its scores in that student’s records. It doesn’t save anything to your photos and doesn’t look at your other photos.',
            'The app doesn’t collect your location, contacts or microphone, and has no advertising, analytics or tracking.',
          ]}
        />
      </DocSection>

      <DocSection title="How we use it">
        <DocList
          items={[
            'To run classes: scheduling, attendance, makeup classes and trial visits.',
            'To record and share students’ progress and results with their own families.',
            'To tell families and staff about classes, changes and news, by email and in the app.',
            'To pay coaches and staff.',
            'To keep the website and app secure and working.',
          ]}
        />
        <p>We don’t sell or rent personal information, and we don’t use it for advertising.</p>
      </DocSection>

      <DocSection title="Who can see it">
        <DocList
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
      </DocSection>

      <DocSection title="Children">
        <p>
          Most of our students are under 18, and many are under 13. We get children’s information from their parents or guardians, or from the academy’s own records,
          and keep only what we need to teach them and keep families informed. A child under 13 gets their own login only with a parent’s permission. Parents can see
          their child’s information, ask us to correct or delete it, and ask us to stop collecting it, by contacting us below.
        </p>
      </DocSection>

      <DocSection title="Keeping it safe, and for how long">
        <p>
          The records and files are stored with our cloud provider in the United States. Information is encrypted on its way to and from the website and app and while
          it’s stored. Every account needs a verified email address, and what each person can see depends on their role at the academy.
        </p>
        <p>
          We keep information while a student is enrolled or an account is in use, and after that only as long as the academy needs it for its records or the law
          requires it (for example, payroll records). Then we delete it.
        </p>
      </DocSection>

      <DocSection title="Your choices">
        <DocList
          items={[
            'See and correct your information and your children’s, or ask us to.',
            'Ask for a copy of your information, or for it to be deleted.',
            <>
              Delete your login: yourself in the phone app (More → Delete my account), or by asking us. This removes your sign-in and your access; the academy keeps
              the records it must keep (a student’s results, payroll), as above, until you ask us to delete them too.
            </>,
            'Withdraw your consent at any time by deleting your login or contacting us; it doesn’t affect what was done before.',
            'Turn notifications on or off in the app, and the camera or photo access in your phone’s settings.',
          ]}
        />
        <p>
          Help with the website or the app: see{' '}
          <Link to="/help" className="underline underline-offset-2">
            Help
          </Link>
          .
        </p>
      </DocSection>

      <DocSection title="Changes to this policy">
        <p>
          When we change this policy, we update the date at the top. If a change matters to how we use your information, we tell families and staff in the app or by
          email first.
        </p>
      </DocSection>

      <DocSection title="Contact us">
        <p>Questions, or a request about your information or your child’s? Contact {name}:</p>
        <AcademyContact ways={ways} />
      </DocSection>
    </PublicDoc>
  )
}
