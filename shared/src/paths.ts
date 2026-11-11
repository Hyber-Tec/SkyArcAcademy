/** Firestore collection names. All academy data lives under `branches/{ACADEMY_ID}` (shared/src/academy.ts). */
export const ROOT = {
  branches: 'branches',
  users: 'users',
} as const

export const COL = {
  public: 'public',
  members: 'members',
  signupRequests: 'signupRequests',
  staff: 'staff',
  students: 'students',
  /** Classes: a time on a day with its seats (`AcademyClass`); `sessions` are the students in them. */
  classes: 'classes',
  sessions: 'sessions',
  /** Families' requests for a seat (shared/src/schedule/requests.ts), and each class's seats taken, without names. */
  classRequests: 'classRequests',
  classSeats: 'classSeats',
  availability: 'availability',
  dayConfigs: 'dayConfigs',
  events: 'events',
  auditLog: 'auditLog',
  clockShifts: 'clockShifts',
  openShifts: 'openShifts',
  kioskPins: 'kioskPins',
  /** Server-only: how often each person tried their own PIN today (functions' `setMyKioskPin`). */
  kioskPinTries: 'kioskPinTries',
  /**
   * The kiosk tablet (shared/src/kiosk, functions/src/kiosk.ts): the tablets registered with the setup PIN
   * (`kioskDevices`, admins read them), and the server-only setup PIN (`kioskSetup/pin`; `kioskSetup/status` says when
   * it was set) and each clock-in or clock-out a tablet sent (`kioskOps`, so one is applied once).
   */
  kioskDevices: 'kioskDevices',
  kioskSetup: 'kioskSetup',
  kioskOps: 'kioskOps',
  payroll: 'payroll',
  payPeriods: 'payPeriods',
  announcements: 'announcements',
  notifications: 'notifications',
  /** Families' and the office's notification switches, by email (shared/src/notices.ts; coaches keep theirs on `staff`). */
  notificationPrefs: 'notificationPrefs',
  /** The Drive's folders and files (shared/src/drive/types.ts). */
  driveFolders: 'driveFolders',
  driveFiles: 'driveFiles',
  /** Scored targets: SIUS results and paper cards (shared/src/shooting/evaluation.ts). */
  evaluations: 'evaluations',
  progressReports: 'progressReports',
  /** The public website (shared/src/website): its photos, the news copied from announcements, the messages sent. */
  websitePhotos: 'websitePhotos',
  websitePosts: 'websitePosts',
  websiteMessages: 'websiteMessages',
  /** Server only: how many messages a sender sent lately (and how often a signing link was asked for). */
  websiteLimits: 'websiteLimits',
  /**
   * The enrollment contract (shared/src/contracts): each version of it, the contracts the office sent (each with its
   * link), each student's signed one (`SignedContract`, by student ID), and the academy's signature (`AcademySigner`).
   */
  contractTemplates: 'contractTemplates',
  contractLinks: 'contractLinks',
  /** A family's request for a child's contract, from the academy's sign (docs/DECISIONS.md §39): the server writes it. */
  contractRequests: 'contractRequests',
  signedContracts: 'signedContracts',
  contractSigner: 'contractSigner',
  /**
   * Server only: each email the server linked by the records (shared/src/access/onFile.ts), by email. One the office
   * then removed isn't linked again by itself (it asks the academy instead).
   */
  accessLinks: 'accessLinks',
  /**
   * Competition results brought in from the tournaments' results site (shared/src/scores/resultsSite.ts,
   * functions/src/resultsSite): its status (`resultsSite/status`, admins read it), its key (`resultsSiteKey/main`,
   * server only), each check of the site (`resultsSiteRuns`), the athletes found there (`onlineAthletes`, by their name's
   * key) and the matches looked at (`onlineMatches`, by the site's match ID).
   */
  resultsSite: 'resultsSite',
  resultsSiteKey: 'resultsSiteKey',
  resultsSiteRuns: 'resultsSiteRuns',
  onlineAthletes: 'onlineAthletes',
  onlineMatches: 'onlineMatches',
  /**
   * SCATT sessions (shared/src/scatt/session.ts): each session's shots and numbers, and apart, each shot's trace. The
   * server writes them from a SCATT file in a student's Drive folder (functions/src/scatt); staff and the student's
   * family read them.
   */
  scattSessions: 'scattSessions',
  scattTraces: 'scattTraces',
} as const

export type BranchCollection = (typeof COL)[keyof typeof COL]

/** Collections under `users/{uid}`. */
export const USER_COL = {
  /** The phone app's installs, with their push tokens (`DeviceDoc`). */
  devices: 'devices',
  /** Server-only state (e.g. how many account emails were sent), no client access. */
  private: 'private',
} as const

/** Sub-documents with fixed IDs. */
export const DOC = {
  publicProfile: 'profile', // branches/{b}/public/profile
  websiteContent: 'website', // branches/{b}/public/website
  privateProfile: 'profile', // students/{id}/private/profile
  compensation: 'compensation', // staff/{id}/private/compensation
  staffNotes: 'notes', // staff/{id}/private/notes
  payrollState: 'state', // branches/{b}/payroll/state
  resultsSiteStatus: 'status', // branches/{b}/resultsSite/status
  resultsSiteKey: 'main', // branches/{b}/resultsSiteKey/main
} as const

export function emailKey(email: string): string {
  return email.trim().toLowerCase()
}

export function branchDocPath(branchId: string): string {
  return `${ROOT.branches}/${branchId}`
}

export function branchColPath(branchId: string, col: BranchCollection): string {
  return `${ROOT.branches}/${branchId}/${col}`
}

export function availabilityDocId(staffId: string, dateKey: string): string {
  return `${staffId}_${dateKey}`
}
