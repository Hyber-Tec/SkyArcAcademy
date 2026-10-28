import { describe, expect, it } from 'vitest'
import { contractEmail } from '../email/contract'
import type { WithId } from '../types'
import { checkSigning, contractFileName, isContractToken, linkState, signUrl, signatureFacts, signedOnText, studentContract } from './signing'
import type { ContractLink } from './types'

const at = (ms: number) => ({ seconds: ms / 1000, nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms })
const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 28, 19, 41)
const by = { uid: 'u', email: 'office@example.test', name: 'Office' }
const PNG = `data:image/png;base64,${'iVBORw0KGgo'.padEnd(400, 'A')}`

function link(id: string, extra: Partial<ContractLink> = {}): WithId<ContractLink> {
  return {
    id,
    studentId: 's1',
    studentName: 'Mia Larkin',
    templateId: 't1',
    templateName: 'Enrollment contract.pdf',
    token: 'x'.repeat(43),
    status: 'sent',
    createdAt: at(NOW - DAY),
    createdBy: by,
    expiresAt: at(NOW + 29 * DAY),
    emailedTo: [],
    emailedAt: null,
    signedAt: null,
    signer: null,
    fileId: null,
    fileName: null,
    canceledAt: null,
    canceledBy: null,
    ...extra,
  }
}

describe('signing links', () => {
  it('knows its own tokens and where they lead', () => {
    expect(isContractToken('AbC_-'.repeat(9))).toBe(true)
    expect(isContractToken('short')).toBe(false)
    expect(isContractToken('a'.repeat(43) + '/')).toBe(false)
    expect(isContractToken(42)).toBe(false)
    expect(signUrl('tok')).toBe('https://skyarcacademy.web.app/sign/tok')
    expect(contractFileName('Mia  Larkin', '2026-10-28')).toBe('Mia Larkin enrollment contract 2026-10-28.pdf')
  })

  it('says whether a link waits, expired, was signed or canceled', () => {
    expect(linkState(link('a'), NOW)).toBe('sent')
    expect(linkState(link('a', { expiresAt: at(NOW - 1) }), NOW)).toBe('expired')
    expect(linkState(link('a', { status: 'signed', expiresAt: at(NOW - 1) }), NOW)).toBe('signed')
    expect(linkState(link('a', { status: 'canceled' }), NOW)).toBe('canceled')
  })

  it('shows a student’s newest link that wasn’t canceled, and the last one signed', () => {
    expect(studentContract([], NOW)).toEqual({ state: 'none', link: null, lastSigned: null })
    expect(studentContract([link('a', { status: 'canceled' })], NOW).state).toBe('none')
    const signed = link('old', { status: 'signed', createdAt: at(NOW - 40 * DAY), expiresAt: at(NOW - 10 * DAY) })
    const fresh = link('new', { createdAt: at(NOW - DAY) })
    const c = studentContract([signed, fresh, link('x', { status: 'canceled', createdAt: at(NOW) })], NOW)
    expect([c.state, c.link?.id, c.lastSigned?.id]).toEqual(['sent', 'new', 'old'])
    expect(studentContract([signed], NOW).state).toBe('signed')
  })
})

describe('what the signer sends', () => {
  it('takes a full name, parent or guardian, a drawn signature and the agreement', () => {
    expect(checkSigning({ name: '  Jane   Larkin ', relation: 'parent', signature: PNG, agree: true })).toEqual({ ok: true, value: { name: 'Jane Larkin', relation: 'parent', signature: PNG } })
    expect(checkSigning({ name: 'José O’Neil-Smith Jr.', relation: 'guardian', signature: PNG, agree: true }).ok).toBe(true)
  })

  it('says what’s missing, field by field', () => {
    const r = checkSigning({ name: 'Jane', relation: 'aunt', signature: 'data:image/jpeg;base64,abc', agree: false })
    expect(r).toEqual({
      ok: false,
      errors: {
        name: 'Type your first and last name.',
        relation: 'Choose parent or guardian.',
        signature: 'Sign in the box with your finger or mouse.',
        agree: 'Check the box to agree to sign electronically.',
      },
    })
    expect(checkSigning({ name: '김 지우', relation: 'parent', signature: PNG, agree: true })).toMatchObject({ ok: false, errors: { name: 'Type your name in English letters.' } })
    expect(checkSigning({ name: 'Jane Larkin', relation: 'parent', signature: `data:image/png;base64,${'A'.repeat(1_500_000)}`, agree: true })).toMatchObject({ ok: false, errors: { signature: 'The signature is too large. Clear it and sign again.' } })
  })
})

describe('the signature page', () => {
  it('dates the signature in the academy’s time zone', () => {
    // 19:41 UTC is 3:41 PM in New York (still daylight time) and 4:41 AM the next day in Seoul.
    expect(signedOnText(NOW, 'America/New_York')).toBe('October 28, 2026 at 3:41 PM EDT')
    expect(signedOnText(NOW, 'Asia/Seoul')).toMatch(/^October 29, 2026 at 4:41 AM /)
  })

  it('records who signed, when, from where, and which contract', () => {
    const facts = signatureFacts({
      academyName: 'Sky Arc Sports Academy',
      studentName: 'Mia Larkin',
      signerName: 'Jane Larkin',
      relation: 'guardian',
      signedAtMs: NOW,
      timezone: 'America/New_York',
      ip: '203.0.113.7',
      userAgent: 'Mozilla/5.0 (iPhone)',
      token: 'tok',
      templateName: 'Enrollment contract.pdf',
      templateSha256: 'ab'.repeat(32),
    })
    expect(Object.fromEntries(facts.map((f) => [f.label, f.value]))).toEqual({
      Academy: 'Sky Arc Sports Academy',
      Student: 'Mia Larkin',
      'Signed by': 'Jane Larkin (guardian)',
      'Signed on': 'October 28, 2026 at 3:41 PM EDT',
      'IP address': '203.0.113.7',
      Browser: 'Mozilla/5.0 (iPhone)',
      'Signing link': 'tok',
      'Contract signed': 'Enrollment contract.pdf',
      'Its SHA-256': 'ab'.repeat(32),
    })
  })
})

describe('the signing email', () => {
  it('names the student, leads to the page, says until when, and escapes names', () => {
    const e = contractEmail({ to: 'jane@example.test', academyName: 'Sky Arc Sports Academy', studentFirstName: 'Mia', url: signUrl('tok'), expiresOn: 'November 27, 2026' })
    expect(e.subject).toBe('Please sign Mia’s enrollment contract')
    expect(e.text).toContain('Read and sign: https://skyarcacademy.web.app/sign/tok')
    expect(e.text).toContain('The link works until November 27, 2026, for one signature.')
    expect(e.html).toContain('href="https://skyarcacademy.web.app/sign/tok"')
    const odd = contractEmail({ to: 'jane@example.test', academyName: 'Sky Arc', studentFirstName: '<Mia>', url: signUrl('tok'), expiresOn: 'x' })
    expect(odd.html).toContain('&lt;Mia&gt;')
    expect(odd.html).not.toContain('<Mia>')
  })
})
