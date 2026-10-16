import { dayStartInstant } from '../availability'
import { newMemberData } from '../branchFactory'
import { STAFF_COLORS } from '../colors'
import { COL, DOC, availabilityDocId } from '../paths'
import type { SessionStatus, WeekHours } from '../settings/defaults'
import { type DateKey, type Weekday, addDays, dayEndInstant, diffDays, makeDateKey, minutesOf, parseDateKey, toInstant, weekdayOf } from '../time'
import type { StudentStatus } from '../types'
import { chance } from './random'

/**
 * Sample data, for trying the app before the academy's real data arrives: fictional coaches, a manager, students and
 * their families, classes in the academy's real weekly blocks with makeups and trials, availability, time entries,
 * announcements and events, around today. Everything is made up: the names match nobody at the academy, emails use the
 * reserved `.test` domain (no email is ever sent to them), and every document ID starts with `sample-`, so
 * `npm run seed:sample -- --remove` deletes all of it, along with anything the app later made for these people.
 */

export const SAMPLE_PREFIX = 'sample-'
export const SAMPLE_EMAIL_DOMAIN = 'skyarc-sample.test'
/** `createdBy`/`updatedBy` on every sample document. */
export const SAMPLE_AUTHOR = 'sample-data'

export interface SampleDoc {
  /** Full document path, e.g. `branches/skyarc/staff/sample-daniel-reed`. */
  path: string
  data: Record<string, unknown>
}

export interface SampleOptions {
  academyId: string
  timezone: string
  /** Today in the academy's zone. */
  today: DateKey
  now: Date
  /** The academy's opening hours: classes only land in blocks inside them. */
  week: WeekHours
  /** `settings.students.levels` and `.programs`. */
  levels: readonly string[]
  programs: readonly string[]
  /** The academy's students-per-coach rule; a block never seats more (and never more than 5, as on the sheets). */
  maxStudentsPerCoach: number
  /** Classes from this many days back to this many ahead (default 28 and 42). */
  daysBack?: number
  daysAhead?: number
}

export interface SampleSummary {
  staff: number
  students: number
  parents: number
  classes: number
  makeups: number
  trials: number
  shifts: number
}

// ----------------------------------------------------------------- the week

interface Block {
  startMin: number
  endMin: number
  /** Precision blocks are 90 minutes and seat the top levels. */
  precision?: boolean
}

/** The class blocks on the academy's weekly sheets (docs/HYBERCRM_REVIEW.md §6). */
const BLOCKS: Partial<Record<Weekday, Block[]>> = {
  sunday: [{ startMin: 840, endMin: 900 }, { startMin: 900, endMin: 990, precision: true }, { startMin: 990, endMin: 1050 }],
  monday: [{ startMin: 990, endMin: 1080, precision: true }, { startMin: 1080, endMin: 1140 }, { startMin: 1140, endMin: 1200 }],
  tuesday: [{ startMin: 1020, endMin: 1080 }, { startMin: 1080, endMin: 1140 }, { startMin: 1140, endMin: 1200 }],
  wednesday: [{ startMin: 1020, endMin: 1080 }, { startMin: 1080, endMin: 1140 }, { startMin: 1140, endMin: 1200 }],
  thursday: [{ startMin: 1020, endMin: 1080 }, { startMin: 1080, endMin: 1140 }, { startMin: 1140, endMin: 1230, precision: true }],
}

/** Levels from this index up (Expert, Precision on the default ladder) take the Precision blocks. */
const PRECISION_FROM = 7

// ----------------------------------------------------------------- people

interface SampleStaff {
  key: string
  first: string
  last: string
  role: 'admin' | 'coach'
  rate: number
  since: DateKey
  /** Weekdays with availability (Sundays also follow the rotation). */
  days: Weekday[]
}

const MANAGER: SampleStaff = { key: 'paige-sutton', first: 'Paige', last: 'Sutton', role: 'admin', rate: 24, since: '2024-06-03', days: [] }
const COACHES: SampleStaff[] = [
  { key: 'daniel-reed', first: 'Daniel', last: 'Reed', role: 'coach', rate: 28, since: '2024-09-03', days: ['monday', 'wednesday', 'thursday'] },
  { key: 'hannah-moreno', first: 'Hannah', last: 'Moreno', role: 'coach', rate: 25, since: '2025-01-13', days: ['tuesday', 'thursday'] },
  { key: 'joel-kwon', first: 'Joel', last: 'Kwon', role: 'coach', rate: 22, since: '2025-08-24', days: ['sunday', 'wednesday'] },
  { key: 'elena-webb', first: 'Elena', last: 'Webb', role: 'coach', rate: 22, since: '2026-02-01', days: ['sunday'] },
]
const STAFF = [MANAGER, ...COACHES]

