import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from 'pdf-lib'

/**
 * The signed enrollment contract (docs/DECISIONS.md §23, F4): the academy's blank contract, page for page, then a
 * signature page that records who signed, how, when and from where (shared/src/contracts/signing.ts writes its words),
 * with the signature they drew.
 */

export interface SignedContractInput {
  /** The blank contract's bytes. */
  template: Uint8Array
  /** The drawn signature, a PNG. */
  signature: Uint8Array
  /** "Enrollment contract · Sky Arc Sports Academy". */
  subtitle: string
  /** How it was signed, in a sentence. */
  statement: string
  facts: { label: string; value: string }[]
  /** Under the facts: what the page is. */
  footnote: string
  signedAt: Date
}

const INK = rgb(0.09, 0.09, 0.11)
const MUTED = rgb(0.38, 0.38, 0.42)
const LINE = rgb(0.85, 0.85, 0.87)

/**
 * Text the page's font can print: the standard PDF fonts have Latin letters only, so anything else becomes "?" (the
 * signer's name is asked for in English letters, shared/src/contracts/signing.ts).
 */
export function pdfText(s: string): string {
  return (s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—…•€™]/g, '?')
}

/** Lines of at most `width` points; a word longer than a line (a token, a hash, a browser's name) is cut. */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = []
  let line = ''
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= width
  for (const word of pdfText(text).split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (fits(next)) {
      line = next
      continue
    }
    if (line) lines.push(line)
    let rest = word
    while (!fits(rest)) {
      let cut = rest.length - 1
      while (cut > 1 && !fits(rest.slice(0, cut))) cut--
      lines.push(rest.slice(0, cut))
      rest = rest.slice(cut)
    }
    line = rest
  }
  if (line) lines.push(line)
  return lines
}

function drawLines(page: PDFPage, lines: string[], x: number, y: number, font: PDFFont, size: number, color = INK, leading = size * 1.4): number {
  for (const l of lines) {
    page.drawText(l, { x, y, size, font, color })
    y -= leading
  }
  return y
}

/**
 * Whether a blank contract can be signed: it opens (no password) and its pages copy, as signing will do. Throws when
 * it can't, so the office hears it before a family does.
 */
export async function checkContract(template: Uint8Array): Promise<number> {
  const source = await PDFDocument.load(template, { updateMetadata: false })
  await (await PDFDocument.create()).copyPages(source, source.getPageIndices())
  return source.getPageCount()
}

/** The contract's pages, then the signature page. Throws when the blank contract can't be read (or is locked). */
export async function buildSignedContract(i: SignedContractInput): Promise<Uint8Array> {
  const source = await PDFDocument.load(i.template, { updateMetadata: false })
  const out = await PDFDocument.create()
  for (const p of await out.copyPages(source, source.getPageIndices())) out.addPage(p)

  const W = 612
  const H = 792
  const M = 54
  const page = out.addPage([W, H])
  const regular = await out.embedFont(StandardFonts.Helvetica)
  const bold = await out.embedFont(StandardFonts.HelveticaBold)
  const png = await out.embedPng(i.signature)

  let y = H - M - 4
  page.drawText('Signature page', { x: M, y, size: 20, font: bold, color: INK })
  y -= 20
  page.drawText(pdfText(i.subtitle), { x: M, y, size: 10.5, font: regular, color: MUTED })
  y -= 30
  y = drawLines(page, wrap(i.statement, regular, 11, W - 2 * M), M, y, regular, 11)

  // The signature, as drawn, in a box.
  y -= 10
  page.drawText('Signature', { x: M, y, size: 9, font: bold, color: MUTED })
  y -= 8
  const boxH = 120
  page.drawRectangle({ x: M, y: y - boxH, width: W - 2 * M, height: boxH, borderColor: LINE, borderWidth: 1 })
  const scale = Math.min((W - 2 * M - 24) / png.width, (boxH - 20) / png.height, 1)
  page.drawImage(png, { x: M + 12, y: y - boxH + (boxH - png.height * scale) / 2, width: png.width * scale, height: png.height * scale })
  y -= boxH + 28

  // What was recorded, a row each.
  const labelW = 120
  const valueW = W - 2 * M - labelW
  for (const f of i.facts) {
    const lines = wrap(f.value, regular, 10, valueW)
    page.drawText(pdfText(f.label), { x: M, y, size: 9, font: bold, color: MUTED })
    const end = drawLines(page, lines, M + labelW, y, regular, 10, INK, 13)
    y = end - 7
    page.drawLine({ start: { x: M, y: y + 4 }, end: { x: W - M, y: y + 4 }, thickness: 0.5, color: LINE })
    y -= 6
  }
  y -= 6
  drawLines(page, wrap(i.footnote, regular, 8.5, W - 2 * M), M, y, regular, 8.5, MUTED, 12)

  out.setTitle(pdfText(`${i.subtitle} (signed)`))
  out.setProducer('Sky Arc')
  out.setCreator('Sky Arc')
  out.setCreationDate(i.signedAt)
  out.setModificationDate(i.signedAt)
  return out.save()
}
