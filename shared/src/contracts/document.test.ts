import { describe, expect, it } from 'vitest'
import { familyFields, parseContract, parseLine, signerField, slug } from './document'

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
[[check: Discount(s) Applied]]
- Siblings: $10 off
- Own rifle: $5 off

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
    expect(doc.blocks.map((b) => b.kind)).toEqual(['box', 'paragraph', 'heading', 'paragraph', 'choose', 'subheading', 'bullets', 'check', 'subheading', 'numbered', 'heading', 'paragraph', 'initials', 'fields', 'fields', 'fields', 'sign', 'sign'])
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
        { id: 'starter-fun', title: 'STARTER · FUN', price: '$100 / Month', lines: ['Basics and safety.', '1 hr / week'] },
        { id: 'team', title: 'TEAM', price: '$200 / Month', lines: [] },
      ],
    })
  })

  it('knows who fills each part, and what each field holds', () => {
    const { doc } = parseContract(SAMPLE)
    expect(familyFields(doc).map((f) => (f.kind === 'field' ? `${f.id}=${f.fill}` : `${f.kind}:${f.id}`))).toEqual([
      'choose:selected-level',
      'check:discount-s-applied',
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
      [2, 'This [[…]] isn’t one the app knows: choose, check, initials, family, academy, sign, academy sign or footer.'],
      [4, 'Give this option its fee after a “|”.'],
      [5, 'Add its options below it, each on a line starting with “- ”.'],
      [8, '“= nickname” isn’t one the app knows: student, signer, date, phone or email.'],
      [9, '“화” can’t be printed in the PDF. Use English letters and common signs.'],
      [9, 'Add [[sign: …]] where the family signs.'],
    ])
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
})
