import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { type Plugin, defineConfig } from 'vite'
import { APP_URL } from '../shared/src/brand.ts'
import { PAGES, PAGE_META, type Page, isSitePath } from './src/site/paths.ts'

/**
 * The site has two pages: the academy's website (index.html, at `/`, `/programs`, `/ko/…` and the other addresses in
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

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

/** The website's address for a page in a language ("/ko/programs"). */
const pagePath = (page: Page, lang: 'en' | 'ko') => `${lang === 'ko' ? '/ko/' : '/'}${page}`

/**
 * Each website page gets its own copy of index.html with its title, description, address and language, so search
 * engines and link previews (which don't run the site) read the right ones: `programs.html`, `ko/programs.html`, and
 * `news-post.html` for the posts (firebase.json sends `/news/…` there). Also the sitemap and robots.txt.
 */
function sitePages(): Plugin {
  return {
    name: 'skyarc-site-pages',
    apply: 'build',
    // After Vite has written index.html into the bundle.
    enforce: 'post',
    generateBundle(_options, bundle) {
      const index = bundle['index.html']
      if (!index || index.type !== 'asset') return
      const template = String(index.source).replaceAll('https://skyarcacademy.web.app', APP_URL)
      const render = (page: Page | 'news-post', lang: 'en' | 'ko') => {
        const meta = PAGE_META[page][lang]
        const own = page === 'news-post' ? pagePath('news', lang) : pagePath(page, lang)
        const en = page === 'news-post' ? pagePath('news', 'en') : pagePath(page, 'en')
        const ko = page === 'news-post' ? pagePath('news', 'ko') : pagePath(page, 'ko')
        return template
          .replace('<html lang="en">', `<html lang="${lang}"${lang === 'ko' ? ' class="lang-ko"' : ''}>`)
          .replace(/<title>[^<]*<\/title>/, `<title>${escape(meta.title)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escape(meta.description)}$2`)
          .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${escape(meta.title)}$2`)
          .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${escape(meta.description)}$2`)
          .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${APP_URL}${own}$2`)
          .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${APP_URL}${own}$2`)
          .replace(/(<link rel="alternate" hreflang="en" href=")[^"]*(")/, `$1${APP_URL}${en}$2`)
          .replace(/(<link rel="alternate" hreflang="ko" href=")[^"]*(")/, `$1${APP_URL}${ko}$2`)
          .replace(/(<link rel="alternate" hreflang="x-default" href=")[^"]*(")/, `$1${APP_URL}${en}$2`)
      }
      index.source = render('', 'en')
      for (const page of PAGES) {
        if (page) this.emitFile({ type: 'asset', fileName: `${page}.html`, source: render(page, 'en') })
        this.emitFile({ type: 'asset', fileName: page ? `ko/${page}.html` : 'ko/index.html', source: render(page, 'ko') })
      }
      // `/ko` without the slash.
      this.emitFile({ type: 'asset', fileName: 'ko.html', source: render('', 'ko') })
      this.emitFile({ type: 'asset', fileName: 'news-post.html', source: render('news-post', 'en') })
      this.emitFile({ type: 'asset', fileName: 'ko/news-post.html', source: render('news-post', 'ko') })

      const urls = PAGES.flatMap((page) => (['en', 'ko'] as const).map((lang) => `${APP_URL}${pagePath(page, lang)}`))
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
  build: {
    rollupOptions: {
      input: { index: path.resolve(import.meta.dirname, 'index.html'), app: path.resolve(import.meta.dirname, 'app.html') },
    },
  },
})
