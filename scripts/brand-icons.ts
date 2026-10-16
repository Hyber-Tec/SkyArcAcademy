/**
 * Rebuilds the copies of Sky Arc's official logos (CLAUDE.md, "Brand and logos") that places without SVG need: the
 * website's app icons and the small email mark from the square icon (`brand/skyarc-icon-black.svg`), the email logo and
 * the link preview from the full logo (`brand/skyarc-logo.svg`); and the phone app's icon, Android icon layers and
 * splash images (mobile/assets/images/), with the official SVG files themselves for the app to draw
 * (mobile/src/components/brand/files.ts). Run it after the official files change:
 *   npx tsx scripts/brand-icons.ts
 * Requires Google Chrome.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PUBLIC = new URL('../web/public/', import.meta.url).pathname
const MOBILE = new URL('../mobile/', import.meta.url).pathname
const brandFile = (name: string) => readFileSync(`${PUBLIC}brand/${name}`, 'utf8')
const icon = brandFile('skyarc-icon-black.svg')
const logo = brandFile('skyarc-logo.svg')
const logoWhite = brandFile('skyarc-logo-white.svg')
const mark = brandFile('skyarc-mark-white.svg')
if (!icon.includes('#FB0202') || !logo.includes('#FB0202') || !mark.includes('#FB0202')) throw new Error('Expected the official Sky Arc files, with the red dot')

const [, , logoW, logoH] = (/viewBox="([\d.\s]+)"/.exec(logo)?.[1] ?? '').split(/\s+/).map(Number)
if (!logoW || !logoH) throw new Error('The full logo has no viewBox')

/** The SVG drawn at a size: its own width and height replaced. */
function sized(svg: string, width: number, height: number) {
  return svg.replace(/<svg\b[^>]*>/, (tag) => tag.replace(/\swidth="[^"]*"/, ` width="${width}"`).replace(/\sheight="[^"]*"/, ` height="${height}"`))
}

interface Job {
  /** Under web/public/, or under mobile/ when it starts with `mobile:`. */
  file: string
  width: number
  height: number
  html: string
  /** Keep the transparency (an icon layer, a splash image); otherwise the picture is opaque. */
  transparent?: boolean
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

/** An SVG drawn `width` wide in the middle of a transparent square canvas. */
function centred(file: string, svg: string, canvas: number, width: number, height = width): Job {
  return { file, width: canvas, height: canvas, transparent: true, html: `<div style="width:${canvas}px;height:${canvas}px;display:flex;align-items:center;justify-content:center">${sized(svg, width, height)}</div>` }
}

/** A wide logo at its own size on a transparent background (the phone app's splash screen). */
function asIs(file: string, svg: string): Job {
  return { file, width: logoW, height: logoH, transparent: true, html: `<div style="width:${logoW}px;height:${logoH}px">${sized(svg, logoW, logoH)}</div>` }
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
  // The phone app (mobile/app.config.ts). iPhone: the square icon full bleed (the phone rounds it).
  square('mobile:assets/images/icon.png', 1024),
  // Android's adaptive icon: the white reticle on the logo's black (the background colour is in app.config.ts), small
  // enough that the ticks stay inside the circle Android may cut it to.
  centred('mobile:assets/images/android-icon-foreground.png', mark, 1024, 800),
  // Android's themed icon: the same shape in one colour (Android tints it), the red dot included.
  centred('mobile:assets/images/android-icon-monochrome.png', mark.replace(/#FB0202/g, 'white'), 1024, 800),
  // The splash screen: the full logo, black on white and white on the dark background.
  asIs('mobile:assets/images/splash-icon.png', logo),
  asIs('mobile:assets/images/splash-icon-dark.png', logoWhite),
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const job of JOBS) {
  const page = await browser.newPage({ viewport: { width: job.width, height: job.height } })
  await page.setContent(`<body style="margin:0">${job.html}</body>`)
  const path = job.file.startsWith('mobile:') ? `${MOBILE}${job.file.slice('mobile:'.length)}` : `${PUBLIC}${job.file}`
  await page.locator('body > div').first().screenshot({ path, omitBackground: job.transparent ?? !job.file.startsWith('mobile:') })
  await page.close()
}
await browser.close()

// The phone app draws the official files themselves (react-native-svg), so they are copied in as they are.
const APP_FILES: Record<string, string> = {
  iconBlack: 'skyarc-icon-black.svg',
  iconWhite: 'skyarc-icon-white.svg',
  wordmark: 'skyarc-wordmark.svg',
  wordmarkWhite: 'skyarc-wordmark-white.svg',
  logo: 'skyarc-logo.svg',
  logoWhite: 'skyarc-logo-white.svg',
  markWhite: 'skyarc-mark-white.svg',
}
const entries = Object.entries(APP_FILES).map(([key, name]) => `  /** web/public/brand/${name} */\n  ${key}: ${JSON.stringify(brandFile(name).trim())},`)
writeFileSync(
  `${MOBILE}src/components/brand/files.ts`,
  `/**\n * The academy's official logo files (web/public/brand, CLAUDE.md "Brand and logos"), copied in as they are by\n * scripts/brand-icons.ts: never edit them here. Rerun the script when the official files change.\n */\nexport const BRAND_FILES = {\n${entries.join('\n')}\n} as const;\n`,
)
console.log(`Wrote ${JOBS.length} PNGs (web/public and mobile/assets/images) and mobile/src/components/brand/files.ts`)
