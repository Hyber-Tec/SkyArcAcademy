import { describe, expect, it } from 'vitest'
import { parseContract } from '../contracts/document'
import { checkContractSigning, checkPreset, tuitionOf, withPreset } from '../contracts/fill'
import { DEFAULT_SETTINGS } from '../settings/defaults'
import { toInstant } from '../time'
import { buildSampleContracts, drawSampleSignature } from './contracts'
import { buildSampleData, sampleStudentId } from './data'

const TZ = 'America/New_York'
const TODAY = '2026-11-05'
const { docs } = buildSampleData({
  academyId: 'demo',
  timezone: TZ,
  today: TODAY,
  now: toInstant(TODAY, 15 * 60, TZ),
  week: DEFAULT_SETTINGS.schedule.defaultWeek,
  levels: DEFAULT_SETTINGS.students.levels,
  programs: DEFAULT_SETTINGS.students.programs,
})

// A made-up contract with the parts the academy's has: programs with prices, the office's discounts (one for a rifle of
// one's own, left out of one program), the family's initials, details and signature.
const { doc } = parseContract(`# AGREEMENT
[[choose: Selected Level | Monthly Fee ($)]]
- BEGINNER · FOUNDATION | $100 / Month | 2 hrs / week
- INTERMEDIATE · SKILL | $200 / Month | 2 hrs / week
- PRECISION · ELITE | $300 / Month | 3 hrs / week
[[academy check: Discount(s) Applied]]
- Partner school: $10 off | $10
- Bring Your Own Gun: $5 off | $5 | except: PRECISION · ELITE
[[check: Acknowledgments]]
- I read the safety rules
[[initials: Parent Initials]]
[[family: STUDENT]]
- Student Name = student
- Date of Birth = date
[[family: PARENT]]
- Name = signer
- Telephone = phone
- Email = email
[[sign: Parent Signature]]
[[academy sign: Club Representative]]`)

const contracts = buildSampleContracts({ doc, docs, academyId: 'demo', timezone: TZ, today: TODAY, skip: new Set() })
const of = (key: string) => contracts.find((c) => c.studentId === sampleStudentId(key))

describe('the sample’s contracts', () => {
  it('leaves the demo parent’s two children waiting, and shows every other state', () => {
    for (const key of ['jiwoo-hwang', 'minjun-hwang']) expect(of(key)?.sent.map((s) => s.status)).toEqual(['sent'])
    expect(of('lucas-ortiz')?.sent.map((s) => s.status)).toEqual(['canceled', 'sent'])
    expect(of('bella-vance')?.sent.map((s) => s.status)).toEqual(['canceled'])
    expect(of('wesley-hart')?.paper?.note).toBe('Signed on paper at the front desk')
    const signed = contracts.filter((c) => c.sent.some((s) => s.status === 'signed'))
    expect(new Set(signed.map((c) => c.sent.at(-1)?.signed?.via))).toEqual(new Set(['app', 'web', 'link']))
  })

  it('signs each one as the app would take it: every field filled, a parent who signs in where it says so', () => {
    for (const c of contracts) {
      for (const s of c.sent) {
        expect(checkPreset(doc, s.preset).ok).toBe(true)
        if (!s.signed) continue
        const checked = checkContractSigning(doc, { values: s.signed.values, relation: s.signed.relation, signature: `data:image/png;base64,${'A'.repeat(400)}`, agree: true })
        expect(checked.ok, c.studentName).toBe(true)
        expect(s.signed.at.getTime()).toBeGreaterThan(s.at.getTime())
        if (s.signed.via !== 'link') expect(s.signed.signerEmail).toMatch(/@skyarc-sample\.test$/)
        // Documentation addresses only (RFC 5737): never a real network's.
        expect(s.signed.ip).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d+$/)
      }
    }
  })

  it('suggests the program by level, and checks a discount only where it applies', () => {
    // Grace uses one of the academy's rifles: no discount for her own.
    expect(of('grace-ellis')?.sent[0].preset['discount-s-applied']).toEqual([])
    // Seoyeon brings her own, but her program is left out of that discount.
    const seoyeon = of('seoyeon-lim')?.sent[0]
    expect(seoyeon?.preset['selected-level']).toBe('precision-elite')
    expect(seoyeon?.preset['discount-s-applied']).toEqual([])
    // The Tak siblings get the other one.
    expect(of('arin-tak')?.sent[0].preset['discount-s-applied']).toEqual(['partner-school-10-off'])
    // The one sent by mistake had a discount the one sent again doesn't.
    const [wrong, fixed] = of('lucas-ortiz')?.sent ?? []
    expect((wrong.preset['discount-s-applied'] as string[]).length).toBeGreaterThan((fixed.preset['discount-s-applied'] as string[]).length)
    // Isaac's family chose another program than the one suggested, and pays its price.
    const isaac = of('isaac-brooks')?.sent[0]
    expect(isaac?.signed?.values['selected-level']).not.toBe(isaac?.preset['selected-level'])
    expect(isaac?.signed && tuitionOf(doc, withPreset(doc, isaac.signed.values, isaac.preset))?.optionId).toBe(isaac?.signed?.values['selected-level'])
  })

  it('leaves alone a student who has a contract already', () => {
    const again = buildSampleContracts({ doc, docs, academyId: 'demo', timezone: TZ, today: TODAY, skip: new Set([sampleStudentId('jiwoo-hwang')]) })
    expect(again.some((c) => c.studentId === sampleStudentId('jiwoo-hwang'))).toBe(false)
    expect(again.length).toBe(contracts.length - 1)
  })

  it('draws a signature from the name, the same each time', () => {
    const a = drawSampleSignature('Jiyeon Hwang')
    const b = drawSampleSignature('Jiyeon Hwang')
    expect(a.width).toBe(520)
    expect(Array.from(a.data)).toEqual(Array.from(b.data))
    const inked = Array.from({ length: a.width * a.height }, (_, i) => a.data[i * 4]).filter((v) => v < 128).length
    expect(inked).toBeGreaterThan(1500)
    expect(Array.from(drawSampleSignature('Laura Ellis').data)).not.toEqual(Array.from(a.data))
  })
})
