import { describe, expect, it } from 'vitest'
import { academyChecks, amountIn, dollarsText, familyFields, parseContract, parseLine, pricedChoice, signerField, slug, withPrices } from './document'

/** A made-up contract, shaped like an academy's (CLAUDE.md: tests never use the academy's own). */
const SAMPLE = `# MAPLE RANGE ENROLLMENT AGREEMENT
[[footer: 1 Example Road, Springfield]]

> **PARTIES:** Maple Range Club and the undersigned parent or legal guardian
> Operated by Maple Range LLC

This Agreement is between Maple Range Club and the parent ("Parent").

## 1. PROGRAM
The Parent enrolls the Student in the level selected below.
[[choose: Selected Level | Monthly Fee ($)]]
- STARTER · FUN | $100 / Month | Basics and safety. | 1 hr / week
- TEAM | $200 / Month

### DISCOUNTS
- Siblings: $10 off.
[[academy check: Discount(s) Applied]]
- Siblings: $10 off | $10
- Own rifle: $5 off (not for Team) | $5 | except: Team
- Member of the club

[[check: Extras]]
- Photos may be shared

### POLICIES
1. Monthly fees include coaching.
2. **Late** pickups are charged.

## 2. WAIVER
**PLEASE READ CAREFULLY.**
[[initials: Parent Initials]]

[[family: STUDENT]]
- Student Name = student
- Date of Birth = date

[[family: PARENT]]
- Name = signer
- Telephone = phone
- Email = email
- Emergency Contact

[[academy: EQUIPMENT]]
- Serial Number
- Start Date = date

[[sign: Parent Signature]]
[[academy sign: Club Representative]]
`

describe('parseContract', () => {
  it('reads the title, the footer, the words and the parts to fill in, in order', () => {
    const { doc, problems } = parseContract(SAMPLE)
    expect(problems).toEqual([])
    expect(doc.title).toBe('MAPLE RANGE ENROLLMENT AGREEMENT')
    expect(doc.footer).toEqual(['1 Example Road, Springfield'])
    expect(doc.blocks.map((b) => b.kind)).toEqual(['box', 'paragraph', 'heading', 'paragraph', 'choose', 'subheading', 'bullets', 'check', 'check', 'subheading', 'numbered', 'heading', 'paragraph', 'initials', 'fields', 'fields', 'fields', 'sign', 'sign'])
    expect(doc.blocks[0]).toEqual({
      kind: 'box',
      lines: [
        [
          { text: 'PARTIES:', bold: true },
          { text: ' Maple Range Club and the undersigned parent or legal guardian', bold: false },
        ],
        [{ text: 'Operated by Maple Range LLC', bold: false }],
      ],
    })
  })

  it('reads a choice’s options with their price and details', () => {
    const choose = parseContract(SAMPLE).doc.blocks.find((b) => b.kind === 'choose')
    expect(choose).toEqual({
      kind: 'choose',
      id: 'selected-level',
      label: 'Selected Level',
      priceLabel: 'Monthly Fee ($)',
      options: [
        { id: 'starter-fun', title: 'STARTER · FUN', price: '$100 / Month', amount: 100, lines: ['Basics and safety.', '1 hr / week'], line: 12 },
        { id: 'team', title: 'TEAM', price: '$200 / Month', amount: 200, lines: [], line: 13 },
      ],
    })
  })

  it('reads the office’s boxes: the discounts, what each takes off, and the options it leaves out', () => {
    const { doc } = parseContract(SAMPLE)
    expect(pricedChoice(doc)?.id).toBe('selected-level')
    expect(academyChecks(doc)).toEqual([
      {
        kind: 'check',
        id: 'discount-s-applied',
        label: 'Discount(s) Applied',
        by: 'academy',
        options: [
          { id: 'siblings-10-off', text: 'Siblings: $10 off', amount: 10, except: [] },
          { id: 'own-rifle-5-off-not-for-team', text: 'Own rifle: $5 off (not for Team)', amount: 5, except: ['team'] },
          { id: 'member-of-the-club', text: 'Member of the club', amount: null, except: [] },
        ],
      },
    ])
    expect(doc.blocks.filter((b) => b.kind === 'check').map((b) => b.kind === 'check' && b.by)).toEqual(['academy', 'family'])
  })

  it('knows who fills each part, and what each field holds', () => {
    const { doc } = parseContract(SAMPLE)
    // The discounts are the office's: the family doesn't fill them in.
    expect(familyFields(doc).map((f) => (f.kind === 'field' ? `${f.id}=${f.fill}` : `${f.kind}:${f.id}`))).toEqual([
      'choose:selected-level',
      'check:extras',
      'initials:parent-initials',
      'student-name=student',
      'date-of-birth=date',
      'name=signer',
      'telephone=phone',
      'email=email',
      'emergency-contact=text',
    ])
    expect(signerField(doc)?.id).toBe('name')
    const signs = doc.blocks.filter((b) => b.kind === 'sign')
    expect(signs.map((b) => b.kind === 'sign' && b.by)).toEqual(['family', 'academy'])
    const academy = doc.blocks.find((b) => b.kind === 'fields' && b.by === 'academy')
    expect(academy?.kind === 'fields' && academy.fields.map((f) => f.id)).toEqual(['serial-number', 'start-date'])
  })

  it('numbers items as written, and keeps bold words', () => {
    const numbered = parseContract(SAMPLE).doc.blocks.find((b) => b.kind === 'numbered')
    expect(numbered).toEqual({
      kind: 'numbered',
      items: [
        { n: '1.', text: [{ text: 'Monthly fees include coaching.', bold: false }] },
        { n: '2.', text: [{ text: 'Late', bold: true }, { text: ' pickups are charged.', bold: false }] },
      ],
    })
  })

  it('says what to fix: the title, the signature, unknown parts, options missing, letters the PDF can’t print', () => {
    const { problems } = parseContract('Some words\n[[pick: One]]\n[[choose: Level | Fee]]\n- Only a name\n[[check: Extras]]\n\n[[family: You]]\n- Name = nickname\n화살표 →')
    expect(problems.map((p) => [p.line, p.message])).toEqual([
      [1, 'Start with the contract’s title, on a line starting with “# ”.'],
      [2, 'This [[…]] isn’t one the app knows: choose, check, academy check, initials, family, academy, sign, academy sign or footer.'],
      [4, 'Give this option its fee after a “|”.'],
      [5, 'Add its options below it, each on a line starting with “- ”.'],
      [8, '“= nickname” isn’t one the app knows: student, signer, date, phone or email.'],
      [9, '“화” can’t be printed in the PDF. Use English letters and common signs.'],
      [9, 'Add [[sign: …]] where the family signs.'],
    ])
  })

  it('says what to fix in a discount: its amount, the options it leaves out, a price to come off', () => {
    const bad = parseContract('# T\n[[choose: Level | Fee]]\n- A | $5\n[[academy check: Off]]\n- Ten | 10 dollars\n- Five | $5 | except: Nope\n[[sign: S]]')
    expect(bad.problems.map((p) => [p.line, p.message])).toEqual([
      [5, '“10 dollars” isn’t an amount (like $20) or “except: …”.'],
      [6, 'There’s no option “Nope” to leave out.'],
    ])
    const nothingPriced = parseContract('# T\n[[academy check: Off]]\n- Ten | $10\n[[sign: S]]')
    expect(nothingPriced.problems.map((p) => [p.line, p.message])).toEqual([[3, 'A discount comes off a price: add a [[choose: … | Price label]] with the prices.']])
  })

  it('keeps one family signature and one signer’s name', () => {
    const { problems } = parseContract('# T\n[[family: A]]\n- One = signer\n- Two = signer\n[[sign: Here]]\n[[sign: There]]')
    expect(problems.map((p) => p.message)).toEqual(['The family signs once: keep one [[sign: …]].', 'Only one field can be “= signer” (the signer’s own name).'])
  })

  it('gives every part its own ID', () => {
    const { doc } = parseContract('# T\n[[family: A]]\n- Name\n[[family: B]]\n- Name\n[[sign: S]]')
    const ids = doc.blocks.flatMap((b) => (b.kind === 'fields' ? b.fields.map((f) => f.id) : [b.kind === 'sign' ? b.id : '']))
    expect(ids).toEqual(['name', 'name-2', 's'])
  })
})

