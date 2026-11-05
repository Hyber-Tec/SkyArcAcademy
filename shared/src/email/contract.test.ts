import { describe, expect, it } from 'vitest'
import { contractEmail, signedCopyEmail, signedCopyWords } from './contract'

const copy = {
  to: 'jane@example.test',
  academyName: 'Sky Arc Sports Academy',
  studentFirstName: 'Mia',
  signerName: 'Jane <Larkin>',
  fileName: 'Mia Larkin enrollment contract 2026-11-05.pdf',
  academyEmail: 'office@example.test',
  academyPhone: '555-0100',
  appUrl: 'https://example.test',
}

describe('the contract’s emails', () => {
  it('sends the link to sign, escaped', () => {
    const mail = contractEmail({ to: 'jane@example.test', academyName: 'Sky Arc Sports Academy', studentFirstName: 'Mia', url: 'https://example.test/sign/abc', appUrl: 'https://example.test' })
    expect(mail.subject).toBe('Please sign Mia’s enrollment contract')
    expect(mail.text).toContain('Read and sign: https://example.test/sign/abc')
  })

  it('sends the signer their copy: the file attached, where else it is, and how to get it on paper', () => {
    const words = signedCopyWords(copy)
    expect(words.subject).toBe('Your signed copy of Mia’s enrollment contract')
    expect(words.intro).toContain('Thank you, Jane.')
    expect(words.intro).toContain('is attached: Mia Larkin enrollment contract 2026-11-05.pdf')
    expect(words.paper).toBe('Would you like a paper copy? Ask the academy: 555-0100 or office@example.test.')
    expect(signedCopyWords({ ...copy, academyEmail: '', academyPhone: '' }).paper).toBe('Would you like a paper copy? Ask the academy.')
  })

  it('escapes what the signer typed', () => {
    const mail = signedCopyEmail({ ...copy, signerName: '<b>Jane</b> Larkin' })
    expect(mail.html).toContain('Thank you, &lt;b&gt;Jane&lt;/b&gt;.')
    expect(mail.html).not.toContain('<b>Jane</b>')
    expect(mail.text).toContain('More → Enrollment contracts')
  })
})
