import { payRule } from '../pay/paidTime'
import { type DateKey, type Weekday, WEEKDAY_SHORT, formatDateKey, formatMinutesShort, orderedWeekdays } from '../time'
import type { BusinessRules } from './businessRules'
import type { BranchSettings, DayHours, WeekHours } from './defaults'

/**
 * What each area of Settings is set to, in a sentence (the Settings home's tiles: docs/DECISIONS.md §23, Goo's pick of
 * 2026-10-28). Read from the resolved settings, and for some, from what the academy has (its dated hours, its messages,
 * its contract, its activity), which the page passes in.
 */

/** 960–1260 → "4–9 PM"; 990–1080 → "4:30–6 PM"; 660–780 → "11 AM–1 PM". */
export function compactRange(startMin: number, endMin: number): string {
  const [a, b] = [formatMinutesShort(startMin), formatMinutesShort(endMin)]
  const [ta, ma] = a.split(' ')
  const [tb, mb] = b.split(' ')
  return ma === mb ? `${ta}–${tb} ${mb}` : `${a}–${b}`
}

const sameHours = (a: DayHours, b: DayHours) => a.isOpen === b.isOpen && (!a.isOpen || (a.openMin === b.openMin && a.closeMin === b.closeMin))

/** A run of days: "Mon", "Fri, Sat", "Mon–Thu". */
function daysWord(days: Weekday[]): string {
  if (days.length === 1) return WEEKDAY_SHORT[days[0]]
  if (days.length === 2) return `${WEEKDAY_SHORT[days[0]]}, ${WEEKDAY_SHORT[days[1]]}`
  return `${WEEKDAY_SHORT[days[0]]}–${WEEKDAY_SHORT[days[days.length - 1]]}`
}

/** The usual week, short: "Mon–Thu 4–9 PM · Sun 1–6 PM · Fri, Sat closed" (days in the academy's week order). */
export function weekHoursSummary(week: WeekHours, weekStartsOn: Weekday): string {
  const runs: { days: Weekday[]; hours: DayHours }[] = []
  for (const day of orderedWeekdays(weekStartsOn)) {
    const last = runs[runs.length - 1]
    if (last && sameHours(last.hours, week[day])) last.days.push(day)
    else runs.push({ days: [day], hours: week[day] })
  }
  const open = runs.filter((r) => r.hours.isOpen).map((r) => `${daysWord(r.days)} ${compactRange(r.hours.openMin, r.hours.closeMin)}`)
  const closed = runs.filter((r) => !r.hours.isOpen).flatMap((r) => r.days)
  if (!open.length) return 'Closed every day'
  return [...open, ...(closed.length ? [`${closed.map((d) => WEEKDAY_SHORT[d]).join(', ')} closed`] : [])].join(' · ')
}

/** A date whose hours differ from the usual week. */
export interface DatedHours {
  dateKey: DateKey
  isOpen: boolean
  openMin: number
  closeMin: number
}

