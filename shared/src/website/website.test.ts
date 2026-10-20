import { describe, expect, it } from 'vitest'
import { imageSrcSet, imageUrl, storageFileUrl, widthsFor } from './images'
import { type WebsiteMessageInput, checkWebsiteMessage, isBotMessage } from './messages'
import { postExcerpt, postSlug } from './posts'
import type { WebsiteImage } from './types'

describe('website pictures', () => {
  it('saves each standard width the picture reaches, and its own width below the largest', () => {
    expect(widthsFor(630)).toEqual([630])
    expect(widthsFor(1000)).toEqual([640, 1000])
    expect(widthsFor(1280)).toEqual([640, 1280])
    expect(widthsFor(1536)).toEqual([640, 1280, 1536])
    expect(widthsFor(4032)).toEqual([640, 1280, 1920])
  })

  it('addresses files by path, with no download token', () => {
    expect(storageFileUrl('b.app', 'branches/x/website/photos/p/640.webp')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/b.app/o/branches%2Fx%2Fwebsite%2Fphotos%2Fp%2F640.webp?alt=media',
    )
    const img: WebsiteImage = { folder: 'f/p', format: 'jpeg', widths: [640, 1280], width: 1280, height: 960, color: '#888', blur: '' }
    expect(imageUrl(img, 700, 'b', 'http://127.0.0.1:9199')).toBe('http://127.0.0.1:9199/v0/b/b/o/f%2Fp%2F1280.jpg?alt=media')
    expect(imageUrl(img, 4000, 'b')).toContain('1280.jpg')
    expect(imageSrcSet(img, 'b').split(', ')).toHaveLength(2)
  })
})

describe('news posts on the website', () => {
  it('makes a readable, unique address from the title', () => {
    expect(postSlug('Match day: proud of every athlete!', 'Ab12CdEf')).toBe('match-day-proud-of-every-athlete-ab12cd')
    expect(postSlug('Café & résumé', 'x1')).toBe('cafe-resume-x1')
    expect(postSlug('추석 연휴 안내', 'Q9w8e7r6')).toBe('post-q9w8e7')
    expect(postSlug('a'.repeat(100), 'id')).toHaveLength(60 + 3)
  })

  it('cuts the excerpt at a word', () => {
    expect(postExcerpt('<p>Short.</p>')).toBe('Short.')
    const long = `<p>${'word '.repeat(80)}</p>`
    const out = postExcerpt(long, 50)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(51)
  })
})

describe('messages from the website', () => {
  const contact: WebsiteMessageInput = { kind: 'contact', lang: 'en', name: ' Pat Doe ', email: 'Pat@Example.com', phone: '', topic: 'tuition', message: 'How much?' }
  const trial: WebsiteMessageInput = {
    kind: 'trial',
    lang: 'ko',
    name: 'Pat Doe',
    email: 'pat@example.com',
    phone: '555-0100',
    message: '',
    athlete: { firstName: 'Sam', lastName: 'Doe', grade: '6', experience: 'none' },
    days: ['Monday · 4:30–8 PM', 'Monday · 4:30–8 PM', ' Tuesday '],
    consent: true,
  }

  it('cleans a question', () => {
    const r = checkWebsiteMessage({ ...contact, student: '11 years old' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value).toMatchObject({ kind: 'contact', name: 'Pat Doe', email: 'pat@example.com', topic: 'tuition', athlete: null, days: [] })
    expect(r.value.message).toBe('Student: 11 years old\n\nHow much?')
  })

  it('cleans a trial request', () => {
    const r = checkWebsiteMessage(trial)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.lang).toBe('ko')
    expect(r.value.days).toEqual(['Monday · 4:30–8 PM', 'Tuesday'])
    expect(r.value.athlete).toEqual({ firstName: 'Sam', lastName: 'Doe', grade: '6', experience: 'none' })
  })

  it('names each missing or wrong field', () => {
    const r = checkWebsiteMessage({ kind: 'contact', lang: 'en', name: '', email: 'nope', phone: '', topic: 'x', message: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.errors).toEqual({ name: 'required', email: 'email', topic: 'required', message: 'required' })
    const t = checkWebsiteMessage({ ...trial, phone: '', days: [], consent: false, athlete: { firstName: '', lastName: 'Doe', grade: '13', experience: 'lots' } })
    expect(t.ok).toBe(false)
    if (t.ok) return
    expect(t.errors).toEqual({ phone: 'required', firstName: 'required', grade: 'required', experience: 'required', days: 'required', consent: 'required' })
  })

  it('refuses text past the limits', () => {
    const r = checkWebsiteMessage({ ...contact, message: 'x'.repeat(4001) })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.message).toBe('tooLong')
  })

  it('spots the field only bots fill in', () => {
    expect(isBotMessage({ website: 'http://spam' })).toBe(true)
    expect(isBotMessage({ website: '' })).toBe(false)
    expect(isBotMessage({})).toBe(false)
  })
})
