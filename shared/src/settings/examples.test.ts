import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type BranchSettings } from './defaults'
import {
  arrivalExample,
  autoClockOutExample,
  autoStatusExample,
  cancelExample,
  changeWindowExample,
  classLengthExample,
  leadExample,
  lockExample,
  payEndExample,
  payPeriodExample,
  requestsExample,
} from './examples'

const with_ = (patch: (s: BranchSettings) => void) => {
  const s = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as BranchSettings
  patch(s)
  return s
}
const TODAY = '2026-10-28'

describe('each setting’s example', () => {
  it('works out when a coach is paid from, as the pay rule does', () => {
    expect(arrivalExample(DEFAULT_SETTINGS)).toBe('For a 4:00 PM class: in at 3:21 → paid from 3:30 PM; in at 3:55 → paid from 3:55 PM. The clock-in stays as it was.')
    expect(arrivalExample(with_((s) => (s.timeClock.arrivalMinutes = 15)))).toContain('in at 3:21 → paid from 3:45 PM')
    expect(arrivalExample(with_((s) => (s.timeClock.arrivalMinutes = 0)))).toContain('in at 3:55 → paid from 4:00 PM')
  })

  it('works out the end of paid time and the forgotten clock-out', () => {
    expect(payEndExample(DEFAULT_SETTINGS)).toContain('paid until 8:00')
    expect(payEndExample(with_((s) => (s.timeClock.payEndsAtLastClass = false)))).toContain('paid until 8:10')
    expect(autoClockOutExample(DEFAULT_SETTINGS)).toBe('Anyone still clocked in at 12:00 AM is clocked out then, and Home lists them so the office can put in the real time.')
    expect(autoClockOutExample(with_((s) => (s.timeClock.autoClockOut.enabled = false)))).toContain('stays open')
    expect(autoClockOutExample(with_((s) => (s.timeClock.autoClockOut.atLastClass = true)))).toContain('when their last class ends')
  })

  it('shows this pay period and the next', () => {
    expect(payPeriodExample(DEFAULT_SETTINGS, TODAY)).toBe('This period: Oct 25 – Nov 7. Next: Nov 8 – Nov 21.')
    expect(payPeriodExample(with_((s) => (s.payroll.payPeriod.type = 'semimonthly')), TODAY)).toBe('This period: Oct 16 – Oct 31. Next: Nov 1 – Nov 15.')
  })

  it('works out the cancel cut-off for a Tuesday 5:00 PM class', () => {
    expect(cancelExample(DEFAULT_SETTINGS)).toBe('A Tuesday class at 5:00 PM can be canceled in the app until Monday at 5:00 PM. Then the class turns Confirmed and the Cancel button goes away.')
    expect(cancelExample(with_((s) => (s.schedule.autoConfirm.hoursBefore = 2)))).toContain('until Tuesday at 3:00 PM')
    expect(cancelExample(with_((s) => (s.schedule.autoConfirm.hoursBefore = 48)))).toContain('until Sunday at 5:00 PM')
    expect(cancelExample(with_((s) => (s.schedule.autoConfirm.hoursBefore = 30)))).toContain('until Monday at 11:00 AM')
    expect(cancelExample(with_((s) => (s.schedule.autoConfirm.enabled = false)))).not.toContain('Confirmed')
  })

  it('works out the days ahead families, coaches and locks see', () => {
    expect(requestsExample(DEFAULT_SETTINGS, TODAY)).toContain('through Wed, Nov 11')
    expect(lockExample(DEFAULT_SETTINGS, TODAY)).toContain('Today (Wed, Oct 28), Oct 28 – Nov 3 are locked')
    expect(lockExample(with_((s) => (s.availability.lockWindowDays = 0)), TODAY)).toContain('Only today and past days')
    expect(leadExample(DEFAULT_SETTINGS, TODAY)).toContain('through Wed, Nov 4 should be set')
    expect(leadExample(with_((s) => (s.availability.leadTimeEnforcement = 'block')), TODAY)).toContain('lock too')
  })

  it('says how long a new class runs, statuses and coaches’ notices', () => {
    expect(classLengthExample(DEFAULT_SETTINGS)).toBe('A class added at 5:00 PM runs 5–6 PM.')
    expect(classLengthExample(with_((s) => (s.schedule.defaultSessionMinutes = 90)))).toBe('A class added at 5:00 PM runs 5–6:30 PM.')
    expect(autoStatusExample(DEFAULT_SETTINGS)).toContain('Paused after 20 days')
    expect(changeWindowExample(DEFAULT_SETTINGS)).toContain('next 24 hours')
  })
})
