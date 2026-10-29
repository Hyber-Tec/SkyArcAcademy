import { availabilityRecord } from '../availabilityWrites'
import { newMemberData } from '../branchFactory'
import { STAFF_COLORS } from '../colors'
import { COL, DOC, availabilityDocId } from '../paths'
import { rateRecord } from '../pay/rates'
import { MAKEUP_LOOKBACK_DAYS, makeupLabel, makeupsOwed } from '../schedule/classes'
import type { ClassRequestAction } from '../schedule/requests'
import { DEFAULT_BUSINESS_RULES } from '../settings/businessRules'
import type { SessionStatus, WeekHours } from '../settings/defaults'
import { type DateKey, type Weekday, addDays, dayEndInstant, diffDays, makeDateKey, minutesOf, parseDateKey, toInstant, weekdayOf } from '../time'
import type { AvailabilityRange, StudentStatus } from '../types'
import { chance } from './random'

/**
 * Sample data, for trying the app before the academy's real data arrives: fictional coaches, a manager, students and
 * their families; ten weeks of classes around today in the academy's weekly layout, taught together by the coaches in
 * (each class's students are its seats, labelled as the sheets do: make-ups, practice, trials), with a seat or two open
 * in the coming weeks' classes; families' requests for those seats, in each state; who's in each day, time entries,
 * announcements and events. Everything is made up: the names match nobody at the academy, emails use the
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
  /** The academy's opening hours: only the weekly classes inside them run. */
  week: WeekHours
  /** `settings.students.levels` and `.programs`. */
  levels: readonly string[]
  programs: readonly string[]
  /** Seats a class has (`businessRules.seatsPerClass`, 6 by default); its regular students leave one free. */
  seatsPerClass?: number
  /** From when each student had one coach; unused since classes are taught together. */
  maxStudentsPerCoach?: number
  /** Classes from this many days back to this many ahead (default 28 and 42). */
  daysBack?: number
  daysAhead?: number
}

export interface SampleSummary {
  staff: number
  students: number
  parents: number
  /** Classes, and the students' seats in them. */
  classes: number
  seats: number
  /** Seats labelled as the sheets do: make-ups, practice, trial visits. */
  makeups: number
  practice: number
  trials: number
  /** Who's in: the staff's hours, one record per person and day (the manager's included). */
  whosIn: number
  shifts: number
  /** Families' requests for classes, in each state. */
  requests: number
}

// ----------------------------------------------------------------- the week

/** Which students a class takes: the sheets group them by level. */
type Band = 'top' | 'advanced' | 'middle' | 'young'

interface Block {
  startMin: number
  endMin: number
  band: Band
}

const t = (h: number, m = 0) => h * 60 + m
const block = (startMin: number, endMin: number, band: Band): Block => ({ startMin, endMin, band })

/**
 * A standing week modelled on the academy's sheets (docs/DECISIONS.md §20): Monday 4:30, 6 and 7 PM; Tuesday to
 * Thursday 5, 6 and 7 PM; Sunday 2, 3:30, 5 and 6 PM. The 90-minute classes are the top level's, except Sunday's
 * second, the advanced students'; the others are the middle levels' or the youngest's. A class runs only when it fits
 * the opening hours (Sunday's last needs the academy open until 7 PM).
 */
const BLOCKS: Partial<Record<Weekday, Block[]>> = {
  sunday: [block(t(14), t(15, 30), 'top'), block(t(15, 30), t(17), 'advanced'), block(t(17), t(18), 'middle'), block(t(18), t(19), 'young')],
  monday: [block(t(16, 30), t(18), 'top'), block(t(18), t(19), 'middle'), block(t(19), t(20), 'middle')],
  tuesday: [block(t(17), t(18), 'young'), block(t(18), t(19), 'middle'), block(t(19), t(20), 'young')],
  wednesday: [block(t(17), t(18), 'young'), block(t(18), t(19), 'middle'), block(t(19), t(20), 'young')],
  thursday: [block(t(17), t(18), 'young'), block(t(18), t(19), 'middle'), block(t(19), t(20, 30), 'top')],
}

/** On the default levels: Precision is the top, Sharp Shooter and Expert advanced, Hunter and below the youngest. */
const TOP_LEVEL = 8
const ADVANCED_FROM = 6
const YOUNG_UP_TO = 2

/** The classes a level takes, the preferred first. */
function bandsFor(level: number | null): Band[] {
  if (level === null || level <= YOUNG_UP_TO) return ['young']
  if (level >= TOP_LEVEL) return ['top']
  if (level >= ADVANCED_FROM) return ['advanced', 'middle']
  return ['middle']
}

// ----------------------------------------------------------------- people

interface SampleStaff {
  key: string
  first: string
  last: string
  role: 'admin' | 'coach'
  rate: number
  since: DateKey
  /** Weekdays they're in, Sundays aside (the manager is in every open day). */
  days: Weekday[]
  /** Sundays: every one, or in turn with the other coaches. */
  sundays?: 'every' | 'turn'
  /** Weekdays they leave when the first class ends. */
  early?: Weekday[]
}

const MANAGER: SampleStaff = { key: 'paige-sutton', first: 'Paige', last: 'Sutton', role: 'admin', rate: 24, since: '2024-06-03', days: [] }
/** Who's in, as at the academy: Monday three coaches (one until 6 PM), Tuesday to Thursday two, Sunday one plus one in turn. */
const COACHES: SampleStaff[] = [
  { key: 'daniel-reed', first: 'Daniel', last: 'Reed', role: 'coach', rate: 28, since: '2024-09-03', days: ['monday', 'tuesday', 'wednesday', 'thursday'], sundays: 'turn' },
  { key: 'hannah-moreno', first: 'Hannah', last: 'Moreno', role: 'coach', rate: 25, since: '2025-01-13', days: ['monday', 'thursday'], sundays: 'turn' },
  { key: 'joel-kwon', first: 'Joel', last: 'Kwon', role: 'coach', rate: 22, since: '2025-08-24', days: ['tuesday', 'wednesday'], sundays: 'turn' },
  { key: 'elena-webb', first: 'Elena', last: 'Webb', role: 'coach', rate: 22, since: '2026-02-01', days: ['monday'], sundays: 'every', early: ['monday'] },
]
const STAFF = [MANAGER, ...COACHES]
const SUNDAY_TURN = COACHES.filter((c) => c.sundays === 'turn').map((c) => c.key)

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
  /** Siblings share parents and come together: to the same class at the same level, the same day otherwise. */
  family?: string
  /** Signed up for a trial: two visits ahead. */
  trial?: boolean
  /** The academy's rifle they use, by its code; none for their own. */
  rifle?: string
  /** Only these weekdays. */
  days?: Weekday[]
  note?: string
}

