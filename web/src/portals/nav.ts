import type { IconType } from 'react-icons'
import {
  LuCalendarClock,
  LuCalendarDays,
  LuChartLine,
  LuCircleUserRound,
  LuGraduationCap,
  LuHardDrive,
  LuHouse,
  LuMegaphone,
  LuSettings,
  LuShieldCheck,
  LuTarget,
  LuUserCog,
  LuUsers,
  LuWallet,
} from 'react-icons/lu'
import type { Portal, RestrictablePage } from '@shared/roles'

export interface NavLeaf {
  key: string
  label: string
  /** Relative to the portal root, e.g. "employees/payroll". */
  to: string
  icon?: IconType
  restrict?: RestrictablePage
  /** Other pages (relative to the portal root) that also light this entry up, e.g. Payroll under the phone's Profile tab. */
  alsoActive?: string[]
}

export interface NavGroup {
  key: string
  label: string
  icon: IconType
  children: NavLeaf[]
}

export type NavItem = NavLeaf | NavGroup

export function isGroup(item: NavItem): item is NavGroup {
  return 'children' in item
}

export interface PortalNav {
  main: NavItem[]
  secondary: NavLeaf[]
  /** Bottom tabs on phones (coach PWA). */
  mobileTabs?: NavLeaf[]
}

export const ADMIN_NAV: PortalNav = {
  main: [
    { key: 'home', label: 'Home', to: 'home', icon: LuHouse },
    { key: 'announcements', label: 'Announcements', to: 'announcements', icon: LuMegaphone },
    { key: 'schedule', label: 'Schedule', to: 'schedule', icon: LuCalendarDays },
    { key: 'students', label: 'Students', to: 'students', icon: LuGraduationCap },
    { key: 'drive', label: 'Drive', to: 'drive', icon: LuHardDrive },
    { key: 'reports', label: 'Reports', to: 'reports', icon: LuChartLine },
    {
      key: 'employees',
      label: 'Employees',
      icon: LuUsers,
      children: [
        { key: 'employeeDirectory', label: 'Directory', to: 'employees/directory' },
        { key: 'employeeCalendar', label: 'Calendar', to: 'employees/calendar' },
        { key: 'payRates', label: 'Pay Rates', to: 'employees/pay-rates', restrict: 'payRates' },
        { key: 'payroll', label: 'Payroll', to: 'employees/payroll', restrict: 'payroll' },
        { key: 'timeEntries', label: 'Time Entries', to: 'employees/time-entries', restrict: 'timeEntries' },
      ],
    },
  ],
  secondary: [
    { key: 'account', label: 'Account', to: 'account', icon: LuUserCog },
    { key: 'accessControl', label: 'Access Control', to: 'access-control', icon: LuShieldCheck, restrict: 'accessControl' },
    { key: 'settings', label: 'Settings', to: 'settings', icon: LuSettings },
  ],
}

/**
 * The coach portal: the same five places as the phone app (Home, Schedule, Availability, News, Profile), plus
 * students and pay. Profile holds the person's own pages (account, notifications, sign-in, appearance).
 */
export const COACH_NAV: PortalNav = {
  main: [
    { key: 'home', label: 'Home', to: 'home', icon: LuHouse },
    { key: 'schedule', label: 'Schedule', to: 'schedule', icon: LuCalendarDays },
    { key: 'availability', label: 'Availability', to: 'availability', icon: LuCalendarClock },
    { key: 'announcements', label: 'Announcements', to: 'announcements', icon: LuMegaphone },
    { key: 'students', label: 'Students', to: 'students', icon: LuGraduationCap },
    { key: 'drive', label: 'Drive', to: 'drive', icon: LuHardDrive },
    { key: 'reports', label: 'Reports', to: 'reports', icon: LuChartLine },
    { key: 'payroll', label: 'Payroll', to: 'payroll', icon: LuWallet },
  ],
  secondary: [{ key: 'profile', label: 'Profile', to: 'profile', icon: LuCircleUserRound }],
  mobileTabs: [
    { key: 'home', label: 'Home', to: 'home', icon: LuHouse },
    { key: 'schedule', label: 'Schedule', to: 'schedule', icon: LuCalendarDays },
    { key: 'availability', label: 'Availability', to: 'availability', icon: LuCalendarClock },
    { key: 'announcements', label: 'News', to: 'announcements', icon: LuMegaphone },
    { key: 'profile', label: 'Profile', to: 'profile', icon: LuCircleUserRound, alsoActive: ['payroll'] },
  ],
}

/**
 * Parents and students: one portal design, the same places (a parent sees their children, a student themself).
 * Scores holds every result, Reports the few the academy writes up (the owner, 2026-10-18), News the academy's posts
 * shown to families (docs/DECISIONS.md §16). Profile holds the person's own pages (account, sign-in, appearance, contact
 * and help). Phones keep five tabs: News opens from Home's "From the academy" card, so Home stays lit there.
 */
export const FAMILY_NAV: PortalNav = {
  main: [
    { key: 'home', label: 'Home', to: 'home', icon: LuHouse },
    { key: 'classes', label: 'Classes', to: 'classes', icon: LuCalendarDays },
    { key: 'scores', label: 'Scores', to: 'scores', icon: LuTarget },
    { key: 'reports', label: 'Reports', to: 'reports', icon: LuChartLine },
    { key: 'news', label: 'News', to: 'news', icon: LuMegaphone },
  ],
  secondary: [{ key: 'profile', label: 'Profile', to: 'profile', icon: LuCircleUserRound }],
  mobileTabs: [
    { key: 'home', label: 'Home', to: 'home', icon: LuHouse, alsoActive: ['news'] },
    { key: 'classes', label: 'Classes', to: 'classes', icon: LuCalendarDays },
    { key: 'scores', label: 'Scores', to: 'scores', icon: LuTarget },
    { key: 'reports', label: 'Reports', to: 'reports', icon: LuChartLine },
    { key: 'profile', label: 'Profile', to: 'profile', icon: LuCircleUserRound },
  ],
}

export const PORTAL_NAV: Record<Portal, PortalNav> = {
  admin: ADMIN_NAV,
  coach: COACH_NAV,
  parent: FAMILY_NAV,
  student: FAMILY_NAV,
}

/** Flattened leaves, for page titles and access checks. */
export function navLeaves(nav: PortalNav): NavLeaf[] {
  return [...nav.main.flatMap((i) => (isGroup(i) ? i.children : [i])), ...nav.secondary]
}
