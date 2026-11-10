import { COL } from '../paths'
import type { WebsiteMessage } from '../website/types'
import { SAMPLE_EMAIL_DOMAIN, SAMPLE_PREFIX, type SampleDoc } from './data'

/** One made-up message, `hoursAgo` before the sample's now. */
interface Draft {
  key: string
  hoursAgo: number
  done?: boolean
  message: Omit<WebsiteMessage, 'status' | 'createdAt' | 'doneAt' | 'doneBy'>
}

/** Phone numbers in 555-0100…0199, which exist nowhere. */
const phone = (n: number) => `(678) 555-01${String(n).padStart(2, '0')}`
const email = (name: string) => `${name.toLowerCase().replace(/\s+/g, '.')}@${SAMPLE_EMAIL_DOMAIN}`

const DRAFTS: Draft[] = [
  {
    key: 'trial-park',
    hoursAgo: 3,
    message: {
      kind: 'trial',
      name: 'Grace Park',
      email: email('Grace Park'),
      phone: phone(71),
      topic: '',
      message: 'My son saw the team at a school fair and can’t stop talking about it. Is a weekday after 5 possible?',
      athlete: { firstName: 'Ethan', lastName: 'Park', grade: '7', experience: 'none' },
      days: ['Monday', 'Wednesday'],
    },
  },
  {
    key: 'question-tuition',
    hoursAgo: 20,
    message: {
      kind: 'contact',
      name: 'Marcus Ortiz',
      email: email('Marcus Ortiz'),
      phone: phone(72),
      topic: 'tuition',
      message: 'Hello, how does tuition work for two siblings, and is the equipment included for beginners?',
      athlete: null,
      days: [],
    },
  },
  {
    key: 'trial-kim',
    hoursAgo: 30,
    message: {
      kind: 'trial',
      name: 'Soyeon Kim',
      email: email('Soyeon Kim'),
      phone: phone(73),
      topic: '',
      message: 'My daughter would like to try air rifle. Which times are open for a trial class?',
      athlete: { firstName: 'Yuna', lastName: 'Kim', grade: '9', experience: 'some' },
      days: ['Tuesday', 'Thursday', 'Sunday'],
    },
  },
  {
    key: 'question-competition',
    hoursAgo: 4 * 24,
    done: true,
    message: {
      kind: 'contact',
      name: 'Rachel Moore',
      email: email('Rachel Moore'),
      phone: '',
      topic: 'competition',
      message: 'My daughter shoots at her high school. Do you help students prepare for the Junior Olympics?',
      athlete: null,
      days: [],
    },
  },
  {
    key: 'trial-lee',
    hoursAgo: 6 * 24,
    done: true,
    message: {
      kind: 'trial',
      name: 'Brian Lee',
      email: email('Brian Lee'),
      phone: phone(74),
      topic: '',
      message: '',
      athlete: { firstName: 'Noah', lastName: 'Lee', grade: '5', experience: 'none' },
      days: ['Saturday'],
    },
  },
]

/**
 * Trial requests and questions as the website sends them (`websiteMessages`), for the sample academy: three new (the
 * Home's Messages and its badge) and two already answered. Their families are made up, and none is a sample student.
 */
export function buildSampleMessages(opts: { academyId: string; now: Date; manager: string }): SampleDoc[] {
  return DRAFTS.map((d) => {
    const at = new Date(opts.now.getTime() - d.hoursAgo * 3_600_000)
    const data: WebsiteMessage = {
      ...d.message,
      status: d.done ? 'done' : 'new',
      createdAt: at as unknown as WebsiteMessage['createdAt'],
      doneAt: d.done ? (new Date(at.getTime() + 5 * 3_600_000) as unknown as WebsiteMessage['createdAt']) : null,
      doneBy: d.done ? opts.manager : null,
    }
    return { path: `branches/${opts.academyId}/${COL.websiteMessages}/${SAMPLE_PREFIX}msg-${d.key}`, data: data as unknown as Record<string, unknown> }
  })
}
