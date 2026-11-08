/**
 * The academy's two signs for the front desk (Goo, 2026-11-08, docs/DECISIONS.md §39), as PDFs to print for acrylic
 * sign holders, letter size (8.5 × 11 in) and 5 × 7 in:
 *
 * - **contract**: its QR code opens /contract, where a parent asks for each child's enrollment contract;
 * - **app**: its QR code opens /get-app?go, which sends an iPhone to the App Store and an Android phone to Google Play,
 *   with the stores' official badges (web/public/badges) and their credit line.
 *
 * Each is in English and Korean, under the academy's official logo (web/public/brand, as it is), in the website's type
 * (Geist, Instrument Serif). Drawn by Chrome (playwright-core, as scripts/brand-icons.ts), the QR codes as vectors.
 *
 *   npx tsx scripts/signs.ts --out ~/Desktop/signs
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from 'playwright-core'
import { APP_SIGN_URL } from '../shared/src/appStores'
import { APP_URL } from '../shared/src/brand'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
// The website's QR code library (the contract's office QR code draws with it too).
const QRCode = createRequire(import.meta.url)('../web/node_modules/qrcode') as { toString(text: string, opts: Record<string, unknown>): Promise<string> }
const file = (p: string) => readFileSync(join(ROOT, p))
const dataUrl = (p: string, type: string) => `data:${type};base64,${file(p).toString('base64')}`

const FONTS = `
@font-face { font-family: 'Geist'; font-weight: 100 900; src: url(${dataUrl('web/node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2', 'font/woff2')}) format('woff2'); }
@font-face { font-family: 'Instrument Serif'; font-style: italic; src: url(${dataUrl('web/node_modules/@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2', 'font/woff2')}) format('woff2'); }
`

const CONTRACT_URL = `${APP_URL}/contract`
const shown = (url: string) => url.replace(/^https:\/\//, '').replace(/\?go$/, '')

type Kind = 'contract' | 'app'
/** The page, and how much smaller than letter size everything is drawn on it. */
const SIZES = { letter: { w: 8.5, h: 11, s: 1 }, '5x7': { w: 5, h: 7, s: 0.62 } } as const
type Size = keyof typeof SIZES

const TEXT: Record<Kind, { kicker: [string, string]; title: [string, string]; lead: [string, string]; scan: [string, string]; url: string }> = {
  contract: {
    kicker: ['For families', '학부모님께'],
    title: ['Enrollment Contract', '등록 계약서'],
    lead: ['Scan to ask for your child’s contract. The academy gets it ready, and you sign it on your phone.', 'QR 코드를 스캔해 자녀의 계약서를 요청하세요. 아카데미가 준비하면 휴대폰에서 바로 서명할 수 있어요.'],
    scan: ['Scan with your phone’s camera', '휴대폰 카메라로 스캔하세요'],
    url: CONTRACT_URL,
  },
  app: {
    kicker: ['The Sky Arc app', 'Sky Arc 앱'],
    title: ['Get the app', '앱 받기'],
    lead: ['Classes, scores, progress reports and academy news on your iPhone or Android phone.', '수업, 점수, 성장 리포트, 아카데미 소식을 iPhone과 Android 휴대폰에서 확인해요.'],
    scan: ['Scan with your phone’s camera', '휴대폰 카메라로 스캔하세요'],
    url: APP_SIGN_URL,
  },
}

const STEPS: [string, string][] = [
  ['Scan the code', '코드 스캔'],
  ['Type your child’s and your details', '자녀와 보호자 정보 입력'],
  ['Sign on your phone; your copy comes by email', '휴대폰에서 서명, 사본은 이메일로'],
]

const CREDIT =
  'Apple and the Apple logo are trademarks of Apple Inc., registered in the U.S. and other countries. App Store is a service mark of Apple Inc. Google Play and the Google Play logo are trademarks of Google LLC.'

