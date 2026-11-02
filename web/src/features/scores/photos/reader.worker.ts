import { photoTakenAt } from '@shared/drive/exif'
import { FLAT_SIZE, flattenPhoto } from '@shared/targets/flat'
import type { RgbaImage } from '@shared/targets/image'
import { startReview } from '@shared/targets/review'
import { scanCard } from '@shared/targets/scan'
import type { ReadReply, ReadRequest } from './types'

/**
 * The card reader, off the page's thread so the page stays responsive while it works: a photo of a paper card is
 * decoded and turned upright, brought to reading size, and read with the same code as the phone app's scanner
 * (shared/src/targets): the card found, its bulls and holes scored. The card comes back flattened and cropped like a
 * scan (as the Drive keeps it), or the photo itself when no card was found. Photos are read one at a time.
 */

/** The long side photos are read at, as the phone reads them (mobile/src/features/scan/photo.ts). */
const READ_SIDE = 2000

/** A JPEG's quality for the Drive's copy (the phone's is 88). */
const JPEG_QUALITY = 0.88

type Worker = { postMessage(message: ReadReply, transfer?: Transferable[]): void; onmessage: ((ev: MessageEvent<ReadRequest>) => void) | null }
const scope = self as unknown as Worker

/** A HEIC (or HEIF) photo, as iPhones take them: by its type, its name, or the brand in its first bytes. */
function isHeic(file: Blob, name: string, bytes: Uint8Array): boolean {
  if (/^image\/hei[cf]/.test(file.type) || /\.(heic|heif)$/i.test(name)) return true
  const brand = String.fromCharCode(...bytes.subarray(4, 12))
  return /^ftyp(heic|heix|hevc|hevx|mif1|msf1)/.test(brand)
}

/**
 * A HEIC photo's pixels, by libheif (loaded the first time one is read: browsers but Safari can't decode HEIC). It comes
 * upright: the decoder turns it as the photo says.
 */
async function decodeHeic(bytes: Uint8Array): Promise<ImageData> {
  const { default: factory } = await import('libheif-js/libheif-wasm/libheif-bundle.mjs')
  const lib = await factory()
  if (lib.ready) await lib.ready
  const decoder = new lib.HeifDecoder()
  const images = decoder.decode(bytes)
  try {
    const image = images[0]
    if (!image) throw new Error('No picture was found in this HEIC file.')
    const width = image.get_width()
    const height = image.get_height()
    const data = await new Promise<Uint8ClampedArray>((resolve, reject) =>
      image.display({ data: new Uint8ClampedArray(width * height * 4), width, height }, (shown) => (shown ? resolve(shown.data) : reject(new Error('This HEIC photo couldn’t be decoded.')))),
    )
    return new ImageData(data as Uint8ClampedArray<ArrayBuffer>, width, height)
  } finally {
    for (const image of images) image.free()
    decoder.decoder?.delete()
  }
}

/** The photo upright, at most READ_SIDE pixels along, on a canvas. */
async function upright(file: Blob, name: string, bytes: Uint8Array): Promise<OffscreenCanvas> {
  let source: ImageBitmap
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    if (!isHeic(file, name, bytes)) throw new Error('This file can’t be opened as a photo. A JPEG, PNG or HEIC photo works.')
    source = await createImageBitmap(await decodeHeic(bytes))
  }
  const k = Math.min(1, READ_SIDE / Math.max(source.width, source.height))
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(source.width * k)), Math.max(1, Math.round(source.height * k)))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser can’t read photos here.')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  source.close()
  return canvas
}

function canvasOf(img: RgbaImage): OffscreenCanvas {
  const canvas = new OffscreenCanvas(img.width, img.height)
  canvas.getContext('2d')!.putImageData(new ImageData(img.data as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0)
  return canvas
}

async function read({ id, file, name }: ReadRequest): Promise<{ reply: ReadReply; transfer: Transferable[] }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const takenAt = photoTakenAt(bytes)
  const photo = await upright(file, name, bytes)
  const ctx = photo.getContext('2d')!
  const pixels = ctx.getImageData(0, 0, photo.width, photo.height)
  const scan = scanCard({ width: pixels.width, height: pixels.height, data: pixels.data }, { shotsPerBull: 'auto' })
  if (scan.ok && scan.cardToImage) {
    const flat = canvasOf(flattenPhoto({ width: pixels.width, height: pixels.height, data: pixels.data }, scan.cardToImage))
    const jpeg = await flat.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
    const image = flat.transferToImageBitmap()
    if (image.width !== FLAT_SIZE.width) throw new Error('The card couldn’t be flattened.')
    return { reply: { id, ok: true, found: true, review: startReview(scan), image, jpeg, takenAt }, transfer: [image] }
  }
  const jpeg = await photo.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY })
  const image = photo.transferToImageBitmap()
  return { reply: { id, ok: true, found: false, reason: scan.reason ?? 'No card was found in this photo.', image, jpeg, takenAt }, transfer: [image] }
}

// One photo at a time: a phone's photo takes tens of megabytes while it's read.
let queue: Promise<void> = Promise.resolve()
scope.onmessage = (ev) => {
  const request = ev.data
  queue = queue.then(async () => {
    try {
      const { reply, transfer } = await read(request)
      scope.postMessage(reply, transfer)
    } catch (e) {
      scope.postMessage({ id: request.id, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  })
}
