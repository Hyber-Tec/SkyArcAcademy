/**
 * pdf.js, loaded only when a page needs it (reading a SIUS result, showing or checking a contract): the library and
 * its worker, once. A failed load isn't kept, so the next try loads it again (the connection may be back).
 */

export type PdfJs = typeof import('pdfjs-dist')

let loading: Promise<PdfJs> | null = null

export function pdfjs(): Promise<PdfJs> {
  loading ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]).then(
    ([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib
    },
    (e: unknown) => {
      loading = null
      throw e
    },
  )
  return loading
}
