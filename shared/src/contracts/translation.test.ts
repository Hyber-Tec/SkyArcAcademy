import { describe, expect, it } from 'vitest'
import { parseContract } from './document'
import { checkContractSigning, contractSummary, missingParts, prefillValues, tuitionOf, tuitionText } from './fill'
import { contractIn, translatedContract, translationProblems } from './translation'

// A made-up contract and its translation: the same markers in the same order.
const EN = `# MAPLE RANGE AGREEMENT
[[footer: 1 Example Road]]
## 1. PROGRAM
The family chooses a level.
[[choose: Selected Level | Monthly Fee ($)]]
- STARTER · BASICS | $100 / Month | 1 hr / week
- TEAM · MATCHES | $200 / Month | 2 hrs / week
[[academy check: Discount(s) Applied]]
- Own rifle: $10 off | $10 | except: TEAM · MATCHES
[[initials: Parent Initials]]
[[family: STUDENT]]
- Student Name = student
- Date of Birth = date
[[sign: Parent Signature]]`

const KO = `# 메이플 레인지 계약서
[[footer: 1 Example Road]]
## 1. 프로그램
가족이 단계를 고릅니다.
[[choose: 선택한 단계 | 월 수강료 ($)]]
- STARTER · 기초 | 월 $100 | 주 1시간
- TEAM · 대회반 | 월 $200 | 주 2시간
[[academy check: 적용된 할인]]
- 개인 소총: $10 할인 | $10 | except: TEAM · 대회반
[[initials: 보호자 이니셜]]
[[family: 학생]]
- 학생 이름 = student
- 생년월일 = date
[[sign: 보호자 서명]]`

describe('the contract in Korean', () => {
  it('reads Korean text when told to, and lines it up with the English part by part', () => {
    expect(parseContract(KO).problems.length).toBeGreaterThan(0)
    const ko = parseContract(KO, { anyText: true })
    expect(ko.problems).toEqual([])
    expect(translationProblems(parseContract(EN).doc, ko.doc)).toEqual([])
  })

  it('keeps the English IDs, prices and rules, with the Korean words', () => {
    const { doc, translated } = contractIn('ko', EN, KO)
    expect(translated).toBe(true)
    expect(doc.title).toBe('메이플 레인지 계약서')
    const choose = doc.blocks.find((b) => b.kind === 'choose')
    expect(choose?.kind === 'choose' && choose.options.map((o) => [o.id, o.title, o.price])).toEqual([
      ['starter-basics', 'STARTER · 기초', '월 $100'],
      ['team-matches', 'TEAM · 대회반', '월 $200'],
    ])
    // A price changed in the app (the English) shows in the Korean too.
    const priced = contractIn('ko', EN.replace('$100 / Month', '$120 / Month'), KO).doc.blocks.find((b) => b.kind === 'choose')
    expect(priced?.kind === 'choose' && priced.options[0].price).toBe('월 $120')
    // The discount still leaves out the same program, by its English ID.
    const values = { 'selected-level': 'starter-basics', 'discount-s-applied': ['own-rifle-10-off'], 'parent-initials': 'JL', 'student-name': 'Mia Larkin', 'date-of-birth': '03/09/2015' }
    const t = tuitionOf(doc, values)
    expect(t && tuitionText(t, 'ko')).toBe('월 $90 (정가 $100에서 $10 할인)')
    expect(tuitionOf(doc, { ...values, 'selected-level': 'team-matches' })?.discounts).toEqual([])
    expect(contractSummary(doc, { ...values, 'discount-s-applied': [] }, 'ko')).toContainEqual({ label: '적용된 할인', value: '없음' })
  })

  it('checks a Korean reader’s form in Korean, and fills in the birth date', () => {
    const { doc } = contractIn('ko', EN, KO)
    expect(prefillValues(doc, { studentName: 'Mia Larkin', dob: '2015-03-09' })).toMatchObject({ 'date-of-birth': '03/09/2015' })
    const checked = checkContractSigning(doc, { values: { 'student-name': '미아' }, relation: '', signature: '', agree: false }, 'ko')
    expect(checked.ok).toBe(false)
    if (!checked.ok) {
      expect(checked.errors['student-name']).toBe('이름은 영문으로 입력해 주세요.')
      expect(checked.errors['@agree']).toBe('전자 서명 동의에 체크해 주세요.')
      expect(missingParts(doc, checked.errors, 'ko').map((m) => m.label)).toContain('학생 이름 (학생)')
    }
  })

  it('falls back to the English when the Korean doesn’t line up, or a reader reads English', () => {
    const short = KO.replace('- TEAM · 대회반 | 월 $200 | 주 2시간\n', '')
    expect(translationProblems(parseContract(EN).doc, parseContract(short, { anyText: true }).doc).join(' ')).toContain('2 lines in the English, 1 in the Korean')
    expect(contractIn('ko', EN, short).translated).toBe(false)
    expect(contractIn('en', EN, KO).translated).toBe(false)
    expect(contractIn('ko', EN, null).doc.title).toBe('MAPLE RANGE AGREEMENT')
    expect(translatedContract(parseContract(EN).doc, parseContract(KO, { anyText: true }).doc).blocks).toHaveLength(parseContract(EN).doc.blocks.length)
  })
})
