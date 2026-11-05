import { describe, expect, it } from 'vitest'
import { parseContract } from './document'
import { carriedValues, checkContractSigning, contractSummary, missingParts, prefillValues, readDate, shownValue, typingDate, usDate } from './fill'

const { doc } = parseContract(`# AGREEMENT
[[choose: Selected Level | Monthly Fee ($)]]
- STARTER | $100 / Month
- TEAM | $200 / Month
[[check: Discount(s) Applied]]
- Siblings: $10 off
- Own rifle: $5 off
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
        values: {
          'selected-level': 'team',
          'discount-s-applied': ['own-rifle-5-off'],
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

  it('shows each value as the contract does, and sums up the choices for the office', () => {
    const values = { 'selected-level': 'team', 'discount-s-applied': ['siblings-10-off'], 'date-of-birth': '2015-03-09' }
    expect(shownValue(doc, 'selected-level', values)).toBe('TEAM')
    expect(shownValue(doc, 'discount-s-applied', values)).toBe('Siblings: $10 off')
    expect(shownValue(doc, 'date-of-birth', values)).toBe('03/09/2015')
    expect(contractSummary(doc, values)).toEqual([
      { label: 'Selected Level', value: 'TEAM' },
      { label: 'Monthly Fee ($)', value: '$200 / Month' },
      { label: 'Discount(s) Applied', value: 'Siblings: $10 off' },
    ])
    expect(contractSummary(doc, {})[2]).toEqual({ label: 'Discount(s) Applied', value: 'None' })
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