const STUDENTS: SampleStudent[] = [
  { key: 'jiwoo-hwang', first: 'Jiwoo', last: 'Hwang', grade: '8', level: 4, status: 'enrolled', perWeek: 2, since: '2025-03-02', family: 'hwang', rifle: 'C2' },
  { key: 'minjun-hwang', first: 'Minjun', last: 'Hwang', grade: '6', level: 2, status: 'enrolled', perWeek: 2, since: '2025-09-07', family: 'hwang', rifle: 'C21' },
  { key: 'seoyeon-lim', first: 'Seoyeon', last: 'Lim', grade: '10', level: 8, status: 'enrolled', perWeek: 2, since: '2024-09-08', note: 'Junior team. Plans to try out for the state match.' },
  { key: 'isaac-brooks', first: 'Isaac', last: 'Brooks', grade: '9', level: 8, status: 'enrolled', perWeek: 2, since: '2024-11-03' },
  { key: 'yuna-chung', first: 'Yuna', last: 'Chung', grade: '7', level: 1, status: 'enrolled', perWeek: 2, since: '2026-06-07', rifle: 'C3' },
  { key: 'leo-carter', first: 'Leo', last: 'Carter', grade: '2', level: 0, status: 'enrolled', perWeek: 1, since: -24, rifle: 'C6' },
  { key: 'haneul-moon', first: 'Haneul', last: 'Moon', grade: '11', level: 8, status: 'enrolled', perWeek: 2, since: '2025-01-05' },
  { key: 'grace-ellis', first: 'Grace', last: 'Ellis', grade: '8', level: 4, status: 'enrolled', perWeek: 2, since: '2025-08-17', rifle: 'C12' },
  { key: 'doyun-rhee', first: 'Doyun', last: 'Rhee', grade: '9', level: 6, status: 'enrolled', perWeek: 2, since: '2025-04-13', rifle: 'C14' },
  { key: 'sophie-novak', first: 'Sophie', last: 'Novak', grade: '7', level: 2, status: 'enrolled', perWeek: 2, since: '2025-10-05', rifle: 'C4' },
  { key: 'owen-fischer', first: 'Owen', last: 'Fischer', grade: '10', level: 4, status: 'enrolled', perWeek: 2, since: '2025-02-09', rifle: 'C5' },
  { key: 'seojin-song', first: 'Seojin', last: 'Song', grade: '12', level: 8, status: 'enrolled', perWeek: 2, since: '2024-08-25' },
  { key: 'lucas-ortiz', first: 'Lucas', last: 'Ortiz', grade: '6', level: 1, status: 'enrolled', perWeek: 2, since: '2026-08-16', rifle: 'C9' },
  { key: 'harin-ryu', first: 'Harin', last: 'Ryu', grade: '8', level: 4, status: 'enrolled', perWeek: 2, since: '2025-06-01', rifle: 'C15' },
  { key: 'nora-bennett', first: 'Nora', last: 'Bennett', grade: '9', level: 7, status: 'enrolled', perWeek: 2, since: '2025-03-16', rifle: 'C18' },
  { key: 'jiho-paek', first: 'Jiho', last: 'Paek', grade: '7', level: 4, status: 'enrolled', perWeek: 2, since: '2025-11-02', rifle: 'JG' },
  { key: 'elijah-hayes', first: 'Elijah', last: 'Hayes', grade: '11', level: 8, status: 'enrolled', perWeek: 2, since: '2024-10-06' },
  { key: 'isla-quinn', first: 'Isla', last: 'Quinn', grade: '3', level: 0, status: 'enrolled', perWeek: 1, since: -17, rifle: 'C1' },
  { key: 'eunwoo-seo', first: 'Eunwoo', last: 'Seo', grade: '10', level: 7, status: 'enrolled', perWeek: 2, since: '2025-01-19', rifle: 'C10' },
  { key: 'mia-collins', first: 'Mia', last: 'Collins', grade: '8', level: 4, status: 'enrolled', perWeek: 2, since: '2025-05-04', rifle: 'C7' },
  { key: 'sua-jang', first: 'Sua', last: 'Jang', grade: '7', level: 1, status: 'enrolled', perWeek: 2, since: '2026-01-11', family: 'jang', rifle: 'C11' },
  { key: 'samuel-jang', first: 'Samuel', last: 'Jang', grade: '9', level: 4, status: 'enrolled', perWeek: 2, since: '2025-07-13', family: 'jang', rifle: 'C16' },
  { key: 'chaewon-byun', first: 'Chaewon', last: 'Byun', grade: '11', level: 8, status: 'enrolled', perWeek: 2, since: '2025-02-23' },
  { key: 'henry-lane', first: 'Henry', last: 'Lane', grade: '5', level: 1, status: 'enrolled', perWeek: 2, since: '2026-09-06', rifle: 'C22' },
  { key: 'zoe-pierce', first: 'Zoe', last: 'Pierce', grade: '8', level: 1, status: 'enrolled', perWeek: 2, since: '2026-03-01', rifle: 'C20' },
  { key: 'yejun-noh', first: 'Yejun', last: 'Noh', grade: '9', level: 7, status: 'enrolled', perWeek: 2, since: '2025-04-27', rifle: 'P' },
  { key: 'ava-monroe', first: 'Ava', last: 'Monroe', grade: '7', level: 1, status: 'enrolled', perWeek: 2, since: '2026-02-08', rifle: 'C19' },
  { key: 'arin-tak', first: 'Arin', last: 'Tak', grade: '10', level: 4, status: 'enrolled', perWeek: 2, since: '2025-05-18', family: 'tak', rifle: 'C8' },
  { key: 'theo-tak', first: 'Theo', last: 'Tak', grade: '8', level: 4, status: 'enrolled', perWeek: 1, since: '2025-09-14', family: 'tak', rifle: 'C17' },
  { key: 'wesley-hart', first: 'Wesley', last: 'Hart', grade: 'Adult', level: 8, status: 'enrolled', perWeek: 1, since: '2025-10-19', days: ['sunday'], note: 'Adult shooter; Sunday Precision only.' },
  { key: 'juno-gil', first: 'Juno', last: 'Gil', grade: '6', level: null, status: 'signed_up', perWeek: 0, since: -2, trial: true },
  { key: 'hailey-underwood', first: 'Hailey', last: 'Underwood', grade: '7', level: null, status: 'signed_up', perWeek: 0, since: -4, trial: true },
  { key: 'kai-whitaker', first: 'Kai', last: 'Whitaker', grade: '9', level: null, status: 'signed_up', perWeek: 0, since: -1, trial: true },
  { key: 'bella-vance', first: 'Bella', last: 'Vance', grade: '8', level: 2, status: 'paused', perWeek: 2, since: '2025-09-21', rifle: 'C13', note: 'Paused for the fall soccer season.' },
  { key: 'jasper-dalton', first: 'Jasper', last: 'Dalton', grade: 'College', level: 5, status: 'finished', perWeek: 0, since: '2023-09-10', note: 'Graduated in May.' },
  { key: 'mason-reyes', first: 'Mason', last: 'Reyes', grade: '5', level: 1, status: 'enrolled', perWeek: 2, since: '2026-04-12', rifle: 'C23' },
  { key: 'yerin-baek', first: 'Yerin', last: 'Baek', grade: '6', level: 2, status: 'enrolled', perWeek: 2, since: '2026-01-25', rifle: 'C24' },
  { key: 'felix-grant', first: 'Felix', last: 'Grant', grade: '9', level: 4, status: 'enrolled', perWeek: 2, since: '2025-10-26', rifle: 'C25' },
  { key: 'dahye-oh', first: 'Dahye', last: 'Oh', grade: '8', level: 4, status: 'enrolled', perWeek: 2, since: '2025-12-14', rifle: 'C26' },
]

