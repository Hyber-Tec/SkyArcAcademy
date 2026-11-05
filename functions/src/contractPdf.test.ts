import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { parseContract } from '@shared/contracts/document'
import { buildContractPdf, pdfText } from './contractPdf'

/** A made-up contract, shaped like an academy's (CLAUDE.md: tests never use the academy's own). */
const { doc } = parseContract(`# MAPLE RANGE ENROLLMENT AGREEMENT
[[footer: 1 Example Road, Springfield]]
> **PARTIES:** Maple Range Club and the undersigned parent
## 1. PROGRAM
The Parent enrolls the Student in the level selected below.
[[choose: Selected Level | Monthly Fee ($)]]
- STARTER · FUN | $100 / Month | Basics and safety.
- TEAM | $200 / Month | Matches.
[[check: Discount(s) Applied]]
- Siblings: $10 off
- Own rifle: $5 off
## 2. WAIVER
${'The Parent waives claims arising from the program, as long as the law allows, and agrees to the club’s rules. '.repeat(30)}
[[initials: Parent Initials]]
[[family: STUDENT]]
- Student Name = student
- Date of Birth = date
[[family: PARENT]]
- Name = signer
- Telephone = phone
[[academy: EQUIPMENT]]
- Serial Number
[[sign: Parent Signature]]
[[academy sign: Club Representative]]`)

/** A 1×1 PNG, for the drawn signature. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')

/** Each page's text, read back through pdf.js. */
async function pagesText(bytes: Uint8Array): Promise<string[]> {
  const task = pdfjs.getDocument({ data: bytes, isOffscreenCanvasSupported: false, verbosity: 0 })
  const pdf = await task.promise
  try {
    const out: string[] = []
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent()
      out.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' ').replace(/\s+/g, ' '))
    }
    return out
  } finally {
    await task.destroy()
  }
}

const values = {
  'selected-level': 'team',
  'discount-s-applied': ['siblings-10-off'],
  'parent-initials': 'JL',
  'student-name': 'Mia Larkin',
  'date-of-birth': '2015-03-09',
  name: 'Jane Larkin',
  telephone: '555-0101',
}

const signed = {
  doc,
  values,
  signature: PNG,
  signerName: 'Jane Larkin',
  relation: 'parent',
  signedOn: '10/28/2026',
  record: {
    statement: 'Jane Larkin read this enrollment contract for Mia Larkin with Maple Range Club, filled it in, typed their name, checked “I agree to sign this contract electronically” and drew the signature on it.',
    facts: [
      { label: 'Signed by', value: 'Jane Larkin (parent)' },
      { label: 'Signed on', value: 'October 28, 2026 at 3:41 PM EDT' },
      { label: 'Browser', value: `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ${'AppleWebKit/605.1.15 '.repeat(6)}` },
      { label: 'Its text’s SHA-256', value: 'ab'.repeat(32) },
    ],
    footnote: 'Signed electronically through Maple Range Club’s website.',
  },
  sample: false,
  createdAt: new Date(Date.UTC(2026, 9, 28, 19, 41)),
}

describe('the signed contract', () => {
  it('lays out the contract as filled in, page by page, then the record of the signing', async () => {
    const pages = await pagesText(await buildContractPdf(signed))
    expect(pages.length).toBeGreaterThanOrEqual(3)
    const all = pages.join(' ')
    for (const words of ['MAPLE RANGE ENROLLMENT AGREEMENT', '1. PROGRAM', 'Selected Level: TEAM', 'Monthly Fee ($): $200 / Month', 'Discount(s) Applied:', 'Parent Initials: JL', 'Student Name: Mia Larkin', 'Date of Birth: 03/09/2015', 'Name: Jane Larkin', 'Parent Signature', '10/28/2026', 'Signed electronically by Jane Larkin (parent)', 'Club Representative', 'Filled in by the academy.']) {
      expect(all).toContain(words)
    }
    // Every page has its number and the contract's footer; the last one records the signing.
    pages.forEach((p, i) => expect(p).toContain(`Page ${i + 1} of ${pages.length}`))
    pages.forEach((p) => expect(p).toContain('1 Example Road, Springfield'))
    const last = pages.at(-1) ?? ''
    for (const words of ['Signature record', 'Jane Larkin (parent)', 'October 28, 2026 at 3:41 PM EDT']) expect(last).toContain(words)
    // A long value wraps (a hash is cut where the line ends), and nothing is lost.
    expect(last.replace(/ /g, '')).toContain('ab'.repeat(32))
    expect(all).not.toContain('SAMPLE')
  })

  it('marks a sample on every page, with no record page', async () => {
    const pages = await pagesText(await buildContractPdf({ ...signed, values: {}, signature: null, signerName: '', record: null, sample: true }))
    pages.forEach((p) => expect(p).toContain('Sample from Settings: not signed, and not filed.'))
    expect(pages.join(' ')).not.toContain('Signature record')
  })

  it('prints what its font has', () => {
    expect(pdfText('José O’Neil – “Mia”')).toBe('José O’Neil – “Mia”')
    expect(pdfText('김지우 Kim')).toBe('??? Kim')
    expect(pdfText('two\nlines')).toBe('two lines')
  })
})
