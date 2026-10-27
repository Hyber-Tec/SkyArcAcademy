import { describe, expect, it } from 'vitest'
import { type WebsiteMessageInput, checkWebsiteMessage } from '../website/messages'
import { SAMPLE_EMAIL_DOMAIN, SAMPLE_PREFIX } from './data'
import { buildSampleMessages } from './messages'

describe('buildSampleMessages', () => {
  const now = new Date('2026-10-27T18:00:00Z')
  const docs = buildSampleMessages({ academyId: 'demo', now, manager: `manager@${SAMPLE_EMAIL_DOMAIN}` })

  it('writes trial requests and questions into the academy, three new and two done', () => {
    expect(docs.every((d) => d.path.startsWith(`branches/demo/websiteMessages/${SAMPLE_PREFIX}`))).toBe(true)
    expect(docs.filter((d) => d.data.status === 'new')).toHaveLength(3)
    expect(docs.filter((d) => d.data.status === 'done').every((d) => d.data.doneBy && d.data.doneAt)).toBe(true)
    expect(new Set(docs.map((d) => d.data.kind))).toEqual(new Set(['trial', 'contact']))
  })

  it('uses only made-up addresses, sent before now', () => {
    for (const d of docs) {
      expect(String(d.data.email).endsWith(`@${SAMPLE_EMAIL_DOMAIN}`)).toBe(true)
      expect((d.data.createdAt as Date).getTime()).toBeLessThan(now.getTime())
    }
  })

  it('passes the checks the website makes before sending', () => {
    for (const d of docs) {
      const r = checkWebsiteMessage({ ...(d.data as unknown as WebsiteMessageInput), consent: true, website: '' })
      expect(r.ok ? {} : r.errors).toEqual({})
    }
  })
})
