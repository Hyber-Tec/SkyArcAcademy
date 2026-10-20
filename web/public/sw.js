// Sky Arc service worker: makes the app installable and shows the last page seen when the network is down. Data always
// comes live from Firestore, and hashed assets are left to the HTTP cache (they are immutable).
//
// The website's pages (`/`, `/programs`, `/ko/…`, the same list as src/site/paths.ts) are kept each under its own
// address; every other address is the app (app.html, kept as `/app`).
const CACHE = 'skyarc-shell-v2'
const APP = '/app'
const PAGES = ['', 'programs', 'about', 'gallery', 'news', 'trial', 'contact', 'portal']

function sitePage(pathname) {
  let parts = pathname.split('/').filter(Boolean)
  if (parts[0] === 'ko') parts = parts.slice(1)
  if (parts.length === 0) return true
  if (parts.length === 2 && parts[0] === 'news') return /^[a-z0-9-]+$/.test(parts[1])
  return parts.length === 1 && PAGES.includes(parts[0])
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([APP, '/', '/manifest.webmanifest', '/favicon.svg']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' || req.mode !== 'navigate') return
  const url = new URL(req.url)
  // Firebase Auth's sign-in helper pages and static pages always come from the network.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/__/') || url.pathname.endsWith('.html')) return
  const site = sitePage(url.pathname)
  // A news post's page is the same for every post; the other site pages each have their own.
  const key = site ? (/^\/(ko\/)?news\/./.test(url.pathname) ? url.pathname.replace(/news\/.*$/, 'news/post') : url.pathname) : APP
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && !res.redirected) {
          const copy = res.clone()
          void caches.open(CACHE).then((cache) => cache.put(key, copy))
        }
        return res
      })
      .catch(() =>
        caches
          .match(key)
          .then((hit) => hit || caches.match(site ? '/' : APP))
          .then((hit) => hit || Response.error()),
      ),
  )
})
