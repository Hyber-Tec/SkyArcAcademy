import type { AuditStamp, TimestampLike } from '../types'

/**
 * The public website (docs/DECISIONS.md §18): the academy's own pages at `/` (web/src/site), filled from the CRM's
 * Website page. Everything here is public: anyone can read it, so it never holds a student's name, score or target,
 * an email address, or anything else that isn't meant for the whole internet.
 */

/** The website's languages: English, and Korean as a draft the owner reviews (docs/TODO.md). */
export type SiteLang = 'en' | 'ko'

/** The gallery's albums. */
export const WEBSITE_ALBUMS = ['training', 'coaching', 'competition', 'community'] as const
export type WebsiteAlbum = (typeof WEBSITE_ALBUMS)[number]

export const WEBSITE_ALBUM_LABELS: Record<WebsiteAlbum, string> = {
  training: 'Training',
  coaching: 'Coaching',
  competition: 'Competition',
  community: 'Community',
}

/**
 * A picture resized for the website: a few widths at `{folder}/{width}.{format}` in Storage, which anyone can read
 * (images.ts builds the addresses).
 */
export interface WebsiteImage {
  /** Storage folder, e.g. "branches/skyarc/website/photos/abc123". */
  folder: string
  format: 'webp' | 'jpeg'
  /** The widths saved, smallest first. */
  widths: number[]
  /** The largest copy's size. */
  width: number
  height: number
  /** The picture's average color, behind it while it loads. */
  color: string
  /** A tiny blurred copy (a data: URL), shown while it loads. */
  blur: string
}

/** `branches/{b}/websitePhotos/{id}`: a photo the academy put on the website (the gallery and the pages' photos). */
export interface WebsitePhoto extends WebsiteImage, AuditStamp {
  album: WebsiteAlbum
  /** A short title under the photo in the gallery. */
  caption: string
  /** What the photo shows, for people who can't see it. */
  alt: string
  /** Where the subject sits, for crops: a CSS object-position such as "50% 40%". */
  focus: string
  /** Gallery order, lowest first. */
  order: number
  /** Kept in the CRM but off the website. Hidden photos can't be read publicly. */
  hidden: boolean
}

/** The spots on the website that show one chosen photo. */
export const WEBSITE_PLACES = [
  { id: 'home.hero', page: 'Home', label: 'Top of the homepage' },
  { id: 'programs.hero', page: 'Programs', label: 'Top of Programs' },
  { id: 'about.hero', page: 'About', label: 'Top of About' },
  { id: 'about.story', page: 'About', label: 'About: our mission' },
  { id: 'menu', page: 'Menu', label: 'The Programs menu' },
] as const
export type WebsitePlace = (typeof WEBSITE_PLACES)[number]['id']

/** A coach's card on the About page. */
export interface WebsiteTeamMember {
  id: string
  name: string
  role: string
  /** One line: what they focus on ("Safety · Mental performance"). */
  focus: string
  /** One credential per line. */
  credentials: string[]
  photoId: string | null
}

/** A family's words, published with their permission. Never made up (the FTC's rule on fake reviews). */
export interface WebsiteTestimonial {
  id: string
  quote: string
  /** Who said it, without a child's name: "Parent of a Development athlete". */
  who: string
  /** What it's about, a few words ("The coaches"). Optional. */
  topic: string
}

/** A line of the hours the website shows ("Mon · 4:30–8 PM"). Not the schedule's own hours, which are wider. */
export interface WebsiteHoursLine {
  id: string
  /** "Monday", "Friday–Sunday". */
  days: string
  /** "4:30–8 PM", "By arrangement". */
  time: string
  /** Optional: "Open range and private coaching". */
  note: string
}

/** `branches/{b}/public/website`: what the Website page sets, besides the photos. Anyone can read it. */
export interface WebsiteContent extends AuditStamp {
  /** Which photo shows where (a photo ID). A place without one shows a marked placeholder. */
  places: Partial<Record<WebsitePlace, string>>
  team: WebsiteTeamMember[]
  /** Until there's one, the site shows sample quotes marked "Sample". */
  testimonials: WebsiteTestimonial[]
  hours: WebsiteHoursLine[]
  /** The academy's Instagram page, or ''. */
  instagram: string
}

export const EMPTY_WEBSITE_CONTENT: WebsiteContent = { places: {}, team: [], testimonials: [], hours: [], instagram: '' }

// ------------------------------------------------------------------ news

/** The website's news categories (its filters). */
export const WEBSITE_NEWS_CATEGORIES = ['results', 'competitions', 'announcements', 'training'] as const
export type WebsiteNewsCategory = (typeof WEBSITE_NEWS_CATEGORIES)[number]

export const WEBSITE_NEWS_LABELS: Record<WebsiteNewsCategory, string> = {
  results: 'Results',
  competitions: 'Competitions',
  announcements: 'Announcements',
  training: 'Training',
}

/** An announcement's place on the website (the editor's "On the website"). */
export interface AnnouncementWebsite {
  on: boolean
  category: WebsiteNewsCategory
  /** The picture at the top of the post and on its card, resized for the site. */
  cover: WebsiteImage | null
  /** Its address on the site (`/news/{slug}`), fixed the first time it's published there. */
  slug: string
}

/**
 * `branches/{b}/websitePosts/{announcementId}`: the public copy of an announcement shown on the website, written only
 * by Cloud Functions. It holds no author, audience, comments or attachments.
 */
export interface WebsitePost {
  slug: string
  title: string
  /** The post's HTML (sanitized again where it's shown). */
  html: string
  /** The first lines as plain text, for cards and link previews. */
  excerpt: string
  category: WebsiteNewsCategory
  cover: WebsiteImage | null
  pinned: boolean
  /** When it first appeared on the website. */
  publishedAt: TimestampLike
  updatedAt: TimestampLike
}

// ------------------------------------------------------------------ messages

export type WebsiteMessageKind = 'trial' | 'contact'
export type WebsiteMessageStatus = 'new' | 'done'

/** `branches/{b}/websiteMessages/{id}`: a trial request or a question sent from the website. Admins only. */
export interface WebsiteMessage {
  kind: WebsiteMessageKind
  status: WebsiteMessageStatus
  /** The page's language when it was sent: the language to reply in. */
  lang: SiteLang
  name: string
  email: string
  phone: string
  /** Contact: what it's about (contact.ts topics). Trial: ''. */
  topic: string
  message: string
  /** Trial requests: the athlete. */
  athlete: { firstName: string; lastName: string; grade: string; experience: string } | null
  /** Trial requests: the days that suit the family (the website's hours lines, as shown). */
  days: string[]
  createdAt: TimestampLike
  doneAt?: TimestampLike | null
  doneBy?: string | null
}
