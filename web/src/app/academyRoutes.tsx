import { Navigate, Outlet, type RouteObject } from 'react-router'
import { BranchProvider } from '@/branch/BranchProvider'
import { PortalLayout } from '@/portals/PortalLayout'
import { PortalHomeRedirect, RequireAuth, RequirePage, RequirePortal } from './guards'

/** Lazy route helper: `page(() => import('./x'), 'X')`. */
export function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M): RouteObject['lazy'] {
  return async () => ({ Component: (await load())[name] as React.ComponentType })
}

const adminRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="home" replace /> },
  { path: 'home', lazy: page(() => import('@/features/home/AdminHomePage'), 'AdminHomePage') },
  { path: 'announcements', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'AnnouncementsPage') },
  { path: 'announcements/new', lazy: page(() => import('@/features/announcements/AnnouncementEditorPage'), 'AnnouncementEditorPage') },
  { path: 'announcements/:announcementId', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'AnnouncementPostPage') },
  {
    path: 'announcements/:announcementId/edit',
    lazy: page(() => import('@/features/announcements/AnnouncementEditorPage'), 'AnnouncementEditorPage'),
  },
  { path: 'website/:tab?', lazy: page(() => import('@/features/website/WebsitePage'), 'WebsitePage') },
  { path: 'schedule/*', lazy: page(() => import('@/features/schedule/SchedulePage'), 'SchedulePage') },
  { path: 'students', lazy: page(() => import('@/features/students/StudentDirectoryPage'), 'StudentDirectoryPage') },
  { path: 'students/:studentId/:tab?', lazy: page(() => import('@/features/students/StudentProfilePage'), 'StudentProfilePage') },
  { path: 'students/:studentId/scores/:evaluationId', lazy: page(() => import('@/features/scores/card/CardEditorPage'), 'CardEditorPage') },
  { path: 'drive/trash', lazy: page(() => import('@/features/drive/DriveTrashPage'), 'DriveTrashPage') },
  { path: 'drive/*', lazy: page(() => import('@/features/drive/DrivePage'), 'DrivePage') },
  { path: 'reports', lazy: page(() => import('@/features/reports/ReportsPage'), 'ReportsPage') },
  { path: 'reports/:reportId', lazy: page(() => import('@/features/reports/ReportEditorPage'), 'ReportEditorPage') },
  { path: 'employees', element: <Navigate to="directory" replace /> },
  { path: 'employees/directory', lazy: page(() => import('@/features/employees/EmployeeDirectoryPage'), 'EmployeeDirectoryPage') },
  { path: 'employees/directory/:staffId', lazy: page(() => import('@/features/employees/EmployeeDetailPage'), 'EmployeeDetailPage') },
  { path: 'employees/calendar', lazy: page(() => import('@/features/employees/EmployeeCalendarPage'), 'EmployeeCalendarPage') },
  {
    path: 'employees/pay-rates',
    element: (
      <RequirePage page="payRates">
        <Outlet />
      </RequirePage>
    ),
    children: [{ index: true, lazy: page(() => import('@/features/employees/PayRatesPage'), 'PayRatesPage') }],
  },
  {
    path: 'employees/payroll',
    element: (
      <RequirePage page="payroll">
        <Outlet />
      </RequirePage>
    ),
    children: [{ index: true, lazy: page(() => import('@/features/timeclock/PayrollPage'), 'PayrollPage') }],
  },
  {
    path: 'employees/time-entries',
    element: (
      <RequirePage page="timeEntries">
        <Outlet />
      </RequirePage>
    ),
    children: [{ index: true, lazy: page(() => import('@/features/timeclock/TimeEntriesPage'), 'TimeEntriesPage') }],
  },
  { path: 'account', lazy: page(() => import('@/features/access/AccountPage'), 'AccountPage') },
  {
    path: 'access-control',
    element: (
      <RequirePage page="accessControl">
        <Outlet />
      </RequirePage>
    ),
    children: [{ index: true, lazy: page(() => import('@/features/access/AccessControlPage'), 'AccessControlPage') }],
  },
  { path: 'settings/:section?', lazy: page(() => import('@/features/settings/SettingsPage'), 'SettingsPage') },
  { path: '*', element: <Navigate to="/admin/home" replace /> },
]

