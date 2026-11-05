import { toast } from 'sonner'

/** The link on the website the office is using (the server's is the academy's own address). */
export const linkHere = (url: string) => url.replace(/^https?:\/\/[^/]+/, window.location.origin)

/** Copies a signing link, saying so (or showing it to copy by hand, where the browser won't). */
export async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url)
    toast.success('Link copied', { description: 'Paste it into a text message to the family.' })
  } catch {
    toast.error('Couldn’t copy the link', { description: url })
  }
}
