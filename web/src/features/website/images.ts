import { deleteObject, ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { WEBSITE_BLUR_WIDTH, imageFile, imageUrl, widthsFor } from '@shared/website/images'
import type { WebsiteImage } from '@shared/website/types'
import { storage, usingEmulators } from '@/lib/firebase'

/**
 * Pictures for the public website (shared/src/website/images.ts): resized in the browser to a few widths, saved as WebP
 * (JPEG where the browser can't write WebP), and uploaded where anyone can read them. The Website page's photos and
 * the announcement editor's covers both come through here.
 */

export const UNREADABLE_IMAGE = 'This photo’s format can’t be read in this browser. Save it as JPEG and try again.'

const QUALITY = 0.82
const MAX_INPUT_BYTES = 50 * 1024 * 1024
/** The blurred copy stays far below the 4,000 characters the rules allow. */
const MAX_BLUR_CHARS = 2500
const IMAGE_EXTENSIONS = /\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i

/** A problem with the picture itself: trying again won't help. */
export class ImageError extends Error {}

/** A picture ready to upload: its copies (smallest first) and what the website shows while they load. */
export interface PreparedImage {
  format: 'webp' | 'jpeg'
  /** The largest copy's size. */
  width: number
  height: number
  color: string
  blur: string
  copies: { width: number; blob: Blob }[]
}

/** Whether a picked or dropped file looks like a picture (phones sometimes leave the type empty). */
export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXTENSIONS.test(file.name)
}

interface Source {
  image: CanvasImageSource
  width: number
  height: number
}

/** Reads the picture upright (its EXIF orientation applied). Safari reads some formats (HEIC) only through an <img>. */
async function decode(file: Blob): Promise<Source & { close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    if (bitmap.width && bitmap.height) return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    bitmap.close()
  } catch {
    // Not readable this way: try an <img>.
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('empty')
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new ImageError(UNREADABLE_IMAGE)
  }
}

function paint(width: number, height: number, image: CanvasImageSource): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('The photo couldn’t be prepared in this browser.')
  // Transparent parts become white, as JPEG has no transparency.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, 0, 0, width, height)
  return canvas
}

/** The picture at this size. Big reductions go in halving steps, so fine detail doesn't turn into noise (Safari). */
function resize(src: Source, width: number, height: number): HTMLCanvasElement {
  let from = src
  while (from.width >= width * 2 && from.height >= height * 2) {
    const half = paint(Math.round(from.width / 2), Math.round(from.height / 2), from.image)
    from = { image: half, width: half.width, height: half.height }
  }
  return paint(width, height, from.image)
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** WebP when the browser can write it (Safari gives back a PNG instead), JPEG otherwise. */
async function encode(canvas: HTMLCanvasElement, format: 'webp' | 'jpeg'): Promise<{ blob: Blob; format: 'webp' | 'jpeg' }> {
  if (format === 'webp') {
    const webp = await toBlob(canvas, 'image/webp', QUALITY)
    if (webp && webp.type === 'image/webp') return { blob: webp, format: 'webp' }
  }
  const jpeg = await toBlob(canvas, 'image/jpeg', QUALITY)
  if (!jpeg) throw new Error('The photo couldn’t be prepared in this browser.')
  return { blob: jpeg, format: 'jpeg' }
}

function hex(n: number): string {
  return Math.round(n).toString(16).padStart(2, '0')
}

/** The average color of a small copy. */
function averageColor(canvas: HTMLCanvasElement): string {
  const { data } = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
  let r = 0
  let g = 0
  let b = 0
  const n = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
  }
  return `#${hex(r / n)}${hex(g / n)}${hex(b / n)}`
}

