import { imageSrcSet, imageUrl } from '@shared/website/images'
import type { WebsiteImage, WebsitePlace } from '@shared/website/types'
import { cn } from '@/lib/utils'
import { type SitePhoto, usePlacePhoto, useSiteData } from '../data'
import { STORAGE_BASE, STORAGE_BUCKET } from '../rest'

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
 * with no photo shows nothing (its page leaves the spot out: `usePlaceShown`).
 */
export function PlacePhoto({
  place,
  sizes,
  className,
  priority,
  focus,
  decorative = false,
}: {
  place: WebsitePlace
  sizes?: string
  className?: string
  priority?: boolean
  focus?: string
  /** Its words are said nearby: no description for screen readers. */
  decorative?: boolean
}) {
  const photo = usePlacePhoto(place)
  const { ready } = useSiteData()
  if (photo) return <Photo photo={photo} alt={decorative ? '' : photo.alt} sizes={sizes} priority={priority} focus={focus ?? photo.focus} className={className} />
  if (!ready) return <div className={cn('bg-warm-2', className)} aria-hidden="true" />
  return null
}

export type { SitePhoto }
