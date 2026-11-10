import { PDFDocument, type PDFFont, type PDFImage, type PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib'
import { type ContractBlock, type ContractDocument, type Run, pricedChoice } from '@shared/contracts/document'
import { type ContractValues, shownValue, tuitionOf, tuitionText } from '@shared/contracts/fill'

/**
 * The signed enrollment contract as a PDF (docs/DECISIONS.md §33 and §34): the academy's contract laid out page by
 * page, as the family filled it in (the option chosen and its price after the discounts the office checked, the boxes
 * checked, their initials, the student's and their own details, their signature and the date), the academy's signature
 * as on file (or its signer's name typed, until there's one: §35), the academy's other parts left for the academy, then a
 * page recording the signing (who, when, from where, which version: shared/src/contracts/signing.ts writes its words).
 * Settings' preview builds the same PDF marked as a sample, and the sample data its demo contracts
 * (scripts/seed-sample.ts). The words are the contract's own; only the layout is the app's.
 */

export interface ContractPdfInput {
  doc: ContractDocument
  values: ContractValues
  /** The drawn signature (a PNG), or none on a sample signed without one. */
  signature: Uint8Array | null
  /** As signed: the signer's name and how they relate to the student ("parent", "legal guardian"). */
  signerName: string
  relation: string
  /** Beside the signature: "11/04/2026", in the academy's time zone. */
  signedOn: string
  /**
   * The academy's signature on file (a PNG) and who signs for it, put on its line with the same date: without an image,
   * their name typed there instead; none: left blank.
   */
  academySigner: { name: string; title: string; image: Uint8Array | null } | null
  /** The page recording the signing; none on a sample. */
  record: { statement: string; facts: { label: string; value: string }[]; footnote: string } | null
  /** A preview (Settings, or More → Enrollment contract on the phone): every page says it's a sample. */
  sample: boolean
  createdAt: Date
  /** The academy's logo over the first page (the email logo's PNG); none leaves the title alone. */
  logo?: Uint8Array | null
}

const W = 612
const H = 792
const M = 54
const TOP = H - M
const BOTTOM = 66
const WIDTH = W - 2 * M

const INK = rgb(0.09, 0.09, 0.11)
const MUTED = rgb(0.4, 0.4, 0.44)
const LINE = rgb(0.82, 0.82, 0.85)
const RED = rgb(0.82, 0.09, 0.11)
const BAR = rgb(0.11, 0.11, 0.12)
const BOX = rgb(0.95, 0.96, 0.97)
const TINT = rgb(1, 0.95, 0.95)
const WHITE = rgb(1, 1, 1)

/**
 * Text the standard fonts can print (shared/src/contracts/document.ts checks the contract's own text against the same
 * set): anything else becomes "?".
 */
export function pdfText(s: string): string {
  return (s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—…•€™]/g, '?')
}

interface Fonts {
  regular: PDFFont
  bold: PDFFont
}

interface Seg {
  text: string
  font: PDFFont
}

interface TextLine {
  segs: Seg[]
  width: number
}

