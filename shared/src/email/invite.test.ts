import { describe, expect, it } from 'vitest'
import { isReservedEmail, signInUrl } from '../brand'
import { inviteEmail } from './invite'

const base = {
  to: 'maya@school.org',
  name: 'Maya Thompson',
  role: 'tutor' as const,
  branchName: 'Demo Academy',
  inviterName: 'Grace Liu',
  signInUrl: signInUrl('maya@school.org'),
}

describe('invite emails', () => {
  it('says who added the person, as what, and how to sign in', () => {
    const e = inviteEmail({ ...base, kind: 'added' })
    expect(e.subject).toBe('You’ve been added to Demo Academy')
    expect(e.text).toContain('Hi Maya,')
    expect(e.text).toContain('Grace Liu added you to Demo Academy on Hyber CRM as a tutor.')
    expect(e.text).toContain('a password for maya@school.org')
    expect(e.html).toContain('href="https://hybercrm.com/login?email=maya%40school.org"')
    expect(e.text).toContain('Hyber CRM is software by HyberTec LLC.')
  })

  it('tells new owners who made them an owner', () => {
    const e = inviteEmail({ ...base, role: 'owner', kind: 'owner' })
    expect(e.subject).toBe('You’re now an owner of Demo Academy')
    expect(e.text).toContain('Grace Liu made you an owner of Demo Academy on Hyber CRM.')
  })

  it('tells approved sign-ups they are in', () => {
    const e = inviteEmail({ ...base, role: 'parent', kind: 'approved' })
    expect(e.subject).toBe('Demo Academy approved your request')
    expect(e.text).toContain('approved your request to join as a parent.')
  })

  it('offers Google for Gmail addresses, and Google or a password for any other address', () => {
    const work = inviteEmail({ ...base, kind: 'added' })
    expect(work.text).toContain('If maya@school.org is a Google account, choose “Continue with Google”.')
    expect(work.text).toContain('Otherwise choose “Create an account” and set a password for maya@school.org.')
    expect(work.html).toContain('<strong>Create an account</strong>')
    const gmail = inviteEmail({ ...base, to: 'maya@gmail.com', kind: 'added' })
    expect(gmail.text).toContain('Choose “Continue with Google” and use maya@gmail.com.')
    expect(gmail.text).not.toContain('Create an account')
  })

  it('escapes names in the HTML', () => {
    const e = inviteEmail({ ...base, branchName: 'A&B <Tutoring>', kind: 'added' })
    expect(e.html).toContain('A&amp;B &lt;Tutoring&gt;')
    expect(e.html).not.toContain('<Tutoring>')
  })
})

describe('reserved addresses', () => {
  it('never emails test and example domains', () => {
    expect(isReservedEmail('tutor@e2e.test')).toBe(true)
    expect(isReservedEmail('someone@example.com')).toBe(true)
    expect(isReservedEmail('x@demo.invalid')).toBe(true)
    expect(isReservedEmail('maya@school.org')).toBe(false)
    expect(isReservedEmail('goochoi913@gmail.com')).toBe(false)
  })
})
