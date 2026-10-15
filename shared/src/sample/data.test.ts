import { describe, expect, it } from 'vitest'
import { isReservedEmail } from '../brand'
import { DEFAULT_SETTINGS } from '../settings/defaults'
import { addDays, diffDays, toInstant, weekdayOf } from '../time'
import { SAMPLE_AUTHOR, SAMPLE_EMAIL_DOMAIN, SAMPLE_PREFIX, buildSampleData } from './data'

const TZ = 'America/New_York'
const TODAY = '2026-10-15'
const opts = {
  academyId: 'skyarc',
  timezone: TZ,
  today: TODAY,
  now: toInstant(TODAY, 15 * 60, TZ),
  week: DEFAULT_SETTINGS.schedule.defaultWeek,
  levels: DEFAULT_SETTINGS.students.levels,
  programs: DEFAULT_SETTINGS.students.programs,
  maxStudentsPerCoach: 6,
}
const { docs, summary } = buildSampleData(opts)
const of = (col: string) => docs.filter((d) => d.path.split('/')[2] === col && d.path.split('/').length === 4)
const classes = of('sessions').map((d) => d.data)

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

  it('books classes only inside opening hours, never on Thanksgiving', () => {
    for (const c of classes) {
      const hours = opts.week[weekdayOf(c.dateKey as string)]
      expect(hours.isOpen).toBe(true)
      expect(c.startMin as number).toBeGreaterThanOrEqual(hours.openMin)
      expect(c.endMin as number).toBeLessThanOrEqual(hours.closeMin)
      expect(c.dateKey).not.toBe('2026-11-26')
    }
    expect(of('dayConfigs').map((d) => d.data.dateKey)).toEqual(['2026-11-26'])
  })

  it('seats a student once a day and never more than five in a block', () => {
    const perDay = new Map<string, number>()
    const perBlock = new Map<string, number>()
    for (const c of classes) {
      const day = `${c.studentId}|${c.dateKey}`
      perDay.set(day, (perDay.get(day) ?? 0) + 1)
      // Trials sit inside an hour block: count them with it.
      const block = `${c.coachId}|${c.dateKey}|${c.note && String(c.note).startsWith('Trial') ? (c.endMin as number) - 60 : c.startMin}`
      if (c.status !== 'canceled') perBlock.set(block, (perBlock.get(block) ?? 0) + 1)
    }
    expect(Math.max(...perDay.values())).toBe(1)
    expect(Math.max(...perBlock.values())).toBeLessThanOrEqual(5)
  })

  it('keeps the top levels in the 90-minute Precision blocks', () => {
    const top = new Set(of('students').filter((d) => ['Expert', 'Precision'].includes(String(d.data.level))).map((d) => d.path.split('/')[3]))
    expect(top.size).toBeGreaterThan(2)
    for (const c of classes.filter((x) => top.has(String(x.studentId)))) expect((c.endMin as number) - (c.startMin as number)).toBe(90)
  })

  it('makes up missed classes within 16 days before to 18 after, and books trials ahead as 30 minutes', () => {
    const makeups = classes.filter((c) => String(c.note).startsWith('MU for '))
    expect(makeups.length).toBeGreaterThan(3)
    for (const m of makeups) {
      const [month, day] = String(m.note).slice('MU for '.length).split('/').map(Number)
      const missed = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const gap = diffDays(missed, String(m.dateKey))
      expect(gap).toBeGreaterThanOrEqual(-16)
      expect(gap).toBeLessThanOrEqual(18)
    }
    const trials = classes.filter((c) => String(c.note).startsWith('Trial'))
    expect(trials).toHaveLength(6)
    for (const t of trials) {
      expect((t.endMin as number) - (t.startMin as number)).toBe(30)
      expect(String(t.dateKey) > TODAY).toBe(true)
    }
  })

  it('gives every class a coach who is available that day, except one sick day to move', () => {
    const avail = new Map(of('availability').map((d) => [`${d.data.staffId}|${d.data.dateKey}`, d.data]))
    const conflicts = classes.filter((c) => {
      const a = avail.get(`${c.coachId}|${c.dateKey}`)
      return !a || a.unavailable === true
    })
    expect(conflicts.length).toBeGreaterThan(0)
    expect(new Set(conflicts.map((c) => `${c.coachId}|${c.dateKey}`)).size).toBe(1)
    expect(String(conflicts[0].dateKey) > addDays(TODAY, 7)).toBe(true)
  })

  it('covers the people and history the app shows', () => {
    expect(summary).toMatchObject({ staff: 5, students: 35 })
    expect(summary.classes).toBeGreaterThan(300)
    expect(summary.shifts).toBeGreaterThan(40)
    expect(of('members').filter((d) => d.data.role === 'parent').length).toBe(7)
    // One shift was closed by the automatic clock-out within the last week.
    expect(of('clockShifts').filter((d) => d.data.autoClosed === true)).toHaveLength(1)
  })
})