interface SampleStudent {
  key: string
  first: string
  last: string
  grade: string
  /** Index on the levels ladder; null: not assessed yet. */
  level: number | null
  status: StudentStatus
  perWeek: 0 | 1 | 2
  /** Sign-up date; regular classes start a week later. A number counts days from today. */
  since: DateKey | number
  /** Siblings share parents and come to the same classes. */
  family?: string
  /** Signed up for a trial: two 30-minute visits ahead. */
  trial?: boolean
  note?: string
}

const STUDENTS: SampleStudent[] = [
  { key: 'jiwoo-hwang', first: 'Jiwoo', last: 'Hwang', grade: '8', level: 4, status: 'enrolled', perWeek: 2, since: '2025-03-02', family: 'hwang' },
  { key: 'minjun-hwang', first: 'Minjun', last: 'Hwang', grade: '6', level: 2, status: 'enrolled', perWeek: 2, since: '2025-09-07', family: 'hwang' },
  { key: 'seoyeon-lim', first: 'Seoyeon', last: 'Lim', grade: '10', level: 8, status: 'enrolled', perWeek: 2, since: '2024-09-08', note: 'Junior team. Plans to try out for the state match.' },
  { key: 'isaac-brooks', first: 'Isaac', last: 'Brooks', grade: '9', level: 7, status: 'enrolled', perWeek: 2, since: '2024-11-03' },
  { key: 'yuna-chung', first: 'Yuna', last: 'Chung', grade: '7', level: 1, status: 'enrolled', perWeek: 1, since: '2026-06-07' },
  { key: 'leo-carter', first: 'Leo', last: 'Carter', grade: '6', level: 0, status: 'enrolled', perWeek: 1, since: -24 },
  { key: 'haneul-moon', first: 'Haneul', last: 'Moon', grade: '11', level: 6, status: 'enrolled', perWeek: 2, since: '2025-01-05' },
  { key: 'grace-ellis', first: 'Grace', last: 'Ellis', grade: '8', level: 3, status: 'enrolled', perWeek: 2, since: '2025-08-17' },
  { key: 'doyun-rhee', first: 'Doyun', last: 'Rhee', grade: '9', level: 5, status: 'enrolled', perWeek: 2, since: '2025-04-13' },
  { key: 'sophie-novak', first: 'Sophie', last: 'Novak', grade: '7', level: 2, status: 'enrolled', perWeek: 2, since: '2025-10-05' },
  { key: 'owen-fischer', first: 'Owen', last: 'Fischer', grade: '10', level: 4, status: 'enrolled', perWeek: 2, since: '2025-02-09' },
  { key: 'seojin-song', first: 'Seojin', last: 'Song', grade: '12', level: 8, status: 'enrolled', perWeek: 2, since: '2024-08-25' },
  { key: 'lucas-ortiz', first: 'Lucas', last: 'Ortiz', grade: '6', level: 1, status: 'enrolled', perWeek: 1, since: '2026-08-16' },
  { key: 'harin-ryu', first: 'Harin', last: 'Ryu', grade: '8', level: 3, status: 'enrolled', perWeek: 2, since: '2025-06-01' },
  { key: 'nora-bennett', first: 'Nora', last: 'Bennett', grade: '9', level: 5, status: 'enrolled', perWeek: 2, since: '2025-03-16' },
  { key: 'jiho-paek', first: 'Jiho', last: 'Paek', grade: '7', level: 2, status: 'enrolled', perWeek: 2, since: '2025-11-02' },
  { key: 'elijah-hayes', first: 'Elijah', last: 'Hayes', grade: '11', level: 7, status: 'enrolled', perWeek: 2, since: '2024-10-06' },
  { key: 'isla-quinn', first: 'Isla', last: 'Quinn', grade: '6', level: 0, status: 'enrolled', perWeek: 1, since: -17 },
  { key: 'eunwoo-seo', first: 'Eunwoo', last: 'Seo', grade: '10', level: 6, status: 'enrolled', perWeek: 2, since: '2025-01-19' },
  { key: 'mia-collins', first: 'Mia', last: 'Collins', grade: '8', level: 4, status: 'enrolled', perWeek: 2, since: '2025-05-04' },
  { key: 'sua-jang', first: 'Sua', last: 'Jang', grade: '7', level: 1, status: 'enrolled', perWeek: 2, since: '2026-01-11', family: 'jang' },
  { key: 'samuel-jang', first: 'Samuel', last: 'Jang', grade: '9', level: 3, status: 'enrolled', perWeek: 2, since: '2025-07-13', family: 'jang' },
  { key: 'chaewon-byun', first: 'Chaewon', last: 'Byun', grade: '11', level: 6, status: 'enrolled', perWeek: 2, since: '2025-02-23' },
  { key: 'henry-lane', first: 'Henry', last: 'Lane', grade: '5', level: 0, status: 'enrolled', perWeek: 1, since: '2026-09-06' },
  { key: 'zoe-pierce', first: 'Zoe', last: 'Pierce', grade: '8', level: 2, status: 'enrolled', perWeek: 1, since: '2026-03-01' },
  { key: 'yejun-noh', first: 'Yejun', last: 'Noh', grade: '9', level: 5, status: 'enrolled', perWeek: 2, since: '2025-04-27' },
  { key: 'ava-monroe', first: 'Ava', last: 'Monroe', grade: '7', level: 1, status: 'enrolled', perWeek: 2, since: '2026-02-08' },
  { key: 'arin-tak', first: 'Arin', last: 'Tak', grade: '10', level: 4, status: 'enrolled', perWeek: 2, since: '2025-05-18', family: 'tak' },
  { key: 'theo-tak', first: 'Theo', last: 'Tak', grade: '8', level: 3, status: 'enrolled', perWeek: 1, since: '2025-09-14', family: 'tak' },
  { key: 'wesley-hart', first: 'Wesley', last: 'Hart', grade: 'Adult', level: 7, status: 'enrolled', perWeek: 1, since: '2025-10-19', note: 'Adult shooter; Sunday Precision only.' },
  { key: 'juno-gil', first: 'Juno', last: 'Gil', grade: '6', level: null, status: 'signed_up', perWeek: 0, since: -2, trial: true },
  { key: 'hailey-underwood', first: 'Hailey', last: 'Underwood', grade: '7', level: null, status: 'signed_up', perWeek: 0, since: -4, trial: true },
  { key: 'kai-whitaker', first: 'Kai', last: 'Whitaker', grade: '9', level: null, status: 'signed_up', perWeek: 0, since: -1, trial: true },
  { key: 'bella-vance', first: 'Bella', last: 'Vance', grade: '8', level: 2, status: 'paused', perWeek: 2, since: '2025-09-21', note: 'Paused for the fall soccer season.' },
  { key: 'jasper-dalton', first: 'Jasper', last: 'Dalton', grade: 'College', level: 5, status: 'finished', perWeek: 0, since: '2023-09-10', note: 'Graduated in May.' },
]