const coachRoutes: RouteObject[] = [
  { index: true, element: <Navigate to="home" replace /> },
  { path: 'home', lazy: page(() => import('@/features/coach/home/CoachHomePage'), 'CoachHomePage') },
  // The first page was "Today" until 2026-10-17.
  { path: 'today', element: <Navigate to="/coach/home" replace /> },
  { path: 'announcements', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'CoachAnnouncementsPage') },
  { path: 'announcements/:announcementId', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'CoachAnnouncementPostPage') },
  { path: 'schedule', lazy: page(() => import('@/features/schedule/CoachSchedulePage'), 'CoachSchedulePage') },
  { path: 'availability', lazy: page(() => import('@/features/availability/CoachAvailabilityPage'), 'CoachAvailabilityPage') },
  { path: 'students', lazy: page(() => import('@/features/students/StudentDirectoryPage'), 'CoachStudentDirectoryPage') },
  { path: 'students/:studentId/:tab?', lazy: page(() => import('@/features/students/StudentProfilePage'), 'CoachStudentProfilePage') },
  { path: 'students/:studentId/scores/:evaluationId', lazy: page(() => import('@/features/scores/card/CardEditorPage'), 'CoachCardEditorPage') },
  { path: 'drive/*', lazy: page(() => import('@/features/drive/DrivePage'), 'DrivePage') },
  { path: 'reports', lazy: page(() => import('@/features/reports/ReportsPage'), 'CoachReportsPage') },
  { path: 'reports/:reportId', lazy: page(() => import('@/features/reports/ReportEditorPage'), 'CoachReportEditorPage') },
  { path: 'payroll', lazy: page(() => import('@/features/timeclock/CoachPayrollPage'), 'CoachPayrollPage') },
  {
    path: 'profile',
    lazy: page(() => import('@/features/coach/profile/ProfilePage'), 'ProfilePage'),
    children: [
      { index: true, lazy: page(() => import('@/features/coach/profile/ProfilePage'), 'ProfileIndex') },
      { path: 'account', lazy: page(() => import('@/features/coach/profile/AccountSection'), 'AccountSection') },
      { path: 'notifications', lazy: page(() => import('@/features/coach/profile/NotificationsSection'), 'NotificationsSection') },
      { path: 'security', lazy: page(() => import('@/features/profile/SecuritySection'), 'SecuritySection') },
      { path: 'appearance', lazy: page(() => import('@/features/profile/AppearanceSection'), 'AppearanceSection') },
      { path: '*', element: <Navigate to="/coach/profile" replace /> },
    ],
  },
  { path: '*', element: <Navigate to="/coach/home" replace /> },
]

/**
 * Parents and students share one portal design: Home, Classes, Scores, Reports, News and Profile (a parent sees their
 * children).
 */
function familyRoutes(portal: 'parent' | 'student'): RouteObject[] {
  return [
    { index: true, element: <Navigate to="home" replace /> },
    { path: 'home', lazy: page(() => import('@/features/family/HomePage'), 'FamilyHomePage') },
    { path: 'classes', lazy: page(() => import('@/features/family/ClassesPage'), 'FamilyClassesPage') },
    { path: 'scores', lazy: page(() => import('@/features/family/ScoresPage'), 'FamilyScoresPage') },
    { path: 'reports', lazy: page(() => import('@/features/family/ReportsPage'), 'FamilyReportsPage') },
    { path: 'news', lazy: page(() => import('@/features/family/NewsPage'), 'FamilyNewsPage') },
    { path: 'news/:announcementId', lazy: page(() => import('@/features/family/NewsPage'), 'FamilyNewsPostPage') },
    {
      path: 'profile',
      lazy: page(() => import('@/features/family/ProfilePage'), 'FamilyProfilePage'),
      children: [
        { index: true, lazy: page(() => import('@/features/family/ProfilePage'), 'FamilyProfileIndex') },
        { path: 'account', lazy: page(() => import('@/features/family/ProfilePage'), 'FamilyAccountSection') },
        { path: 'security', lazy: page(() => import('@/features/profile/SecuritySection'), 'SecuritySection') },
        { path: 'appearance', lazy: page(() => import('@/features/profile/AppearanceSection'), 'AppearanceSection') },
        { path: 'help', lazy: page(() => import('@/features/family/ProfilePage'), 'FamilyHelpSection') },
        { path: '*', element: <Navigate to={`/${portal}/profile`} replace /> },
      ],
    },
    // Addresses of the pages these replaced (the student's Calendar and My Info, until 2026-10-17).
    { path: 'calendar', element: <Navigate to={`/${portal}/classes?view=month`} replace /> },
    { path: '*', element: <Navigate to={`/${portal}/home`} replace /> },
  ]
}

/**
 * Every signed-in page of the academy. Sky Arc is one academy: the portals sit at the top of the site (`/admin`,
 * `/coach`, `/parent`, `/student`, `/kiosk`), and `/app` sends each person to their own portal.
 */
export const academyRoute: RouteObject = {
  element: (
    <RequireAuth>
      <BranchProvider>
        <Outlet />
      </BranchProvider>
    </RequireAuth>
  ),
  children: [
    { path: '/app', element: <PortalHomeRedirect /> },
    // A progress report as families see it, printable (staff open it too); the rules decide who may read it.
    { path: '/report/:reportId', lazy: page(() => import('@/features/reports/ReportPage'), 'ReportPage') },
    {
      path: '/admin',
      element: (
        <RequirePortal role="admin">
          <PortalLayout portal="admin" />
        </RequirePortal>
      ),
      children: adminRoutes,
    },
    {
      path: '/coach',
      element: (
        <RequirePortal role="coach">
          <PortalLayout portal="coach" />
        </RequirePortal>
      ),
      children: coachRoutes,
    },
    {
      path: '/parent',
      element: (
        <RequirePortal role="parent">
          <PortalLayout portal="parent" />
        </RequirePortal>
      ),
      children: familyRoutes('parent'),
    },
    {
      path: '/student',
      element: (
        <RequirePortal role="student">
          <PortalLayout portal="student" />
        </RequirePortal>
      ),
      children: familyRoutes('student'),
    },
    {
      path: '/kiosk',
      children: [{ index: true, lazy: page(() => import('@/features/timeclock/KioskPage'), 'KioskPage') }],
      element: (
        <RequirePortal role="admin">
          <Outlet />
        </RequirePortal>
      ),
    },
  ],
}
