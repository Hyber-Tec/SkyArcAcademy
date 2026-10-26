import { randomBytes } from 'node:crypto'
import { availabilityRecord } from '../../shared/src/availabilityWrites'
import { COL, DOC, availabilityDocId } from '../../shared/src/paths'
import { pickStaffColor } from '../../shared/src/colors'
import { seatKind, uncovered } from '../../shared/src/schedule/classes'
import type { SessionStatus } from '../../shared/src/settings/defaults'
import { type DateKey, type Weekday, dayEndInstant, formatDateKey, formatTimeRange, toInstant, weekdayOf } from '../../shared/src/time'
import type { AvailabilityRange } from '../../shared/src/types'

/**
 * The academy's real data, moved in once (docs/TODO.md, "Moving the real data in"). The import file is built locally
 * from the academy's schedule sheets and the manager's spreadsheet (it holds names and contacts, so it lives in the
 * git-ignored docs/internal/); this turns it into the app's documents: the people (`peopleDocs`), and the classes with
 * each student's seat and who's in each day (`classesDocs`). Nobody gets access: no member records, so no sign-in email
 * goes out. The office gives access from the website when it's ready.
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

export interface ClassesOptions {
  academyId: string
  now: Date
  /** The academy's time zone: the sheets' times are its wall clock. */
  timezone: string
  /** Seats a class has: the academy's `businessRules.seatsPerClass`. */
  seatsPerClass: number
  ids: IdMap
}

export interface ClassesResult {
  docs: ImportDoc[]
  problems: string[]
  summary: {
    /** Days with classes, the first and the last. */
    days: number
    from: DateKey | null
    to: DateKey | null
    classes: number
    seats: number
    /** Seats by what the sheets made them. */
    kinds: Record<ImportSeat['kind'], number>
    canceled: number
    /** Who's in: one record per person and day. */
    whosIn: number
  }
}

/**
 * The classes as the app stores them (docs/DECISIONS.md §20): a class document for each class on the sheets, a
 * session for each student's seat in it (its label, in the sheets' words, as its note, with the seat's own note after
 * it; no coach of its own: the coaches in teach it together), and who's in each day from the staff's hours, which are
 * the coaches' availability.
 */
