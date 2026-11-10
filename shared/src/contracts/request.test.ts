import { describe, expect, it } from 'vitest'
import { checkContractRequest, childName } from './request'

const today = '2026-11-08'
const good = { children: [{ firstName: 'Ava', lastName: 'Kim', dob: '2014-05-02' }], parentName: 'Grace Kim', email: 'Grace.Kim@Example.com ', phone: '(404) 555-0134' }

describe('a family’s request for the contract (docs/DECISIONS.md §39)', () => {
  it('takes each child and the parent, as the contract will check them', () => {
    const r = checkContractRequest(good, today)
    expect(r).toEqual({ ok: true, value: { children: [{ firstName: 'Ava', lastName: 'Kim', dob: '2014-05-02' }], parentName: 'Grace Kim', email: 'grace.kim@example.com', phone: '(404) 555-0134' } })
    // A birth date can be left out.
    const noDob = checkContractRequest({ ...good, children: [{ firstName: 'Leo', lastName: 'Kim', dob: '' }] }, today)
    expect(noDob.ok && noDob.value.children[0].dob).toBeNull()
    expect(childName({ firstName: 'Ava', lastName: 'Kim' })).toBe('Ava Kim')
  })

  it('says what to fix', () => {
    const r = checkContractRequest({ children: [{ firstName: 'Мия', lastName: '', dob: '2030-01-01' }], parentName: 'Grace', email: 'grace@', phone: '12' }, today)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toEqual({
      'children.0.firstName': 'Type the name in English letters.',
      'children.0.lastName': 'Type the last name.',
      'children.0.dob': 'Choose the date of birth.',
      parentName: 'Type your first and last name.',
      email: 'Type an email address.',
      phone: 'Type a phone number.',
    })
  })

  it('takes one to four children', () => {
    expect(checkContractRequest({ ...good, children: [] }, today)).toMatchObject({ ok: false, errors: { children: 'Add your child.' } })
    const five = Array.from({ length: 5 }, () => good.children[0])
    expect(checkContractRequest({ ...good, children: five }, today)).toMatchObject({ ok: false, errors: { children: 'Up to 4 children at a time.' } })
  })
})
