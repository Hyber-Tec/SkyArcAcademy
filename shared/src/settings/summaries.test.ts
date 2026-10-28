import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type BranchSettings } from './defaults'
import {
  activitySummary,
  agoWords,
  availabilitySummary,
  classesSummary,
  compactRange,
  contractSummary,
  durationWords,
  hoursSummary,
  noticesSummary,
  paySummary,
  signupSummary,
  studentsSummary,
  weekHoursSummary,
} from './summaries'

const with_ = (patch: (s: BranchSettings) => void) => {
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as BranchSettings
  patch(s)
  return s
}

describe('the Settings home’s sentences', () => {
  it('says time ranges short', () => {
    expect(compactRange(960, 1260)).toBe('4–9 PM')
    expect(compactRange(990, 1080)).toBe('4:30–6 PM')
    expect(compactRange(660, 780)).toBe('11 AM–1 PM')
  })

  it('says the usual week in the academy’s order, open days first', () => {
    expect(weekHoursSummary(DEFAULT_SETTINGS.schedule.defaultWeek, 'monday')).toBe('Mon–Thu 4–9 PM · Sun 1–6 PM · Fri, Sat closed')
    expect(weekHoursSummary(DEFAULT_SETTINGS.schedule.defaultWeek, 'sunday')).toBe('Sun 1–6 PM · Mon–Thu 4–9 PM · Fri, Sat closed')
    const shut = Object.fromEntries(Object.entries(DEFAULT_SETTINGS.schedule.defaultWeek).map(([d, h]) => [d, { ...h, isOpen: false }]))
    expect(weekHoursSummary(shut as BranchSettings['schedule']['defaultWeek'], 'monday')).toBe('Closed every day')
  })

  it('adds the next date with other hours', () => {
    expect(hoursSummary(DEFAULT_SETTINGS, [])).toContain('No closed days or other hours coming up')
    const dated = [
      { dateKey: '2026-12-24', isOpen: false, openMin: 960, closeMin: 1260 },
      { dateKey: '2026-11-26', isOpen: false, openMin: 960, closeMin: 1260 },
      { dateKey: '2026-12-31', isOpen: true, openMin: 960, closeMin: 1140 },
    ]
    expect(hoursSummary(DEFAULT_SETTINGS, dated)).toBe('Mon–Thu 4–9 PM · Sun 1–6 PM · Fri, Sat closed. Next: Thu, Nov 26, closed (and 2 more).')
  })

  it('says the classes, the availability and the pay as set', () => {
    expect(classesSummary(DEFAULT_SETTINGS, { seatsPerClass: 6 })).toBe('Families cancel up to 24 hours before a class and ask for open seats 14 days ahead. A new class: 1 hour, 6 seats.')
    expect(availabilitySummary(DEFAULT_SETTINGS)).toBe('Coaches’ days lock 7 days ahead. Coaches set their days 7 days ahead, with a warning when they’re late.')
    expect(paySummary(DEFAULT_SETTINGS)).toBe('Paid from 30 minutes before the first class to the end of the last, every two weeks. Rates are on each person’s page.')
    expect(paySummary(with_((s) => ((s.timeClock.payEndsAtLastClass = false), (s.payroll.payPeriod.type = 'monthly'))))).toBe(
      'Paid from 30 minutes before the first class to the clock-out, every month. Rates are on each person’s page.',
    )
  })

  it('says the students, the sign-up page, the notices and the contract', () => {
    expect(studentsSummary(DEFAULT_SETTINGS)).toBe('9 levels, 4 programs. Paused after 20 days without classes.')
    expect(signupSummary(DEFAULT_SETTINGS)).toBe('Open to coaches and parents.')
    expect(signupSummary(with_((s) => (s.signup.roles = ['coach', 'parent', 'student'])))).toBe('Open to coaches, parents and students.')
    expect(signupSummary(with_((s) => (s.signup.enabled = false)))).toBe('Closed: nobody can ask for access.')
    expect(noticesSummary(DEFAULT_SETTINGS)).toBe('Coaches hear of class changes within 24 hours. The office is reminded of first classes. 3 post categories.')
    expect(contractSummary(false)).toContain('No contract uploaded yet')
    expect(durationWords(90)).toBe('1 h 30 min')
  })

  it('says when the last change was', () => {
    const now = Date.UTC(2026, 9, 28, 20)
    expect(activitySummary(null, now)).toContain('who and when')
    expect(activitySummary({ summary: 'Updated Pay & time clock settings', who: 'Goo C.', atMs: now - 3 * 3_600_000 }, now)).toBe('Last: Updated Pay & time clock settings (Goo C., 3 h ago).')
    expect(agoWords(30_000)).toBe('just now')
    expect(agoWords(2 * 86_400_000)).toBe('2 days ago')
  })
})