/** Words, bold or not, in lines at most `width` points wide; a word longer than a line is cut. */
function wrapRuns(runs: Run[], size: number, width: number, f: Fonts): TextLine[] {
  const tokens: Seg[] = []
  for (const r of runs) {
    const font = r.bold ? f.bold : f.regular
    for (const part of pdfText(r.text).split(/(\s+)/)) if (part) tokens.push({ text: /^\s+$/.test(part) ? ' ' : part, font })
  }
  const lines: TextLine[] = []
  let cur: Seg[] = []
  let w = 0
  const flush = () => {
    while (cur.length && cur[cur.length - 1].text === ' ') w -= cur.pop()!.font.widthOfTextAtSize(' ', size)
    if (cur.length) lines.push({ segs: cur, width: w })
    cur = []
    w = 0
  }
  for (const t of tokens) {
    const tw = t.font.widthOfTextAtSize(t.text, size)
    if (t.text === ' ') {
      if (cur.length) {
        cur.push(t)
        w += tw
      }
      continue
    }
    if (w + tw > width && cur.length) flush()
    if (tw <= width) {
      cur.push(t)
      w += tw
      continue
    }
    let rest = t.text
    while (rest) {
      let cut = rest.length
      while (cut > 1 && t.font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--
      const piece = rest.slice(0, cut)
      cur.push({ text: piece, font: t.font })
      w += t.font.widthOfTextAtSize(piece, size)
      rest = rest.slice(cut)
      if (rest) flush()
    }
  }
  flush()
  return lines.length ? lines : [{ segs: [], width: 0 }]
}

const plainRuns = (text: string, bold = false): Run[] => [{ text, bold }]

/** The pages, laid out top to bottom: `need` starts a new page when what comes next doesn't fit. */
class Layout {
  readonly pages: PDFPage[] = []
  page!: PDFPage
  y = TOP
  /** The drawn signature, embedded once for the contract and the record page. */
  signature: PDFImage | null = null
  /** The academy's signature on file. */
  academySignature: PDFImage | null = null
  /** The font of a name typed as a signature (the academy's, until it has an image). */
  typed: PDFFont | null = null

  constructor(
    readonly pdf: PDFDocument,
    readonly f: Fonts,
    readonly logo: PDFImage | null,
    readonly title: string,
  ) {}

  /** Text as the standard fonts can print it. */
  clean(s: string): string {
    return pdfText(s)
  }

  /** A new page: the first opens with the logo and the title, the others with a small header. */
  newPage() {
    this.page = this.pdf.addPage([W, H])
    this.pages.push(this.page)
    if (this.pages.length === 1) {
      let y = TOP
      if (this.logo) {
        const h = 48
        const w = (this.logo.width / this.logo.height) * h
        this.page.drawImage(this.logo, { x: M - 4, y: y - h, width: w, height: h })
        y -= h + 14
      }
      for (const l of wrapRuns(plainRuns(this.title, true), 19, WIDTH, this.f)) {
        this.text(l, M, y - 19, 19, INK)
        y -= 23
      }
      this.page.drawRectangle({ x: M, y: y - 8, width: WIDTH, height: 2.5, color: INK })
      this.y = y - 24
      return
    }
    let y = TOP
    if (this.logo) {
      const h = 28
      const w = (this.logo.width / this.logo.height) * h
      this.page.drawImage(this.logo, { x: M - 2, y: y - h, width: w, height: h })
    }
    const small = wrapRuns(plainRuns(this.title, true), 8.5, WIDTH * 0.62, this.f)
    small.slice(0, 2).forEach((l, i) => this.text(l, W - M - l.width, y - 12 - i * 11, 8.5, INK))
    y -= 36
    this.page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: INK })
    this.y = y - 18
  }

  need(height: number) {
    if (!this.pages.length || this.y - height < BOTTOM) this.newPage()
  }

  text(line: TextLine, x: number, y: number, size: number, color = INK) {
    let at = x
    for (const s of line.segs) {
      if (s.text !== ' ') this.page.drawText(s.text, { x: at, y, size, font: s.font, color })
      at += s.font.widthOfTextAtSize(s.text, size)
    }
  }

  /** Lines of words, a new page as needed between lines; returns nothing, moves `y`. */
  flow(lines: TextLine[], x: number, size: number, leading: number, color = INK, align: 'left' | 'center' = 'left', width = WIDTH) {
    for (const l of lines) {
      this.need(leading)
      const lx = align === 'center' ? x + (width - l.width) / 2 : x
      this.text(l, lx, this.y - size, size, color)
      this.y -= leading
    }
  }

  gap(points: number) {
    if (this.y < TOP - 30) this.y -= points
  }
}

