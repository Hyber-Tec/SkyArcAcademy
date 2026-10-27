import { addDays, dateKeyOf, formatInstant, formatInstantTime, todayKey } from '@shared/time'
import type { TimestampLike } from '@shared/types'
import { CONTACT_TOPIC_LABELS, type ContactTopic } from '@shared/website/messages'
import type { WebsiteMessage } from '@shared/website/types'

export function kindLabel(m: WebsiteMessage): string {
  return m.kind === 'trial' ? 'Trial request' : 'Question'
}

/** "Today, 4:02 PM", "Yesterday, 9:15 AM", or the date and time, in the academy's time zone. */
export function when(t: TimestampLike | null | undefined, timezone: string): string {
  if (!t) return 'Just now'
  const d = t.toDate()
  const day = dateKeyOf(d, timezone)
  const today = todayKey(timezone)
  if (day === today) return `Today, ${formatInstantTime(d, timezone)}`
  if (day === addDays(today, -1)) return `Yesterday, ${formatInstantTime(d, timezone)}`
  return formatInstant(d, timezone, { dateStyle: 'medium', timeStyle: 'short' })
}

/** One line about a message: the athlete and grade for a trial, the topic (or its first words) for a question. */
export function aboutLine(m: WebsiteMessage): string {
  if (m.kind === 'trial' && m.athlete) {
    const grade = m.athlete.grade === 'other' ? 'other grade' : `grade ${m.athlete.grade}`
    return [m.athlete.firstName, grade].filter(Boolean).join(', ')
  }
  return CONTACT_TOPIC_LABELS[m.topic as ContactTopic] ?? (m.message.trim().slice(0, 60) || '')
}
