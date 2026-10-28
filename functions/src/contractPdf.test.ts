import { PDFDocument, StandardFonts } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { buildSignedContract, checkContract, pdfText } from './contractPdf'

/** A made-up blank contract: `pages` pages that say which they are. */
async function blankContract(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]).drawText(`Made-up contract, page ${i + 1}`, { x: 72, y: 700, size: 14, font })
  return doc.save()
}

/** A 1×1 PNG, for the drawn signature. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

/** Each page's text, read back through pdf.js. */
async function pagesText(bytes: Uint8Array): Promise<string[]> {
  const task = pdfjs.getDocument({ data: bytes, isOffscreenCanvasSupported: false, verbosity: 0 })
  const doc = await task.promise
  try {
    const out: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const content = await (await doc.getPage(n)).getTextContent()
      out.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' '))
    }
    return out
  } finally {
    await task.destroy()
  }
}

const input = (template: Uint8Array) => ({
  template,
  signature: PNG,
  subtitle: 'Enrollment contract · Sky Arc Sports Academy',
  statement: 'Jane Larkin read this enrollment contract for Mia Larkin with Sky Arc Sports Academy, typed their name, checked “I agree to sign this contract electronically” and drew the signature below.',
  facts: [
    { label: 'Signed by', value: 'Jane Larkin (parent)' },
    { label: 'Signed on', value: 'October 28, 2026 at 3:41 PM EDT' },
    { label: 'Browser', value: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ${'AppleWebKit/605.1.15 '.repeat(6)}` },
    { label: 'Its SHA-256', value: 'ab'.repeat(32) },
  ],
  footnote: 'Signed electronically through Sky Arc Sports Academy’s website.',
  signedAt: new Date(Date.UTC(2026, 9, 28, 19, 41)),
})

describe('the signed contract', () => {
  it('keeps every page of the contract, then adds the signature page with what was recorded', async () => {
    const pages = await pagesText(await buildSignedContract(input(await blankContract(3))))
    expect(pages).toHaveLength(4)
    expect(pages.slice(0, 3)).toEqual(['Made-up contract, page 1', 'Made-up contract, page 2', 'Made-up contract, page 3'])
    const last = pages[3]
    for (const words of ['Signature page', 'Jane Larkin (parent)', 'October 28, 2026 at 3:41 PM EDT', 'Signed electronically']) expect(last).toContain(words)
    // A long value wraps (a hash is cut where the line ends), and nothing is lost.
    expect(last.replace(/ /g, '')).toContain('ab'.repeat(32))
  })

  it('prints what its font has, and asks for nothing it can’t print', () => {
    expect(pdfText('José O’Neil – “Mia”')).toBe('José O’Neil – “Mia”')
    expect(pdfText('김지우 Kim')).toBe('??? Kim')
    expect(pdfText('two\nlines')).toBe('two lines')
  })

  it('refuses a contract it can’t read, and says so before a link is sent', async () => {
    await expect(buildSignedContract(input(new Uint8Array([1, 2, 3, 4])))).rejects.toThrow()
    await expect(checkContract(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow()
    expect(await checkContract(await blankContract(2))).toBe(2)
  })
})
