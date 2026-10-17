import type { ReactNode } from 'react'
import { ACADEMY_NAME } from '@shared/brand'
import { usePublicProfile } from '@/lib/publicProfile'

/** The academy's name and the ways to reach it, from its public profile (Settings → Academy). */
export function useAcademyContact(): { name: string; ways: ReactNode[] } {
  const { data: profile } = usePublicProfile()
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
    contact?.phone ? (
      <>
        Phone:{' '}
        <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-2">
          {contact.phone}
        </a>
      </>
    ) : null,
    contact?.address ? <>Mail: {contact.address}</> : null,
    contact?.website ? (
      <>
        Website:{' '}
        <a href={/^https?:\/\//.test(contact.website) ? contact.website : `https://${contact.website}`} className="underline underline-offset-2">
          {contact.website.replace(/^https?:\/\//, '')}
        </a>
      </>
    ) : null,
  ].filter((w): w is NonNullable<typeof w> => w !== null)
  return { name: profile?.name?.trim() || ACADEMY_NAME, ways }
}