async function signHtml(kind: Kind, size: Size): Promise<string> {
  const { w, h, s } = SIZES[size]
  const t = TEXT[kind]
  const qr = await QRCode.toString(t.url, { type: 'svg', margin: 0, errorCorrectionLevel: 'Q', color: { dark: '#0a0a0a', light: '#ffffff' } })
  const logo = dataUrl('web/public/brand/skyarc-logo.svg', 'image/svg+xml')
  const pt = (n: number) => `${(n * s).toFixed(2)}pt`
  const inch = (n: number) => `${(n * s).toFixed(3)}in`
  const badges =
    kind === 'app'
      ? `<div class="badges">
          <img src="${dataUrl('web/public/badges/app-store-en.svg', 'image/svg+xml')}" alt="Download on the App Store" style="height:${inch(0.62)}">
          <span class="gp" style="height:${inch(0.62)};width:${inch((0.62 * 564) / 168)}"><img src="${dataUrl('web/public/badges/google-play-en.png', 'image/png')}" alt="Get it on Google Play" style="height:${inch((0.62 * 250) / 168)};left:${inch((-0.62 * 41) / 168)};top:${inch((-0.62 * 41) / 168)}"></span>
        </div>`
      : ''
  const steps =
    kind === 'contract'
      ? `<ol class="steps">${STEPS.map(([en, ko], i) => `<li><span class="n">${i + 1}</span><span><b>${en}</b><i>${ko}</i></span></li>`).join('')}</ol>`
      : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
${FONTS}
@page { size: ${w}in ${h}in; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { width: ${w}in; height: ${h}in; background: #fff; color: #0a0a0a; -webkit-print-color-adjust: exact; print-color-adjust: exact; word-break: keep-all; text-wrap: balance }
body { font-family: 'Geist', 'Apple SD Gothic Neo', 'Noto Sans KR', system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; padding: ${inch(0.5)} ${inch(0.55)} ${inch(0.42)}; text-align: center }
.logo { width: ${inch(2.55)}; height: auto }
.kicker { margin-top: ${inch(0.26)}; font-family: 'Instrument Serif', serif; font-style: italic; font-size: ${pt(21)}; color: #57534e; display: flex; align-items: center; gap: ${inch(0.14)} }
.kicker::before, .kicker::after { content: ''; width: ${inch(0.38)}; height: 1px; background: #d6d3d1 }
.kicker small { font-family: 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; font-style: normal; font-size: ${pt(13)}; margin-left: ${inch(0.08)} }
h1 { margin-top: ${inch(0.06)}; font-size: ${pt(42)}; line-height: 1.02; letter-spacing: -0.035em; font-weight: 650 }
h2 { margin-top: ${inch(0.04)}; font-size: ${pt(24)}; font-weight: 600; letter-spacing: -0.01em; color: #292524 }
.lead { margin-top: ${inch(0.16)}; max-width: ${inch(5.6)}; font-size: ${pt(13.5)}; line-height: 1.45; color: #44403c }
.lead + .lead { margin-top: ${inch(0.05)}; font-size: ${pt(12.5)} }
.frame { position: relative; margin-top: ${inch(0.26)}; padding: ${inch(0.2)}; }
.frame svg { display: block; width: ${inch(kind === 'contract' ? 2.5 : 2.65)}; height: auto }
.frame i { position: absolute; width: ${inch(0.36)}; height: ${inch(0.36)}; border-color: #0a0a0a; border-style: solid; border-width: 0 }
.frame .tl { top: 0; left: 0; border-top-width: ${pt(3)}; border-left-width: ${pt(3)}; border-top-left-radius: ${inch(0.1)} }
.frame .tr { top: 0; right: 0; border-top-width: ${pt(3)}; border-right-width: ${pt(3)}; border-top-right-radius: ${inch(0.1)} }
.frame .bl { bottom: 0; left: 0; border-bottom-width: ${pt(3)}; border-left-width: ${pt(3)}; border-bottom-left-radius: ${inch(0.1)} }
.frame .br { bottom: 0; right: 0; border-bottom-width: ${pt(3)}; border-right-width: ${pt(3)}; border-bottom-right-radius: ${inch(0.1)} }
.scan { margin-top: ${inch(0.12)}; font-size: ${pt(12)}; font-weight: 600; letter-spacing: 0.01em }
.scan span { display: block; margin-top: ${inch(0.02)}; font-weight: 500; color: #57534e; font-size: ${pt(11)} }
.url { margin-top: ${inch(0.06)}; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: ${pt(11.5)}; color: #44403c }
.steps { list-style: none; margin-top: ${inch(0.3)}; display: grid; grid-template-columns: repeat(3, 1fr); gap: ${inch(0.18)}; width: 100%; max-width: ${inch(6.6)}; text-align: left }
.steps li { display: flex; gap: ${inch(0.1)}; align-items: flex-start; border-top: 1px solid #e7e5e4; padding-top: ${inch(0.12)} }
.steps .n { flex: none; width: ${inch(0.27)}; height: ${inch(0.27)}; border-radius: 50%; background: #0a0a0a; color: #fff; font-size: ${pt(10.5)}; font-weight: 700; display: flex; align-items: center; justify-content: center }
.steps b { display: block; font-size: ${pt(10.5)}; font-weight: 600; line-height: 1.3 }
.steps i { display: block; margin-top: ${inch(0.03)}; font-style: normal; font-size: ${pt(9.5)}; color: #57534e; line-height: 1.35 }
.badges { margin-top: ${inch(0.26)}; display: flex; gap: ${inch(0.22)}; align-items: center; justify-content: center }
.gp { position: relative; overflow: hidden; display: inline-block; border-radius: ${inch(0.06)} }
.gp img { position: absolute; max-width: none }
.foot { margin-top: auto; padding-top: ${inch(0.2)}; font-size: ${pt(9.5)}; color: #78716c; letter-spacing: 0.02em }
.credit { margin-top: ${inch(0.06)}; max-width: ${inch(6.4)}; font-size: ${pt(6.5)}; line-height: 1.4; color: #a8a29e }
</style></head><body>
<img class="logo" src="${logo}" alt="Sky Arc Sports Academy">
<p class="kicker">${t.kicker[0]}<small>${t.kicker[1]}</small></p>
<h1>${t.title[0]}</h1>
<h2 lang="ko">${t.title[1]}</h2>
<p class="lead">${t.lead[0]}</p>
<p class="lead" lang="ko">${t.lead[1]}</p>
<div class="frame">${qr}<i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>
<p class="scan">${t.scan[0]}<span lang="ko">${t.scan[1]}</span></p>
<p class="url">${shown(t.url)}</p>
${steps}${badges}
<p class="foot">Sky Arc Sports Academy · skyarcacademy.com</p>
${kind === 'app' ? `<p class="credit">${CREDIT}</p>` : ''}
</body></html>`
}

async function main() {
  const { values } = parseArgs({ options: { out: { type: 'string' } } })
  const out = resolve(values.out ?? join(process.env.TMPDIR ?? '/tmp', 'skyarc-signs'))
  mkdirSync(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome' })
  const page = await browser.newPage()
  for (const kind of ['contract', 'app'] as const) {
    for (const size of ['letter', '5x7'] as const) {
      const { w, h } = SIZES[size]
      await page.setContent(await signHtml(kind, size), { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      const name = `sky-arc-sign-${kind}-${size}.pdf`
      await page.pdf({ path: join(out, name), width: `${w}in`, height: `${h}in`, printBackground: true, pageRanges: '1' })
      await page.setViewportSize({ width: Math.round(w * 96), height: Math.round(h * 96) })
      await page.screenshot({ path: join(out, name.replace('.pdf', '.png')), fullPage: false })
      console.log(`${name}`)
    }
  }
  await browser.close()
  console.log(`In ${out}`)
}

await main()
