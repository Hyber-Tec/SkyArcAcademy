import { type ArrowPixels, arrowAngle } from './arrow'
import type { PdfImagePaint, PdfTextItem, SiusPage } from './parse'

/**
 * Pulls what the SIUS parser needs out of a PDF opened with pdf.js (the browser and the scripts both use this).
 * Only the parts of pdf.js used here are typed, so shared code doesn't depend on it.
 */

interface PdfJsImage {
  width?: number
  height?: number
  kind?: number
  data?: ArrayLike<number>
  bitmap?: unknown
}

interface PdfJsPage {
  getTextContent(): Promise<{ items: unknown[] }>
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>
  objs: { get(id: string, callback: (data: unknown) => void): unknown }
}

export interface PdfJsDocument {
  numPages: number
  getPage(n: number): Promise<PdfJsPage>
  getMetadata(): Promise<{ info: unknown }>
}

export interface PdfJsOps {
  save: number
  restore: number
  transform: number
  paintImageXObject: number
}

// Timers exist wherever this runs (browsers and Node); shared code has no DOM or Node types.
declare function setTimeout(callback: () => void, ms: number): unknown
declare function clearTimeout(handle: unknown): void

/** A page sits this far below the previous one, so several pages read as one long page (points). */
const PAGE_GAP = 10_000
/** SIUS results fit on one page; a 60-shot result might take two. */
const MAX_PAGES = 3

type Matrix = [number, number, number, number, number, number]

/** An image's data, once pdf.js has decoded it (it arrives after the operator list); null if it never does. */
function imageData(page: PdfJsPage, objId: string, timeoutMs = 4000): Promise<PdfJsImage | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs)
    try {
      page.objs.get(objId, (data) => {
        clearTimeout(timer)
        resolve((data as PdfJsImage | null) ?? null)
      })
    } catch {
      clearTimeout(timer)
      resolve(null)
    }
  })
}

const multiply = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
]

/** pdf.js image data as plain pixels: RGBA (kind 3), RGB (kind 2) or 1-bit gray (kind 1, unpacked). */
export function imagePixels(img: PdfJsImage | null | undefined): ArrowPixels | null {
  if (!img?.data || !img.width || !img.height) return null
  const { width, height, data } = img
  if (img.kind === 1) {
    const out = new Uint8Array(width * height)
    const rowBytes = Math.ceil(width / 8)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) out[y * width + x] = (data[y * rowBytes + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0
    }
    return { width, height, data: out }
  }
  return { width, height, data }
}

/**
 * The SIUS parser's input for a whole PDF. `readBitmap` decodes images that pdf.js handed over as an ImageBitmap (in
 * browsers, unless the document was opened with `isOffscreenCanvasSupported: false`).
 */
export async function extractSiusPage(
  doc: PdfJsDocument,
  ops: PdfJsOps,
  readBitmap?: (bitmap: unknown) => ArrowPixels | null,
): Promise<SiusPage> {
  const meta = await doc.getMetadata().catch(() => ({ info: {} }))
  const info = (meta.info ?? {}) as { CreationDate?: string }
  const items: PdfTextItem[] = []
  const images: PdfImagePaint[] = []
  const arrowAngles: Record<string, number | null> = {}
  for (let p = 1; p <= Math.min(doc.numPages, MAX_PAGES); p++) {
    const page = await doc.getPage(p)
    const shift = (p - 1) * PAGE_GAP
    const text = await page.getTextContent()
    for (const raw of text.items) {
      const it = raw as { str?: string; transform?: number[]; width?: number; fontName?: string }
      if (typeof it.str !== 'string' || !it.str.trim() || !it.transform) continue
      items.push({ str: it.str, x: it.transform[4], y: it.transform[5] - shift, w: it.width ?? 0, font: it.fontName ?? '' })
    }
    const list = await page.getOperatorList()
    const pending: { id: string; objId: string }[] = []
    let ctm: Matrix = [1, 0, 0, 1, 0, 0]
    const stack: Matrix[] = []
    for (let k = 0; k < list.fnArray.length; k++) {
      const fn = list.fnArray[k]
      const args = list.argsArray[k]
      if (fn === ops.save) stack.push([...ctm] as Matrix)
      else if (fn === ops.restore) ctm = stack.pop() ?? [1, 0, 0, 1, 0, 0]
      else if (fn === ops.transform) ctm = multiply(args as unknown as Matrix, ctm)
      else if (fn === ops.paintImageXObject) {
        const [objId, pw, ph] = args as [string, number, number]
        const id = `${p}:${objId}`
        images.push({ id, pw, ph, x: ctm[4], y: ctm[5] - shift })
        if (pw <= 32 && ph <= 32 && !(id in arrowAngles)) pending.push({ id, objId })
      }
    }
    const decoded = await Promise.all(pending.map((p) => imageData(page, p.objId)))
    pending.forEach((p, i) => {
      const obj = decoded[i]
      const pixels = obj?.bitmap && readBitmap ? readBitmap(obj.bitmap) : imagePixels(obj)
      arrowAngles[p.id] = pixels ? arrowAngle(pixels) : null
    })
  }
  return { items, images, arrowAngles, creationDate: info.CreationDate ?? null }
}
