import { ACADEMY_NAME } from '@shared/brand'
import { cn } from '@/lib/utils'

/**
 * Sky Arc's official logos (CLAUDE.md, "Brand"). The full logo already says "Sky Arc Sports Academy", so it never
 * sits next to the academy's name in text; the square icon is for small square places only.
 */

// The official square icon's drawing (`public/brand/skyarc-icon-black.svg`, 512 × 512): the reticle and its red dot.
const ARCS = [
  'M409.548 285.985C403.581 316.536 388.636 344.614 366.625 366.625C344.614 388.636 316.536 403.581 285.985 409.548L281.227 385.177C306.929 380.158 330.55 367.586 349.068 349.068C367.586 330.55 380.158 306.929 385.177 281.227L409.548 285.985Z',
  'M226.019 409.548C195.467 403.581 167.39 388.636 145.379 366.625C123.367 344.614 108.422 316.536 102.456 285.985L126.827 281.227C131.845 306.929 144.418 330.55 162.935 349.068C181.453 367.586 205.074 380.158 230.777 385.177L226.019 409.548Z',
  'M102.456 226.016C108.422 195.464 123.367 167.387 145.379 145.376C167.39 123.364 195.467 108.419 226.019 102.453L230.777 126.824C205.074 131.842 181.453 144.415 162.935 162.933C144.418 181.45 131.845 205.071 126.827 230.774L102.456 226.016Z',
  'M285.985 102.453C316.536 108.419 344.614 123.364 366.625 145.376C388.636 167.387 403.581 195.464 409.548 226.016L385.177 230.774C380.158 205.071 367.586 181.45 349.068 162.933C330.55 144.415 306.929 131.842 281.227 126.824L285.985 102.453Z',
  'M348.912 283.062C344.36 298.689 335.94 312.916 324.43 324.425C312.921 335.935 298.694 344.355 283.067 348.908L279.905 338.069C293.711 334.048 306.279 326.61 316.447 316.442C326.614 306.274 334.053 293.706 338.074 279.9L348.912 283.062Z',
  'M163.092 228.938C167.644 213.31 176.065 199.084 187.574 187.574C199.084 176.065 213.31 167.644 228.938 163.092L232.099 173.93C218.293 177.951 205.725 185.39 195.557 195.557C185.39 205.725 177.951 218.293 173.93 232.099L163.092 228.938Z',
]
const DOT = 'M256.002 283.35C271.109 283.35 283.356 271.103 283.356 255.995C283.356 240.888 271.109 228.641 256.002 228.641C240.894 228.641 228.647 240.888 228.647 255.995C228.647 271.103 240.894 283.35 256.002 283.35Z'
const RED = '#FB0202'
const INK = '#0A0A0A'

/**
 * The official square icon: the reticle on a black tile (`black`, the app icon and favicon) or on a white one
 * (`white`). Rounded like an app icon unless the class says otherwise.
 */
export function SkyArcMark({ tone = 'black', className }: { tone?: 'black' | 'white'; className?: string }) {
  const tile = tone === 'black' ? INK : '#FFFFFF'
  const ink = tone === 'black' ? '#FFFFFF' : INK
  // Sized inline: menus and buttons that size every icon inside them (`[&_svg]:size-4`) leave the mark alone.
  return (
    <span className={cn('inline-flex size-8 shrink-0 overflow-hidden rounded-[22%]', className)} aria-hidden="true">
      <svg viewBox="0 0 512 512" style={{ width: '100%', height: '100%' }}>
        <rect width="512" height="512" fill={tile} />
        <g fill={ink}>
          {ARCS.map((d) => (
            <path key={d} d={d} />
          ))}
          <rect x="363.144" y="245.631" width="89.8606" height="20.7371" rx="9" />
          <rect x="59" y="245.631" width="89.8606" height="20.7371" rx="9" />
          <rect x="245.634" y="148.859" width="89.8606" height="20.7371" rx="9" transform="rotate(-90 245.634 148.859)" />
          <rect x="245.634" y="452.998" width="89.8606" height="20.7371" rx="9" transform="rotate(-90 245.634 452.998)" />
        </g>
        <path d={DOT} fill={RED} />
      </svg>
    </span>
  )
}

/**
 * The official reticle alone, white with its red dot (`public/brand/skyarc-mark-white.svg`), for dark backgrounds and
 * photos: a watermark or a banner (the public website's dark sections). Decoration only: screen readers skip it.
 */
export function SkyArcReticle({ className }: { className?: string }) {
  return <img src="/brand/skyarc-mark-white.svg" alt="" aria-hidden="true" className={cn('inline-block aspect-square', className)} />
}

const LOGO = { black: '/brand/skyarc-logo.svg', white: '/brand/skyarc-logo-white.svg' }
const WORDMARK = { black: '/brand/skyarc-wordmark.svg', white: '/brand/skyarc-wordmark-white.svg' }

type Tone = 'auto' | 'black' | 'white'

/** One of the official files in a box of its proportions, black or white or following the theme. */
function BrandImage({ files, tone, className }: { files: { black: string; white: string }; tone: Tone; className: string }) {
  return (
    <span className={className}>
      {tone === 'auto' ? (
        <>
          <img src={files.black} alt={ACADEMY_NAME} className="block size-full dark:hidden" />
          <img src={files.white} alt={ACADEMY_NAME} className="hidden size-full dark:block" />
        </>
      ) : (
        <img src={files[tone]} alt={ACADEMY_NAME} className="block size-full" />
      )}
    </span>
  )
}

/**
 * The full official logo, name included. `auto` is black in light mode and white in dark mode; `black` is for white
 * paper whatever the theme (reports, printouts); `white` is for dark backgrounds. It keeps the logo's proportions:
 * size it by height (the default, `h-12`) or by width (`h-auto w-40`).
 */
export function SkyArcLogo({ tone = 'auto', className }: { tone?: Tone; className?: string }) {
  return <BrandImage files={LOGO} tone={tone} className={cn('inline-block aspect-[1128/541] h-12 shrink-0', className)} />
}

/** The official wordmark alone: "SKY ARC" over "SPORTS ACADEMY", without the reticle. Size it by height. */
export function SkyArcWordmark({ tone = 'auto', className }: { tone?: Tone; className?: string }) {
  return <BrandImage files={WORDMARK} tone={tone} className={cn('inline-block aspect-[360/83] h-7 shrink-0', className)} />
}

/**
 * The square icon and the wordmark side by side, for the top of the navigation: `md` in the sidebar, `sm` in the
 * phone's top bar.
 */
export function SkyArcLockup({ size = 'md', className }: { size?: 'md' | 'sm'; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center', size === 'md' ? 'gap-3' : 'gap-2', className)}>
      <SkyArcMark className={size === 'md' ? 'size-11' : 'size-7'} />
      <SkyArcWordmark className={size === 'md' ? 'h-7' : 'h-[18px]'} />
    </span>
  )
}