/** Parents, by family (siblings share them); `login` families can sign in to the parent portal. */
const MOTHERS = ['Jiyeon', 'Sunhee', 'Eunji', 'Laura', 'Karen', 'Rachel', 'Megan', 'Julie']
const FATHERS = ['Hyunwoo', 'Sungmin', 'Minho', 'Michael', 'Brian', 'Steven', 'Mark']
const PARENT_LOGINS = new Set(['hwang', 'jang', 'tak', 'seoyeon-lim', 'isaac-brooks', 'grace-ellis', 'sophie-novak'])
const SCHOOLS = ['North Ridge Middle School', 'Lakeview High School', 'Maple Creek Middle School', 'Summit Oaks High School', 'Brookside Elementary School']

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const sampleEmail = (first: string, last: string) => `${slug(first)}.${slug(last)}@${SAMPLE_EMAIL_DOMAIN}`
export const sampleStaffId = (key: string) => `${SAMPLE_PREFIX}${key}`
/** The sample manager (an admin), who files the sample results and prepares the sample reports. */
export const SAMPLE_MANAGER = { name: `${MANAGER.first} ${MANAGER.last}`, email: sampleEmail(MANAGER.first, MANAGER.last) }
export const sampleStudentId = (key: string) => `${SAMPLE_PREFIX}${key}`
/** Phone numbers in 555-0100…0199, which exist nowhere. */
const phone = (n: number) => `(678) 555-01${String(n % 100).padStart(2, '0')}`

/** Who teaches a block: rows by coach, with Sundays rotating between two coaches week by week. */
function coachFor(dateKey: DateKey, weekday: Weekday, block: Block): SampleStaff {
  const byKey = (key: string) => COACHES.find((c) => c.key === key)!
  switch (weekday) {
    case 'monday':
    case 'wednesday':
      return byKey('daniel-reed')
    case 'tuesday':
      return byKey('hannah-moreno')
    case 'thursday':
      return byKey(block.precision ? 'daniel-reed' : 'hannah-moreno')
    default:
      return byKey(sundayCoachKey(dateKey))
  }
}

function sundayCoachKey(dateKey: DateKey): string {
  const weeks = Math.floor(diffDays('2026-01-04', dateKey) / 7)
  return ((weeks % 2) + 2) % 2 === 0 ? 'joel-kwon' : 'elena-webb'
}

