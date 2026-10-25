import { randomBytes } from 'node:crypto'
import { COL, DOC } from '../../shared/src/paths'
import { pickStaffColor } from '../../shared/src/colors'
import type { SessionStatus } from '../../shared/src/settings/defaults'
import type { DateKey, Weekday } from '../../shared/src/time'

/**
 * The academy's real data, moved in once (docs/TODO.md, "Moving the real data in"). The import file is built locally
 * from the academy's schedule sheets and the manager's spreadsheet (it holds names and contacts, so it lives in the
 * git-ignored docs/internal/); this turns it into the app's documents. Nobody gets access: no member records, so no
 * sign-in email goes out. The office gives access from the website when it's ready.
 */

export interface ImportFile {
  version: 1
  /** The last day the weekly sheets cover; later days come from each month's standing week. */
  historyThrough: DateKey
  standingThrough: DateKey
  staff: ImportStaff[]
  students: ImportStudent[]
  days: { dateKey: DateKey; classes: { startMin: number; endMin: number; seats: ImportSeat[] }[] }[]
  duty: { staff: string; dateKey: DateKey; startMin: number; endMin: number }[]
}

export interface ImportStaff {
  key: string
  firstName: string
  lastName: string
  legalName: string
  email: string
  phone: string
  role: 'admin' | 'coach'
  /** Dollars per hour, for all their time at the academy (the Hourly pay model). */
  rate: number
  title: string
  usualDays: Weekday[]
  sundays?: 'rotation'
}

export interface ImportStudent {
  key: string
  firstName: string
  lastName: string
  /** A second name the academy writes in brackets ("Olivia (Jiwoo) Park"). */
  otherName: string | null
  grade: string | null
  /** The grade is on the spreadsheet's grades tab (reviewed), not only beside the contact. */
  gradeChecked: boolean
  level: string | null
  program: string | null
  /** The rifle code the sheets write beside the level ("C9", "P", "JG"). */
  rifle: string | null
  parents: { email: string; phone: string; relation: string }[]
  notes: string[]
  /** False for students on the sheets whose parents aren't on the spreadsheet yet. */
  contacts: boolean
}

export interface ImportSeat {
  student: string
  kind: 'regular' | 'makeup' | 'practice' | 'trial' | 'evaluation'
  /** The sheets' own words: "MU for 10/13", "Practice", "Trial 1". */
  label: string
  status: SessionStatus
  startMin?: number
  endMin?: number
  note?: string
}

/** `createdBy` / `updatedBy` on every imported document, so they can be found again. */
export const IMPORT_AUTHOR = 'academy-import'

/** Firestore-style IDs (20 letters and digits) that say nothing about the person, kept between runs. */
export type IdMap = Record<string, string>

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export function newId(): string {
  const bytes = randomBytes(20)
  return Array.from(bytes, (b) => ID_CHARS[b % ID_CHARS.length]).join('')
}

export function idFor(ids: IdMap, key: string): string {
  ids[key] ??= newId()
  return ids[key]
}

export interface ImportDoc {
  path: string
  data: Record<string, unknown>
}

export interface PeopleOptions {
  academyId: string
  now: Date
  today: DateKey
  /** The academy's `settings.students.levels` and `.programs`: anything else is left empty and reported. */
  levels: readonly string[]
  programs: readonly string[]
  ids: IdMap
}

export interface PeopleResult {
  docs: ImportDoc[]
  problems: string[]
  summary: { staff: number; students: number; parents: number; withoutParents: string[] }
}

