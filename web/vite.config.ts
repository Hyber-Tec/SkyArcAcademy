import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { type Plugin, defineConfig } from 'vite'
import { APP_URL } from '../shared/src/brand.ts'
import { PAGES, PAGE_META, type Page, isSitePath } from './src/site/paths.ts'

/**
 * The site has two pages: the academy's website (index.html, at `/`, `/programs` and the other addresses in
 * src/site/paths.ts) and the app (app.html, every other address), as Firebase Hosting serves them. The dev server does
 * the same.
 */
function appPages(): Plugin {
  return {
    name: 'skyarc-app-pages',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url ?? '/').split('?')
        const page = req.method === 'GET' && req.headers.accept?.includes('text/html') && !pathname.includes('.')
        if (page && pathname !== '/') req.url = `${isSitePath(pathname) ? '/index.html' : '/app.html'}${query ? `?${query}` : ''}`
        next()
      })
    },
  }
}

/** The address written in index.html and app.html (links, the preview picture, the structured data). */
const SOURCE_URL = 'https://skyarcacademy.web.app'

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The website's address for a page ("/programs"). */
const pagePath = (page: Page) => `/${page}`

/**
 * Each website page gets its own copy of index.html with its title, description and address, so search engines and
 * link previews (which don't run the site) read the right ones: `programs.html`, and `news-post.html` for the posts
 * (firebase.json sends `/news/…` there). Also the sitemap and robots.txt.
 */
function sitePages(): Plugin {
  return {
    name: 'skyarc-site-pages',
    apply: 'build',
    // After Vite has written index.html into the bundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      // index.html and app.html are written with Firebase's own address; the build puts the site's (APP_URL) in its place.
      const app = bundle['app.html']
      if (app?.type === 'asset') app.source = String(app.source).replaceAll(SOURCE_URL, APP_URL)
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') return
      const template = String(index.source).replaceAll(SOURCE_URL, APP_URL)
      const render = (page: Page | 'news-post') => {
        const meta = PAGE_META[page]
        const own = page === 'news-post' ? pagePath('news') : pagePath(page)
        return template
          .replace(/<title>[^<]*<\/title>/, `<title>${escape(meta.title)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escape(meta.description)}$2`)
          .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escape(meta.title)}$2`)
          .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escape(meta.description)}$2`)
          .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${APP_URL}${own}$2`)
          .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${APP_URL}${own}$2`)
      }
      index.source = render('')
      for (const page of PAGES) if (page) this.emitFile({ type: 'asset', fileName: `${page}.html`, source: render(page) })
      this.emitFile({ type: 'asset', fileName: 'news-post.html', source: render('news-post') })

      const urls = PAGES.map((page) => `${APP_URL}${pagePath(page)}`)
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`,
      })
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${APP_URL}/sitemap.xml\n` })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), appPages(), sitePages()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@shared': path.resolve(import.meta.dirname, '../shared/src'),
    },
  },
  server: { port: 5173 },
  // The card reader's worker (src/features/scores/photos) loads the HEIC decoder (2 MB) only when it reads a HEIC photo:
  // built as an ES module, the worker keeps the decoder in a chunk of its own.
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: { index: path.resolve(import.meta.dirname, 'index.html'), app: path.resolve(import.meta.dirname, 'app.html') },
    },
  },
})
