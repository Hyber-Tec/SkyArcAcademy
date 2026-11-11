/**
 * The website's addresses (kept free of React, so the Vite config can read it too): the pages at `/programs`, a news
 * post at `/news/{slug}`. Every other address is the app's. The site is English only (docs/DECISIONS.md §42); the old
 * Korean addresses (`/ko/…`) are sent to the English ones by Firebase Hosting (firebase.json).
 */
export const PAGES = ['', 'programs', 'about', 'gallery', 'news', 'trial', 'contact', 'portal', 'get-app', 'franchise', 'privacy', 'terms', 'help'] as const
export type Page = (typeof PAGES)[number]

/** Whether an address is one of the website's pages (and not the app's). */
export function isSitePath(pathname: string): boolean {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return true
  if (parts.length === 2 && parts[0] === 'news') return /^[a-z0-9-]+$/.test(parts[1])
  return parts.length === 1 && (PAGES as readonly string[]).includes(parts[0])
}

/**
 * Each page's title and description, for search engines and link previews (the built HTML of each page carries
 * them; the site keeps the tab's title current as people move around).
 */
export const PAGE_META: Record<Page | 'news-post', { title: string; description: string }> = {
  '': {
    title: 'Sky Arc Sports Academy · Youth air rifle in Suwanee, GA',
    description: 'Olympic-style 10 m air rifle training for young athletes in Suwanee, Georgia: safe instruction, strong fundamentals and a clear path from first shot to competition.',
  },
  programs: { title: 'Programs & tuition · Sky Arc Sports Academy', description: 'Four program levels, from bench-supported first shots to Sporter and NCAA Precision competition. Placement by readiness, not school grade.' },
  about: { title: 'About & coaches · Sky Arc Sports Academy', description: 'A youth development academy where technical excellence, personal growth and belonging share the same target. Meet the coaches.' },
  gallery: { title: 'Gallery · Sky Arc Sports Academy', description: 'Practice, competition and the community behind every shot at Sky Arc Sports Academy.' },
  news: { title: 'News · Sky Arc Sports Academy', description: 'Tournament results, competition updates and announcements from Sky Arc Sports Academy.' },
  'news-post': { title: 'News · Sky Arc Sports Academy', description: 'News from Sky Arc Sports Academy, a youth air rifle academy in Suwanee, Georgia.' },
  trial: { title: 'Book a trial · Sky Arc Sports Academy', description: 'Every athlete starts with Trial One: safety, range commands and the rifle, before any shooting. Request a time online.' },
  contact: { title: 'Contact · Sky Arc Sports Academy', description: 'Questions about programs, tuition, equipment or placement? Send a message to Sky Arc Sports Academy in Suwanee, GA.' },
  franchise: {
    title: 'Franchise opportunity · Sky Arc Sports Academy',
    description: 'Interested in opening an air rifle academy built on Sky Arc’s program, coaching and tools? Tell us about yourself and where you’d like to open.',
  },
  'get-app': { title: 'The Sky Arc app · Sky Arc Sports Academy', description: 'Classes, scores, progress reports and academy news on your iPhone or Android phone. Get Sky Arc on the App Store or Google Play.' },
  portal: { title: 'Parent portal · Sky Arc Sports Academy', description: 'One login for class schedules, scores, progress reports and academy news.' },
  privacy: { title: 'Privacy Policy · Sky Arc Sports Academy', description: 'What Sky Arc Sports Academy keeps about families, students and staff on its website and phone app, why, who can see it, and your choices.' },
  terms: { title: 'Terms of Service · Sky Arc Sports Academy', description: 'The rules for using the Sky Arc Sports Academy website and the Sky Arc phone app: accounts, trial requests, classes, safety and students’ records.' },
  help: { title: 'Help · Sky Arc Sports Academy', description: 'Help with the Sky Arc Sports Academy website and the Sky Arc phone app: whom to ask, signing in, and deleting your account.' },
}
