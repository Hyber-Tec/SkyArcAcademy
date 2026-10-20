import type { WebsiteImage } from './types'

/**
 * Where the website's pictures live and how they're sized. The CRM saves each picture at a few widths in Storage,
 * under `branches/{b}/website/`, which anyone may read (storage.rules), so the website shows them by plain address,
 * with no sign-in and no download token.
 */

/** The widths saved for each picture (never wider than the original). */
export const WEBSITE_IMAGE_WIDTHS = [640, 1280, 1920] as const

/** The tiny blurred copy's width. */
export const WEBSITE_BLUR_WIDTH = 24

export function websitePhotoFolder(branchId: string, photoId: string): string {
  return `branches/${branchId}/website/photos/${photoId}`
}

export function websitePostFolder(branchId: string, announcementId: string): string {
  return `branches/${branchId}/website/posts/${announcementId}`
}

/** The widths to save for a picture this wide: each standard width it reaches, and its own width if smaller. */
export function widthsFor(originalWidth: number): number[] {
  const out: number[] = WEBSITE_IMAGE_WIDTHS.filter((w) => w <= originalWidth)
  if (out.length === 0 || (out[out.length - 1] < originalWidth && originalWidth < WEBSITE_IMAGE_WIDTHS[WEBSITE_IMAGE_WIDTHS.length - 1])) out.push(Math.round(originalWidth))
  return out
}

/**
 * The public address of a file in Storage. `base` is the Storage API's address: Firebase's in production
 * (`https://firebasestorage.googleapis.com`), the emulator's when testing.
 */
export function storageFileUrl(bucket: string, path: string, base = 'https://firebasestorage.googleapis.com'): string {
  return `${base}/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`
}

export function imageFile(img: Pick<WebsiteImage, 'folder' | 'format'>, width: number): string {
  return `${img.folder}/${width}.${img.format === 'jpeg' ? 'jpg' : 'webp'}`
}

/** The copy at least `want` pixels wide (or the largest). */
export function imageUrl(img: WebsiteImage, want: number, bucket: string, base?: string): string {
  const width = img.widths.find((w) => w >= want) ?? img.widths[img.widths.length - 1]
  return storageFileUrl(bucket, imageFile(img, width), base)
}

/** A `srcset` with every saved width. */
export function imageSrcSet(img: WebsiteImage, bucket: string, base?: string): string {
  return img.widths.map((w) => `${storageFileUrl(bucket, imageFile(img, w), base)} ${w}w`).join(', ')
}
