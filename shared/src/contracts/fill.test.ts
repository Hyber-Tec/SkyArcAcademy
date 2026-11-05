import { describe, expect, it } from 'vitest'
import { parseContract } from './document'
import {
  carriedValues,
  checkContractSigning,
  checkPreset,
  contractSummary,
  emailsIn,
  missingParts,
  prefillValues,
  presetValues,
  readDate,
  shownValue,
  optionHeading,
  optionPrices,
  suggestedOption,
  tuitionOf,
  tuitionText,
  typingDate,
  usDate,
  withPreset,
} from './fill'

const { doc } = parseContract(`# AGREEMENT
[[choose: Selected Level | Monthly Fee ($)]]
- STARTER | $100 / Month
- TEAM | $200 / Month
[[academy check: Discount(s) Applied]]
- Siblings: $10 off | $10
- Own rifle: $5 off | $5 | except: STARTER
[[initials: Parent Initials]]
[[family: STUDENT]]
- Student Name = student
- Date of Birth = date
[[family: PARENT]]
- Name = signer
- Telephone = phone
- Email = email
[[sign: Parent Signature]]`)

const PNG = `data:image/png;base64,${'iVBORw0KGgo'.padEnd(400, 'A')}`
const filled = {
  'selected-level': 'team',
  'discount-s-applied': ['own-rifle-5-off', 'nonsense'],
  'parent-initials': 'jl',
  'student-name': ' Mia  Larkin ',
  'date-of-birth': '3/9/2015',
  name: 'Jane Larkin',
  telephone: '(555) 010-1234',
  email: 'Jane@Example.test',
}

describe('checkContractSigning', () => {
  it('cleans what the family filled in and takes the signer’s name from their field', () => {
    expect(checkContractSigning(doc, { values: filled, relation: 'parent', signature: PNG, agree: true })).toEqual({
      ok: true,
      value: {
        // The discounts are the office's: what the family sends for them is dropped.
        values: {
          'selected-level': 'team',
          'parent-initials': 'JL',
          'student-name': 'Mia Larkin',
          'date-of-birth': '2015-03-09',
          name: 'Jane Larkin',
          telephone: '(555) 010-1234',
          email: 'jane@example.test',
        },
        name: 'Jane Larkin',
        relation: 'parent',
        signature: PNG,
      },
    })
  })

  it('says what’s missing, part by part, in the contract’s order', () => {
    const r = checkContractSigning(doc, { values: { 'date-of-birth': '13/40/2015', name: 'Jane', email: 'no', telephone: '12' }, relation: 'aunt', signature: 'data:image/jpeg;base64,x', agree: false })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toEqual({
      'selected-level': 'Choose one.',
      'parent-initials': 'Type your initials.',
      'student-name': 'Fill this in.',
      'date-of-birth': 'Type the date as MM/DD/YYYY.',
      name: 'Type the first and last name.',
      telephone: 'Type a phone number.',
      email: 'Type an email address.',
      '@relation': 'Choose parent or legal guardian.',
      '@signature': 'Sign in the box with your finger or mouse.',
      '@agree': 'Check the box to agree to sign electronically.',
    })
    expect(missingParts(doc, r.errors).map((m) => m.label)).toEqual([
      'Selected Level',
      'Parent Initials',
      'Student Name (student)',
      'Date of Birth (student)',
      'Name (parent)',
      'Telephone (parent)',
      'Email (parent)',
      'Parent or legal guardian',
      'Your signature',
      'Agreeing to sign electronically',
    ])
  })

  it('asks for the signer’s name when the contract has no field for it, in English letters', () => {
    const plain = parseContract('# T\n[[sign: Signature]]').doc
    expect(checkContractSigning(plain, { relation: 'guardian', signature: PNG, agree: true })).toMatchObject({ ok: false, errors: { '@name': 'Type your first and last name.' } })
    expect(checkContractSigning(plain, { name: '김 지우', relation: 'guardian', signature: PNG, agree: true })).toMatchObject({ ok: false, errors: { '@name': 'Type the name in English letters.' } })
    expect(checkContractSigning(plain, { name: 'José O’Neil-Smith Jr.', relation: 'guardian', signature: PNG, agree: true })).toMatchObject({ ok: true, value: { name: 'José O’Neil-Smith Jr.' } })
  })

  it('refuses a signature too large', () => {
    const r = checkContractSigning(doc, { values: filled, relation: 'parent', signature: `data:image/png;base64,${'A'.repeat(1_500_000)}`, agree: true })
    expect(r).toMatchObject({ ok: false, errors: { '@signature': 'The signature is too large. Clear it and sign again.' } })
  })
})