export function classesDocs(input: ImportFile, opts: ClassesOptions): ClassesResult {
  const base = `branches/${opts.academyId}`
  const tz = opts.timezone
  const stamp = { createdAt: opts.now, createdBy: IMPORT_AUTHOR, updatedAt: opts.now, updatedBy: IMPORT_AUTHOR }
  const docs: ImportDoc[] = []
  const problems: string[] = []
  const add = (path: string, data: Record<string, unknown>) => docs.push({ path: `${base}/${path}`, data })
  const students = new Map(input.students.map((s) => [s.key, s]))
  const staff = new Map(input.staff.map((s) => [s.key, s]))
  const when = (dateKey: DateKey, startMin: number, endMin: number) => `${formatDateKey(dateKey, 'weekdayMedium')}, ${formatTimeRange(startMin, endMin)}`
  // One ID per class and per seat, kept between runs; a second class at the same time, or a student's second seat in
  // one class, gets its own.
  const used = new Set<string>()
  const unique = (key: string) => {
    let k = key
    for (let n = 2; used.has(k); n++) k = `${key}#${n}`
    used.add(k)
    return k
  }

  // Who's in: each person's hours that day (several stretches make one record).
  const hours = new Map<string, { st: ImportStaff; dateKey: DateKey; ranges: AvailabilityRange[] }>()
  for (const d of input.duty) {
    const st = staff.get(d.staff)
    if (!st) {
      problems.push(`${formatDateKey(d.dateKey, 'weekdayMedium')}: hours for "${d.staff}", who isn't among the import's staff; left out.`)
      continue
    }
    if (!(d.startMin < d.endMin)) {
      problems.push(`${st.firstName} ${st.lastName}, ${formatDateKey(d.dateKey, 'weekdayMedium')}: hours that end before they start; left out.`)
      continue
    }
    const key = `${st.key}|${d.dateKey}`
    const day = hours.get(key) ?? { st, dateKey: d.dateKey, ranges: [] }
    day.ranges.push({ startMin: d.startMin, endMin: d.endMin })
    hours.set(key, day)
  }
  let whosIn = 0
  for (const { st, dateKey, ranges } of hours.values()) {
    const staffId = idFor(opts.ids, `staff:${st.key}`)
    const record = availabilityRecord(staffId, { dateKey, ranges }, tz, 'admin', `${st.firstName} ${st.lastName}`, st.role)
    if (!record) continue
    add(`${COL.availability}/${availabilityDocId(staffId, dateKey)}`, { ...record, ...stamp })
    whosIn++
  }
  const coachHours = (dateKey: DateKey) => [...hours.values()].filter((h) => h.dateKey === dateKey && h.st.role === 'coach').flatMap((h) => h.ranges)

  const kinds: Record<ImportSeat['kind'], number> = { regular: 0, makeup: 0, practice: 0, trial: 0, evaluation: 0 }
  let classes = 0
  let seats = 0
  let canceled = 0
  const days = [...input.days].filter((d) => d.classes.length).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  for (const day of days) {
    const { dateKey } = day
    const weekday = weekdayOf(dateKey)
    const dayEndAt = dayEndInstant(dateKey, tz)
    const times = (startMin: number, endMin: number) => ({ startMin, endMin, startAt: toInstant(dateKey, startMin, tz), endAt: toInstant(dateKey, endMin, tz), dayEndAt })
    const taken: { student: string; startMin: number; endMin: number }[] = []
    for (const c of [...day.classes].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)) {
      const at = when(dateKey, c.startMin, c.endMin)
      const classKey = unique(`class:${dateKey}:${c.startMin}-${c.endMin}`)
      if (classKey.includes('#')) problems.push(`${at}: two classes at the same time; both kept.`)
      const classId = idFor(opts.ids, classKey)
      add(`${COL.classes}/${classId}`, {
        dateKey,
        weekday,
        ...times(c.startMin, c.endMin),
        seats: opts.seatsPerClass,
        note: '',
        source: 'import',
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        ...stamp,
      })
      classes++
      const gaps = uncovered(c, coachHours(dateKey))
      if (gaps.length) {
        const whole = gaps[0].startMin === c.startMin && gaps[0].endMin === c.endMin
        problems.push(`${at}: no coach in${whole ? '' : ` ${gaps.map((g) => formatTimeRange(g.startMin, g.endMin)).join(' and ')}`}.`)
      }
      let inSeats = 0
      c.seats.forEach((seat, position) => {
        const s = students.get(seat.student)
        if (!s) {
          problems.push(`${at}: a seat for "${seat.student}", who isn't among the import's students; left out.`)
          return
        }
        const name = `${s.firstName} ${s.lastName}`
        let startMin = seat.startMin ?? c.startMin
        let endMin = seat.endMin ?? c.endMin
        if (!(startMin < endMin)) {
          problems.push(`${name}, ${at}: a seat that ends before it starts; given the class's time.`)
          startMin = c.startMin
          endMin = c.endMin
        }
        // The label in the sheets' words, and the seat's own note after it ("Absent: make-up planned for 11/2").
        const note = [seat.label.trim(), seat.note?.trim() ?? ''].filter(Boolean).join(' · ')
        if (seatKind(note) !== seat.kind) problems.push(`${name}, ${at}: "${note}" reads as ${seatKind(note)}, not ${seat.kind}.`)
        if (seat.status !== 'canceled') {
          const clash = taken.find((x) => x.student === s.key && x.startMin < endMin && startMin < x.endMin)
          if (clash) problems.push(`${name}: two seats at once on ${formatDateKey(dateKey, 'weekdayMedium')} (${formatTimeRange(clash.startMin, clash.endMin)} and ${formatTimeRange(startMin, endMin)}); both kept.`)
          taken.push({ student: s.key, startMin, endMin })
          inSeats++
        }
        const seatId = idFor(opts.ids, unique(`seat:${dateKey}:${c.startMin}-${c.endMin}:${s.key}`))
        add(`${COL.sessions}/${seatId}`, {
          classId,
          coachId: '',
          coachName: '',
          studentId: idFor(opts.ids, `student:${s.key}`),
          studentName: name,
          studentGrade: s.grade ?? '',
          note,
          status: seat.status,
          dateKey,
          weekday,
          ...times(startMin, endMin),
          visualOrder: position,
          confirmedAt: null,
          confirmedBy: null,
          source: 'import',
          isDeleted: false,
          deletedAt: null,
          deletedBy: null,
          ...stamp,
        })
        seats++
        kinds[seat.kind]++
        if (seat.status === 'canceled') canceled++
      })
      if (inSeats > opts.seatsPerClass) problems.push(`${at}: ${inSeats} students for ${opts.seatsPerClass} seat${opts.seatsPerClass === 1 ? '' : 's'}.`)
    }
  }

  return {
    docs,
    problems,
    summary: { days: days.length, from: days[0]?.dateKey ?? null, to: days.at(-1)?.dateKey ?? null, classes, seats, kinds, canceled, whosIn },
  }
}
