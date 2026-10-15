import type { Role } from '../roles'
import type { Weekday } from '../time'

/**
 * Settings the academy's admins may change (the core rules the owner sets live in `businessRules.ts`). The academy
 * stores only its overrides (`branches/{b}.settings`); everything reads `resolveSettings(branch.settings)`. Defaults
 * follow Sky Arc's current practice (its weekly sheets and website, Oct 2026) until Matt confirms the real values
 * (docs/DECISIONS.md); they are never hard-coded anywhere else.
 */

export interface DayHours {
  isOpen: boolean
  /** Minutes after local midnight. */
  openMin: number
  closeMin: number
}

export type WeekHours = Record<Weekday, DayHours>

export interface MinuteRange {
  startMin: number
  endMin: number
}

export type LeadTimeEnforcement = 'off' | 'warn' | 'block'
export type PayPeriodType = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
export type ScheduleView = 'day' | 'week' | 'month'
export type SessionStatus = 'pending' | 'confirmed' | 'present' | 'no_show' | 'canceled'

export interface BranchSettings {
  general: {
    weekStartsOn: Weekday
    timeFormat: '12h' | '24h'
  }
  schedule: {
    defaultWeek: WeekHours
    snapMinutes: number
    /** Length of a new class. */
    defaultSessionMinutes: number
    defaultView: ScheduleView
    /** Ordered staff IDs; staff not listed follow alphabetically. */
    tutorOrder: string[]
    pasteStatus: SessionStatus
    autoConfirm: { enabled: boolean; hoursBefore: number }
    duplicate: { overwriteTargetDays: boolean }
    events: { titlePresets: string[]; defaultMinutes: number; monthDefaultStartMin: number }
    alerts: { firstSession: boolean }
    /** Bounds of the day-hours editors. */
    editorRange: MinuteRange
  }
  trash: { retentionDays: number }
  availability: {
    /** Tutors are reminded to enter availability at least this many days ahead. */
    leadTimeDays: number
    leadTimeEnforcement: LeadTimeEnforcement
    /** Tutors can't create, change or delete availability that starts within this many days. 0 = no lock. */
    lockWindowDays: number
    stepMinutes: number
    minBlockMinutes: number
    maxRangesPerDay: number
  }
  students: {
    autoStatus: { enabled: boolean; inactivityPauseDays: number; respectManual: boolean }
    gradeOptions: string[]
  }
  /** The pay model itself is a branch rule (`businessRules`); owners and admins are always paid one rate. */
  payroll: {
    /** Sessions in these statuses count as teaching time (default: only attended sessions). */
    teachingSessionStatuses: SessionStatus[]
    hoursDecimals: number
    payPeriod: { type: PayPeriodType; anchorDate: string }
  }
  timeClock: {
    autoClockOut: { enabled: boolean; localTime: string }
    kiosk: { pinLength: number; successReturnSeconds: number }
  }
  timeEntries: {
    stepMinutes: number
  }
  home: {
    /** How far back Home looks for automatic clock-outs to fix. */
    clockLookbackDays: number
  }
  announcements: { defaultCategories: string[] }
  notifications: {
    retentionDays: number
    /** Window in which new classes and changes notify the tutor (future phone app). */
    sessionChangeWindowHours: number
  }
  signup: {
    enabled: boolean
    roles: Role[]
    welcomeMessage: string
  }
}

const open = (openMin: number, closeMin: number): DayHours => ({ isOpen: true, openMin, closeMin })
const closed = (openMin = 840, closeMin = 1260): DayHours => ({ isOpen: false, openMin, closeMin })

export const DEFAULT_SETTINGS: BranchSettings = {
  general: {
    weekStartsOn: 'sunday',
    timeFormat: '12h',
  },
  schedule: {
    // Sky Arc's class hours: Sun 2–5:30, Mon 4:30–8, Tue and Wed 5–8, Thu 5–8:30; Fri and Sat by arrangement only.
    defaultWeek: {
      sunday: open(840, 1050),
      monday: open(990, 1200),
      tuesday: open(1020, 1200),
      wednesday: open(1020, 1200),
      thursday: open(1020, 1230),
      friday: closed(),
      saturday: closed(),
    },
    snapMinutes: 5,
    defaultSessionMinutes: 60,
    defaultView: 'day',
    tutorOrder: [],
    pasteStatus: 'pending',
    autoConfirm: { enabled: true, hoursBefore: 24 },
    duplicate: { overwriteTargetDays: true },
    events: {
      titlePresets: ['Tournament', 'Closed', 'Range Practice', 'Private Coaching', 'Parent Meeting'],
      defaultMinutes: 60,
      monthDefaultStartMin: 840,
    },
    alerts: { firstSession: true },
    editorRange: { startMin: 360, endMin: 1320 },
  },
  trash: { retentionDays: 14 },
  availability: {
    leadTimeDays: 14,
    leadTimeEnforcement: 'warn',
    lockWindowDays: 7,
    stepMinutes: 30,
    minBlockMinutes: 30,
    maxRangesPerDay: 4,
  },
  students: {
    autoStatus: { enabled: true, inactivityPauseDays: 20, respectManual: true },
    gradeOptions: ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'College', 'Adult'],
  },
  payroll: {
    teachingSessionStatuses: ['present'],
    hoursDecimals: 2,
    payPeriod: { type: 'biweekly', anchorDate: '2026-01-04' },
  },
  timeClock: {
    autoClockOut: { enabled: true, localTime: '00:00' },
    kiosk: { pinLength: 4, successReturnSeconds: 3 },
  },
  timeEntries: { stepMinutes: 5 },
  home: {
    clockLookbackDays: 7,
  },
  announcements: { defaultCategories: ['General', 'Tournaments', 'Updates'] },
  notifications: { retentionDays: 14, sessionChangeWindowHours: 24 },
  // Students sign in with the phone app later (Phase 2); on the web, coaches and parents ask for access.
  signup: {
    enabled: true,
    roles: ['tutor', 'parent'],
    welcomeMessage: '',
  },
}
