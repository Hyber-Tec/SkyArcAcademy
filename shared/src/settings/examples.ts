import { periodContaining } from '../pay/periods'
import { payRule } from '../pay/paidTime'
import { type DateKey, WEEKDAY_LABELS, type Weekday, addDays, formatDateKey, formatMinutes, orderedWeekdays, parseHHMM } from '../time'
import type { BranchSettings } from './defaults'
import { compactRange, periodWords } from './summaries'

/**
 * A setting's effect as an example, worked out from its value (Settings, under the setting: docs/DECISIONS.md §23).
 * Pay's examples follow the pay rule itself (`payRule`), on a made-up day: classes from 4:00 to 8:00 PM.
 */

const FIRST = 16 * 60
const LAST = 20 * 60
const t = (m: number) => formatMinutes(m)

/** When a clock-in at `inMin` starts being paid, before a 4:00 PM first class. */
function paidFrom(s: BranchSettings, inMin: number): number {
  return Math.max(inMin, FIRST - payRule(s).arrivalMinutes)
}

/** "For a 4:00 PM class: in at 3:21 → paid from 3:30; in at 3:55 → paid from 3:55. The clock-in stays as it was." */
export function arrivalExample(s: BranchSettings): string {
  const early = 15 * 60 + 21
  const late = 15 * 60 + 55
  return `For a 4:00 PM class: in at 3:21 → paid from ${t(paidFrom(s, early))}; in at 3:55 → paid from ${t(paidFrom(s, late))}. The clock-in stays as it was.`
}

/** The end of paid time, for a coach whose last class ends at 8:00 and who clocks out at 8:10. */
export function payEndExample(s: BranchSettings): string {
  return payRule(s).endsAtLastClass
    ? 'Last class ends at 8:00 PM, out at 8:10 → paid until 8:00. The clock-out stays 8:10.'
    : 'Last class ends at 8:00 PM, out at 8:10 → paid until 8:10.'
}

export function autoClockOutExample(s: BranchSettings): string {
  const a = s.timeClock.autoClockOut
  if (!a.enabled) return 'A shift stays open until the person clocks out, or the office closes it.'
  const at = parseHHMM(a.localTime)
  const when = Number.isNaN(at) ? a.localTime : t(at)
  if (a.atLastClass) return `Coaches are clocked out automatically when their last class ends; on a day without classes, anyone still in is clocked out at ${when}.`
  return `Anyone still clocked in at ${when} is clocked out then, and Home lists them so the office can put in the real time.`
}

/** "This period: Oct 25 – Nov 7. Next: Nov 8 – Nov 21." */
export function payPeriodExample(s: BranchSettings, today: DateKey): string {
  const { type, anchorDate } = s.payroll.payPeriod
  const now = periodContaining(today, type, anchorDate)
  const next = periodContaining(addDays(now.end, 1), type, anchorDate)
  return `This period: ${periodWords(now)}. Next: ${periodWords(next)}.`
}

/** The day `n` days before `day` in the week. */
function dayBefore(day: Weekday, n: number): Weekday {
  const week = orderedWeekdays('sunday')
  const i = week.indexOf(day)
  return week[(((i - n) % 7) + 7) % 7]
}

/** "A Tuesday class at 5:00 PM can be canceled until Monday at 5:00 PM." */
export function cancelExample(s: BranchSettings): string {
  const c = s.schedule.autoConfirm
  const start = 17 * 60
  const cut = start - c.hoursBefore * 60
  const daysBack = Math.ceil(Math.max(0, -cut) / 1440)
  const cutMin = cut + daysBack * 1440
  const day = daysBack === 0 ? 'Tuesday' : WEEKDAY_LABELS[dayBefore('tuesday', daysBack)]
  const confirm = c.enabled ? ' Then the class turns Confirmed and the Cancel button goes away.' : ''
  return `A Tuesday class at 5:00 PM can be canceled in the app until ${day} at ${t(cutMin)}.${confirm}`
}

/** "Today, families see open seats through Wed, Nov 11." */
export function requestsExample(s: BranchSettings, today: DateKey): string {
  return `Today, families see open seats through ${formatDateKey(addDays(today, s.schedule.requests.daysAhead), 'weekdayMedium')}.`
}

/** "Today (Wed, Oct 28), Oct 28 – Nov 3 are locked: …" */
export function lockExample(s: BranchSettings, today: DateKey): string {
  const n = s.availability.lockWindowDays
  if (n <= 0) return 'Only today and past days are locked. Admins can always change any coach’s day.'
  const last = addDays(today, n - 1)
  const span = n === 1 ? formatDateKey(today, 'monthDay') : `${formatDateKey(today, 'monthDay')} – ${formatDateKey(last, 'monthDay')}`
  return `Today (${formatDateKey(today, 'weekdayMedium')}), ${span} ${n === 1 ? 'is' : 'are'} locked: coaches can add time there, not remove it. Admins can always change any coach’s day.`
}

export function leadExample(s: BranchSettings, today: DateKey): string {
  const a = s.availability
  const by = formatDateKey(addDays(today, a.leadTimeDays), 'weekdayMedium')
  const late = a.leadTimeEnforcement === 'warn' ? 'Days later than that show them a warning.' : a.leadTimeEnforcement === 'block' ? 'Days later than that lock too: they can only add time.' : 'Nothing happens when they’re late.'
  return `Every open day through ${by} should be set; Home and the reminders list the ones that aren’t. ${late}`
}

/** "A class added at 5:00 PM runs 5–6 PM." */
export function classLengthExample(s: BranchSettings): string {
  const start = 17 * 60
  return `A class added at 5:00 PM runs ${compactRange(start, start + s.schedule.defaultSessionMinutes)}.`
}

export function autoStatusExample(s: BranchSettings): string {
  const a = s.students.autoStatus
  if (!a.enabled) return 'Statuses only change by hand.'
  return `Signed up → Enrolled after their first class; Enrolled → Paused after ${a.inactivityPauseDays} days without classes, and back when they return.`
}

export function changeWindowExample(s: BranchSettings): string {
  const h = s.notifications.sessionChangeWindowHours
  return `When a class in the next ${h} ${h === 1 ? 'hour' : 'hours'} changes, the coaches in it get a notice. Each person turns kinds of notices on or off on their own page.`
}

/** The made-up day pay's examples use: a coach's classes run from FIRST to LAST. */
export const EXAMPLE_DAY = { firstClassMin: FIRST, lastClassEndMin: LAST }