/** Parents, by family (siblings share them); `login` families can sign in to the parent portal. */
const MOTHERS = ['Jiyeon', 'Sunhee', 'Eunji', 'Laura', 'Karen', 'Rachel', 'Megan', 'Julie']
const FATHERS = ['Hyunwoo', 'Sungmin', 'Minho', 'Michael', 'Brian', 'Steven', 'Mark']
const PARENT_LOGINS = new Set(['hwang', 'jang', 'tak', 'seoyeon-lim', 'isaac-brooks', 'grace-ellis', 'sophie-novak'])
/** Older students with a sign-in of their own (the student portal): one whose parent also has one, one without. */
const STUDENT_LOGINS = new Set(['arin-tak', 'seoyeon-lim', 'elijah-hayes'])
const SCHOOLS = ['North Ridge Middle School', 'Lakeview High School', 'Maple Creek Middle School', 'Summit Oaks High School', 'Brookside Elementary School']

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const sampleEmail = (first: string, last: string) => `${slug(first)}.${slug(last)}@${SAMPLE_EMAIL_DOMAIN}`
export const sampleStaffId = (key: string) => `${SAMPLE_PREFIX}${key}`
/** The sample manager (an admin), who files the sample results and prepares the sample reports. */
export const SAMPLE_MANAGER = { name: `${MANAGER.first} ${MANAGER.last}`, email: sampleEmail(MANAGER.first, MANAGER.last) }
export const sampleStudentId = (key: string) => `${SAMPLE_PREFIX}${key}`
/** Phone numbers in 555-0100…0199, which exist nowhere. */
const phone = (n: number) => `(678) 555-01${String(n % 100).padStart(2, '0')}`
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}${String(min % 60).padStart(2, '0')}`
const monthDay = (d: DateKey) => `${parseDateKey(d).month}/${parseDateKey(d).day}`

/** Lexicographic order by a list of numbers. */
const byRank =
  <T>(rank: (x: T) => number[]) =>
  (a: T, b: T): number => {
    const ra = rank(a)
    const rb = rank(b)
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i]
    return 0
  }

/** The coach whose Sunday it is, among those who take them in turn, week by week. */
function sundayTurn(dateKey: DateKey): string {
  const weeks = Math.floor(diffDays('2026-01-04', dateKey) / 7)
  return SUNDAY_TURN[((weeks % SUNDAY_TURN.length) + SUNDAY_TURN.length) % SUNDAY_TURN.length]
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
  const seats = Math.max(1, opts.seatsPerClass ?? DEFAULT_BUSINESS_RULES.seatsPerClass)
  const from = addDays(today, -(opts.daysBack ?? 28))
  const to = addDays(today, opts.daysAhead ?? 42)
  const nowMin = minutesOf(now, timezone)
  const days: DateKey[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  const closedDays = new Set(days.filter((d) => d === thanksgiving(parseDateKey(d).year)))
  const levelName = (i: number | null) => (i === null ? null : (opts.levels[i] ?? null))
  const programName = (i: number | null) => (i === null ? null : (opts.programs[i <= 1 ? 0 : i <= 3 ? 1 : i <= 6 ? 2 : 3] ?? null))
  const sinceOf = (s: SampleStudent) => (typeof s.since === 'number' ? addDays(today, s.since) : s.since)

  // The classes that fit the academy's opening hours, by weekday.
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
    // Everyone's one hourly rate (docs/DECISIONS.md §23), in both fields until the phone app's update.
    const rates = rateRecord(st.rate)
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

  // Who's in: everyone's hours each open day ------------------------------------
  // Joel is away one Tuesday ahead and Daniel leaves at 7 PM that day: its last class has no coach in until someone
  // fills in.
  const awayDay = days.find((d) => d >= addDays(today, 8) && weekdayOf(d) === 'tuesday' && isOpen(d)) ?? null
  /** Someone's hours on a day, or null when they're not in. */
  const hoursIn = (st: SampleStaff, d: DateKey): AvailabilityRange[] | null => {
    if (!isOpen(d)) return null
    const wd = weekdayOf(d)
    const blocks = blocksOn(wd)
    const hours = opts.week[wd]
    // In from 30 minutes before the first class, to set up (docs/DECISIONS.md §20), to the end of the last.
    const startMin = Math.max(hours.openMin, blocks[0].startMin - 30)
    let endMin = Math.min(hours.closeMin, blocks[blocks.length - 1].endMin)
    if (st.role === 'admin') return [{ startMin, endMin }]
    const on = wd === 'sunday' ? st.sundays === 'every' || (st.sundays === 'turn' && sundayTurn(d) === st.key) : st.days.includes(wd)
    if (!on || (d === awayDay && st.key === 'joel-kwon')) return null
    if (st.early?.includes(wd)) endMin = blocks[0].endMin
    if (d === awayDay && st.key === 'daniel-reed') endMin = Math.min(endMin, t(19))
    return [{ startMin, endMin }]
  }
  // The coaches' other open days ahead are marked not available (an answer), except Daniel's: he hasn't answered his
  // yet, so his calendar shows the days still to set.
  let whosIn = 0
  for (const st of STAFF) {
    const staffId = sampleStaffId(st.key)
    for (const d of days) {
      if (!isOpen(d)) continue
      const ranges = hoursIn(st, d)
      if (!ranges && (st.role !== 'coach' || d < today || st.key === 'daniel-reed')) continue
      const record = availabilityRecord(staffId, { dateKey: d, ranges: ranges ?? [], unavailable: !ranges }, timezone, ranges ? 'admin' : 'coach', `${st.first} ${st.last}`, st.role)
      if (!record) continue
      add(`${COL.availability}/${availabilityDocId(staffId, d)}`, { ...record, ...stamp })
      if (ranges) whosIn++
    }
  }

  // Weekly seats: each enrolled student keeps the same classes every week, among their level's ------------------
  interface Slot {
    wd: Weekday
    block: Block
    key: string
  }
  const slots: Slot[] = (Object.keys(BLOCKS) as Weekday[]).flatMap((wd) => blocksOn(wd).map((b) => ({ wd, block: b, key: `${wd}:${b.startMin}` })))
  const slotsOn = (d: DateKey) => slots.filter((x) => x.wd === weekdayOf(d))
  // The regulars leave a seat free for make-ups, practice and trials.
  const regulars = Math.max(1, seats - 1)
  const fill = new Map<string, number>()
  const weekly = new Map<string, Slot[]>()
  const familySlots = new Map<string, Slot[]>()
  for (const s of STUDENTS) {
    if (s.perWeek === 0) continue
    const bands = bandsFor(s.level)
    const family = (s.family && familySlots.get(s.family)) || []
    const chosen: Slot[] = []
    while (chosen.length < s.perWeek) {
      const usedDays = new Set(chosen.map((x) => x.wd))
      const options = slots.filter((x) => bands.includes(x.block.band) && !usedDays.has(x.wd) && (!s.days || s.days.includes(x.wd)) && (fill.get(x.key) ?? 0) < regulars)
      if (!options.length) break
      // Siblings come together: to the same class when it's their level, on the same day otherwise.
      const rank = (x: Slot) => [family.some((f) => f.key === x.key) ? 0 : family.some((f) => f.wd === x.wd) ? 1 : 2, bands.indexOf(x.block.band), fill.get(x.key) ?? 0, chance(s.key, x.key)]
      const pick = options.sort(byRank(rank))[0]
      chosen.push(pick)
      fill.set(pick.key, (fill.get(pick.key) ?? 0) + 1)
    }
    weekly.set(s.key, chosen)
    if (s.family) familySlots.set(s.family, [...family, ...chosen])
  }

  // Seats ---------------------------------------------------------------------
  interface Seat {
    id: string
    student: SampleStudent
    dateKey: DateKey
    kind: 'class' | 'makeup' | 'practice' | 'trial'
    status: SessionStatus
    data: Record<string, unknown>
  }
  const made: Seat[] = []
  const inClass = new Map<string, Seat[]>() // `${dateKey}|${slot.key}` → its seats
  const busy = new Set<string>() // `${studentKey}|${dateKey}`: one class a day
  const classIdOf = (d: DateKey, slot: Slot) => `${SAMPLE_PREFIX}class-${d}-${hhmm(slot.block.startMin)}`
  /** Seats in use in a class: a canceled student frees theirs. */
  const taken = (d: DateKey, slot: Slot) => (inClass.get(`${d}|${slot.key}`) ?? []).filter((x) => x.status !== 'canceled').length
  const ended = (d: DateKey, endMin: number) => d < today || (d === today && endMin <= nowMin)
  const statusFor = (id: string, d: DateKey, endMin: number, kind: Seat['kind']): SessionStatus => {
    const r = chance(id, 'status')
    if (ended(d, endMin)) return kind === 'class' ? (r < 0.88 ? 'present' : r < 0.92 ? 'no_show' : 'canceled') : 'present'
    if (kind === 'class' && r < 0.04) return 'canceled'
    return diffDays(today, d) <= 1 ? 'confirmed' : 'pending'
  }

  const addSeat = (s: SampleStudent, d: DateKey, slot: Slot, kind: Seat['kind'], note: string, span?: AvailabilityRange): Seat => {
    // The youngest come for the last half hour of their class.
    const half = s.level === 0 && slot.block.endMin - slot.block.startMin === 60 ? { startMin: slot.block.endMin - 30, endMin: slot.block.endMin } : null
    const { startMin, endMin } = span ?? half ?? slot.block
    const id = `${SAMPLE_PREFIX}c-${d}-${s.key}`
    const status = statusFor(id, d, endMin, kind)
    const list = inClass.get(`${d}|${slot.key}`) ?? []
    const data: Record<string, unknown> = {
      classId: classIdOf(d, slot),
      coachId: '',
      coachName: '',
      studentId: sampleStudentId(s.key),
      studentName: `${s.first} ${s.last}`,
      studentGrade: s.grade,
      // The sheets write "Absent" beside a student who canceled.
      note: kind === 'class' && status === 'canceled' ? 'Absent' : note,
      status,
      dateKey: d,
      weekday: weekdayOf(d),
      startMin,
      endMin,
      startAt: toInstant(d, startMin, timezone),
      endAt: toInstant(d, endMin, timezone),
      dayEndAt: dayEndInstant(d, timezone),
      visualOrder: list.length,
      confirmedAt: null,
      confirmedBy: null,
      source: 'seed',
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      ...stamp,
    }
    const seat: Seat = { id, student: s, dateKey: d, kind, status, data }
    list.push(seat)
    inClass.set(`${d}|${slot.key}`, list)
    busy.add(`${s.key}|${d}`)
    made.push(seat)
    return seat
  }

  // Regular classes, every week in the window.
  const activeOn = (s: SampleStudent, d: DateKey) => {
    const start = addDays(sinceOf(s), 7)
    return s.status === 'enrolled' ? d >= start : s.status === 'paused' ? d >= start && d <= addDays(today, -21) : false
  }
  for (const d of days) {
    if (!isOpen(d)) continue
    for (const s of STUDENTS) {
      if (!activeOn(s, d)) continue
      for (const slot of weekly.get(s.key) ?? []) {
        if (slot.wd !== weekdayOf(d)) continue
        const seat = addSeat(s, d, slot, 'class', '')
        if (seat.status === 'present' && chance(s.key, d, 'note') < 0.03) seat.data.note = 'Stayed 15 minutes extra'
      }
    }
  }

  // From today on, make-ups and practice leave each class a seat open, so families have seats to ask for.
  const roomFor = (d: DateKey) => (d >= today ? seats - 1 : seats)

  // Make-ups: about half the missed classes are made up within 16 days before or 18 after, in a class of their level
  // with a seat free, as on the sheets; the missed one says what became of it.
  const missed = made.filter((m) => m.kind === 'class' && (m.status === 'canceled' || m.status === 'no_show'))
  for (const m of missed) {
    if (chance(m.student.key, m.dateKey, 'makeup') >= 0.55) continue
    const bands = bandsFor(m.student.level)
    for (const off of [3, 5, 6, 8, 10, -2, -4, 12, 14, -6, 17, -9, -13, -16, 18]) {
      const d = addDays(m.dateKey, off)
      if (d < from || d > to || !isOpen(d) || busy.has(`${m.student.key}|${d}`)) continue
      const slot = slotsOn(d)
        .filter((x) => bands.includes(x.block.band) && taken(d, x) < roomFor(d))
        .sort(byRank((x) => [bands.indexOf(x.block.band), taken(d, x)]))[0]
      if (!slot) continue
      const mu = addSeat(m.student, d, slot, 'makeup', makeupLabel(m.dateKey))
      if (m.status === 'canceled') m.data.note = mu.status === 'present' ? `Absent: made up on ${monthDay(d)}` : `Absent: make-up planned for ${monthDay(d)}`
      break
    }
  }

  // Practice: now and then a student past the beginners' levels comes for extra practice (the light blue on the
  // sheets) where a seat is free, in a class of their level, or the middle levels' for the advanced and the top.
  const practicesIn = (s: SampleStudent, slot: Slot) =>
    (!s.days || s.days.includes(slot.wd)) && (bandsFor(s.level).includes(slot.block.band) || (slot.block.band === 'middle' && (s.level ?? 0) >= ADVANCED_FROM))
  for (const d of days) {
    if (!isOpen(d)) continue
    for (const slot of slotsOn(d)) {
      if (chance(d, slot.key, 'practice') >= 0.22 || taken(d, slot) >= roomFor(d)) continue
      const who = STUDENTS.filter((s) => s.status === 'enrolled' && activeOn(s, d) && (s.level ?? 0) > YOUNG_UP_TO && !busy.has(`${s.key}|${d}`) && practicesIn(s, slot)).sort(
        (a, b) => chance(a.key, d, 'practice') - chance(b.key, d, 'practice'),
      )[0]
      if (who) addSeat(who, d, slot, 'practice', 'Practice')
    }
  }

  // Trials: two visits ahead in a beginners' class, a week apart (the first its last half hour, the second all of
  // it), each new student starting on a different day.
  const beginnersDays = days.filter((d) => d >= addDays(today, 2) && isOpen(d) && slotsOn(d).some((x) => x.block.band === 'young'))
  const hasTrial = (d: DateKey, slot: Slot) => (inClass.get(`${d}|${slot.key}`) ?? []).some((x) => x.kind === 'trial')
  for (const [i, s] of STUDENTS.filter((x) => x.trial).entries()) {
    let first: DateKey | null = null
    for (const visit of [1, 2] as const) {
      const after = visit === 1 ? (beginnersDays[i] ?? addDays(today, 2)) : addDays(first ?? today, 7)
      for (const d of days) {
        if (d < after || !isOpen(d) || busy.has(`${s.key}|${d}`)) continue
        const slot = slotsOn(d)
          .filter((x) => x.block.band === 'young' && x.block.endMin - x.block.startMin === 60 && taken(d, x) < seats)
          .sort(byRank((x) => [hasTrial(d, x) ? 1 : 0, taken(d, x)]))[0]
        if (!slot) continue
        addSeat(s, d, slot, 'trial', `Trial ${visit}`, visit === 1 ? { startMin: slot.block.endMin - 30, endMin: slot.block.endMin } : slot.block)
        if (visit === 1) first = d
        break
      }
    }
  }

  // Families' requests (docs/DECISIONS.md §23) ------------------------------------------
  // From families who sign in, each with its back and forth: a few waiting for the office (one for a class that has
  // filled up since it was asked for, so the office suggests another), one where the office suggested another time and
  // waits on the family, one booked once the family accepted the time suggested, and one declined. The Hwang family (the
  // sample parent's) has one waiting on each side. The seats they need are made here; the requests are written below,
  // once the parents are known.
  const studentOf = (key: string) => STUDENTS.find((s) => s.key === key)
  const ownSeats = (s: SampleStudent) => made.filter((m) => m.student.key === s.key).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  /** A student's classes missed (canceled or a no-show) before `before` and not made up yet, the latest first. */
  const owedOf = (s: SampleStudent, before = today): Seat[] => {
    const own = ownSeats(s)
    const owed = makeupsOwed(
      own.map((m) => ({ id: m.id, studentId: s.key, dateKey: m.dateKey, status: m.status, note: String(m.data.note ?? ''), isDeleted: false })),
      addDays(today, -MAKEUP_LOOKBACK_DAYS),
    )
    return owed
      .filter((o) => o.dateKey < before)
      .map((o) => own.find((m) => m.id === o.id)!)
      .reverse()
  }
  type Choice = { d: DateKey; slot: Slot }
  const idOf = (c: Choice) => classIdOf(c.d, c.slot)
  /** The classes asked for so far: the others are picked first, and the one that fills up is none of them. */
  const askedFor = new Set<string>()
  /** The student has a seat that day at that time (not canceled): asking for it would clash. */
  const clashes = (s: SampleStudent, d: DateKey, slot: Slot) =>
    made.some((m) => m.student.key === s.key && m.dateKey === d && m.status !== 'canceled' && Number(m.data.startMin) < slot.block.endMin && Number(m.data.endMin) > slot.block.startMin)
  /**
   * Classes ahead a student could ask for: of their level (or `bands`), with a seat open, at a time they have no class;
   * the days they have none first, then the classes nobody has asked for. `freeDay`: only those days (a seat booked
   * keeps the sample's one class a day).
   */
  const choicesFor = (s: SampleStudent, fromDay: number, toDay: number, bands = bandsFor(s.level), freeDay = false): Choice[] =>
    days
      .filter((d) => d >= addDays(today, fromDay) && d <= addDays(today, toDay) && isOpen(d) && (!freeDay || !busy.has(`${s.key}|${d}`)))
      .flatMap((d) => slotsOn(d).map((slot) => ({ d, slot })))
      .filter(({ d, slot }) => bands.includes(slot.block.band) && (!s.days || s.days.includes(slot.wd)) && taken(d, slot) < seats && !clashes(s, d, slot))
      .sort(byRank((x) => [Number(busy.has(`${s.key}|${x.d}`)), Number(askedFor.has(idOf(x)))]))
  const ask = (c: Choice | undefined): Choice | null => {
    if (c) askedFor.add(idOf(c))
    return c ?? null
  }
  interface RequestPlan {
    student: SampleStudent
    kind: 'makeup' | 'reschedule' | 'extra'
    /** The class asked for now: the one booked, once approved. */
    at: Choice
    /** The missed class a make-up is for, or the class a move replaces. */
    forSeat: Seat | null
    by: 'parent' | 'student'
    message: string
    status: 'pending' | 'offered' | 'approved' | 'rejected'
    /** Oldest first; the first is the ask. */
    steps: { action: ClassRequestAction; hoursAgo: number; office?: boolean; at?: Choice; note?: string }[]
    offer?: { at: Choice; note: string; hoursAgo: number }
    seat?: Seat
    decisionNote?: string
  }
  const plans: RequestPlan[] = []

  // Jiwoo: a make-up waiting for the office (her last class here was missed, if nothing else is owed).
  const jiwoo = studentOf('jiwoo-hwang')
  if (jiwoo) {
    let owed: Seat | null = owedOf(jiwoo)[0] ?? null
    if (!owed) {
      owed = ownSeats(jiwoo).filter((m) => m.kind === 'class' && m.status === 'present' && m.dateKey < today && m.dateKey >= addDays(today, -10)).at(-1) ?? null
      if (owed) {
        owed.status = 'canceled'
        Object.assign(owed.data, { status: 'canceled', note: 'Absent' })
      }
    }
    const c = ask(choicesFor(jiwoo, 2, 9)[0])
    if (c) {
      const message = owed ? 'She was sick that day. Any evening works.' : 'Extra practice before the junior match, please.'
      plans.push({ student: jiwoo, kind: owed ? 'makeup' : 'extra', at: c, forSeat: owed, by: 'parent', message, status: 'pending', steps: [{ action: 'asked', hoursAgo: 20, at: c }] })
    }
  }
  // Minjun: asked for one of the older students' classes; the office suggested one of his level, and waits on the family.
  const minjun = studentOf('minjun-hwang')
  if (minjun) {
    // Asked two days ago: for a class missed before then.
    const owed = owedOf(minjun, addDays(today, -2))[0] ?? null
    const first = ask(choicesFor(minjun, 3, 9, ['middle'])[0])
    const instead = ask(choicesFor(minjun, 2, 12)[0])
    if (first && instead) {
      const note = 'That class is for older students. This one is Minjun’s level, with a seat open.'
      plans.push({
        student: minjun,
        kind: owed ? 'makeup' : 'extra',
        at: first,
        forSeat: owed,
        by: 'parent',
        message: owed ? 'Could Minjun make up the class he missed?' : 'Could Minjun come for extra practice?',
        status: 'offered',
        steps: [
          { action: 'asked', hoursAgo: 46, at: first },
          { action: 'offered', hoursAgo: 26, office: true, at: instead, note },
        ],
        offer: { at: instead, note, hoursAgo: 26 },
      })
    }
  }
  // Samuel: an extra class, waiting for the office.
  const samuel = studentOf('samuel-jang')
  const samuelAt = samuel ? ask(choicesFor(samuel, 2, 10)[0]) : null
  if (samuel && samuelAt) {
    plans.push({ student: samuel, kind: 'extra', at: samuelAt, forSeat: null, by: 'parent', message: 'He has a match coming up and would like extra practice.', status: 'pending', steps: [{ action: 'asked', hoursAgo: 5, at: samuelAt }] })
  }
  // Arin, from her own sign-in: one of her classes moved to another day, waiting for the office.
  const arin = studentOf('arin-tak')
  if (arin) {
    const next = ownSeats(arin).find((m) => m.kind === 'class' && (m.status === 'pending' || m.status === 'confirmed') && m.dateKey >= addDays(today, 3) && m.dateKey <= addDays(today, 10))
    const c = next ? ask(choicesFor(arin, 2, 10)[0]) : null
    if (next && c) plans.push({ student: arin, kind: 'reschedule', at: c, forSeat: next, by: 'student', message: 'I have a school concert that evening.', status: 'pending', steps: [{ action: 'asked', hoursAgo: 3, at: c }] })
  }
  // Grace: waiting for the office, for a class whose last seats went to other students' practice since she asked (no
  // other request's class).
  const grace = studentOf('grace-ellis')
  if (grace) {
    const owed = owedOf(grace, addDays(today, -3))[0] ?? null
    const fullest = choicesFor(grace, 3, 9)
      .filter((x) => !askedFor.has(idOf(x)))
      .sort((a, b) => taken(b.d, b.slot) - taken(a.d, a.slot))
    const c = ask(fullest[0])
    if (c) {
      const others = STUDENTS.filter((s) => s.key !== grace.key && s.status === 'enrolled' && activeOn(s, c.d) && (s.level ?? 0) > YOUNG_UP_TO && !busy.has(`${s.key}|${c.d}`) && practicesIn(s, c.slot)).sort(
        (a, b) => chance(a.key, c.d, 'filled') - chance(b.key, c.d, 'filled'),
      )
      for (const o of others) {
        if (taken(c.d, c.slot) >= seats) break
        addSeat(o, c.d, c.slot, 'practice', 'Practice')
      }
      plans.push({ student: grace, kind: owed ? 'makeup' : 'extra', at: c, forSeat: owed, by: 'parent', message: 'Grace can come any day after 5.', status: 'pending', steps: [{ action: 'asked', hoursAgo: 70, at: c }] })
    }
  }
  // Theo: the office suggested another time, the family accepted it, and it's booked.
  const theo = studentOf('theo-tak')
  if (theo) {
    const owed = owedOf(theo, addDays(today, -3))[0] ?? null
    const first = ask(choicesFor(theo, 2, 8)[0])
    // Another day's class, and not the last seat of one another request asks for (that one would be full).
    const others = choicesFor(theo, 2, 12, undefined, true).filter((x) => (!first || x.d !== first.d) && !(askedFor.has(idOf(x)) && taken(x.d, x.slot) >= seats - 1))
    // A make-up within 18 days of the class it makes up, as the sheets' are; else an extra class.
    const makeupAt = owed ? others.find((x) => diffDays(owed.dateKey, x.d) <= 18) : undefined
    const kind = makeupAt ? 'makeup' : 'extra'
    const booked = ask(makeupAt ?? others[0])
    if (first && booked) {
      const seat = addSeat(theo, booked.d, booked.slot, makeupAt ? 'makeup' : 'practice', makeupAt && owed ? makeupLabel(owed.dateKey) : 'Practice')
      seat.status = 'confirmed'
      Object.assign(seat.data, { status: 'confirmed', source: 'request' })
      if (makeupAt && owed?.status === 'canceled') owed.data.note = `Absent: make-up planned for ${monthDay(booked.d)}`
      const note = 'That class is full now. This one has a seat open.'
      plans.push({
        student: theo,
        kind,
        at: booked,
        forSeat: makeupAt ? owed : null,
        by: 'parent',
        message: makeupAt ? 'Theo missed his class. Could he make it up?' : 'Could Theo come once more this week?',
        status: 'approved',
        seat,
        steps: [
          { action: 'asked', hoursAgo: 68, at: first },
          { action: 'offered', hoursAgo: 52, office: true, at: booked, note },
          { action: 'accepted', hoursAgo: 30, at: booked },
        ],
      })
    }
  }
  // Sophie: an extra class the office declined, with a note.
  const sophie = studentOf('sophie-novak')
  const sophieAt = sophie ? ask(choicesFor(sophie, 1, 12)[0]) : null
  if (sophie && sophieAt) {
    const decisionNote = 'The beginners’ classes are busy this week. Next week has seats.'
    plans.push({
      student: sophie,
      kind: 'extra',
      at: sophieAt,
      forSeat: null,
      by: 'parent',
      message: 'Could Sophie come twice this week?',
      status: 'rejected',
      decisionNote,
      steps: [
        { action: 'asked', hoursAgo: 52, at: sophieAt },
        { action: 'rejected', hoursAgo: 30, office: true, note: decisionNote },
      ],
    })
  }

  // Classes, then their seats ------------------------------------------------------
  // A note for the coaches on a few classes in the coming week.
  const topAhead = days.find((d) => d >= today && isOpen(d) && slotsOn(d).some((x) => x.block.band === 'top')) ?? null
  const noteFor = (d: DateKey, slot: Slot) => {
    if (d < today || d > addDays(today, 7)) return ''
    if ((inClass.get(`${d}|${slot.key}`) ?? []).some((x) => x.kind === 'trial')) return 'A trial visit: safety and range commands first.'
    if (d === topAhead && slot.block.band === 'top') return 'Standing this week: holding drills first, then 20 shots on SIUS.'
    return ''
  }
  let classes = 0
  for (const d of days) {
    if (!isOpen(d)) continue
    for (const slot of slotsOn(d)) {
      add(`${COL.classes}/${classIdOf(d, slot)}`, {
        dateKey: d,
        weekday: weekdayOf(d),
        startMin: slot.block.startMin,
        endMin: slot.block.endMin,
        startAt: toInstant(d, slot.block.startMin, timezone),
        endAt: toInstant(d, slot.block.endMin, timezone),
        dayEndAt: dayEndInstant(d, timezone),
        seats,
        note: noteFor(d, slot),
        source: 'seed',
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
        ...stamp,
      })
      classes++
    }
  }
  for (const seat of [...made].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || String(a.data.classId).localeCompare(String(b.data.classId)) || Number(a.data.visualOrder) - Number(b.data.visualOrder))) {
    add(`${COL.sessions}/${seat.id}`, seat.data)
  }
  // Each class's seats taken, as the server keeps them (functions/src/requests.ts), so families see open seats at once.
  for (const d of days) {
    if (!isOpen(d)) continue
    for (const slot of slotsOn(d)) {
      const id = classIdOf(d, slot)
      add(`${COL.classSeats}/${id}`, {
        dateKey: d,
        startMin: slot.block.startMin,
        endMin: slot.block.endMin,
        startAt: toInstant(d, slot.block.startMin, timezone),
        seats,
        taken: taken(d, slot),
        isDeleted: false,
      })
    }
  }

  // Students, with dates the app keeps up to date ------------------------------
  let parents = 0
  const familyParents = new Map<string, { name: string; email: string; phone: string; relation: string }[]>()
  STUDENTS.forEach((s, i) => {
    const id = sampleStudentId(s.key)
    const name = `${s.first} ${s.last}`
    const own = made.filter((m) => m.student.key === s.key)
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
      rifle: s.rifle ?? null,
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

  // Student sign-ins: their own email, linked to their own record.
  for (const key of STUDENT_LOGINS) {
    const s = STUDENTS.find((x) => x.key === key)
    if (!s) continue
    const email = sampleEmail(s.first, s.last)
    add(`${COL.members}/${email}`, {
      ...newMemberData({ email, displayName: `${s.first} ${s.last}`, role: 'student', studentId: sampleStudentId(s.key), createdBy: SAMPLE_AUTHOR }),
      createdAt: now,
      updatedAt: now,
    })
  }

  // The families' requests planned above, asked by the parent who signs in (or the student), answered by the manager.
  const office = { email: SAMPLE_MANAGER.email, name: SAMPLE_MANAGER.name }
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000)
  const timeOf = (x: Choice) => ({ classId: classIdOf(x.d, x.slot), dateKey: x.d, startMin: x.slot.block.startMin, endMin: x.slot.block.endMin })
  const startOf = (x: Choice) => toInstant(x.d, x.slot.block.startMin, timezone)
  let requests = 0
  for (const p of plans) {
    const s = p.student
    const parent = familyParents.get(s.family ?? s.key)?.[0]
    const family = p.by === 'student' ? { email: sampleEmail(s.first, s.last), name: `${s.first} ${s.last}`, role: 'student' as const } : parent ? { email: parent.email, name: parent.name, role: 'parent' as const } : null
    if (!family) continue
    const history = p.steps.map((st, i) => {
      // The ask carries the family's message.
      const note = st.note ?? (i === 0 ? p.message : '')
      return { action: st.action, at: hoursAgo(st.hoursAgo), by: st.office ? { ...office, role: 'admin' } : family, ...(st.at ? timeOf(st.at) : {}), ...(note ? { note } : {}) }
    })
    const last = p.steps[p.steps.length - 1]
    const decided = p.status === 'approved' || p.status === 'rejected'
    add(`${COL.classRequests}/${SAMPLE_PREFIX}request-${s.key}`, {
      kind: p.kind,
      studentId: sampleStudentId(s.key),
      studentName: `${s.first} ${s.last}`,
      ...timeOf(p.at),
      startAt: startOf(p.at),
      forSessionId: p.forSeat?.id ?? null,
      forDateKey: p.forSeat?.dateKey ?? null,
      message: p.message,
      status: p.status,
      requestedBy: family,
      createdAt: hoursAgo(p.steps[0].hoursAgo),
      updatedAt: hoursAgo(last.hoursAgo),
      decidedAt: decided ? hoursAgo(last.hoursAgo) : null,
      // The office's answer, or the family member who accepted the time suggested.
      decidedBy: decided ? (last.office ? office : { email: family.email, name: family.name }) : null,
      decisionNote: p.decisionNote ?? '',
      sessionId: p.seat?.id ?? null,
      offer: p.offer ? { ...timeOf(p.offer.at), startAt: startOf(p.offer.at), note: p.offer.note, by: office, at: hoursAgo(p.offer.hoursAgo) } : null,
      history,
    })
    requests++
  }

  // Time entries: everyone in clocks in when their hours start, give or take five minutes, and out a little after.
  let shifts = 0
  const shift = (st: SampleStaff, d: DateKey, inMin: number, outMin: number) => {
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
    })
  }
  let lastDanielDay: DateKey | null = null
  for (const d of days) {
    if (d >= today || !isOpen(d)) continue
    for (const st of STAFF) {
      const ranges = hoursIn(st, d)
      if (!ranges) continue
      const inMin = ranges[0].startMin - 5 + Math.floor(chance(d, st.key, 'in') * 3) * 5
      const outMin = ranges[ranges.length - 1].endMin + 5 + Math.floor(chance(d, st.key, 'out') * 3) * 5
      shift(st, d, inMin, outMin)
      if (st.key === 'daniel-reed') lastDanielDay = d
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
      families: false,
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
  // The match and the closed day are shown to families too (parents and students), the staff's welcome isn't.
  post('a-match', 6, {
    title: 'Fall junior match: sign-ups are open',
    category: 'Tournaments',
    contentHtml: '<p>The fall junior match is next month. Marksman and higher students can sign up at the front desk until the end of next week.</p>',
    contentText: 'The fall junior match is next month. Marksman and higher students can sign up at the front desk until the end of next week.',
    families: true,
  })
  post('a-thanksgiving', 2, {
    title: 'Closed on Thanksgiving Day',
    category: 'Updates',
    contentHtml: '<p>The academy is closed on Thanksgiving Day. Classes that day move to makeups; check your schedule.</p>',
    contentText: 'The academy is closed on Thanksgiving Day. Classes that day move to makeups; check your schedule.',
    families: true,
  })

  // Events -------------------------------------------------------------------------
  // `isRecurring` as the website's event dialog saves it: the schedules find one-off and repeating events by it.
  const firstSunday = days.find((d) => weekdayOf(d) === 'sunday') ?? today
  add(`${COL.events}/${SAMPLE_PREFIX}e-range-practice`, {
    title: 'Range Practice',
    dateKey: firstSunday,
    startMin: 1050,
    endMin: 1170,
    notes: 'Open practice for enrolled students.',
    recurrence: { frequency: 'weekly', interval: 1, weekdays: ['sunday'], monthDay: null, ends: { type: 'never', endDate: null, occurrences: null } },
    isRecurring: true,
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
    isRecurring: false,
    ...stamp,
  })

  const count = (kind: Seat['kind']) => made.filter((m) => m.kind === kind).length
  const summary: SampleSummary = {
    staff: STAFF.length,
    students: STUDENTS.length,
    parents,
    classes,
    seats: made.length,
    makeups: count('makeup'),
    practice: count('practice'),
    trials: count('trial'),
    whosIn,
    shifts,
    requests,
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
    summary: `Added sample data: ${summary.staff} staff, ${summary.students} students, ${summary.classes} classes with ${summary.seats} seats`,
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
