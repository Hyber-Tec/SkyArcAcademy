import { useEffect, useRef, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { pdfjs } from '@/lib/pdfjs'

/**
 * A PDF shown as its pages, each a picture as wide as the screen allows (phones show embedded PDFs poorly, or one page
 * only): pdf.js draws them one after another, so the first is there while the rest come. `onFail` when the PDF can't
 * be shown (the page offers it as a download instead).
 */
export function ContractPages({ data, onFail }: { data: Uint8Array; onFail: () => void }) {
  const [pages, setPages] = useState<{ url: string; width: number; height: number }[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const fail = useRef(onFail)
  useEffect(() => {
    fail.current = onFail
  })

  // One PDF per page view (a new one would come with a new key).
  useEffect(() => {
    let alive = true
    const urls: string[] = []
    ;(async () => {
      const lib = await pdfjs()
      // pdf.js takes the bytes over: give it its own copy.
      const task = lib.getDocument({ data: data.slice(), isOffscreenCanvasSupported: false, verbosity: 0 })
      try {
        const doc = await task.promise
        if (!alive) return
        setTotal(doc.numPages)
        const cssWidth = box.current?.clientWidth || 800
        const width = Math.min(1600, Math.round(cssWidth * Math.min(window.devicePixelRatio || 1, 2)))
        for (let n = 1; n <= doc.numPages && alive; n++) {
          const page = await doc.getPage(n)
          const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width })
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width)
          canvas.height = Math.round(viewport.height)
          await page.render({ canvas, viewport, background: '#ffffff' }).promise
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
          page.cleanup()
          if (!blob || !alive) continue
          const url = URL.createObjectURL(blob)
          urls.push(url)
          setPages((p) => [...p, { url, width: canvas.width, height: canvas.height }])
        }
      } finally {
        await task.destroy().catch(() => undefined)
      }
    })().catch(() => alive && fail.current())
    return () => {
      alive = false
      for (const u of urls) URL.revokeObjectURL(u)
    }
  }, [data])

  return (
    <div ref={box} className="space-y-3" aria-label="The contract">
      {pages.map((p, i) => (
        <figure key={p.url} className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <img src={p.url} width={p.width} height={p.height} alt={`Page ${i + 1} of ${total ?? pages.length}`} className="block h-auto w-full" />
          <figcaption className="border-t bg-muted/40 px-3 py-1 text-center text-xs text-muted-foreground">
            Page {i + 1} of {total ?? pages.length}
          </figcaption>
        </figure>
      ))}
      {total === null || pages.length < total ? <Skeleton className="aspect-[8.5/11] w-full rounded-lg" /> : null}
    </div>
  )
}