describe('the form’s values', () => {
  it('starts with what the records know', () => {
    expect(prefillValues(doc, { studentName: 'Mia Larkin', dob: '2015-03-09', signerName: 'Jane Larkin', phone: '555-0101', email: 'jane@example.test' })).toEqual({
      'student-name': 'Mia Larkin',
      'date-of-birth': '03/09/2015',
      name: 'Jane Larkin',
      telephone: '555-0101',
      email: 'jane@example.test',
    })
  })

  it('carries the signer’s own details to the next child, never the child’s', () => {
    expect(carriedValues(doc, { ...filled, 'parent-initials': 'JL' })).toEqual({ 'parent-initials': 'JL', name: 'Jane Larkin', telephone: '(555) 010-1234', email: 'Jane@Example.test' })
  })

  it('finds the address the signer gave, for their copy', () => {
    expect(emailsIn(doc, { ...filled, email: ' Jane@Example.test ' })).toEqual(['jane@example.test'])
    expect(emailsIn(doc, { ...filled, email: 'not an address' })).toEqual([])
    expect(emailsIn(doc, {})).toEqual([])
  })

  it('shows each value as the contract does, and sums up the choices for the office', () => {
    const values = { 'selected-level': 'team', 'discount-s-applied': ['siblings-10-off'], 'date-of-birth': '2015-03-09' }
    expect(shownValue(doc, 'selected-level', values)).toBe('TEAM')
    expect(shownValue(doc, 'discount-s-applied', values)).toBe('Siblings: $10 off')
    expect(shownValue(doc, 'date-of-birth', values)).toBe('03/09/2015')
    expect(contractSummary(doc, values)).toEqual([
      { label: 'Selected Level', value: 'TEAM' },
      { label: 'Monthly Fee ($)', value: '$190 / Month ($200, less $10 in discount)' },
      { label: 'Discount(s) Applied', value: 'Siblings: $10 off' },
    ])
    expect(contractSummary(doc, {})[2]).toEqual({ label: 'Discount(s) Applied', value: 'None' })
  })
})