/** A checkbox, ticked or not. */
function box(page: PDFPage, x: number, y: number, size: number, on: boolean) {
  page.drawRectangle({ x, y, width: size, height: size, borderColor: on ? INK : MUTED, borderWidth: 0.9, color: on ? INK : WHITE })
  if (on) {
    page.drawLine({ start: { x: x + size * 0.2, y: y + size * 0.5 }, end: { x: x + size * 0.42, y: y + size * 0.25 }, thickness: 1.3, color: WHITE })
    page.drawLine({ start: { x: x + size * 0.42, y: y + size * 0.25 }, end: { x: x + size * 0.82, y: y + size * 0.78 }, thickness: 1.3, color: WHITE })
  }
}

/** A label and its value on a line, as the paper's filled-in rows. */
function valueRow(L: Layout, label: string, value: string, labelW = 160) {
  const size = 9.5
  const lines = wrapRuns(plainRuns(value || ' '), size, WIDTH - labelW - 12, L.f)
  const h = Math.max(1, lines.length) * 12.5 + 8
  L.need(h)
  const top = L.y
  for (const [i, l] of wrapRuns(plainRuns(label, true), 9, labelW - 8, L.f).entries()) L.text(l, M + 8, top - 12 - i * 11, 9, INK)
  lines.forEach((l, i) => L.text(l, M + labelW, top - 12.5 - i * 12.5, size, INK))
  L.page.drawLine({ start: { x: M + labelW - 4, y: top - h + 3 }, end: { x: W - M - 8, y: top - h + 3 }, thickness: 0.6, color: LINE })
  L.y -= h
}

