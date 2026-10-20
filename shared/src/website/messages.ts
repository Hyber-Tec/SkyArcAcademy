import type { SiteLang, WebsiteMessageKind } from './types'

/**
 * Trial requests and questions sent from the website (the `websiteMessage` function). The website checks a form with
 * these rules before sending it, and the server checks it again, since anyone can call the function.
 */

/** What a question can be about (the contact form's choices). */
export const CONTACT_TOPICS = ['program', 'tuition', 'trial', 'competition', 'range', 'general'] as const
export type ContactTopic = (typeof CONTACT_TOPICS)[number]

export const CONTACT_TOPIC_LABELS: Record<ContactTopic, string> = {
  program: 'Program information',
  tuition: 'Tuition',
  trial: 'Trial session',
  competition: 'Competition pathway',
  range: 'Open range or private coaching',
  general: 'General inquiry',
}

/** The trial form's grades: 1 to 12, or other. */
export const TRIAL_GRADES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'other'] as const

export const TRIAL_EXPERIENCE = ['none', 'some', 'competed'] as const
export type TrialExperience = (typeof TRIAL_EXPERIENCE)[number]

export const TRIAL_EXPERIENCE_LABELS: Record<TrialExperience, string> = {
  none: 'New to shooting',
  some: 'Some experience',
  competed: 'Has competed',
}

export const MESSAGE_LIMITS = { name: 120, email: 254, phone: 40, message: 4000, day: 80, days: 12 } as const

/** What the website sends. `website` is a field people never see: only bots fill it in. */
export interface WebsiteMessageInput {
  kind: WebsiteMessageKind
  /** The language to reply in. */
  lang: SiteLang
  name: string
  email: string
  phone: string
  /** Contact only. */
  topic?: string
  /** Contact: the student's age or grade (optional). */
  student?: string
  message: string
  /** Trial only. */
  athlete?: { firstName: string; lastName: string; grade: string; experience: string }
  /** Trial only: the days that suit the family, as the website shows them. */
  days?: string[]
  /** The privacy policy was accepted. */
  consent?: boolean
  website?: string
}

export type MessageField = 'name' | 'email' | 'phone' | 'topic' | 'message' | 'firstName' | 'lastName' | 'grade' | 'experience' | 'days' | 'consent'
export type MessageError = 'required' | 'email' | 'tooLong' | 'invalid'

export interface CleanMessage {
  kind: WebsiteMessageKind
  lang: SiteLang
  name: string
  email: string
  phone: string
  topic: string
  message: string
  athlete: { firstName: string; lastName: string; grade: string; experience: string } | null
  days: string[]
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isEmailAddress(value: string): boolean {
  return EMAIL.test(value.trim())
}

/** Text as stored: trimmed, control characters removed, runs of spaces kept as typed. */
function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : ''
}

/** Checks a message; on success returns it cleaned, ready to store. */
export function checkWebsiteMessage(input: WebsiteMessageInput): { ok: true; value: CleanMessage } | { ok: false; errors: Partial<Record<MessageField, MessageError>> } {
  const errors: Partial<Record<MessageField, MessageError>> = {}
  const kind: WebsiteMessageKind = input?.kind === 'trial' ? 'trial' : 'contact'
  const lang: SiteLang = input?.lang === 'ko' ? 'ko' : 'en'
  const name = text(input?.name)
  const email = text(input?.email).toLowerCase()
  const phone = text(input?.phone)
  const message = text(input?.message)
  const need = (field: MessageField, value: string, max: number) => {
    if (!value) errors[field] = 'required'
    else if (value.length > max) errors[field] = 'tooLong'
  }

  need('name', name, MESSAGE_LIMITS.name)
  if (!email) errors.email = 'required'
  else if (email.length > MESSAGE_LIMITS.email || !isEmailAddress(email)) errors.email = 'email'
  if (phone.length > MESSAGE_LIMITS.phone) errors.phone = 'tooLong'
  if (message.length > MESSAGE_LIMITS.message) errors.message = 'tooLong'

  let topic = ''
  let athlete: CleanMessage['athlete'] = null
  let days: string[] = []
  if (kind === 'contact') {
    topic = text(input?.topic)
    if (!(CONTACT_TOPICS as readonly string[]).includes(topic)) errors.topic = 'required'
    if (!message) errors.message = 'required'
  } else {
    if (!phone) errors.phone = 'required'
    const a = input?.athlete
    const firstName = text(a?.firstName)
    const lastName = text(a?.lastName)
    const grade = text(a?.grade)
    const experience = text(a?.experience)
    need('firstName', firstName, 60)
    need('lastName', lastName, 60)
    if (!(TRIAL_GRADES as readonly string[]).includes(grade)) errors.grade = 'required'
    if (!(TRIAL_EXPERIENCE as readonly string[]).includes(experience)) errors.experience = 'required'
    athlete = { firstName, lastName, grade, experience }
    days = Array.isArray(input?.days) ? [...new Set(input.days.map(text).filter(Boolean))] : []
    if (days.length === 0) errors.days = 'required'
    else if (days.length > MESSAGE_LIMITS.days || days.some((d) => d.length > MESSAGE_LIMITS.day)) errors.days = 'invalid'
    if (input?.consent !== true) errors.consent = 'required'
  }
  // A contact message may name the student's age or grade; it travels with the message.
  const student = kind === 'contact' ? text(input?.student).slice(0, 60) : ''
  if (Object.keys(errors).length) return { ok: false, errors }
  return {
    ok: true,
    value: { kind, lang, name, email, phone, topic, message: student ? `Student: ${student}\n\n${message}` : message, athlete, days },
  }
}

/** Whether a bot filled in the field people never see. */
export function isBotMessage(input: Pick<WebsiteMessageInput, 'website'>): boolean {
  return typeof input?.website === 'string' && input.website.trim().length > 0
}