/** The usual week, and the next date that's different. */
export function hoursSummary(s: BranchSettings, dated: DatedHours[]): string {
  const week = weekHoursSummary(s.schedule.defaultWeek, s.general.weekStartsOn)
  const next = [...dated].sort((a, b) => a.dateKey.localeCompare(b.dateKey))[0]
  if (!next) return `${week}. No closed days or other hours coming up.`
  const what = next.isOpen ? compactRange(next.openMin, next.closeMin) : 'closed'
  return `${week}. Next: ${formatDateKey(next.dateKey, 'weekdayMedium')}, ${what}${dated.length > 1 ? ` (and ${dated.length - 1} more)` : ''}.`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "1 hour", "45 minutes", "1 h 30 min". */
export function durationWords(min: number): string {
  if (min < 60) return plural(min, 'minute')
  if (min % 60 === 0) return plural(min / 60, 'hour')
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

export function classesSummary(s: BranchSettings, rules: Pick<BusinessRules, 'seatsPerClass'>): string {
  return `Families cancel up to ${plural(s.schedule.autoConfirm.hoursBefore, 'hour')} before a class and ask for open seats ${plural(s.schedule.requests.daysAhead, 'day')} ahead. A new class: ${durationWords(s.schedule.defaultSessionMinutes)}, ${plural(rules.seatsPerClass, 'seat')}.`
}

export function availabilitySummary(s: BranchSettings): string {
  const a = s.availability
  const late = a.leadTimeEnforcement === 'warn' ? ', with a warning when they’re late' : a.leadTimeEnforcement === 'block' ? '; late days lock too' : ''
  const lock = a.lockWindowDays > 0 ? `Coaches’ days lock ${plural(a.lockWindowDays, 'day')} ahead` : 'Only today and past days are locked'
  return `${lock}. Coaches set their days ${plural(a.leadTimeDays, 'day')} ahead${late}.`
}

const PERIOD_WORDS: Record<BranchSettings['payroll']['payPeriod']['type'], string> = {
  weekly: 'every week',
  biweekly: 'every two weeks',
  semimonthly: 'twice a month',
  monthly: 'every month',
}

/** "Oct 25 – Nov 7" */
export function periodWords(p: { start: DateKey; end: DateKey }): string {
  return `${formatDateKey(p.start, 'monthDay')} – ${formatDateKey(p.end, 'monthDay')}`
}

/** How pay works, short (the page's examples have the rest: the periods' dates among them). */
export function paySummary(s: BranchSettings): string {
  const rule = payRule(s)
  const start = rule.arrivalMinutes > 0 ? `${plural(rule.arrivalMinutes, 'minute')} before the first class` : 'the first class'
  const end = rule.endsAtLastClass ? 'the end of the last' : 'the clock-out'
  return `Paid from ${start} to ${end}, ${PERIOD_WORDS[s.payroll.payPeriod.type]}. Rates are on each person’s page.`
}

export function studentsSummary(s: BranchSettings): string {
  const st = s.students
  const status = st.autoStatus.enabled ? `Paused after ${plural(st.autoStatus.inactivityPauseDays, 'day')} without classes.` : 'Statuses change by hand.'
  return `${plural(st.levels.length, 'level')}, ${plural(st.programs.length, 'program')}. ${status}`
}

const ROLE_PLURAL: Record<string, string> = { coach: 'coaches', parent: 'parents', student: 'students' }

export function signupSummary(s: BranchSettings): string {
  if (!s.signup.enabled) return 'Closed: nobody can ask for access.'
  const who = s.signup.roles.map((r) => ROLE_PLURAL[r] ?? r)
  if (!who.length) return 'Open, but no one is picked to ask.'
  return `Open to ${who.length > 1 ? `${who.slice(0, -1).join(', ')} and ${who[who.length - 1]}` : who[0]}.`
}

export function noticesSummary(s: BranchSettings): string {
  const first = s.schedule.alerts.firstSession ? ' The office is reminded of first classes.' : ''
  return `Coaches hear of class changes within ${plural(s.notifications.sessionChangeWindowHours, 'hour')}.${first} ${plural(s.announcements.defaultCategories.length, 'post category', 'post categories')}.`
}

export function websiteSummary(newMessages: number): string {
  return newMessages ? `${plural(newMessages, 'new message')} from families. Photos, coaches, reviews and the hours it shows.` : 'Photos, coaches, reviews, the hours it shows, and the trial requests it sends.'
}

export function contractSummary(uploaded: boolean): string {
  return uploaded ? 'The blank contract is uploaded. Send a signing link from a student’s page.' : 'No contract uploaded yet. Upload the blank PDF families sign.'
}

/** "Changed Pay & time clock settings (Goo C., 2 h ago)" */
export function activitySummary(last: { summary: string; who: string; atMs: number } | null, nowMs: number): string {
  if (!last) return 'Every change to settings, the schedule, people and pay: who and when.'
  return `Last: ${last.summary} (${last.who}, ${agoWords(nowMs - last.atMs)}).`
}

/** 90 s → "just now", 5 min → "5 min ago", 3 h → "3 h ago", 2 days → "2 days ago". */
export function agoWords(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 2) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h ago`
  return plural(Math.floor(h / 24), 'day') + ' ago'
}