function drawBlock(L: Layout, b: ContractBlock, input: ContractPdfInput) {
  const { f } = L
  switch (b.kind) {
    case 'heading': {
      L.gap(10)
      const lines = wrapRuns(plainRuns(b.text, true), 11.5, WIDTH, f)
      L.need(lines.length * 15 + 30)
      L.flow(lines, M, 11.5, 15, RED)
      L.y -= 2
      return
    }
    case 'subheading': {
      L.gap(6)
      const lines = wrapRuns(plainRuns(b.text, true), 9.5, WIDTH, f)
      L.need(lines.length * 13 + 26)
      L.flow(lines, M, 9.5, 13, RED)
      L.y -= 1
      return
    }
    case 'paragraph':
      L.flow(wrapRuns(b.text, 9.5, WIDTH, f), M, 9.5, 12.6)
      L.y -= 4
      return
    case 'bullets':
      for (const item of b.items) {
        const lines = wrapRuns(item, 9.5, WIDTH - 14, f)
        L.need(12.6)
        L.page.drawCircle({ x: M + 3, y: L.y - 6.4, size: 1.7, color: RED })
        L.flow(lines, M + 14, 9.5, 12.6)
        L.y -= 1.5
      }
      L.y -= 3
      return
    case 'numbered':
      for (const item of b.items) {
        const lines = wrapRuns(item.text, 9.5, WIDTH - 18, f)
        L.need(12.6)
        L.page.drawText(L.clean(item.n), { x: M, y: L.y - 9.5, size: 9.5, font: f.regular, color: INK })
        L.flow(lines, M + 18, 9.5, 12.6)
        L.y -= 1.5
      }
      L.y -= 3
      return
    case 'box': {
      const lines = b.lines.flatMap((l, i) => wrapRuns(l, i === 0 ? 9.5 : 8.5, WIDTH - 24, f).map((t) => ({ t, size: i === 0 ? 9.5 : 8.5 })))
      const h = lines.reduce((s, l) => s + l.size * 1.35, 0) + 16
      L.gap(2)
      L.need(h + 6)
      L.page.drawRectangle({ x: M, y: L.y - h, width: WIDTH, height: h, color: BOX, borderColor: LINE, borderWidth: 0.8 })
      let y = L.y - 8
      for (const { t, size } of lines) {
        L.text(t, M + (WIDTH - t.width) / 2, y - size, size, size < 9.5 ? MUTED : INK)
        y -= size * 1.35
      }
      L.y -= h + 10
      return
    }
    case 'choose': {
      const chosen = input.values[b.id]
      L.gap(2)
      for (const o of b.options) {
        const on = o.id === chosen
        const priceW = o.price ? f.bold.widthOfTextAtSize(L.clean(o.price), 10) : 0
        const textW = WIDTH - 30 - priceW - 18
        const title = wrapRuns(plainRuns(o.title, true), 9.5, textW, f)
        const details = o.lines.flatMap((d) => wrapRuns(plainRuns(d), 8.3, textW, f))
        const h = title.length * 12 + details.length * 10.5 + 12
        L.need(h + 4)
        const top = L.y
        L.page.drawRectangle({ x: M, y: top - h, width: WIDTH, height: h, color: on ? TINT : WHITE, borderColor: on ? RED : LINE, borderWidth: on ? 1.4 : 0.8 })
        box(L.page, M + 9, top - 6 - 11, 10, on)
        let y = top - 6
        for (const l of title) {
          L.text(l, M + 28, y - 9.5, 9.5, INK)
          y -= 12
        }
        for (const l of details) {
          L.text(l, M + 28, y - 8.3, 8.3, MUTED)
          y -= 10.5
        }
        if (o.price) L.page.drawText(L.clean(o.price), { x: W - M - 10 - priceW, y: top - 6 - 10, size: 10, font: f.bold, color: INK })
        L.y -= h + 4
      }
      const picked = b.options.find((o) => o.id === chosen)
      // The price after the discounts the office checked, with what it was before them.
      const tuition = b === pricedChoice(input.doc) ? tuitionOf(input.doc, input.values) : null
      L.y -= 4
      valueRow(L, `${b.label}:`, picked?.title ?? '')
      if (b.priceLabel) valueRow(L, `${b.priceLabel}:`, tuition ? tuitionText(tuition) : (picked?.price ?? ''))
      L.y -= 8
      return
    }
    case 'check': {
      const list = Array.isArray(input.values[b.id]) ? (input.values[b.id] as string[]) : []
      L.gap(2)
      L.need(30)
      L.flow(wrapRuns(plainRuns(`${b.label}:`, true), 9.5, WIDTH, f), M, 9.5, 14)
      if (b.by === 'academy') L.flow(wrapRuns(plainRuns('Checked by the academy.'), 7.5, WIDTH, f), M, 7.5, 11, MUTED)
      for (const o of b.options) {
        const lines = wrapRuns(plainRuns(o.text), 9.5, WIDTH - 22, f)
        L.need(lines.length * 12.6 + 2)
        box(L.page, M + 2, L.y - 10.5, 9.5, list.includes(o.id))
        L.flow(lines, M + 20, 9.5, 12.6)
        L.y -= 3
      }
      if (!list.length) L.flow(wrapRuns(plainRuns('None checked.'), 8.5, WIDTH, f), M + 20, 8.5, 12, MUTED)
      L.y -= 6
      return
    }
    case 'initials': {
      const value = shownValue(input.doc, b.id, input.values)
      L.need(26)
      L.y -= 4
      const label = `${b.label}:`
      const lw = f.bold.widthOfTextAtSize(L.clean(label), 9)
      L.page.drawText(L.clean(label), { x: M, y: L.y - 12, size: 9, font: f.bold, color: INK })
      L.page.drawLine({ start: { x: M + lw + 10, y: L.y - 15 }, end: { x: M + lw + 120, y: L.y - 15 }, thickness: 0.8, color: INK })
      if (value) L.page.drawText(L.clean(value), { x: M + lw + 18, y: L.y - 12.5, size: 11, font: f.bold, color: INK })
      L.y -= 26
      return
    }
    case 'fields': {
      const rows = b.fields.length
      L.gap(4)
      L.need(22 + Math.min(rows, 3) * 21)
      L.page.drawRectangle({ x: M, y: L.y - 18, width: WIDTH, height: 18, color: b.by === 'academy' ? RED : BAR })
      L.page.drawText(L.clean(b.title.toUpperCase()), { x: M + 8, y: L.y - 12.5, size: 8.5, font: f.bold, color: WHITE })
      L.y -= 22
      for (const field of b.fields) valueRow(L, `${field.label}:`, b.by === 'family' ? shownValue(input.doc, field.id, input.values) : '')
      if (b.by === 'academy') {
        L.need(14)
        L.flow(wrapRuns(plainRuns('Filled in by the academy.'), 7.5, WIDTH, f), M + 8, 7.5, 11, MUTED)
      }
      L.y -= 8
      return
    }
    case 'sign': {
      const family = b.by === 'family'
      L.gap(6)
      L.need(family ? 98 : 64)
      const lineY = L.y - (family ? 62 : 36)
      const sigW = WIDTH * 0.62
      L.page.drawLine({ start: { x: M, y: lineY }, end: { x: M + sigW, y: lineY }, thickness: 0.9, color: INK })
      L.page.drawLine({ start: { x: M + sigW + 26, y: lineY }, end: { x: W - M, y: lineY }, thickness: 0.9, color: INK })
      if (family && L.signature) {
        // The signature as drawn, fitted above its line.
        const png = L.signature
        const scale = Math.min((sigW - 12) / png.width, 56 / png.height)
        L.page.drawImage(png, { x: M + 6, y: lineY + 2, width: png.width * scale, height: png.height * scale })
      }
      const academy = !family && input.academySigner ? input.academySigner : null
      if (academy && L.academySignature) {
        // The academy's signature on file, fitted above its line as the family's is.
        const png = L.academySignature
        const scale = Math.min((sigW - 12) / png.width, 30 / png.height)
        L.page.drawImage(png, { x: M + 6, y: lineY + 2, width: png.width * scale, height: png.height * scale })
      } else if (academy && L.typed) {
        // No image yet: the signer's name typed on the line, as an electronic signature.
        const name = pdfText(academy.name)
        const size = Math.min(17, (17 * (sigW - 12)) / Math.max(1, L.typed.widthOfTextAtSize(name, 17)))
        L.page.drawText(name, { x: M + 6, y: lineY + 5, size, font: L.typed, color: INK })
      }
      if ((family || academy) && input.signedOn) L.page.drawText(L.clean(input.signedOn), { x: M + sigW + 32, y: lineY + 5, size: 10.5, font: f.regular, color: INK })
      const labels = wrapRuns(plainRuns(b.label), 8, sigW, f)
      labels.forEach((l, i) => L.text(l, M, lineY - 11 - i * 10, 8, MUTED))
      L.page.drawText('Date', { x: M + sigW + 26, y: lineY - 11, size: 8, font: f.regular, color: MUTED })
      let y = lineY - 11 - labels.length * 10
      const by =
        family && input.signerName
          ? `Signed electronically by ${input.signerName} (${input.relation})`
          : academy
            ? `Signed for the academy by ${[academy.name, academy.title].filter(Boolean).join(', ')}`
            : ''
      for (const l of by ? wrapRuns(plainRuns(by), 7.5, sigW, f) : []) {
        L.text(l, M, y - 1, 7.5, MUTED)
        y -= 9.5
      }
      L.y = y - 14
      return
    }
  }
}

