/**
 * Rebuilds the PNG copies of Sky Arc's official logos (CLAUDE.md, "Brand"): the app icons and the small email mark
 * from the square icon (`brand/skyarc-icon-black.svg`), and the email logo and the link preview from the full logo
 * (`brand/skyarc-logo.svg`). Email apps and link previews don't show SVG. Run it after the official files change:
 *   npx tsx scripts/brand-icons.ts
 * Requires Google Chrome.
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PUBLIC = new URL('../web/public/', import.meta.url).pathname
const icon = readFileSync(`${PUBLIC}brand/skyarc-icon-black.svg`, 'utf8')
const logo = readFileSync(`${PUBLIC}brand/skyarc-logo.svg`, 'utf8')
if (!icon.includes('#FB0202') || !logo.includes('#FB0202')) throw new Error('Expected the official Sky Arc files, with the red dot')

const [, , logoW, logoH] = (/viewBox="([\d.\s]+)"/.exec(logo)?.[1] ?? '').split(/\s+/).map(Number)
if (!logoW || !logoH) throw new Error('The full logo has no viewBox')

/** The SVG drawn at a size: its own width and height replaced. */
function sized(svg: string, width: number, height: number) {
  return svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\swidth="[^"]*"/, ` width="${width}"`).replace(/\sheight="[^"]*"/, ` height="${height}"`))
}

interface Job {
  file: string
  width: number
  height: number
  html: string
}

/** The square icon, full bleed or with rounded corners (a share of the size). */
function square(file: string, size: number, radius = 0): Job {
  return { file, width: size, height: size, html: `<div style="width:${size}px;height:${size}px;border-radius:${radius * size}px;overflow:hidden">${sized(icon, size, size)}</div>` }
}

/** The full logo centred on white, `logoWidth` wide. */
function onWhite(file: string, width: number, height: number, logoWidth: number): Job {
  const h = Math.round((logoWidth * logoH) / logoW)
  return { file, width, height, html: `<div style="width:${width}px;height:${height}px;background:#fff;display:flex;align-items:center;justify-content:center">${sized(logo, logoWidth, h)}</div>` }
}

const emailLogoWidth = 168 * 3
const JOBS: Job[] = [
  // Installed app: the icon with rounded corners, as computers show it.
  square('icons/icon-192.png', 192, 14 / 64),
  square('icons/icon-512.png', 512, 14 / 64),
  // Android masks it to the phone's shape; the reticle already sits inside the safe circle.
  square('icons/maskable-512.png', 512),
  // iPhone rounds the icon itself.
  square('icons/apple-touch-icon.png', 180),
  // Older emails show this mark at 36 px with rounded corners.
  square('brand/skyarc-email.png', 144),
  // Emails show the full logo at 168 px wide on their white card (shared/src/email/logo.ts), drawn at 3×.
  onWhite('brand/skyarc-logo-email.png', emailLogoWidth, Math.round((emailLogoWidth * logoH) / logoW), emailLogoWidth),
  // The picture a shared link shows (og:image).
  onWhite('brand/skyarc-og.png', 1200, 630, 760),
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const job of JOBS) {
  const page = await browser.newPage({ viewport: { width: job.width, height: job.height } })
  await page.setContent(`<body style="margin:0">${job.html}</body>`)
  await page.locator('body > div').first().screenshot({ path: `${PUBLIC}${job.file}`, omitBackground: true })
  await page.close()
}
await browser.close()
console.log(`Wrote ${JOBS.length} PNGs in web/public`)
