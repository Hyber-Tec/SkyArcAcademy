import { FullPageMessage } from '@/components/app/FullPage'

/** The homepage's "Book a trial" link, until trial booking is built: where to ask in the meantime. */
export function TrialPage() {
  return (
    <FullPageMessage
      title="Book a trial"
      description="Online trial booking opens soon. Until then, please contact the academy through skyarcacademy.com."
      actions={[
        { label: 'Home', to: '/', variant: 'outline' },
        { label: 'skyarcacademy.com', to: 'https://skyarcacademy.com' },
      ]}
    />
  )
}
