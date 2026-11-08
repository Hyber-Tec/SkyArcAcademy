import { useState } from 'react'
import { phoneKind } from '@shared/appStores'
import { APP_STORE_URL, PLAY_STORE_URL } from '@shared/brand'
import { cn } from '@/lib/utils'
import { APP, type Lang } from '@/site/kit/content'
import { useSite } from '@/site/kit/site'

/**
 * The stores' official badges, as Apple and Google give them (`web/public/badges`: never redrawn, recoloured or cut),
 * each linking to the app in its store, in the page's language, the phone's own store first. Apple's are SVGs drawn at
 * `height`; Google's are PNGs with clear space of their own, which the frame leaves outside so both badges stand the
 * same height (the space each store asks for around its badge is the gap between them).
 */
const APPLE: Record<Lang, { file: string; ratio: number }> = {
  en: { file: '/badges/app-store-en.svg', ratio: 119.66407 / 40 },
  ko: { file: '/badges/app-store-ko.svg', ratio: 129.70071 / 40 },
}
/** Google's PNGs (646 × 250) and where the badge sits inside each, measured: [left, top, right, bottom]. */
const GOOGLE: Record<Lang, { file: string; box: [number, number, number, number] }> = {
  en: { file: '/badges/google-play-en.png', box: [41, 41, 605, 209] },
  ko: { file: '/badges/google-play-ko.png', box: [0, 29, 646, 221] },
}

function AppStore({ lang, height, label }: { lang: Lang; height: number; label: string }) {
  const a = APPLE[lang]
  return (
    <a href={APP_STORE_URL} target="_blank" rel="noreferrer" className="inline-flex shrink-0 rounded-[9px] focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:outline-none" data-store="app-store">
      <img src={a.file} alt={label} width={Math.round(height * a.ratio)} height={height} className="block" style={{ height, width: height * a.ratio }} />
    </a>
  )
}

function GooglePlay({ lang, height, label }: { lang: Lang; height: number; label: string }) {
  const g = GOOGLE[lang]
  const [x0, y0, x1, y1] = g.box
  const scale = height / (y1 - y0)
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noreferrer"
      className="relative inline-block shrink-0 overflow-hidden rounded-[9px] focus-visible:ring-2 focus-visible:ring-ink/40 focus-visible:ring-offset-2 focus-visible:outline-none"
      style={{ width: (x1 - x0) * scale, height }}
      data-store="google-play"
    >
      <img src={g.file} alt={label} className="absolute block max-w-none" style={{ width: 646 * scale, height: 250 * scale, left: -x0 * scale, top: -y0 * scale }} />
    </a>
  )
}

export function StoreBadges({ height = 48, className }: { height?: number; className?: string }) {
  const { t, lang } = useSite()
  // Read once, on the visitor's own browser: the built page lists the App Store first.
  const [android] = useState(() => typeof navigator !== 'undefined' && phoneKind(navigator.userAgent, navigator.maxTouchPoints) === 'android')
  const apple = <AppStore key="apple" lang={lang} height={height} label={t(APP.appStore)} />
  const google = <GooglePlay key="google" lang={lang} height={height} label={t(APP.googlePlay)} />
  return <div className={cn('flex flex-wrap items-center', className)} style={{ gap: Math.round(height / 3) }}>{android ? [google, apple] : [apple, google]}</div>
}
