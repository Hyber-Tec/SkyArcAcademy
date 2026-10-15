import { cn } from '@/lib/utils'

/**
 * Sky Arc's mark: the reticle and red dot of the academy's logo on black, as in the favicon (`public/favicon.svg`).
 * The app icons and email logo are built from the same drawing by `scripts/brand-icons.ts`.
 */
export function SkyArcMark({ className }: { className?: string }) {
  // Sized inline: menus and buttons that size every icon inside them (`[&_svg]:size-4`) leave the mark alone.
  return (
    <span className={cn('inline-flex size-8 shrink-0', className)} aria-hidden="true">
      <svg viewBox="0 0 64 64" style={{ width: '100%', height: '100%' }}>
        <rect width="64" height="64" rx="14" fill="#000" />
        <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" strokeWidth="4" />
        <path d="M32 7v11M32 46v11M7 32h11M46 32h11" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
        <circle cx="32" cy="32" r="6" fill="#FB0202" />
      </svg>
    </span>
  )
}

/** The full Sky Arc Sports Academy logo: black on light backgrounds, white in dark mode. Size it by height. */
export function SkyArcLogo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-12', className)}>
      <img src="/brand/skyarc-logo.svg" alt="Sky Arc Sports Academy" className="h-full w-auto dark:hidden" />
      <img src="/brand/skyarc-logo-white.svg" alt="Sky Arc Sports Academy" className="hidden h-full w-auto dark:block" />
    </span>
  )
}
