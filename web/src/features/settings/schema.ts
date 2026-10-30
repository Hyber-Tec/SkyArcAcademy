import { ROLE_LABELS } from '@shared/roles'
import type { BranchSettings } from '@shared/settings/defaults'
import { WEEKDAYS, WEEKDAY_LABELS } from '@shared/time'

/**
 * Declarative description of the academy's settings (the Settings page renders these). Each section holds what people
 * look for there, the most used first, in groups with plain names; the fine-tuning few ever change sits under "More
 * options" (the manager's second meeting, ST1: even Goo had to scroll around to find the right setting).
 */

interface Base {
  path: string
  label: string
  help?: string
  /** Shown only when the other settings need it (as they are being edited), e.g. the clock-out time when it's on. */
  visible?: (settings: BranchSettings) => boolean
  /** The heading it sits under in its section. */
  group?: string
  /** Fine-tuning: under "More options", closed until opened or found. */
  more?: true
  /** Other words people search for it by. */
  keywords?: string
}

export type FieldDef =
  | (Base & { kind: 'number'; min?: number; max?: number; step?: number; suffix?: string })
  | (Base & { kind: 'boolean' })
  | (Base & { kind: 'select'; options: { value: string; label: string }[] })
  | (Base & { kind: 'multiselect'; options: { value: string; label: string }[] })
  | (Base & { kind: 'text'; multiline?: boolean })
  | (Base & { kind: 'list' })
  | (Base & { kind: 'hhmm' })
  | (Base & { kind: 'date' })
  | (Base & { kind: 'weekHours' })
  | (Base & { kind: 'range'; step?: number })

export interface SettingsSection {
  key: string
  title: string
  description: string
  fields: FieldDef[]
}

const SESSION_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
]