function worksOn(st: SampleStaff, dateKey: DateKey): boolean {
  const wd = weekdayOf(dateKey)
  if (!st.days.includes(wd)) return false
  return wd !== 'sunday' || sundayCoachKey(dateKey) === st.key
}

/** The fourth Thursday of November: the academy is closed on Thanksgiving. */
function thanksgiving(year: number): DateKey {
  const first = makeDateKey(year, 11, 1)
  const offset = (4 - new Date(`${first}T12:00:00Z`).getUTCDay() + 7) % 7
  return addDays(first, offset + 21)
}

// --------------------------------------------------------------- the data

export function buildSampleData(opts: SampleOptions): { docs: SampleDoc[]; summary: SampleSummary } {
  const { academyId, timezone, today, now } = opts
  const base = `branches/${academyId}`
  const stamp = { createdAt: now, createdBy: SAMPLE_AUTHOR, updatedAt: now, updatedBy: SAMPLE_AUTHOR }
  const docs: SampleDoc[] = []
  const add = (path: string, data: Record<string, unknown>) => docs.push({ path: `${base}/${path}`, data })
  const seats = Math.max(1, Math.min(5, opts.maxStudentsPerCoach))
  const from = addDays(today, -(opts.daysBack ?? 28))
  const to = addDays(today, opts.daysAhead ?? 42)
  const nowMin = minutesOf(now, timezone)
  const days: DateKey[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  const closedDays = new Set(days.filter((d) => d === thanksgiving(parseDateKey(d).year)))
  const levelName = (i: number | null) => (i === null ? null : (opts.levels[i] ?? null))
  const programName = (i: number | null) => (i === null ? null : (opts.programs[i <= 1 ? 0 : i <= 3 ? 1 : i <= 6 ? 2 : 3] ?? null))
  const sinceOf = (s: SampleStudent) => (typeof s.since === 'number' ? addDays(today, s.since) : s.since)

  // The blocks that fit the academy's opening hours, by weekday.
  const blocksOn = (wd: Weekday): Block[] => {
    const hours = opts.week[wd]
    if (!hours?.isOpen) return []
    return (BLOCKS[wd] ?? []).filter((b) => b.startMin >= hours.openMin && b.endMin <= hours.closeMin)
  }
  const isOpen = (d: DateKey) => !closedDays.has(d) && blocksOn(weekdayOf(d)).length > 0

  // Staff -----------------------------------------------------------------
  STAFF.forEach((st, i) => {
    const id = sampleStaffId(st.key)
    const name = `${st.first} ${st.last}`
    const email = sampleEmail(st.first, st.last)
    add(`${COL.staff}/${id}`, {
      firstName: st.first,
      lastName: st.last,
      name,
      nameLower: name.toLowerCase(),
      email,
      phone: phone(10 + i),
      role: st.role,
      status: 'active',
      color: STAFF_COLORS[i % STAFF_COLORS.length],
      startDate: st.since,
      endDate: null,
      dob: null,
      address: '',
      hasKioskPin: false,
      notificationPrefs: { announcements: true, sessionCreated: true, sessionChanged: true, sessionCanceled: true },
      ...stamp,
    })
    const rates = { teaching: st.rate, admin: st.rate }
    add(`${COL.staff}/${id}/private/${DOC.compensation}`, {
      rates,
      history: [{ effectiveFrom: st.since, rates, setAt: now.toISOString(), setBy: SAMPLE_AUTHOR }],
      updatedAt: now,
      updatedBy: SAMPLE_AUTHOR,
    })
    add(`${COL.members}/${email}`, {
      ...newMemberData({ email, displayName: name, role: st.role, staffId: id, createdBy: SAMPLE_AUTHOR }),
      createdAt: now,
      updatedAt: now,
    })
  })

  // Availability: each coach's working days, all opening hours ---------------
  const hannahOff = days.find((d) => d >= addDays(today, 8) && weekdayOf(d) === 'tuesday' && isOpen(d)) ?? null
  for (const coach of COACHES) {
    const staffId = sampleStaffId(coach.key)
    for (const d of days) {
      if (!isOpen(d) || !worksOn(coach, d)) continue
      const hours = opts.week[weekdayOf(d)]
      // Hannah is out sick one Tuesday ahead: her classes that day show as conflicts to move.
      const off = coach.key === 'hannah-moreno' && d === hannahOff
      add(`${COL.availability}/${availabilityDocId(staffId, d)}`, {
        staffId,
        dateKey: d,
        weekday: weekdayOf(d),
        ranges: off ? [] : [{ startMin: hours.openMin, endMin: hours.closeMin }],
        unavailable: off,
        hidden: false,
        dayStartAt: dayStartInstant(d, timezone),
        updatedVia: 'admin',
        ...stamp,
      })
    }
  }

  // Weekly seats: each enrolled student keeps the same blocks every week -----
  const slots = (Object.keys(BLOCKS) as Weekday[]).flatMap((wd) => blocksOn(wd).map((block, index) => ({ wd, index, block, key: `${wd}:${index}` })))
  const fill = new Map<string, number>()
  const weekly = new Map<string, string[]>()
  const familySlots = new Map<string, string[]>()
  for (const s of STUDENTS) {
    if (s.perWeek === 0) continue
    const top = (s.level ?? 0) >= PRECISION_FROM
    const allowed = slots.filter((x) => !!x.block.precision === top)
    const chosen: string[] = []
    // Siblings take the same blocks when there's room.
    for (const key of (s.family && familySlots.get(s.family)) || []) {
      if (chosen.length < s.perWeek && allowed.some((x) => x.key === key) && (fill.get(key) ?? 0) < seats) chosen.push(key)
    }
    while (chosen.length < s.perWeek) {
      const usedDays = new Set(chosen.map((k) => k.split(':')[0]))
      const options = allowed
        .filter((x) => !usedDays.has(x.wd) && (fill.get(x.key) ?? 0) < seats)
        .sort((a, b) => (fill.get(a.key) ?? 0) - (fill.get(b.key) ?? 0) || chance(s.key, a.key) - chance(s.key, b.key))
      if (!options.length) break
      chosen.push(options[0].key)
    }
    for (const key of chosen) fill.set(key, (fill.get(key) ?? 0) + 1)
    weekly.set(s.key, chosen)
    if (s.family && !familySlots.has(s.family)) familySlots.set(s.family, chosen)
  }

  // Classes -----------------------------------------------------------------
  interface Made {
    studentKey: string
    dateKey: DateKey
    status: SessionStatus
    kind: 'class' | 'makeup' | 'trial'
  }
  const made: Made[] = []
  const taken = new Map<string, number>() // `${dateKey}|${slotKey}` → seats taken
  const busy = new Set<string>() // `${studentKey}|${dateKey}`
  const ended = (d: DateKey, endMin: number) => d < today || (d === today && endMin <= nowMin)
  const statusFor = (id: string, d: DateKey, endMin: number, kind: Made['kind']): SessionStatus => {
    const r = chance(id, 'status')
    if (ended(d, endMin)) return kind === 'class' ? (r < 0.86 ? 'present' : r < 0.91 ? 'no_show' : 'canceled') : 'present'
    if (kind === 'class' && r < 0.04) return 'canceled'
    return diffDays(today, d) <= 1 ? 'confirmed' : 'pending'
  }
  const md = (d: DateKey) => `${parseDateKey(d).month}/${parseDateKey(d).day}`

  const addClass = (s: SampleStudent, d: DateKey, slotKey: string, kind: Made['kind'], note: string, span?: { startMin: number; endMin: number }) => {
    const slot = slots.find((x) => x.key === slotKey)!
    const coach = coachFor(d, slot.wd, slot.block)
    const startMin = span?.startMin ?? slot.block.startMin
    const endMin = span?.endMin ?? slot.block.endMin
    const id = `${SAMPLE_PREFIX}c-${d}-${s.key}`
    const status = statusFor(id, d, endMin, kind)
    add(`${COL.sessions}/${id}`, {
      coachId: sampleStaffId(coach.key),
      coachName: `${coach.first} ${coach.last}`,
      studentId: sampleStudentId(s.key),
      studentName: `${s.first} ${s.last}`,
      studentGrade: s.grade,
      note,
      status,
      dateKey: d,
      weekday: weekdayOf(d),
      startMin,
      endMin,
      startAt: toInstant(d, startMin, timezone),
      endAt: toInstant(d, endMin, timezone),
      dayEndAt: dayEndInstant(d, timezone),
      visualOrder: 0,
      confirmedAt: null,
      confirmedBy: null,
      source: 'seed',
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      ...stamp,
    })
    taken.set(`${d}|${slotKey}`, (taken.get(`${d}|${slotKey}`) ?? 0) + 1)
    busy.add(`${s.key}|${d}`)
    made.push({ studentKey: s.key, dateKey: d, status, kind })
    return status
  }

  // Regular classes, every week in the window.
  for (const d of days) {
    if (!isOpen(d)) continue
    const wd = weekdayOf(d)
    for (const s of STUDENTS) {
      const start = addDays(sinceOf(s), 7)
      const active = s.status === 'enrolled' ? d >= start : s.status === 'paused' ? d >= start && d <= addDays(today, -21) : false
      if (!active) continue
      for (const key of weekly.get(s.key) ?? []) {
        if (key.startsWith(`${wd}:`)) addClass(s, d, key, 'class', chance(s.key, d, 'note') < 0.04 ? 'Stayed 15 minutes extra' : '')
      }
    }
  }

  // Makeups: about half the missed classes are made up within 16 days before or 18 after, as on the sheets.
  const missed = made.filter((m) => m.kind === 'class' && (m.status === 'canceled' || m.status === 'no_show'))
  for (const m of missed) {
    if (chance(m.studentKey, m.dateKey, 'makeup') >= 0.55) continue
    const s = STUDENTS.find((x) => x.key === m.studentKey)!
    const top = (s.level ?? 0) >= PRECISION_FROM
    const tries = [3, 5, 6, 8, 10, -2, -4, 12, 14, -6, 17, -9, -13, -16, 18]
    let placed = false
    for (const off of tries) {
      const d = addDays(m.dateKey, off)
      if (placed || d < from || d > to || !isOpen(d) || busy.has(`${s.key}|${d}`)) continue
      const wd = weekdayOf(d)
      const options = slots.filter((x) => x.wd === wd && !!x.block.precision === top && (taken.get(`${d}|${x.key}`) ?? 0) < seats)
      if (!options.length) continue
      addClass(s, d, options[0].key, 'makeup', `MU for ${md(m.dateKey)}`)
      placed = true
    }
  }

  // Trials: two 30-minute visits in the last half hour of an hour-long block, a week apart.
  for (const s of STUDENTS.filter((x) => x.trial)) {
    let first: DateKey | null = null
    for (const visit of [1, 2] as const) {
      const after = visit === 1 ? addDays(today, 2 + Math.floor(chance(s.key, 'trial') * 4)) : addDays(first ?? today, 7)
      for (const d of days) {
        if (d < after || !isOpen(d) || busy.has(`${s.key}|${d}`)) continue
        const wd = weekdayOf(d)
        const slot = slots.find((x) => x.wd === wd && !x.block.precision && x.block.endMin - x.block.startMin === 60 && (taken.get(`${d}|${x.key}`) ?? 0) < seats)
        if (!slot) continue
        addClass(s, d, slot.key, 'trial', `Trial ${visit}`, { startMin: slot.block.endMin - 30, endMin: slot.block.endMin })
        if (visit === 1) first = d
        break
      }
    }
  }

  // Students, with dates the app keeps up to date ------------------------------
  let parents = 0
  const familyParents = new Map<string, { name: string; email: string; phone: string; relation: string }[]>()
  STUDENTS.forEach((s, i) => {
    const id = sampleStudentId(s.key)
    const name = `${s.first} ${s.last}`
    const own = made.filter((m) => m.studentKey === s.key)
    const attended = own.filter((m) => m.status === 'present' && m.dateKey <= today).map((m) => m.dateKey).sort()
    const ahead = own.filter((m) => m.status !== 'canceled' && m.dateKey >= today).map((m) => m.dateKey).sort()
    const since = sinceOf(s)
    const longTime = addDays(since, 7) < from
    add(`${COL.students}/${id}`, {
      firstName: s.first,
      lastName: s.last,
      name,
      nameLower: name.toLowerCase(),
      grade: s.grade,
      school: !/^\d+$/.test(s.grade) ? '' : Number(s.grade) <= 5 ? SCHOOLS[4] : SCHOOLS[(Number(s.grade) >= 9 ? 1 : 0) + (i % 2) * 2],
      level: levelName(s.level),
      program: programName(s.level),
      status: s.status,
      statusSource: 'auto',
      signUpDate: since,
      firstSessionDate: s.status === 'finished' ? addDays(since, 7) : longTime ? addDays(since, 7) : (attended[0] ?? null),
      lastSessionDate: s.status === 'finished' ? '2026-05-28' : (attended.at(-1) ?? null),
      nextSessionDate: ahead[0] ?? null,
      followUpReviewedAt: s.status === 'signed_up' ? null : now,
      ...stamp,
    })
    const familyKey = s.family ?? s.key
    let family = familyParents.get(familyKey)
    if (!family) {
      const mother = MOTHERS[i % MOTHERS.length]
      const father = FATHERS[i % FATHERS.length]
      family = [{ name: `${mother} ${s.last}`, email: sampleEmail(mother, s.last), phone: phone(20 + i), relation: 'Mother' }]
      if (chance(familyKey, 'two-parents') < 0.6) family.push({ name: `${father} ${s.last}`, email: sampleEmail(father, s.last), phone: phone(60 + i), relation: 'Father' })
      familyParents.set(familyKey, family)
      parents += family.length
    }
    const g = Number(s.grade)
    const birthYear = Number.isFinite(g) && g > 0 ? parseDateKey(today).year - (g + 6) : 1992
    add(`${COL.students}/${id}/private/${DOC.privateProfile}`, {
      email: Number.isFinite(g) && g >= 9 ? sampleEmail(s.first, s.last) : '',
      phone: '',
      dob: makeDateKey(birthYear, 1 + (i % 12), 1 + ((i * 7) % 27)),
      address: `${100 + i * 12} Sample Lane, Suwanee, GA`,
      parents: family,
      adminNote: s.note ?? '',
      customFields: {},
    })
  })

  // Parent sign-ins, by family.
  for (const familyKey of PARENT_LOGINS) {
    const kids = STUDENTS.filter((s) => (s.family ?? s.key) === familyKey)
    const parent = familyParents.get(familyKey)?.[0]
    if (!parent || !kids.length) continue
    add(`${COL.members}/${parent.email}`, {
      ...newMemberData({ email: parent.email, displayName: parent.name, role: 'parent', studentIds: kids.map((k) => sampleStudentId(k.key)), createdBy: SAMPLE_AUTHOR }),
      createdAt: now,
      updatedAt: now,
    })
  }

  // Time entries: each coach clocks in before the first class and out after the last; the manager works each open day.
  let shifts = 0
  const shift = (st: SampleStaff, d: DateKey, inMin: number, outMin: number, extra: Record<string, unknown> = {}) => {
    shifts++
    add(`${COL.clockShifts}/${SAMPLE_PREFIX}shift-${d}-${st.key}`, {
      staffId: sampleStaffId(st.key),
      staffName: `${st.first} ${st.last}`,
      dateKey: d,
      inMin,
      clockInAt: toInstant(d, inMin, timezone),
      clockOutAt: toInstant(d, outMin, timezone),
      outDateKey: d,
      outMin,
      status: 'closed',
      source: 'kiosk',
      autoClosed: false,
      autoCorrected: false,
      forcedType: null,
      note: '',
      ...stamp,
      ...extra,
    })
  }
  const sessions = docs.filter((x) => x.path.includes(`/${COL.sessions}/`)).map((x) => x.data)
  let lastDanielDay: DateKey | null = null
  for (const d of days) {
    if (d >= today || !isOpen(d)) continue
    const hours = opts.week[weekdayOf(d)]
    shift(MANAGER, d, hours.openMin - 30 + Math.floor(chance(d, 'mgr-in') * 3) * 5, hours.closeMin + 10 + Math.floor(chance(d, 'mgr-out') * 3) * 5)
    for (const coach of COACHES) {
      const own = sessions.filter((x) => x.dateKey === d && x.coachId === sampleStaffId(coach.key) && x.status !== 'canceled')
      if (!own.length) continue
      const inMin = Math.min(...own.map((x) => x.startMin as number)) - 15 - Math.floor(chance(d, coach.key, 'in') * 3) * 5
      const outMin = Math.max(...own.map((x) => x.endMin as number)) + 5 + Math.floor(chance(d, coach.key, 'out') * 3) * 5
      shift(coach, d, inMin, outMin)
      if (coach.key === 'daniel-reed') lastDanielDay = d
    }
  }
  // Daniel forgot to clock out on his last day: the automatic clock-out closed it at midnight.
  if (lastDanielDay && diffDays(lastDanielDay, today) <= 7) {
    const doc = docs.find((x) => x.path.endsWith(`/${COL.clockShifts}/${SAMPLE_PREFIX}shift-${lastDanielDay}-daniel-reed`))!
    const next = addDays(lastDanielDay, 1)
    Object.assign(doc.data, { outDateKey: next, outMin: 0, clockOutAt: toInstant(next, 0, timezone), autoClosed: true, note: 'Closed automatically at 12:00 AM' })
  }

  // Closed on Thanksgiving ------------------------------------------------------
  for (const d of closedDays) {
    const hours = opts.week[weekdayOf(d)]
    add(`${COL.dayConfigs}/${d}`, { dateKey: d, isOpen: false, openMin: hours.openMin, closeMin: hours.closeMin, ...stamp })
  }

  // Announcements, from the manager ----------------------------------------------
  const manager = { key: sampleEmail(MANAGER.first, MANAGER.last), name: `${MANAGER.first} ${MANAGER.last}` }
  const daysAgo = (n: number, minutes = 600) => toInstant(addDays(today, -n), minutes, timezone)
  const post = (id: string, n: number, data: Record<string, unknown>) =>
    add(`${COL.announcements}/${SAMPLE_PREFIX}${id}`, {
      category: 'General',
      audienceType: 'all',
      audienceKeys: [],
      commentsEnabled: false,
      pinned: false,
      pinnedAt: null,
      archived: false,
      notifyRequestedAt: null,
      attachments: [],
      authorKey: manager.key,
      authorName: manager.name,
      readCount: 0,
      commentCount: 0,
      createdAt: daysAgo(n),
      createdBy: SAMPLE_AUTHOR,
      updatedAt: daysAgo(n),
      updatedBy: SAMPLE_AUTHOR,
      ...data,
    })
  post('a-welcome', 20, {
    title: 'Welcome to the new Sky Arc app',
    contentHtml:
      '<p>Hi coaches! Schedule changes, match news and academy updates are posted here from now on.</p><ul><li>Check <strong>Schedule</strong> for your classes.</li><li>Keep your <strong>Availability</strong> up to date at least two weeks ahead.</li><li>Clock in at the kiosk when you arrive.</li></ul><p>Questions? Leave a comment below.</p>',
    contentText:
      'Hi coaches! Schedule changes, match news and academy updates are posted here from now on. Check Schedule for your classes. Keep your Availability up to date at least two weeks ahead. Clock in at the kiosk when you arrive. Questions? Leave a comment below.',
    pinned: true,
    pinnedAt: daysAgo(20),
    commentsEnabled: true,
    commentCount: 1,
  })
  add(`${COL.announcements}/${SAMPLE_PREFIX}a-welcome/comments/${SAMPLE_PREFIX}c-1`, {
    authorKey: sampleEmail('Hannah', 'Moreno'),
    authorName: 'Hannah Moreno',
    authorRole: 'coach',
    text: 'Looks great, thank you!',
    createdAt: daysAgo(19, 1110),
  })
  post('a-match', 6, {
    title: 'Fall junior match: sign-ups are open',
    category: 'Tournaments',
    contentHtml: '<p>The fall junior match is next month. Please remind your Marksman and higher students to sign up by the end of next week.</p>',
    contentText: 'The fall junior match is next month. Please remind your Marksman and higher students to sign up by the end of next week.',
  })
  post('a-thanksgiving', 2, {
    title: 'Closed on Thanksgiving Day',
    category: 'Updates',
    contentHtml: '<p>The academy is closed on Thanksgiving Day. Classes that day move to makeups; check your schedule.</p>',
    contentText: 'The academy is closed on Thanksgiving Day. Classes that day move to makeups; check your schedule.',
  })

  // Events -------------------------------------------------------------------------
  const firstSunday = days.find((d) => weekdayOf(d) === 'sunday') ?? today
  add(`${COL.events}/${SAMPLE_PREFIX}e-range-practice`, {
    title: 'Range Practice',
    dateKey: firstSunday,
    startMin: 1050,
    endMin: 1170,
    notes: 'Open practice for enrolled students.',
    recurrence: { frequency: 'weekly', interval: 1, weekdays: ['sunday'], monthDay: null, ends: { type: 'never', endDate: null, occurrences: null } },
    ...stamp,
  })
  const meeting = days.find((d) => d >= addDays(today, 3) && weekdayOf(d) === 'sunday' && isOpen(d)) ?? addDays(today, 3)
  add(`${COL.events}/${SAMPLE_PREFIX}e-parent-meeting`, {
    title: 'Parent Meeting',
    dateKey: meeting,
    startMin: 810,
    endMin: 840,
    notes: 'The fall season and the junior match.',
    recurrence: null,
    ...stamp,
  })

  const classes = made.filter((m) => m.kind === 'class').length
  const summary: SampleSummary = {
    staff: STAFF.length,
    students: STUDENTS.length,
    parents,
    classes,
    makeups: made.filter((m) => m.kind === 'makeup').length,
    trials: made.filter((m) => m.kind === 'trial').length,
    shifts,
  }
  add(`${COL.auditLog}/${SAMPLE_PREFIX}data-added`, {
    at: now,
    actorUid: SAMPLE_AUTHOR,
    actorEmail: SAMPLE_AUTHOR,
    actorName: 'Sample data',
    actorRole: 'system',
    action: 'sample.add',
    category: 'settings',
    entityType: 'academy',
    entityId: `${SAMPLE_PREFIX}data`,
    summary: `Added sample data: ${summary.staff} staff, ${summary.students} students, ${summary.classes + summary.makeups + summary.trials} classes`,
    context: '',
    dateKey: today,
    studentId: null,
    studentName: null,
    coachId: null,
    coachName: null,
    changes: [],
    via: 'function',
  })
  return { docs, summary }
}
