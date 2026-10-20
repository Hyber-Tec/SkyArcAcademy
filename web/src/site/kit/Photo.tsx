import { LuImage, LuQuote, LuUser } from 'react-icons/lu'
import { imageSrcSet, imageUrl } from '@shared/website/images'
import type { WebsiteImage, WebsitePlace } from '@shared/website/types'
import { cn } from '@/lib/utils'
import { type SitePhoto, usePlacePhoto, useSiteData } from '../data'
import { STORAGE_BASE, STORAGE_BUCKET } from '../rest'
import type { L } from './content'
import { useSite } from './site'

/**
 * The academy's photos, from the CRM's Website page: a few widths of each in Storage, with its tiny blurred copy and
 * average color behind it while it loads.
 */
export const photoSrc = (img: WebsiteImage, want = 1280) => imageUrl(img, want, STORAGE_BUCKET, STORAGE_BASE)

export function Photo({
  photo,
  alt,
  sizes = '100vw',
  className,
  priority = false,
  focus,
  style,
}: {
  photo: WebsiteImage & { focus?: string }
  alt: string
  sizes?: string
  className?: string
  priority?: boolean
  focus?: string
  style?: React.CSSProperties
}) {
  return (
    <img
      src={photoSrc(photo, 1280)}
      srcSet={imageSrcSet(photo, STORAGE_BUCKET, STORAGE_BASE)}
      sizes={sizes}
      alt={alt}
      width={photo.width}
      height={photo.height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={cn('object-cover', className)}
      style={{
        backgroundImage: photo.blur ? `url(${photo.blur})` : undefined,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: photo.color || undefined,
        objectPosition: focus ?? photo.focus ?? '50% 50%',
        ...style,
      }}
    />
  )
}

/**
 * The photo the academy chose for a spot on the site. While the site's content loads it's a quiet tinted box; a spot
 * with no photo yet shows a marked placeholder.
 */
export function PlacePhoto({
  place,
  sizes,
  className,
  priority,
  focus,
  label,
  decorative = false,
}: {
  place: WebsitePlace
  sizes?: string
  className?: string
  priority?: boolean
  focus?: string
  label: L
  /** Its words are said nearby: no description for screen readers. */
  decorative?: boolean
}) {
  const photo = usePlacePhoto(place)
  const { ready } = useSiteData()
  if (photo) return <Photo photo={photo} alt={decorative ? '' : photo.alt} sizes={sizes} priority={priority} focus={focus ?? photo.focus} className={className} />
  if (!ready) return <div className={cn('bg-warm-2', className)} aria-hidden="true" />
  return <Placeholder label={label} className={cn('bg-warm text-stone', className)} />
}

export type { SitePhoto }

/**
 * A clearly marked spot for content the academy still has to send (a photo, a coach's portrait). It says
 * "Placeholder" and what's needed (it uses currentColor).
 */
export function Placeholder({ label, kind = 'photo', className, compact = false }: { label: L; kind?: 'photo' | 'person' | 'quote'; className?: string; compact?: boolean }) {
  const { t, lang } = useSite()
  const Icon = kind === 'person' ? LuUser : kind === 'quote' ? LuQuote : LuImage
  return (
    <div className={cn('demo-placeholder relative flex flex-col items-center justify-center gap-2 overflow-hidden border border-dashed border-current/30 p-4 text-center', className)} role="img" aria-label={`${lang === 'ko' ? '임시' : 'Placeholder'}: ${t(label)}`}>
      <Icon className={cn('shrink-0 opacity-60', compact ? 'size-5' : 'size-7')} aria-hidden="true" />
      <span className={cn('font-mono tracking-[0.18em] uppercase opacity-60', compact ? 'text-[9px]' : 'text-[10px]')}>{lang === 'ko' ? '임시' : 'Placeholder'}</span>
      {!compact || label ? <span className={cn('max-w-[22ch] leading-snug opacity-80', compact ? 'text-[11px]' : 'text-xs')}>{t(label)}</span> : null}
    </div>
  )
}
