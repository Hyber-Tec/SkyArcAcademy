import { Link } from 'react-router'
import { COMPANY_NAME, SENDER_EMAIL } from '@shared/brand'
import { useAcademyContact } from './academyContact'
import { AcademyContact, DocList, DocSection, PublicDoc } from './publicDoc'

/**
 * Help, for anyone: whom to ask about what, signing in, deleting an account, and HyberTec for the app itself. It's the
 * Support URL the App Store and Google Play ask for (docs/publishing.md), and the phone app links it from sign-in and
 * More. The academy's contact details come from its public profile (Settings → Academy).
 */
export function HelpPage() {
  const { name, ways } = useAcademyContact()
  return (
    <PublicDoc title="Help" subtitle={`${name}’s website and Sky Arc, its phone app`}>
      <DocSection title="Classes, your account, a student’s records">
        <p>The academy runs all of it. Contact {name}:</p>
        <AcademyContact ways={ways} />
      </DocSection>

      <DocSection title="Signing in">
        <DocList
          items={[
            'The academy gives each person access by their email address: sign in with the email it has for you, with Google or with a password.',
            <>
              Forgot your password?{' '}
              <Link to="/forgot-password" className="underline underline-offset-2">
                Choose a new one
              </Link>
              .
            </>,
            '“No access yet” means the academy hasn’t added the email you signed in with: ask it to, or sign in with the email its invitation went to.',
            'A password account opens once its email is confirmed: look for the email from the academy, or ask for a new one from the sign-in page.',
          ]}
        />
      </DocSection>

      <DocSection title="Deleting your account">
        <p>
          In the phone app: More → Delete my account. Or ask the academy, using the contact details above. What’s deleted and what the academy keeps is in the{' '}
          <Link to="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </DocSection>

      <DocSection title="A problem with the website or the app">
        <p>
          Something doesn’t work, or looks wrong? Tell the academy, or write to {COMPANY_NAME}, which builds and runs the website and the app for it:{' '}
          <a href={`mailto:${SENDER_EMAIL}?subject=${encodeURIComponent('Sky Arc: a problem')}`} className="underline underline-offset-2">
            {SENDER_EMAIL}
          </a>
          . Say what you were doing, on which phone or browser, and what happened.
        </p>
      </DocSection>
    </PublicDoc>
  )
}
