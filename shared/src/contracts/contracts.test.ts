import { describe, expect, it } from 'vitest'
import { contractEmail } from '../email/contract'
import type { WithId } from '../types'
import { contractFileName, isContractToken, signUrl, signatureFacts, signedOnText, studentContract } from './signing'
import { contractFilePlace, contractFoldersToMake } from './filing'
import type { ContractLink } from './types'

const at = (ms: number) => ({ seconds: ms / 1000, nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms })
const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 28, 19, 41)
const by = { uid: 'u', email: 'office@example.test', name: 'Office' }

function link(id: string, extra: Partial<ContractLink> = {}): WithId<ContractLink> {
  return {
    id,
    studentId: 's1',
    studentName: 'Mia Larkin',
    templateId: 't1',
    templateName: 'Enrollment contract (version 1)',
    preset: {},
    status: 'sent',
    createdAt: at(NOW - DAY),
    createdBy: by,
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

  it('shows the contract waiting, the last one signed, and one the office withdrew', () => {
    expect(studentContract([])).toEqual({ waiting: null, lastSigned: null, withdrawn: null })
    const signed = link('old', { status: 'signed', createdAt: at(NOW - 40 * DAY) })
    const fresh = link('new', { createdAt: at(NOW - DAY) })
    const c = studentContract([signed, fresh, link('x', { status: 'canceled', createdAt: at(NOW - 2 * DAY) })])
    expect([c.waiting?.id, c.lastSigned?.id, c.withdrawn]).toEqual(['new', 'old', null])
    // Withdrawn, and nothing sent since: the office sees it was withdrawn.
    const gone = studentContract([signed, link('x', { status: 'canceled', createdAt: at(NOW) })])
    expect([gone.waiting, gone.lastSigned?.id, gone.withdrawn?.id]).toEqual([null, 'old', 'x'])
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
      how: { link: 'tok' },
      templateName: 'Rental Agreement (version 1)',
      templateSha256: 'ab'.repeat(32),
      sentBy: { name: 'Office Person', atMs: NOW - DAY },
      academySigner: { name: 'Sam Director', title: 'Director' },
    })
    expect(Object.fromEntries(facts.map((f) => [f.label, f.value]))).toEqual({
      Academy: 'Sky Arc Sports Academy',
      Student: 'Mia Larkin',
      'Signed by': 'Jane Larkin (legal guardian)',
      'Signed on': 'October 28, 2026 at 3:41 PM EDT',
      'IP address': '203.0.113.7',
      Browser: 'Mozilla/5.0 (iPhone)',
      'Signing link': 'tok',
      'Sent by': 'Office Person, October 27, 2026',
      'Contract signed': 'Rental Agreement (version 1)',
      'Its text’s SHA-256': 'ab'.repeat(32),
      'The academy’s signature': 'Sam Director, Director: the signature on file with the academy, put on every contract it sends',
    })
  })

  it('says when the academy’s signature is its signer’s name typed', () => {
    const base = { academyName: 'Sky Arc', studentName: 'Mia Larkin', signerName: 'Jane Larkin', relation: 'parent' as const, signedAtMs: NOW, timezone: 'America/New_York', ip: '', userAgent: '', how: { link: 'tok' }, templateName: 'c', templateSha256: 'cd'.repeat(32) }
    const typed = signatureFacts({ ...base, academySigner: { name: 'Sam Director', title: '', typed: true } }).at(-1)
    expect(typed).toEqual({ label: 'The academy’s signature', value: 'Sam Director: their name typed as the academy’s signature, as on file with the academy, on every contract it sends' })
    expect(signatureFacts(base).some((f) => f.label === 'The academy’s signature')).toBe(false)
  })

  it('records the account that signed in the app or on the website', () => {
    const base = { academyName: 'Sky Arc', studentName: 'Mia Larkin', signerName: 'Jane Larkin', relation: 'parent' as const, signedAtMs: NOW, timezone: 'America/New_York', ip: '', userAgent: 'SkyArc/1.2 iOS', templateName: 'c.pdf', templateSha256: 'cd'.repeat(32) }
    const app = Object.fromEntries(signatureFacts({ ...base, how: { account: 'jane@example.test', where: 'app' } }).map((f) => [f.label, f.value]))
    expect(app).toMatchObject({ 'IP address': 'Unknown', Device: 'SkyArc/1.2 iOS', Account: 'jane@example.test (signed in to the app)' })
    expect(app['Signing link']).toBeUndefined()
    const web = Object.fromEntries(signatureFacts({ ...base, how: { account: 'jane@example.test', where: 'website' } }).map((f) => [f.label, f.value]))
    expect(web).toMatchObject({ Browser: 'SkyArc/1.2 iOS', Account: 'jane@example.test (signed in on the website)' })
  })
})

describe('the signing email', () => {
  it('names the student, leads to the page and the app, and escapes names', () => {
    const e = contractEmail({ to: 'jane@example.test', academyName: 'Sky Arc Sports Academy', studentFirstName: 'Mia', url: signUrl('tok') })
    expect(e.subject).toBe('Please sign Mia’s enrollment contract')
    expect(e.text).toContain('Read and sign: https://skyarcacademy.web.app/sign/tok')
    expect(e.text).toContain('It’s also waiting in Sky Arc Sports Academy’s app, if you sign in with this email.')
    expect(e.html).toContain('href="https://skyarcacademy.web.app/sign/tok"')
    const odd = contractEmail({ to: 'jane@example.test', academyName: 'Sky Arc', studentFirstName: '<Mia>', url: signUrl('tok') })
    expect(odd.html).toContain('&lt;Mia&gt;')
    expect(odd.html).not.toContain('<Mia>')
  })
})

describe('where a signed contract is filed', () => {
  it('goes in the student’s Contracts folder, owners’ and admins’ only, as no student’s file', () => {
    expect(contractFilePlace('s1')).toEqual({ folderId: 'contracts-s1', studentId: null, access: 'admins' })
  })

  it('makes the student’s folder and their Contracts folder in it, those not there yet', () => {
    const made = (has: { studentFolder: boolean; contractsFolder: boolean }) => contractFoldersToMake({ studentId: 's1', studentName: ' Mia  Larkin ', has, by, at: 'now' })
    expect(made({ studentFolder: false, contractsFolder: false })).toEqual([
      { id: 'student-s1', data: { name: 'Mia Larkin', parentId: null, studentId: 's1', access: 'staff', createdAt: 'now', createdBy: by, updatedAt: 'now', updatedBy: by } },
      { id: 'contracts-s1', data: { name: 'Contracts', parentId: 'student-s1', studentId: null, access: 'admins', createdAt: 'now', createdBy: by, updatedAt: 'now', updatedBy: by } },
    ])
    expect(made({ studentFolder: true, contractsFolder: false }).map((f) => f.id)).toEqual(['contracts-s1'])
    expect(made({ studentFolder: true, contractsFolder: true })).toEqual([])
    expect(contractFoldersToMake({ studentId: 's1', studentName: '', has: { studentFolder: false, contractsFolder: true }, by, at: 1 })[0].data.name).toBe('Student')
  })
})
