import { toast } from 'sonner'
import type { StudentPrivateProfile } from '@shared/types'

/** The addresses on a student's record, as the office knows them: "Jane Larkin (mother) · jane@…". */
export function contactEmails(priv: StudentPrivateProfile | null, studentFirst: string): { email: string; label: string }[] {
  const out: { email: string; label: string }[] = []
  for (const p of priv?.parents ?? []) {
    const email = (p.email ?? '').trim().toLowerCase()
    if (email.includes('@') && !out.some((o) => o.email === email)) out.push({ email, label: [p.name || `${studentFirst}’s parent`, p.relation ? `(${p.relation.toLowerCase()})` : null].filter(Boolean).join(' ') })
  }
  const own = (priv?.email ?? '').trim().toLowerCase()
  if (own.includes('@') && !out.some((o) => o.email === own)) out.push({ email: own, label: `${studentFirst} (student)` })
  return out
}

/** Copies a signing link, saying so (or showing it to copy by hand, where the browser won't). */
export async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link copied', { description: 'Paste it into a text message to the family.' })
  } catch {
    toast.error('Couldn’t copy the link', { description: url })
  }
}