/** The page recording the signing: the sentence, the signature, then each fact on its row. */
function drawRecord(L: Layout, record: NonNullable<ContractPdfInput['record']>) {
  const { f } = L
  L.newPage()
  L.flow(wrapRuns(plainRuns('Signature record', true), 17, WIDTH, f), M, 17, 22)
  L.y -= 6
  L.flow(wrapRuns(plainRuns(record.statement), 10.5, WIDTH, f), M, 10.5, 14.5)
  L.y -= 14
  const png = L.signature
  if (png) {
    const h = 96
    L.page.drawText('Signature', { x: M, y: L.y - 9, size: 8.5, font: f.bold, color: MUTED })
    L.y -= 14
    L.page.drawRectangle({ x: M, y: L.y - h, width: WIDTH, height: h, borderColor: LINE, borderWidth: 1 })
    const scale = Math.min((WIDTH - 24) / png.width, (h - 18) / png.height, 1)
    L.page.drawImage(png, { x: M + 12, y: L.y - h + (h - png.height * scale) / 2, width: png.width * scale, height: png.height * scale })
    L.y -= h + 20
  }
  const labelW = 132
  for (const fact of record.facts) {
    const lines = wrapRuns(plainRuns(fact.value), 9.5, WIDTH - labelW, f)
    L.need(lines.length * 12.5 + 12)
    L.page.drawText(pdfText(fact.label), { x: M, y: L.y - 9.5, size: 8.5, font: f.bold, color: MUTED })
    lines.forEach((l, i) => L.text(l, M + labelW, L.y - 9.5 - i * 12.5, 9.5, INK))
    L.y -= lines.length * 12.5 + 4
    L.page.drawLine({ start: { x: M, y: L.y }, end: { x: W - M, y: L.y }, thickness: 0.5, color: LINE })
    L.y -= 8
  }
  L.y -= 4
  L.flow(wrapRuns(plainRuns(record.footnote), 8, WIDTH, f), M, 8, 11, MUTED)
}

