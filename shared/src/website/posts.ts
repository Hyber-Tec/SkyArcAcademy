import { stripHtmlToText } from '../comms'

/** A post's address on the website: its title in plain letters, then a few letters of its ID so it's always unique. */
export function postSlug(title: string, id: string): string {
  const words = (title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6).toLowerCase()
  return words ? `${words}-${tail}` : `post-${tail}`
}

/** The first lines of a post as plain text, cut at a word. */
export function postExcerpt(html: string, max = 220): string {
  const text = stripHtmlToText(html)
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, '')}…`
}
