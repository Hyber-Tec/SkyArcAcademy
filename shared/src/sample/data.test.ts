import { describe, expect, it } from 'vitest'
import { isReservedEmail } from '../brand'
import { coachesIn, seatKind } from '../schedule/classes'
import { type ClassRequest, type RequestClass, type RequestSeat, isOpenRequest, offerCheck, requestCheck, requestHistory, seatLabelFor } from '../schedule/requests'
import type { SessionStatus } from '../settings/defaults'
import { DEFAULT_SETTINGS } from '../settings/defaults'
import { addDays, diffDays, parseDateKey, toInstant, weekdayOf } from '../time'
import type { Availability } from '../types'
import { SAMPLE_AUTHOR, SAMPLE_EMAIL_DOMAIN, SAMPLE_PREFIX, type SampleDoc, buildSampleData } from './data'

const TZ = 'America/New_York'
const TODAY = '2026-10-15'
const week = DEFAULT_SETTINGS.schedule.defaultWeek
const opts = {
  academyId: 'skyarc',
  timezone: TZ,
  today: TODAY,
  now: toInstant(TODAY, 15 * 60, TZ),
  week,
  levels: DEFAULT_SETTINGS.students.levels,
  programs: DEFAULT_SETTINGS.students.programs,
  seatsPerClass: 6,
}
const { docs, summary } = buildSampleData(opts)
const of = (col: string) => docs.filter((d) => d.path.split('/')[2] === col && d.path.split('/').length === 4)
const idOf = (path: string) => path.split('/')[3]

interface ClassRow {
  id: string
  dateKey: string
  startMin: number
  endMin: number
  seats: number
  note: string
}
interface SeatRow {
  id: string
  classId: string
  coachId: string
  coachName: string
  studentId: string
  note: string
  status: SessionStatus
  dateKey: string
  startMin: number
  endMin: number
  visualOrder: number
}
const classes = of('classes').map((d) => ({ ...d.data, id: idOf(d.path) })) as unknown as ClassRow[]
const seats = of('sessions').map((d) => ({ ...d.data, id: idOf(d.path) })) as unknown as SeatRow[]
const availability = of('availability').map((d) => d.data) as unknown as Availability[]
const classOf = new Map(classes.map((c) => [c.id, c]))
const seatsOf = (c: ClassRow) => seats.filter((s) => s.classId === c.id)
const inUse = (list: readonly SeatRow[]) => list.filter((s) => s.status !== 'canceled')
const levelOf = new Map(of('students').map((d) => [idOf(d.path), String(d.data.level)]))
const level = (s: SeatRow) => levelOf.get(s.studentId)
const t = (h: number, m = 0) => h * 60 + m
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
const dayOf = (dateKey: string) => availability.filter((a) => a.dateKey === dateKey)
const coachesFor = (c: ClassRow) => coachesIn(c, dayOf(c.dateKey), week[weekdayOf(c.dateKey)])