describe('what the office sets, and the price', () => {
  it('checks the office’s suggestion and discounts', () => {
    expect(checkPreset(doc, { 'selected-level': 'team', 'discount-s-applied': ['own-rifle-5-off', 'siblings-10-off', 'siblings-10-off'] })).toEqual({
      ok: true,
      value: { 'selected-level': 'team', 'discount-s-applied': ['siblings-10-off', 'own-rifle-5-off'] },
    })
    expect(checkPreset(doc, { 'selected-level': '' })).toEqual({ ok: true, value: {} })
    expect(checkPreset(doc, { 'selected-level': 'gold' })).toEqual({ ok: false, error: 'Choose one of the contract’s options.' })
    expect(checkPreset(doc, { 'discount-s-applied': ['free'] })).toEqual({ ok: false, error: 'Choose from the contract’s discount(s) applied.' })
    expect(checkPreset(doc, { 'parent-initials': 'JL' })).toEqual({ ok: false, error: 'That isn’t part of the contract.' })
  })

  it('starts the family’s form with the office’s choices, and keeps the office’s discounts whatever the family sends', () => {
    const preset = { 'selected-level': 'starter', 'discount-s-applied': ['siblings-10-off'] }
    expect(presetValues(doc, preset)).toEqual(preset)
    expect(presetValues(doc, {})).toEqual({ 'discount-s-applied': [] })
    expect(withPreset(doc, { 'selected-level': 'team', 'discount-s-applied': ['own-rifle-5-off', 'siblings-10-off'] }, preset)).toEqual({ 'selected-level': 'team', 'discount-s-applied': ['siblings-10-off'] })
  })

  it('takes the discounts off the price chosen, except where one doesn’t apply', () => {
    const both = { 'discount-s-applied': ['siblings-10-off', 'own-rifle-5-off'] }
    expect(tuitionOf(doc, { 'selected-level': 'team', ...both })).toMatchObject({ base: 200, net: 185, shown: '$185 / Month', discounts: [{ amount: 10 }, { amount: 5 }] })
    // The rifle discount leaves STARTER out.
    const starter = tuitionOf(doc, { 'selected-level': 'starter', ...both })
    expect(starter && [starter.net, starter.shown, tuitionText(starter)]).toEqual([90, '$90 / Month', '$90 / Month ($100, less $10 in discount)'])
    const plain = tuitionOf(doc, { 'selected-level': 'team' })
    expect(plain && [plain.net, tuitionText(plain)]).toEqual([200, '$200 / Month'])
    expect(tuitionOf(doc, {})).toBeNull()
  })

  it('shows each option as a card: its name over the rest, its price after its own discounts', () => {
    expect(optionHeading('BEGINNER · FOUNDATION · 1 HR')).toEqual({ name: 'BEGINNER', sub: 'FOUNDATION · 1 HR' })
    expect(optionHeading('TEAM')).toEqual({ name: 'TEAM', sub: '' })
    const prices = optionPrices(doc, { 'discount-s-applied': ['siblings-10-off', 'own-rifle-5-off'] })
    expect(prices.get('team')).toEqual({ now: '$185', was: '$200', per: '/ Month' })
    expect(prices.get('starter')).toEqual({ now: '$90', was: '$100', per: '/ Month' })
    expect(optionPrices(doc, {}).get('team')).toEqual({ now: '$200', was: null, per: '/ Month' })
  })

  it('suggests the last contract’s program, or the one the student’s level names, by its name or its details', () => {
    expect(suggestedOption(doc, ['team', 'Starter'])).toBe('team')
    expect(suggestedOption(doc, [null, 'starter'])).toBe('starter')
    expect(suggestedOption(doc, ['', 'Gold'])).toBe('')
    const ranked = parseContract('# T\n[[choose: Level | Fee]]\n- NEW · FUN | $10 | 1 hr / week · New Entry\n- MIDDLE · SKILLS | $20 | 2 hrs / week · Sharpshooter / Expert\n- MIDDLE · SKILLS · 1 HR | $15 | 1 hr / week · Sharpshooter\n[[sign: S]]').doc
    expect(suggestedOption(ranked, ['Sharp Shooter'])).toBe('middle-skills')
    expect(suggestedOption(ranked, ['Expert+'])).toBe('middle-skills')
    expect(suggestedOption(ranked, ['New'])).toBe('new-fun')
  })
})

describe('dates', () => {
  it('reads a date typed the American way, or as written in the records', () => {
    expect(readDate('03/09/2015')).toBe('2015-03-09')
    expect(readDate('3/9/2015')).toBe('2015-03-09')
    expect(readDate('2015-3-9')).toBe('2015-03-09')
    expect(readDate('02/30/2015')).toBeNull()
    expect(readDate('9/3/15')).toBeNull()
    expect(usDate('2015-03-09')).toBe('03/09/2015')
  })

  it('puts the slashes in as a date is typed', () => {
    expect(typingDate('0')).toBe('0')
    expect(typingDate('0309')).toBe('03/09')
    expect(typingDate('03092015')).toBe('03/09/2015')
    expect(typingDate('03/09/20159')).toBe('03/09/2015')
  })
})