describe('the small helpers', () => {
  it('reads bold words, and leaves an unpaired ** as it is', () => {
    expect(parseLine('a **b** c')).toEqual([
      { text: 'a ', bold: false },
      { text: 'b', bold: true },
      { text: ' c', bold: false },
    ])
    expect(parseLine('5 ** 2')).toEqual([{ text: '5 ** 2', bold: false }])
  })

  it('makes short IDs of labels', () => {
    expect(slug('Monthly Tuition ($):')).toBe('monthly-tuition')
    expect(slug('???')).toBe('field')
  })

  it('reads and writes dollars', () => {
    expect(amountIn('$495 / Month')).toBe(495)
    expect(amountIn('About $1,200.5 a year')).toBe(1200.5)
    expect(amountIn('Free')).toBeNull()
    expect(dollarsText(495)).toBe('$495')
    expect(dollarsText(1200)).toBe('$1,200')
    expect(dollarsText(12.5)).toBe('$12.50')
  })
})

describe('withPrices', () => {
  it('changes only the prices, by option, and keeps every other word', () => {
    const next = withPrices(SAMPLE, { 'starter-fun': 110, team: 1250 })
    const lines = next.split('\n')
    expect(lines[11]).toBe('- STARTER · FUN | $110 / Month | Basics and safety. | 1 hr / week')
    expect(lines[12]).toBe('- TEAM | $1,250 / Month')
    expect(next.replace('$110', '$100').replace('$1,250', '$200')).toBe(SAMPLE)
    // The discounts' own dollars aren't prices: they stay.
    expect(next).toContain('- Siblings: $10 off | $10')
    expect(withPrices(SAMPLE, {})).toBe(SAMPLE)
  })
})