/** The contract as filled in and signed (or a sample of it), then the record of its signing. */
export async function buildContractPdf(input: ContractPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const f: Fonts = { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold) }
  const logo = input.logo ? await pdf.embedPng(input.logo) : null
  const title = input.doc.title || 'Enrollment contract'
  const L = new Layout(pdf, f, logo, title)
  if (input.signature) L.signature = await pdf.embedPng(input.signature)
  if (input.academySigner?.image) L.academySignature = await pdf.embedPng(input.academySigner.image)
  else if (input.academySigner) L.typed = await pdf.embedFont(StandardFonts.TimesRomanItalic)
  L.newPage()
  for (const b of input.doc.blocks) drawBlock(L, b, input)
  if (input.record) drawRecord(L, input.record)

  // Each page's foot: its number, and the contract's own footer lines.
  const total = L.pages.length
  L.pages.forEach((page, i) => {
    page.drawLine({ start: { x: M, y: 46 }, end: { x: W - M, y: 46 }, thickness: 0.6, color: LINE })
    page.drawText(`Page ${i + 1} of ${total}`, { x: M, y: 34, size: 7.5, font: f.regular, color: MUTED })
    input.doc.footer.slice(0, 3).forEach((line, k) => {
      const t = pdfText(line)
      const w = f.regular.widthOfTextAtSize(t, 7.5)
      page.drawText(t, { x: W - M - w, y: 34 - k * 9.5, size: 7.5, font: f.regular, color: MUTED })
    })
    if (input.sample) {
      page.drawText('SAMPLE', { x: 150, y: 250, size: 110, font: f.bold, color: RED, opacity: 0.08, rotate: degrees(40) })
      const note = 'Sample: not signed, and not filed.'
      page.drawText(note, { x: W - M - f.bold.widthOfTextAtSize(note, 7.5), y: H - 26, size: 7.5, font: f.bold, color: RED })
    }
  })

  pdf.setTitle(pdfText(`${title}${input.sample ? ' (sample)' : ' (signed)'}`))
  pdf.setProducer('Sky Arc')
  pdf.setCreator('Sky Arc')
  pdf.setCreationDate(input.createdAt)
  pdf.setModificationDate(input.createdAt)
  return pdf.save()
}