const DAY_SHORT: Record<Weekday, string> = { monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun' }

/** The staff (with their pay rate and usual days) and the students (with their parents), as the app stores them. */
export function peopleDocs(input: ImportFile, opts: PeopleOptions): PeopleResult {
  const base = `branches/${opts.academyId}`
  const stamp = { createdAt: opts.now, createdBy: IMPORT_AUTHOR, updatedAt: opts.now, updatedBy: IMPORT_AUTHOR }
  const docs: ImportDoc[] = []
  const problems: string[] = []
  const add = (path: string, data: Record<string, unknown>) => docs.push({ path: `${base}/${path}`, data })

  input.staff.forEach((st, i) => {
    const id = idFor(opts.ids, `staff:${st.key}`)
    const name = `${st.firstName} ${st.lastName}`
    add(`${COL.staff}/${id}`, {
      firstName: st.firstName,
      lastName: st.lastName,
      name,
      nameLower: name.toLowerCase(),
      email: st.email.toLowerCase(),
      phone: st.phone,
      role: st.role,
      status: 'active',
      color: pickStaffColor(i),
      startDate: null,
      endDate: null,
      dob: null,
      address: '',
      hasKioskPin: false,
      notificationPrefs: { announcements: true, sessionCreated: true, sessionChanged: true, sessionCanceled: true },
      ...stamp,
    })
    // Coaches are paid their teaching rate under Hourly; the admin rate is the same, for time the office marks as admin.
    const rates = { teaching: st.rate, admin: st.rate }
    add(`${COL.staff}/${id}/private/${DOC.compensation}`, {
      rates,
      history: [{ effectiveFrom: opts.today, rates, setAt: opts.now.toISOString(), setBy: IMPORT_AUTHOR }],
      updatedAt: opts.now,
      updatedBy: IMPORT_AUTHOR,
    })
    const days = st.usualDays.map((d) => DAY_SHORT[d]).join(', ')
    const lines = [
      st.legalName && st.legalName !== name ? `Legal name: ${st.legalName}.` : '',
      `${st.title}.`,
      `Usual days: ${days}${st.sundays === 'rotation' ? '; Sundays in turn' : ''}.`,
    ]
    add(`${COL.staff}/${id}/private/${DOC.staffNotes}`, { adminNote: lines.filter(Boolean).join(' '), updatedAt: opts.now, updatedBy: IMPORT_AUTHOR })
  })

  let parents = 0
  const withoutParents: string[] = []
  for (const s of input.students) {
    const id = idFor(opts.ids, `student:${s.key}`)
    const name = `${s.firstName} ${s.lastName}`
    const level = s.level && opts.levels.includes(s.level) ? s.level : null
    const program = s.program && opts.programs.includes(s.program) ? s.program : null
    if (s.level && !level) problems.push(`${name}: level "${s.level}" isn't one of the academy's levels; left empty.`)
    if (s.program && !program) problems.push(`${name}: program "${s.program}" isn't one of the academy's programs; left empty.`)
    if (!s.parents.length) withoutParents.push(name)
    parents += s.parents.length
    add(`${COL.students}/${id}`, {
      firstName: s.firstName,
      lastName: s.lastName,
      name,
      nameLower: name.toLowerCase(),
      grade: s.grade ?? '',
      school: '',
      level,
      program,
      rifle: s.rifle,
      status: 'enrolled',
      statusSource: 'auto',
      signUpDate: null,
      firstSessionDate: null,
      lastSessionDate: null,
      nextSessionDate: null,
      // Already known to the office: not "new students to follow up" on Home.
      followUpReviewedAt: opts.now,
      ...stamp,
    })
    const note = [
      s.otherName ? `Also called ${s.otherName}.` : '',
      s.grade && !s.gradeChecked ? 'Grade from the contacts list, not yet reviewed.' : '',
      ...s.notes.map((n) => (/[.!?]$/.test(n) ? n : `${n}.`)),
    ]
    add(`${COL.students}/${id}/private/${DOC.privateProfile}`, {
      email: '',
      phone: '',
      dob: null,
      address: '',
      parents: s.parents.map((p) => ({ name: '', email: p.email.toLowerCase(), phone: p.phone, relation: p.relation })),
      adminNote: note.filter(Boolean).join(' '),
      customFields: {},
    })
  }

  return { docs, problems, summary: { staff: input.staff.length, students: input.students.length, parents, withoutParents } }
}
