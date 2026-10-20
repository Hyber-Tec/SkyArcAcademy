import { describe, expect, it } from 'vitest'
import type { CleanMessage } from '../website/messages'
import { websiteMessageEmail, websiteMessageLines, websiteMessageTitle } from './websiteMessage'

const trial: CleanMessage = {
  kind: 'trial',
  lang: 'ko',
  name: 'Pat <Doe>',
  email: 'pat@example.com',
  phone: '555-0100',
  topic: '',
  message: 'Left-handed.',
  athlete: { firstName: 'Sam', lastName: 'Doe', grade: '6', experience: 'none' },
  days: ['Monday · 4:30–8 PM', 'Thursday · 5–8:30 PM'],
}

describe('the office’s email for a website message', () => {
  it('names the athlete for a trial request and the sender for a question', () => {
    expect(websiteMessageTitle(trial)).toBe('Trial request: Sam Doe')
    expect(websiteMessageTitle({ ...trial, kind: 'contact', athlete: null, days: [], topic: 'tuition' })).toBe('Question from Pat <Doe>')
  })

  it('lists what the family sent, in words', () => {
    const lines = websiteMessageLines(trial)
    expect(lines.map((l) => l.label)).toEqual(['Athlete', 'Grade', 'Experience', 'Days that suit them', 'Parent or guardian', 'Email', 'Phone', 'Reply in', 'Notes'])
    expect(lines.find((l) => l.label === 'Experience')?.value).toBe('New to shooting')
    expect(lines.find((l) => l.label === 'Reply in')?.value).toBe('Korean')
  })

  it('escapes what the family typed', () => {
    const mail = websiteMessageEmail(trial, 'Sky Arc Sports Academy', 'https://example.test')
    expect(mail.subject).toBe('Trial request: Sam Doe (website)')
    expect(mail.html).toContain('Pat &lt;Doe&gt;')
    expect(mail.html).not.toContain('Pat <Doe>')
    expect(mail.text).toContain('Days that suit them: \nMonday · 4:30–8 PM\nThursday · 5–8:30 PM')
    expect(mail.text).toContain('https://example.test/admin/website/messages')
  })
})