describe('sample data', () => {
  it('is the same on every run', () => {
    expect(JSON.stringify(buildSampleData(opts).docs)).toBe(JSON.stringify(docs))
  })

  it('can be told apart from real data, so it can all be removed', () => {
    for (const d of docs) {
      const [, , col, id] = d.path.split('/')
      if (col === 'members') expect(id.endsWith(`@${SAMPLE_EMAIL_DOMAIN}`)).toBe(true)
      else if (col === 'dayConfigs') expect(d.data.createdBy).toBe(SAMPLE_AUTHOR)
      else expect(id.startsWith(SAMPLE_PREFIX)).toBe(true)
    }
  })

  it('never emails anyone', () => {
    const emails = JSON.stringify(docs).match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? []
    expect(emails.length).toBeGreaterThan(50)
    for (const e of emails) expect(isReservedEmail(e)).toBe(true)
  })

  it('runs the academy’s weekly classes inside its opening hours, never on Thanksgiving', () => {
    for (const c of classes) {
      const hours = week[weekdayOf(c.dateKey)]
      expect(hours.isOpen).toBe(true)
      expect(c.startMin).toBeGreaterThanOrEqual(hours.openMin)
      expect(c.endMin).toBeLessThanOrEqual(hours.closeMin)
      expect(c.dateKey).not.toBe('2026-11-26')
      expect(c.seats).toBe(6)
    }
    expect(of('dayConfigs').map((d) => d.data.dateKey)).toEqual(['2026-11-26'])
    // As on the sheets: Sunday 2, 3:30 and 5 PM; Monday 4:30, 6 and 7; Tuesday to Thursday 5, 6 and 7.
    const times = (list: readonly ClassRow[], from: string, to: string) =>
      list.filter((c) => c.dateKey >= from && c.dateKey <= to).map((c) => `${weekdayOf(c.dateKey).slice(0, 3)} ${hm(c.startMin)}-${hm(c.endMin)}`)
    expect(times(classes, '2026-10-18', '2026-10-24')).toEqual([
      'sun 14:00-15:30',
      'sun 15:30-17:00',
      'sun 17:00-18:00',
      'mon 16:30-18:00',
      'mon 18:00-19:00',
      'mon 19:00-20:00',
      'tue 17:00-18:00',
      'tue 18:00-19:00',
      'tue 19:00-20:00',
      'wed 17:00-18:00',
      'wed 18:00-19:00',
      'wed 19:00-20:00',
      'thu 17:00-18:00',
      'thu 18:00-19:00',
      'thu 19:00-20:30',
    ])
    // Sunday's last class runs when the academy is open until 7 PM.
    const late = buildSampleData({ ...opts, week: { ...week, sunday: { isOpen: true, openMin: t(13), closeMin: t(19) } } })
    const lateClasses = late.docs.filter((d) => d.path.split('/')[2] === 'classes').map((d) => d.data) as unknown as ClassRow[]
    expect(times(lateClasses, '2026-10-18', '2026-10-18')).toEqual(['sun 14:00-15:30', 'sun 15:30-17:00', 'sun 17:00-18:00', 'sun 18:00-19:00'])
  })

  it('seats four or five students in most classes, never more than six, each student once a day', () => {
    const counts = classes.map((c) => inUse(seatsOf(c)).length)
    expect(Math.max(...counts)).toBeLessThanOrEqual(6)
    expect(counts.filter((n) => n === 4 || n === 5).length / counts.length).toBeGreaterThan(0.6)
    const average = counts.reduce((a, b) => a + b, 0) / counts.length
    expect(average).toBeGreaterThan(4)
    expect(average).toBeLessThan(5)
    // Each seat is in its class: that day, inside its time, in its place, and with no coach of its own.
    for (const s of seats) {
      const c = classOf.get(s.classId)
      expect(c).toBeDefined()
      expect(s.dateKey).toBe(c!.dateKey)
      expect(s.startMin).toBeGreaterThanOrEqual(c!.startMin)
      expect(s.endMin).toBeLessThanOrEqual(c!.endMin)
      expect([s.coachId, s.coachName]).toEqual(['', ''])
    }
    for (const c of classes) expect(seatsOf(c).map((s) => s.visualOrder).sort((a, b) => a - b)).toEqual(seatsOf(c).map((_, i) => i))
    const perDay = new Map<string, number>()
    for (const s of seats) perDay.set(`${s.studentId}|${s.dateKey}`, (perDay.get(`${s.studentId}|${s.dateKey}`) ?? 0) + 1)
    expect(Math.max(...perDay.values())).toBe(1)
  })

  it('groups students by level as the sheets do: the top level together, the beginners together, the youngest for half an hour', () => {
    const top = (c: ClassRow) => ['sunday 840', 'monday 990', 'thursday 1140'].includes(`${weekdayOf(c.dateKey)} ${c.startMin}`)
    for (const s of seats) {
      const c = classOf.get(s.classId)!
      if (top(c)) expect(level(s)).toBe('Precision')
      // The top level comes to other classes only to practice.
      else if (level(s) === 'Precision') expect(s.note).toBe('Practice')
    }
    const beginner = (s: SeatRow) => ['Discovery', 'Scout', 'Hunter', 'null'].includes(String(level(s)))
    for (const c of classes) {
      const list = seatsOf(c)
      if (list.some(beginner)) expect(list.every(beginner)).toBe(true)
    }
    const youngest = seats.filter((s) => level(s) === 'Discovery')
    expect(youngest.length).toBeGreaterThan(5)
    for (const s of youngest) {
      const c = classOf.get(s.classId)!
      expect([s.startMin, s.endMin]).toEqual([c.endMin - 30, c.endMin])
    }
  })

  it('labels make-ups, practice and trials in the sheets’ words', () => {
    const md = (d: string) => `${parseDateKey(d).month}/${parseDateKey(d).day}`
    const makeups = seats.filter((s) => seatKind(s.note) === 'makeup')
    expect(makeups.length).toBeGreaterThan(10)
    for (const m of makeups) {
      const [month, day] = m.note.slice('MU for '.length).split('/').map(Number)
      const missedOn = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const gap = diffDays(missedOn, m.dateKey)
      expect(gap).toBeGreaterThanOrEqual(-16)
      expect(gap).toBeLessThanOrEqual(18)
      // The class it makes up was the student's, missed; a canceled one says when it's made up.
      const missed = seats.find((s) => s.studentId === m.studentId && s.dateKey === missedOn)!
      expect(['canceled', 'no_show']).toContain(missed.status)
      if (missed.status === 'canceled') expect(missed.note).toMatch(new RegExp(`^Absent: (made up on|make-up planned for) ${md(m.dateKey)}$`))
    }
    expect(seats.filter((s) => s.status === 'canceled' && s.note === 'Absent').length).toBeGreaterThan(5)
    expect(seats.filter((s) => s.note === 'Practice').length).toBeGreaterThan(10)
    // Trials: two visits ahead for each new student, the first the class's last half hour, the second all of it.
    const trials = seats.filter((s) => seatKind(s.note) === 'trial')
    expect(trials.map((s) => s.note).sort()).toEqual(['Trial 1', 'Trial 1', 'Trial 1', 'Trial 2', 'Trial 2', 'Trial 2'])
    for (const s of trials) {
      const c = classOf.get(s.classId)!
      expect(s.dateKey > TODAY).toBe(true)
      expect([s.startMin, s.endMin]).toEqual(s.note === 'Trial 1' ? [c.endMin - 30, c.endMin] : [c.startMin, c.endMin])
      if (s.dateKey <= addDays(TODAY, 7)) expect(c.note).toMatch(/trial/i)
    }
  })

  it('has coaches in for every class (three on Mondays until 6 PM), the manager every open day, but one class ahead', () => {
    // Joel is away one Tuesday ahead and Daniel leaves at 7 PM: that day's last class has no coach yet.
    const none = classes.filter((c) => coachesFor(c).length === 0)
    expect(none).toHaveLength(1)
    expect(weekdayOf(none[0].dateKey)).toBe('tuesday')
    expect(none[0].dateKey > addDays(TODAY, 7)).toBe(true)
    expect(none[0].startMin).toBe(t(19))
    expect(dayOf(none[0].dateKey).filter((a) => a.unavailable).map((a) => a.staffName)).toContain('Joel Kwon')
    const coaches = (dateKey: string, startMin: number) => coachesFor(classes.find((c) => c.dateKey === dateKey && c.startMin === startMin)!).map((k) => k.name)
    expect(coaches('2026-10-19', t(16, 30))).toEqual(['Daniel Reed', 'Elena Webb', 'Hannah Moreno'])
    expect(coaches('2026-10-19', t(18))).toEqual(['Daniel Reed', 'Hannah Moreno'])
    expect(coaches('2026-10-20', t(17))).toEqual(['Daniel Reed', 'Joel Kwon'])
    expect(coaches('2026-10-22', t(19))).toEqual(['Daniel Reed', 'Hannah Moreno'])
    // Sundays: Elena every week, and Daniel, Hannah and Joel in turn.
    const openDays = [...new Set(classes.map((c) => c.dateKey))]
    const sundays = openDays.filter((d) => weekdayOf(d) === 'sunday').map((d) => coachesFor(classes.find((c) => c.dateKey === d)!).map((k) => k.name))
    for (const names of sundays) {
      expect(names).toHaveLength(2)
      expect(names).toContain('Elena Webb')
    }
    expect(new Set(sundays.map((names) => names.find((n) => n !== 'Elena Webb'))).size).toBe(3)
    // The manager is in every open day, but doesn't teach; every record says whose it is and their role.
    for (const d of openDays) expect(dayOf(d).find((a) => a.staffName === 'Paige Sutton')).toMatchObject({ staffRole: 'admin', unavailable: false })
    for (const a of availability) {
      expect(a.staffName).toBeTruthy()
      expect(['coach', 'admin']).toContain(a.staffRole)
    }
    // Daniel hasn't answered for his Sundays off yet: they're still to set.
    expect(availability.some((a) => a.staffName === 'Daniel Reed' && a.unavailable)).toBe(false)
    expect(availability.some((a) => a.staffName === 'Hannah Moreno' && a.unavailable && a.dateKey > TODAY)).toBe(true)
  })

  it('clocks in whoever was in, at their hours', () => {
    const shifts = of('clockShifts').map((d) => d.data)
    const wasIn = availability.filter((a) => a.dateKey < TODAY && !a.unavailable)
    expect(shifts).toHaveLength(wasIn.length)
    for (const s of shifts) {
      const a = wasIn.find((x) => x.staffId === s.staffId && x.dateKey === s.dateKey)
      expect(a).toBeDefined()
      expect(Math.abs(Number(s.inMin) - a!.ranges[0].startMin)).toBeLessThanOrEqual(5)
      if (s.autoClosed) continue
      const after = Number(s.outMin) - a!.ranges[a!.ranges.length - 1].endMin
      expect(after).toBeGreaterThanOrEqual(5)
      expect(after).toBeLessThanOrEqual(15)
    }
    // One shift was closed by the automatic clock-out within the last week.
    expect(shifts.filter((s) => s.autoClosed === true)).toHaveLength(1)
  })

  it('covers the people and history the app shows', () => {
    expect(summary).toMatchObject({ staff: 5, students: 39, classes: classes.length, seats: seats.length, trials: 6 })
    expect(summary.classes).toBeGreaterThan(140)
    expect(summary.seats).toBeGreaterThan(600)
    expect(summary.shifts).toBeGreaterThan(60)
    expect(summary.whosIn).toBe(availability.filter((a) => !a.unavailable).length)
    expect(of('members').filter((d) => d.data.role === 'parent').length).toBe(7)
    // Students with their own sign-in, each linked to their own record.
    const own = of('members').filter((d) => d.data.role === 'student')
    expect(own.length).toBe(3)
    for (const m of own) expect(of('students').some((st) => st.path.endsWith(`/${String(m.data.studentId)}`))).toBe(true)
    // The people the stores' review logins sign in as (scripts/review-logins.ts) are still here.
    const members = of('members').map((d) => idOf(d.path))
    for (const who of ['paige.sutton', 'daniel.reed', 'jiyeon.hwang', 'seoyeon.lim']) expect(members).toContain(`${who}@${SAMPLE_EMAIL_DOMAIN}`)
    // Most students use one of the academy's rifles, by its code; the top level shoot their own.
    const students = of('students').map((d) => d.data)
    expect(students.filter((s) => s.rifle).length).toBeGreaterThan(25)
    expect(students.filter((s) => s.level === 'Precision').every((s) => s.rifle === null)).toBe(true)
  })

  it('has events the schedules find: one-off or repeating, as the website saves them', () => {
    const events = of('events').map((d) => d.data)
    expect(events.length).toBe(2)
    for (const e of events) expect(e.isRecurring).toBe(e.recurrence !== null)
  })

  it('leaves most classes in the coming weeks a seat or two for families to ask for', () => {
    const ahead = classes.filter((c) => c.dateKey >= TODAY && c.dateKey <= addDays(TODAY, 14))
    const open = ahead.map((c) => c.seats - inUse(seatsOf(c)).length)
    expect(open.filter((n) => n === 1 || n === 2).length / ahead.length).toBeGreaterThan(0.6)
    expect(open.filter((n) => n === 0).length / ahead.length).toBeLessThan(0.2)
    // The seats taken families see are the classes' own.
    for (const d of of('classSeats')) expect(d.data.taken).toBe(inUse(seatsOf(classOf.get(idOf(d.path))!)).length)
  })
})

