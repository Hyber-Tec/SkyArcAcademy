import type { Role } from '../roles'
import type { Weekday } from '../time'

/**
 * Settings the academy's admins may change (the core rules the owner sets live in `businessRules.ts`). The academy
 * stores only its overrides (`branches/{b}.settings`); everything reads `resolveSettings(branch.settings)`. Defaults
 * follow Sky Arc's current practice (its weekly sheets and website, Oct 2026) until the academy confirms the real
 * values (docs/QUESTIONS.md); they are never hard-coded anywhere else.
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
    /**
     * The academy's week: the schedule's week, Duplicate a week, Copy last week and the week's totals. Month calendars
     * start on Sunday whatever it is (`CALENDAR_WEEK_START`).
     */
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
    coachOrder: string[]
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
    /** Coaches are reminded to enter availability at least this many days ahead. */
    leadTimeDays: number
    leadTimeEnforcement: LeadTimeEnforcement
    /**
     * Inside this many days, coaches can add availability but not remove or shorten it (docs/DECISIONS.md §23, C2);
     * admins change anything. 0 = only past days are locked.
     */
    lockWindowDays: number
    stepMinutes: number
    minBlockMinutes: number
    maxRangesPerDay: number
  }
  students: {
    autoStatus: { enabled: boolean; inactivityPauseDays: number; respectManual: boolean }
    gradeOptions: string[]
    /** The skill ladder, lowest first: a student's `level`. */
    levels: string[]
    /** What the academy offers (its website's programs): a student's `program`. */
    programs: string[]
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
    /** Window in which new classes and changes notify the coach (future phone app). */
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
    // Monday to Sunday, as the academy's sheets run (the owner, 2026-10-26).
    weekStartsOn: 'monday',
    timeFormat: '12h',
  },
  schedule: {
    // Open hours, wider than the classes (Sun 2–5:30; Mon to Thu between 4:30 and 8:30) so the schedule also shows
    // coaches arriving early and leaving late (docs/DECISIONS.md §7). Fri and Sat by arrangement only.
    defaultWeek: {
      sunday: open(780, 1080),
      monday: open(960, 1260),
      tuesday: open(960, 1260),
      wednesday: open(960, 1260),
      thursday: open(960, 1260),
      friday: closed(),
      saturday: closed(),
    },
    snapMinutes: 5,
    defaultSessionMinutes: 60,
    defaultView: 'day',
    coachOrder: [],
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
    // A week's notice and a week's lock (the manager, 2026-10-27: docs/DECISIONS.md §23, C1).
    leadTimeDays: 7,
    leadTimeEnforcement: 'warn',
    lockWindowDays: 7,
    stepMinutes: 30,
    minBlockMinutes: 30,
    maxRangesPerDay: 4,
  },
  students: {
    autoStatus: { enabled: true, inactivityPauseDays: 20, respectManual: true },
    // School grades from 1st, as the website's trial form asks.
    gradeOptions: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'College', 'Adult'],
    // The ladder on the academy's class sheets, and the programs on skyarcacademy.com (docs/DECISIONS.md §5).
    levels: ['Discovery', 'Scout', 'Hunter', 'Hunter+', 'Marksman', 'Marksman+', 'Sharp Shooter', 'Expert', 'Precision'],
    programs: ['Launchpad', 'Foundations', 'Development', 'Performance'],
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
    roles: ['coach', 'parent'],
    welcomeMessage: '',
  },
}
