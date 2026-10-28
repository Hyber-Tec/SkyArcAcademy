import { ROLE_LABELS } from '@shared/roles'
import type { BranchSettings } from '@shared/settings/defaults'
import { WEEKDAYS, WEEKDAY_LABELS } from '@shared/time'

/** Declarative description of the academy's settings (the Settings page renders these). */

interface Base {
  path: string
  label: string
  help?: string
  /** Shown only when the other settings need it (as they are being edited), e.g. the clock-out time when it's on. */
  visible?: (settings: BranchSettings) => boolean
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
    key: 'signup',
    title: 'Sign-up page',
    description: 'The public page where new coaches, parents and students request access with Google.',
    fields: [
      { kind: 'boolean', path: 'signup.enabled', label: 'Accept sign-up requests' },
      {
        kind: 'multiselect',
        path: 'signup.roles',
        label: 'Who can request access',
        options: (['coach', 'parent', 'student'] as const).map((r) => ({ value: r, label: ROLE_LABELS[r] })),
      },
      { kind: 'text', path: 'signup.welcomeMessage', label: 'Welcome message', multiline: true, help: 'Shown at the top of the sign-up page.' },
    ],
  },
  {
    key: 'schedule',
    title: 'Schedule',
    description: 'Opening hours, class defaults and automatic confirmation.',
    fields: [
      {
        kind: 'select',
        path: 'general.weekStartsOn',
        label: 'Weeks start on',
        options: WEEKDAYS.map((d) => ({ value: d, label: WEEKDAY_LABELS[d] })),
        help: 'The first day of the schedule’s week (also for Duplicate a week and the week’s totals). Month calendars always start on Sunday.',
      },
      { kind: 'weekHours', path: 'schedule.defaultWeek', label: 'Default opening hours', help: 'When the academy is open each weekday, not only class times: start early and end late enough that the schedule also shows coaches arriving before the first class and leaving after the last. Dates set in “Opening hours by date” below (or edited on the schedule) override them. Classes already booked outside new hours stay booked and show as conflicts on the schedule until moved.' },
      { kind: 'number', path: 'schedule.defaultSessionMinutes', label: 'Default class length', min: 15, max: 480, step: 5, suffix: 'min' },
      { kind: 'number', path: 'schedule.snapMinutes', label: 'Time snap', min: 1, max: 60, step: 1, suffix: 'min', help: 'Clicks, drags and resizes snap to this step.' },
      {
        kind: 'select',
        path: 'schedule.defaultView',
        label: 'Default view',
        options: [
          { value: 'day', label: 'Day' },
          { value: 'week', label: 'Week' },
        ],
      },
      { kind: 'boolean', path: 'schedule.autoConfirm.enabled', label: 'Confirm pending classes automatically' },
      { kind: 'number', path: 'schedule.autoConfirm.hoursBefore', label: 'Confirm this long before the start', min: 1, max: 168, suffix: 'hours' },
      { kind: 'select', path: 'schedule.pasteStatus', label: 'Status of pasted and duplicated classes', options: SESSION_STATUS_OPTIONS },
      { kind: 'list', path: 'schedule.events.titlePresets', label: 'Event title presets', help: 'One per line. Offered when adding an event.' },
      { kind: 'boolean', path: 'schedule.alerts.firstSession', label: 'Bell: student’s first class' },
      { kind: 'number', path: 'trash.retentionDays', label: 'Keep deleted classes in Trash for', min: 1, max: 365, suffix: 'days' },
    ],
  },
  {
    key: 'availability',
    title: 'Availability',
    description: 'How far ahead coaches must enter availability, and when it locks.',
    fields: [
      { kind: 'number', path: 'availability.leadTimeDays', label: 'Ask coaches to set availability at least', min: 0, max: 90, suffix: 'days ahead' },
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
      {
        kind: 'number',
        path: 'availability.lockWindowDays',
        label: 'Lock availability that starts within',
        min: 0,
        max: 60,
        suffix: 'days',
        help: 'Inside this window coaches can add time but not remove or shorten it. Admins can always change it. 0 locks only today and past days.',
      },
      { kind: 'number', path: 'availability.maxRangesPerDay', label: 'Time ranges per day', min: 1, max: 6 },
      { kind: 'number', path: 'availability.stepMinutes', label: 'Picker step', min: 5, max: 60, step: 5, suffix: 'min' },
      { kind: 'number', path: 'availability.minBlockMinutes', label: 'Shortest range', min: 5, max: 240, step: 5, suffix: 'min' },
    ],
  },
  {
    key: 'students',
    title: 'Students',
    description: 'Automatic status changes, grades, levels and programs.',
    fields: [
      { kind: 'boolean', path: 'students.autoStatus.enabled', label: 'Update student statuses automatically', help: 'Signed Up → Enrolled after the first class; Enrolled ↔ Paused by activity.' },
      { kind: 'number', path: 'students.autoStatus.inactivityPauseDays', label: 'Pause after no classes for', min: 1, max: 180, suffix: 'days' },
      { kind: 'boolean', path: 'students.autoStatus.respectManual', label: 'Keep a status set by hand', help: 'A manual status stops the automatic changes until someone changes it again.' },
      { kind: 'list', path: 'students.gradeOptions', label: 'Grades', help: 'One per line.' },
      { kind: 'list', path: 'students.levels', label: 'Levels', help: 'The skill ladder, lowest first. One per line.' },
      { kind: 'list', path: 'students.programs', label: 'Programs', help: 'One per line.' },
    ],
  },
  {
    key: 'payroll',
    title: 'Payroll & time clock',
    description: 'Pay periods, when paid time starts and ends, the automatic clock-out and the kiosk. Everyone is paid their hourly rate (Employees → Pay Rates).',
    fields: [
      {
        kind: 'select',
        path: 'payroll.payPeriod.type',
        label: 'Pay period',
        options: [
          { value: 'weekly', label: 'Weekly' },
          { value: 'biweekly', label: 'Every two weeks' },
          { value: 'semimonthly', label: 'Twice a month (1–15, 16–end)' },
          { value: 'monthly', label: 'Monthly' },
        ],
      },
      { kind: 'date', path: 'payroll.payPeriod.anchorDate', label: 'A pay period starts on', help: 'For weekly and two-week periods.' },
      {
        kind: 'number',
        path: 'timeClock.arrivalMinutes',
        label: 'Paid time starts this long before a coach’s first class',
        min: 0,
        max: 180,
        step: 5,
        suffix: 'min',
        help: 'Earlier clock-ins don’t count: with 30 minutes, a coach who clocks in at 5:20 for a 6:00 class is paid from 5:30. A later clock-in counts from the clock-in.',
      },
      { kind: 'boolean', path: 'timeClock.autoClockOut.enabled', label: 'Clock everyone out automatically', help: 'Closes the shift of anyone who forgets to clock out.' },
      {
        kind: 'boolean',
        path: 'timeClock.autoClockOut.atLastClass',
        label: 'Clock out automatically at the end of the coach’s last class',
        help: 'Their paid time ends there too, even if they clock out later. Off: everyone is clocked out at the time below and paid until they clock out.',
        visible: (s) => s.timeClock.autoClockOut.enabled,
      },
      {
        kind: 'hhmm',
        path: 'timeClock.autoClockOut.localTime',
        label: 'On days without classes, clock out at',
        help: 'Also every day when the end of the last class is off. 12:00 AM is the midnight after the clock-in.',
        visible: (s) => s.timeClock.autoClockOut.enabled,
      },
      { kind: 'number', path: 'timeClock.kiosk.pinLength', label: 'Kiosk PIN length', min: 4, max: 8 },
      { kind: 'number', path: 'timeEntries.stepMinutes', label: 'Time entry step', min: 1, max: 30, suffix: 'min' },
    ],
  },
  {
    key: 'home',
    title: 'Home & announcements',
    description: 'What the admin Home dashboard looks at, and the announcement categories.',
    fields: [
      { kind: 'number', path: 'home.clockLookbackDays', label: 'Look for automatic clock-outs in the last', min: 1, max: 31, suffix: 'days' },
      { kind: 'list', path: 'announcements.defaultCategories', label: 'Announcement categories', help: 'One per line. Listed first, in this order.' },
    ],
  },
  {
    key: 'notifications',
    title: 'Notifications',
    description: 'Push notifications arrive with the phone app; the app already records them.',
    fields: [
      { kind: 'number', path: 'notifications.sessionChangeWindowHours', label: 'Notify coaches of changes within', min: 1, max: 168, suffix: 'hours' },
      { kind: 'number', path: 'notifications.retentionDays', label: 'Keep notifications for', min: 1, max: 365, suffix: 'days' },
    ],
  },
]