describe('the sample families’ requests', () => {
  type Row = ClassRequest & { id: string }
  /** The requests of a sample built on `today`, and what the server's checks read about them. */
  function requestsOn(today: string) {
    const now = toInstant(today, 15 * 60, TZ)
    const built = today === TODAY ? docs : buildSampleData({ ...opts, today, now }).docs
    const rows = (col: string) => built.filter((d: SampleDoc) => d.path.split('/')[2] === col && d.path.split('/').length === 4).map((d) => ({ ...d.data, id: idOf(d.path) }))
    const requests = rows('classRequests') as unknown as Row[]
    const sessions = rows('sessions') as unknown as (SeatRow & { startAt: Date; source: string })[]
    const seatsTaken = new Map(rows('classSeats').map((c) => [c.id, c as unknown as { dateKey: string; startMin: number; endMin: number; seats: number; taken: number; startAt: Date }]))
    const target = (classId: string): RequestClass | null => {
      const c = seatsTaken.get(classId)
      return c ? { id: classId, dateKey: c.dateKey, startMin: c.startMin, endMin: c.endMin, seats: c.seats, taken: c.taken, isDeleted: false, startMs: c.startAt.getTime() } : null
    }
    const seatsOfStudent = (studentId: string): RequestSeat[] =>
      sessions.filter((s) => s.studentId === studentId).map((s) => ({ id: s.id, classId: s.classId, studentId: s.studentId, dateKey: s.dateKey, startMin: s.startMin, endMin: s.endMin, status: s.status, note: s.note, isDeleted: false, startMs: s.startAt.getTime() }))
    const facts = (r: Row, classId: string) => ({
      target: target(classId),
      seats: seatsOfStudent(r.studentId),
      pending: requests.filter((x) => x.studentId === r.studentId && x.id !== r.id && isOpenRequest(x)),
      nowMs: now.getTime(),
      today,
      settings: DEFAULT_SETTINGS,
    })
    const members = rows('members') as unknown as { id: string; role: string; studentId?: string | null; studentIds?: string[] }[]
    return { requests, sessions, target, facts, members, now }
  }

  it('has some in each state, the Hwang family’s waiting on the office and on them', () => {
    const { requests } = requestsOn(TODAY)
    const count = (status: string) => requests.filter((r) => r.status === status).length
    expect([count('pending'), count('offered'), count('approved'), count('rejected')]).toEqual([4, 1, 1, 1])
    expect(summary.requests).toBe(requests.length)
    const hwang = requests.filter((r) => r.studentId === `${SAMPLE_PREFIX}jiwoo-hwang` || r.studentId === `${SAMPLE_PREFIX}minjun-hwang`)
    expect(hwang.map((r) => r.status).sort()).toEqual(['offered', 'pending'])
    expect(new Set(requests.map((r) => r.kind))).toEqual(new Set(['makeup', 'reschedule', 'extra']))
  })

  for (const today of [TODAY, '2026-11-02', '2026-12-08', '2027-01-21', '2027-03-04', '2027-05-30']) {
    it(`are what the server would have made, on ${today}`, () => {
      const { requests, sessions, target, facts, members, now } = requestsOn(today)
      expect(requests).toHaveLength(7)
      for (const r of requests) {
        // Asked by a parent of the student, or the student, who signs in; the class is a sample class ahead.
        const m = members.find((x) => x.id === r.requestedBy.email)!
        expect(r.requestedBy.role === 'student' ? m.studentId : m.studentIds).toEqual(r.requestedBy.role === 'student' ? r.studentId : expect.arrayContaining([r.studentId]))
        expect(target(r.classId)).toMatchObject({ dateKey: r.dateKey, startMin: r.startMin, endMin: r.endMin })
        expect(r.dateKey > today && r.dateKey <= addDays(today, DEFAULT_SETTINGS.schedule.requests.daysAhead)).toBe(true)
        // Its back and forth starts with the ask, in time order, ending at its last change.
        const history = requestHistory(r)
        expect(history[0]).toMatchObject({ action: 'asked', by: r.requestedBy })
        const times = history.map((h) => (h.at as unknown as Date).getTime())
        expect([...times].sort((a, b) => a - b)).toEqual(times)
        expect(times.at(-1)).toBe((r.updatedAt as unknown as Date).getTime())
        expect(times.at(-1)!).toBeLessThan(now.getTime())
      }
      // Waiting on the office: each one a family could ask for, but one whose class filled up since.
      const pending = requests.filter((r) => r.status === 'pending')
      const checks = pending.map((r) => requestCheck({ ...facts(r, r.classId), draft: { kind: r.kind, classId: r.classId, forSessionId: r.forSessionId } }))
      expect(checks.filter((c) => !c.ok)).toEqual([{ ok: false, message: 'That class is full now. Choose another time.' }])
      // Waiting on the family: a class of the student's level the office could suggest, with seats open.
      const offered = requests.find((r) => r.status === 'offered')!
      expect(offered.offer).toMatchObject({ by: { name: 'Paige Sutton' } })
      expect(offerCheck(offered, facts(offered, offered.offer!.classId)).ok).toBe(true)
      expect(requestHistory(offered).at(-1)).toMatchObject({ action: 'offered', classId: offered.offer!.classId, note: offered.offer!.note })
      // Booked once the family accepted: its seat in the class suggested, labeled as approving labels it.
      const approved = requests.find((r) => r.status === 'approved')!
      expect(requestHistory(approved).map((h) => h.action)).toEqual(['asked', 'offered', 'accepted'])
      expect(sessions.find((s) => s.id === approved.sessionId)).toMatchObject({
        classId: approved.classId,
        studentId: approved.studentId,
        status: 'confirmed',
        source: 'request',
        note: seatLabelFor(approved.kind, approved.forDateKey),
      })
      expect(approved.decidedBy?.email).toBe(approved.requestedBy.email)
      // Declined, with a note for the family.
      const declined = requests.find((r) => r.status === 'rejected')!
      expect(declined.decisionNote).toBeTruthy()
      expect(requestHistory(declined).at(-1)).toMatchObject({ action: 'rejected', note: declined.decisionNote, by: { role: 'admin' } })
    })
  }
})
