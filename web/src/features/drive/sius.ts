import type { ArrowPixels } from '@shared/sius/arrow'
import { extractSiusPage } from '@shared/sius/extract'
import { type SiusReading, type SiusResult, parseSiusPage, readSiusResult } from '@shared/sius/parse'
import { pdfjs } from '@/lib/pdfjs'

/**
 * Reads a dropped PDF as a SIUS result, in the browser: pdf.js (loaded only when a PDF is dropped) opens it, and
 * the shared parser reads the page. Null when the PDF isn't a SIUS result (it's then stored as a plain file).
 */

/** An ImageBitmap's pixels (when pdf.js hands images over that way). */
function bitmapPixels(bitmap: unknown): ArrowPixels | null {
  const b = bitmap as ImageBitmap
  if (!b?.width || !b?.height) return null
  const canvas = document.createElement('canvas')
  canvas.width = b.width
  canvas.height = b.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(b, 0, 0)
  const data = ctx.getImageData(0, 0, b.width, b.height)
  return { width: b.width, height: b.height, data: data.data }
}

export interface SiusFile {
  result: SiusResult
  reading: SiusReading
}

export async function readSiusFile(file: File, timezone: string): Promise<SiusFile | null> {
  const lib = await pdfjs()
  const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isOffscreenCanvasSupported: false, verbosity: 0 })
  try {
    const doc = await task.promise
    const page = await extractSiusPage(doc as never, lib.OPS, bitmapPixels)
    const result = parseSiusPage(page)
    return result ? { result, reading: readSiusResult(result, timezone) } : null
  } catch {
    return null
  } finally {
    await task.destroy().catch(() => undefined)
  }
}

/** Reads several PDFs, a few at a time. */
export async function readSiusFiles(files: File[], timezone: string, onEach?: (done: number) => void): Promise<(SiusFile | null)[]> {
  const out: (SiusFile | null)[] = new Array(files.length).fill(null)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < files.length) {
      const i = next++
      out[i] = await readSiusFile(files[i], timezone)
      onEach?.(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker))
  return out
}
