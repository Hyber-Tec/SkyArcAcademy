/**
 * Rebuilds the app icons and the email logo from Sky Arc's mark (web/public/favicon.svg: the reticle and red dot of
 * the academy's logo, on black). Run it after changing the mark:
 *   npx tsx scripts/brand-icons.ts
 * Requires Google Chrome.
 */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PUBLIC = new URL('../web/public/', import.meta.url).pathname
const favicon = readFileSync(`${PUBLIC}favicon.svg`, 'utf8')
// The drawing on the favicon's 64×64 tile, without the tile itself.
const drawing = favicon.replace(/^[\s\S]*?<rect[^>]*\/>/, '').replace(/<\/svg>\s*$/, '')
if (!drawing.includes('#FB0202')) throw new Error('Expected the favicon to be the 64×64 tile with the red dot')

interface Tile {
  /** Corner radius, as a share of the size. */
  radius: number
  /** The drawing's size, as a share of the favicon's. */
  scale: number
}

function tile(size: number, { radius, scale }: Tile) {
  const s = (size / 64) * scale
  const offset = (size - 64 * s) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="${size}" height="${size}" rx="${size * radius}" fill="#000"/>
<g transform="translate(${offset} ${offset}) scale(${s})">${drawing}</g>
</svg>`
}

const JOBS: [file: string, size: number, tile: Tile][] = [
  // Installed app: the favicon's rounded tile.
  ['icons/icon-192.png', 192, { radius: 14 / 64, scale: 1 }],
  ['icons/icon-512.png', 512, { radius: 14 / 64, scale: 1 }],
  // Android masks this to the phone's shape, so the reticle stays inside the safe circle.
  ['icons/maskable-512.png', 512, { radius: 0, scale: 0.8 }],
  // iPhone rounds the icon itself.
  ['icons/apple-touch-icon.png', 180, { radius: 0, scale: 0.9 }],
  // Emails show it at 36 px and round its corners.
  ['brand/skyarc-email.png', 144, { radius: 0, scale: 1 }],
]

const browser = await chromium.launch({ channel: 'chrome', headless: true })
for (const [file, size, t] of JOBS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<body style="margin:0">${tile(size, t)}</body>`)
  await page.locator('svg').first().screenshot({ path: `${PUBLIC}${file}`, omitBackground: true })
  await page.close()
}
await browser.close()
console.log(`Wrote ${JOBS.length} PNGs in web/public`)
