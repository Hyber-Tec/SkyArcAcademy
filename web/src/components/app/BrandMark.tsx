import { cn } from '@/lib/utils'
import { SkyArcMark } from './SkyArcMark'

export function initials(name: string, max = 2): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return parts.slice(0, max).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
}

/** The academy's uploaded logo, a monogram in its chosen color, or else Sky Arc's mark. */
export function BrandMark({
  name,
  logoUrl,
  accentColor,
  className,
}: {
  name: string
  logoUrl?: string | null
  accentColor?: string | null
  className?: string
}) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className={cn('size-8 shrink-0 rounded-lg border bg-white object-contain', className)}
      />
    )
  }
  if (!accentColor) return <SkyArcMark className={className} />
  return (
    <div
      className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white', className)}
      style={{ backgroundColor: accentColor }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  )
}
