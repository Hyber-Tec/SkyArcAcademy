import { describe, expect, it } from 'vitest'
import { checkContractRequest, childName } from './request'

const today = '2026-11-08'
const good = { children: [{ firstName: 'Ava', lastName: 'Kim', dob: '2014-05-02' }], parentName: 'Grace Kim', email: 'Grace.Kim@Example.com ', phone: '(404) 555-0134', lang: 'en' }

describe('a family’s request for the contract (docs/DECISIONS.md §39)', () => {
  it('takes each child and the parent, as the contract will check them', () => {
    const r = checkContractRequest(good, today)
    expect(r).toEqual({ ok: true, value: { children: [{ firstName: 'Ava', lastName: 'Kim', dob: '2014-05-02' }], parentName: 'Grace Kim', email: 'grace.kim@example.com', phone: '(404) 555-0134', lang: 'en' } })
    // A birth date can be left out.
    const noDob = checkContractRequest({ ...good, children: [{ firstName: 'Leo', lastName: 'Kim', dob: '' }] }, today)
    expect(noDob.ok && noDob.value.children[0].dob).toBeNull()
    expect(childName({ firstName: 'Ava', lastName: 'Kim' })).toBe('Ava Kim')
  })

  it('says what to fix, in Korean for a parent reading it', () => {
    const r = checkContractRequest({ children: [{ firstName: '지우', lastName: '', dob: '2030-01-01' }], parentName: 'Grace', email: 'grace@', phone: '12', lang: 'ko' }, today)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toEqual({
      'children.0.firstName': '이름은 영문으로 입력해 주세요.',
      'children.0.lastName': '성을 입력해 주세요.',
      'children.0.dob': '생년월일을 골라 주세요.',
      parentName: '이름과 성을 모두 입력해 주세요.',
      email: '이메일 주소를 입력해 주세요.',
      phone: '전화번호를 입력해 주세요.',
    })
  })

  it('takes one to four children', () => {
    expect(checkContractRequest({ ...good, children: [] }, today)).toMatchObject({ ok: false, errors: { children: 'Add your child.' } })
    const five = Array.from({ length: 5 }, () => good.children[0])
    expect(checkContractRequest({ ...good, children: five }, today)).toMatchObject({ ok: false, errors: { children: 'Up to 4 children at a time.' } })
  })
})