export const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    key: 'schedule',
    title: 'Classes & opening hours',
    description: 'When the academy is open, how classes are set up, and until when families can cancel.',
    fields: [
      {
        kind: 'weekHours',
        path: 'schedule.defaultWeek',
        group: 'Opening hours',
        label: 'Usual opening hours',
        keywords: 'open close hours days weekly closed friday saturday sunday',
        help: 'Open a little before the first class and after the last, so the schedule shows coaches arriving and leaving. Dates below override these hours; classes already booked outside new hours stay, shown as conflicts until moved.',
      },
      {
        kind: 'boolean',
        path: 'schedule.autoConfirm.enabled',
        group: 'Confirmation and cancellation',
        label: 'Mark each class Confirmed at that point',
        keywords: 'confirm confirmed pending automatic',
        help: 'So the office and coaches see who’s coming. Off: classes stay as they are until the office confirms them.',
      },
      {
        kind: 'number',
        path: 'schedule.autoConfirm.hoursBefore',
        group: 'Confirmation and cancellation',
        label: 'Families can cancel a class in the app up to',
        keywords: 'cancel cancellation cutoff deadline 24 hours families parents students policy',
        help: 'After that, their Cancel button is off, with a note saying why.',
        min: 1,
        max: 168,
        suffix: 'hours before',
      },
      {
        kind: 'number',
        path: 'schedule.requests.daysAhead',
        group: 'Confirmation and cancellation',
        label: 'Families can ask for open seats up to',
        keywords: 'makeup make-up reschedule extra class request book families parents students',
        help: 'A makeup, a class moved to another time, or an extra class. The office approves or declines each request.',
        min: 1,
        max: 60,
        suffix: 'days ahead',
      },
      { kind: 'number', path: 'schedule.defaultSessionMinutes', group: 'Classes', label: 'A new class lasts', keywords: 'length duration', min: 15, max: 480, step: 5, suffix: 'min' },
      {
        kind: 'select',
        path: 'general.weekStartsOn',
        group: 'Classes',
        label: 'Weeks start on',
        keywords: 'monday sunday calendar',
        options: WEEKDAYS.map((d) => ({ value: d, label: WEEKDAY_LABELS[d] })),
        help: 'The first day of the schedule’s week (also for Duplicate a week and the week’s totals). Month calendars always start on Sunday.',
      },
      {
        kind: 'select',
        path: 'schedule.defaultView',
        group: 'Classes',
        label: 'The schedule opens on',
        options: [
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ],
      },
      { kind: 'number', path: 'schedule.snapMinutes', more: true, label: 'Clicks and drags snap to', keywords: 'snap step grid', min: 1, max: 60, step: 1, suffix: 'min' },
      { kind: 'select', path: 'schedule.pasteStatus', more: true, label: 'Pasted and duplicated classes start as', keywords: 'paste duplicate status', options: SESSION_STATUS_OPTIONS },
      {
        kind: 'number',
        path: 'trash.retentionDays',
        more: true,
        label: 'Keep deleted classes and Drive files in the Trash for',
        keywords: 'trash delete restore drive files',
        min: 1,
        max: 365,
        suffix: 'days',
      },
    ],
  },
  {
    key: 'availability',
    title: 'Coaches’ availability',
    description: 'When coaches’ days lock, and how far ahead they set them.',
    fields: [
      {
        kind: 'number',
        path: 'availability.lockWindowDays',
        label: 'Lock availability that starts within',
        keywords: 'lock locked 7 days coaches add remove',
        min: 0,
        max: 60,
        suffix: 'days',
        help: 'Inside it, coaches can add time but not remove or shorten it. 0 locks only today and past days.',
      },
      { kind: 'number', path: 'availability.leadTimeDays', label: 'Ask coaches to set their days at least', keywords: 'notice reminder ahead', min: 0, max: 90, suffix: 'days ahead' },
      {
        kind: 'select',
        path: 'availability.leadTimeEnforcement',
        label: 'When a coach is later than that',
        options: [
          { value: 'off', label: 'Do nothing' },
          { value: 'warn', label: 'Show a warning' },
          { value: 'block', label: 'Lock those days too (time can only be added)' },
        ],
      },
      { kind: 'number', path: 'availability.maxRangesPerDay', more: true, label: 'Time ranges a day can have', min: 1, max: 6 },
      { kind: 'number', path: 'availability.stepMinutes', more: true, label: 'Times are picked in steps of', min: 5, max: 60, step: 5, suffix: 'min' },
      { kind: 'number', path: 'availability.minBlockMinutes', more: true, label: 'The shortest time a coach can set', min: 5, max: 240, step: 5, suffix: 'min' },
    ],
  },
  {
    key: 'payroll',
    title: 'Pay & time clock',
    description: 'When paid time starts and ends, the automatic clock-out, pay periods and the kiosk. Everyone is paid their hourly rate (on their page in Employees → Directory).',
    fields: [
      {
        kind: 'number',
        path: 'timeClock.arrivalMinutes',
        group: 'Paid time',
        label: 'Paid time starts this long before a coach’s first class',
        keywords: 'arrival early clock in 30 minutes setup',
        min: 0,
        max: 180,
        step: 5,
        suffix: 'min',
        help: 'Earlier clock-ins don’t count; a later one counts from the clock-in.',
      },
      {
        kind: 'boolean',
        path: 'timeClock.payEndsAtLastClass',
        group: 'Paid time',
        label: 'Paid time ends at the end of a coach’s last class',
        keywords: 'last class end clock out late pay',
        help: 'Even if they clock out later; their clock-out stays as they clocked it. Off: paid until they clock out.',
      },
      {
        kind: 'boolean',
        path: 'timeClock.autoClockOut.enabled',
        group: 'Paid time',
        label: 'Clock out anyone who forgets',
        keywords: 'clock out forgot automatic',
        help: 'For anyone who forgets to clock out.',
      },
      {
        kind: 'hhmm',
        path: 'timeClock.autoClockOut.localTime',
        group: 'Paid time',
        label: 'Clock them out at',
        help: '12:00 AM is the midnight after the clock-in.',
        visible: (s) => s.timeClock.autoClockOut.enabled,
      },
      {
        kind: 'boolean',
        path: 'timeClock.autoClockOut.atLastClass',
        more: true,
        label: 'Clock coaches out automatically at the end of their last class',
        keywords: 'last class end clock out automatic',
        help: 'Instead of letting them clock out themselves. The time above is then for days without classes.',
        visible: (s) => s.timeClock.autoClockOut.enabled,
      },
      {
        kind: 'select',
        path: 'payroll.payPeriod.type',
        group: 'Pay periods',
        label: 'Pay period',
        keywords: 'payroll weekly biweekly monthly',
        options: [
          { value: 'weekly', label: 'Weekly' },
          { value: 'biweekly', label: 'Every two weeks' },
          { value: 'semimonthly', label: 'Twice a month (1–15, 16–end)' },
          { value: 'monthly', label: 'Monthly' },
        ],
      },
      { kind: 'date', path: 'payroll.payPeriod.anchorDate', group: 'Pay periods', label: 'A pay period starts on', help: 'For weekly and two-week periods.' },
      { kind: 'number', path: 'timeClock.kiosk.pinLength', group: 'Kiosk', label: 'Kiosk PIN length', keywords: 'pin kiosk tablet', min: 4, max: 8 },
      { kind: 'number', path: 'timeEntries.stepMinutes', more: true, label: 'Time entries are edited in steps of', min: 1, max: 30, suffix: 'min' },
      { kind: 'number', path: 'home.clockLookbackDays', more: true, label: 'Home lists automatic clock-outs from the last', keywords: 'home fix clock out', min: 1, max: 31, suffix: 'days' },
    ],
  },
  {
    key: 'students',
    title: 'Students',
    description: 'Levels, programs and grades, and automatic statuses.',
    fields: [
      { kind: 'list', path: 'students.levels', label: 'Levels', keywords: 'ladder skill marksman hunter scout', help: 'The skill ladder, lowest first. One per line.' },
      { kind: 'list', path: 'students.programs', label: 'Programs', help: 'One per line.' },
      { kind: 'list', path: 'students.gradeOptions', label: 'Grades', keywords: 'school grade', help: 'One per line.' },
      {
        kind: 'boolean',
        path: 'students.autoStatus.enabled',
        group: 'Automatic status',
        label: 'Update student statuses automatically',
        keywords: 'enrolled paused signed up status',
      },
      { kind: 'number', path: 'students.autoStatus.inactivityPauseDays', group: 'Automatic status', label: 'Pause after no classes for', min: 1, max: 180, suffix: 'days' },
      { kind: 'boolean', path: 'students.autoStatus.respectManual', group: 'Automatic status', label: 'Keep a status set by hand', help: 'A manual status stops the automatic changes until someone changes it again.' },
    ],
  },
  {
    key: 'notifications',
    title: 'Notifications',
    description: 'What the academy’s notices cover. Each person turns kinds of notices on or off for themself (Profile, or the account menu).',
    fields: [
      { kind: 'boolean', path: 'schedule.alerts.firstSession', label: 'Remind the office of a student’s first class', keywords: 'bell first class new student' },
      { kind: 'number', path: 'notifications.sessionChangeWindowHours', label: 'Tell coaches about class changes within', keywords: 'coaches changes push', min: 1, max: 168, suffix: 'hours' },
      { kind: 'number', path: 'notifications.retentionDays', more: true, label: 'Keep notifications for', keywords: 'delete old', min: 1, max: 365, suffix: 'days' },
    ],
  },
  {
    key: 'announcements',
    title: 'Announcements',
    description: 'The categories offered when writing a post.',
    fields: [{ kind: 'list', path: 'announcements.defaultCategories', label: 'Announcement categories', keywords: 'news posts categories', help: 'One per line. Listed first, in this order.' }],
  },
  {
    key: 'signup',
    title: 'Sign-up page',
    description: 'The public page where new coaches, parents and students request access with Google.',
    fields: [
      { kind: 'boolean', path: 'signup.enabled', label: 'Accept sign-up requests', keywords: 'join access request' },
      {
        kind: 'multiselect',
        path: 'signup.roles',
        label: 'Who can request access',
        options: (['coach', 'parent', 'student'] as const).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
      },
      { kind: 'text', path: 'signup.welcomeMessage', label: 'Welcome message', multiline: true, help: 'Shown at the top of the sign-up page.' },
    ],
  },
]

/** Things on the Settings page that aren't fields of a section above, found by the search too. */
export const OTHER_FINDS: { label: string; section: string; anchor?: string; keywords: string }[] = [
  { label: 'Academy name, email, phone and address', section: 'academy', anchor: 'profile', keywords: 'name contact email phone address website time zone timezone profile' },
  { label: 'Seats per class', section: 'academy', anchor: 'seats', keywords: 'seats capacity class size six' },
  { label: 'How pay works', section: 'academy', anchor: 'pay-rule', keywords: 'pay model hourly rate rules wage' },
  { label: 'Closed days and other hours', section: 'schedule', anchor: 'date-hours', keywords: 'holiday closed date special hours opening hours by date' },
  { label: 'Website: messages, photos, pages, coaches, testimonials', section: 'website', keywords: 'website public site photos testimonials coaches messages trial instagram news' },
  { label: 'Sign-up link and QR code', section: 'signup', anchor: 'signup-share', keywords: 'link qr share' },
  { label: 'Enrollment contract', section: 'contract', keywords: 'contract enrollment sign signature agreement pdf' },
  { label: 'Activity log', section: 'audit-log', keywords: 'audit history changes who changed' },
]