/** The tiny copy shown blurred while the picture loads, as a data: URL. */
function blurCopy(src: Source, format: 'webp' | 'jpeg'): { blur: string; color: string } {
  const width = Math.min(WEBSITE_BLUR_WIDTH, src.width)
  const height = Math.max(1, Math.min(WEBSITE_BLUR_WIDTH * 4, Math.round((src.height * width) / src.width)))
  const canvas = resize(src, width, height)
  const color = averageColor(canvas)
  for (const quality of [0.5, 0.3, 0.15]) {
    const webp = format === 'webp' ? canvas.toDataURL('image/webp', quality) : ''
    const url = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality)
    if (url.length <= MAX_BLUR_CHARS) return { blur: url, color }
  }
  return { blur: '', color }
}

/** Reads a picture and makes its copies for the website: one per width in `widthsFor`, never wider than the original. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (file.size > MAX_INPUT_BYTES) throw new ImageError('This photo is larger than 50 MB. Save a smaller copy and try again.')
  const decoded = await decode(file)
  try {
    const widths = widthsFor(decoded.width)
    const copies: PreparedImage['copies'] = []
    let format: 'webp' | 'jpeg' = 'webp'
    // Largest first (it settles the format); each smaller copy is made from the one before.
    let from: Source = decoded
    for (const width of [...widths].reverse()) {
      const height = Math.max(1, Math.round((decoded.height * width) / decoded.width))
      const canvas = resize(from, width, height)
      const out = await encode(canvas, format)
      format = out.format
      copies.unshift({ width, blob: out.blob })
      from = { image: canvas, width, height }
    }
    const largest = widths[widths.length - 1]
    return {
      format,
      width: largest,
      height: Math.max(1, Math.round((decoded.height * largest) / decoded.width)),
      ...blurCopy(from, format),
      copies,
    }
  } finally {
    decoded.close()
  }
}

/** Why an upload failed, in a sentence. */
export function uploadErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (e instanceof ImageError) return e.message
  if (code === 'storage/unauthorized') return 'The website’s storage didn’t accept this photo.'
  if (code === 'storage/canceled') return 'The upload was stopped.'
  if (code === 'storage/retry-limit-exceeded' || code === 'unavailable') return 'The upload failed. Check the connection and try again.'
  if (code === 'permission-denied') return 'The photo’s details couldn’t be saved (permission denied).'
  return (e as Error)?.message || 'The upload failed.'
}

/** Uploads the copies to `folder` (`{width}.webp` or `.jpg`), reporting progress from 0 to 1. */
export async function uploadImage(folder: string, img: PreparedImage, onProgress?: (fraction: number) => void): Promise<WebsiteImage> {
  const total = img.copies.reduce((n, c) => n + c.blob.size, 0)
  const sent = new Map<number, number>()
  const report = () => onProgress?.(total ? [...sent.values()].reduce((a, b) => a + b, 0) / total : 1)
  await Promise.all(
    img.copies.map(async (c) => {
      const task = uploadBytesResumable(storageRef(storage, imageFile({ folder, format: img.format }, c.width)), c.blob, {
        contentType: img.format === 'webp' ? 'image/webp' : 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      })
      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          (s) => {
            sent.set(c.width, s.bytesTransferred)
            report()
          },
          reject,
          () => resolve(),
        )
      })
    }),
  )
  return { folder, format: img.format, widths: img.copies.map((c) => c.width), width: img.width, height: img.height, color: img.color, blur: img.blur }
}

/** Deletes a picture's copies (the ones already gone are skipped). */
export async function deleteImageFiles(img: Pick<WebsiteImage, 'folder' | 'format' | 'widths'>): Promise<void> {
  await Promise.all(
    img.widths.map((w) =>
      deleteObject(storageRef(storage, imageFile(img, w))).catch((e: { code?: string }) => {
        if (e?.code !== 'storage/object-not-found') throw e
      }),
    ),
  )
}

/** The copy at least `want` pixels wide, by its public address (the emulator's when testing). */
export function websiteImageUrl(img: WebsiteImage, want: number): string {
  return imageUrl(img, want, storage.app.options.storageBucket ?? '', usingEmulators ? 'http://127.0.0.1:9199' : undefined)
}
