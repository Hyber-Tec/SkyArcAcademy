import type { MemberStatus, RestrictablePage, Role } from './roles'
import type { BusinessRules } from './settings/businessRules'
import type { SessionStatus } from './settings/defaults'
import type { SettingsOverrides } from './settings/resolve'
import type { PayType } from './pay/segment'
import type { DateKey, Weekday } from './time'

/** Structural Firestore Timestamp (shared code doesn't depend on the Firebase SDK). */
export interface TimestampLike {
  seconds: number
  nanoseconds: number
  toDate(): Date
  toMillis(): number
}

/** A Firestore document with its ID. */
export type WithId<T> = T & { id: string }

export interface AuditStamp {
  createdAt?: TimestampLike | null
  createdBy?: string | null
  updatedAt?: TimestampLike | null
  updatedBy?: string | null
}

// ------------------------------------------------------------------- academy

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  photoURL: string | null
  lastBranchId?: string | null
  lastPortal?: Role | null
  lastLoginAt?: TimestampLike | null
}

export type BranchStatus = 'active' | 'suspended' | 'archived'

export interface BranchBranding {
  logoUrl: string | null
  logoPath: string | null
  /** Hex color used for the brand mark and a few accents; the UI theme stays neutral. */
  accentColor: string | null
  sidebarTitle: string | null
}

export interface BranchContact {
  email: string
  phone: string
  address: string
  website: string
}

export interface Branch extends AuditStamp {
  name: string
  shortName: string
  status: BranchStatus
  timezone: string
  locale: string
  currency: string
  branding: BranchBranding
  contact: BranchContact
  settings: SettingsOverrides
  /** Core rules only the owner changes (`resolveBusinessRules`). */
  businessRules?: Partial<BusinessRules>
}

/** `branches/{b}/public/profile`: world-readable, used by the sign-up page, pickers and the privacy policy. */
export interface BranchPublicProfile {
  name: string
  shortName: string
  status: BranchStatus
  logoUrl: string | null
  accentColor: string | null
  timezone: string
  signupEnabled: boolean
  signupRoles: Role[]
  signupMessage: string
  /** The academy's contact details (Settings → Academy), shown on the privacy policy. Missing on profiles saved before. */
  contact?: BranchContact
}

// ------------------------------------------------------------- people/access

/** `branches/{b}/members/{emailLower}`: who may sign in to the branch, and as what. */
export interface Member extends AuditStamp {
  email: string
  displayName: string
  /** One role per person (owner decision, round 2). */
  role: Role
  status: MemberStatus
  staffId: string | null
  studentId: string | null
  studentIds: string[]
  /** Admins only: pages an owner blocked for them. */
  restrictions: RestrictablePage[]
  uid: string | null
  photoURL: string | null
  firstLoginAt: TimestampLike | null
  lastLoginAt: TimestampLike | null
  /** The last sign-in email, written by Cloud Functions. */
  invite?: MemberInvite | null
}

/**
 * Sign-in email status: `sent`; `failed` (with the error); `not_configured`
 * (the sending password isn't set yet); `skipped` (paused access, or a
 * suspended branch).
 */
export interface MemberInvite {
  status: 'sent' | 'failed' | 'not_configured' | 'skipped'
  kind: 'owner' | 'promoted_owner' | 'added' | 'approved'
  at: TimestampLike
  by: string | null
  error: string | null
  count: number
}

export type SignupRequestStatus = 'pending' | 'approved' | 'rejected'

/** `branches/{b}/signupRequests/{emailLower}`: written by the person on the branch sign-up page. */
export interface SignupRequest {
  email: string
  uid: string
  photoURL: string | null
  requestedRole: Role
  firstName: string
  lastName: string
  phone: string
  message: string
  /** Parents: the student(s) they're signing up for. */
  studentNames: string
  status: SignupRequestStatus
  createdAt: TimestampLike | null
  updatedAt: TimestampLike | null
  decidedAt?: TimestampLike | null
  decidedBy?: string | null
  decisionNote?: string | null
}

/** Employees: owners and admins run the branch, only coaches teach. */
export type StaffRole = Extract<Role, 'owner' | 'admin' | 'coach'>
export type StaffStatus = 'active' | 'on_hold' | 'finished'

export interface NotificationPrefs {
  announcements: boolean
  sessionCreated: boolean
  sessionChanged: boolean
  sessionCanceled: boolean
}

/** `branches/{b}/staff/{staffId}`: employee record. */
export interface Staff extends AuditStamp {
  firstName: string
  lastName: string
  name: string
  nameLower: string
  email: string
  phone: string
  role: StaffRole
  status: StaffStatus
  /** Calendar color for the schedule and Employee Calendar. */
  color: string
  startDate: DateKey | null
  endDate: DateKey | null
  dob: DateKey | null
  address: string
  hasKioskPin: boolean
  notificationPrefs: NotificationPrefs
}

/** `staff/{id}/private/notes`: admin-only. */
export interface StaffNotes {
  adminNote: string
  updatedAt?: TimestampLike | null
  updatedBy?: string | null
}

/** `staff/{id}/private/compensation`. */
export interface Compensation {
  /**
   * Hourly rates. Coaches: `teaching` (and `admin` for non-teaching time under
   * Teaching + Admin). Owners and admins: `admin` is their one hourly rate.
   */
  rates: { teaching: number; admin: number }
  /** Unused since round 2 (the pay model is a branch rule); kept on older records. */
  payModel?: string
  history: { effectiveFrom: DateKey; rates: { teaching: number; admin: number }; setAt: string; setBy: string }[]
  updatedAt?: TimestampLike | null
  updatedBy?: string | null
}

export type StudentStatus = 'signed_up' | 'enrolled' | 'paused' | 'no_answer' | 'not_interested' | 'finished'

/** `branches/{b}/students/{id}`: the basic record every staff member may read. */
export interface Student extends AuditStamp {
  firstName: string
  lastName: string
  name: string
  nameLower: string
  grade: string
  school: string
  /** One of `settings.students.levels`, or null when not assessed yet. */
  level: string | null
  /** One of `settings.students.programs`, or null. */
  program: string | null
  /** The rifle the academy gives the student, by its own code ("C9", "P", "JG"); null or missing when none is set. */
  rifle?: string | null
  status: StudentStatus
  statusSource: 'auto' | 'manual'
  signUpDate: DateKey | null
  firstSessionDate: DateKey | null
  lastSessionDate: DateKey | null
  nextSessionDate: DateKey | null
  /** Set when an admin first opens a new student (Home "new students to follow up"). */
  followUpReviewedAt: TimestampLike | null
}

export interface ParentContact {
  name: string
  email: string
  phone: string
  relation: string
}

/** `students/{id}/private/profile`: admin-only contact and sensitive data. */
export interface StudentPrivateProfile {
  email: string
  phone: string
  dob: DateKey | null
  address: string
  parents: ParentContact[]
  adminNote: string
  customFields: Record<string, string>
}

// --------------------------------------------------------------- scheduling

/**
 * `branches/{b}/classes/{id}`: a class, one time on one day with its seats (the sheets' six), taught together by every
 * coach in at that time (their availability that day). Its students are its sessions (`Session.classId`).
 */
export interface AcademyClass extends AuditStamp {
  dateKey: DateKey
  weekday: Weekday
  startMin: number
  endMin: number
  startAt: TimestampLike
  endAt: TimestampLike
  /** Start of the next local day; rules refuse client edits once it has passed. */
  dayEndAt: TimestampLike
  /** Students it takes (`businessRules.seatsPerClass` when it was made). */
  seats: number
  /** For the coaches: what to work on, equipment, anything to pass on. */
  note: string
  source: 'manual' | 'duplicate_week' | 'import' | 'seed'
  isDeleted: boolean
  deletedAt: TimestampLike | null
  deletedBy: string | null
}

/**
 * `branches/{b}/sessions/{id}`: one student in one class, their seat (called a Class everywhere families see it). Its
 * time is the class's, or part of it (a half-hour trial). `note` is its label in the sheets' own words ("MU for 10/13",
 * "Practice", "Trial 1").
 */
export interface Session extends AuditStamp {
  /** The class it's a seat in (`classes/{id}`); missing on sessions from before classes were taught together. */
  classId: string
  /**
   * The one coach a session had before classes were taught together (the sample data, and the phone app until its
   * update reads `classId`). Empty on every seat since: a class's coaches are the ones in at its time.
   */
  coachId: string
  coachName: string
  studentId: string
  studentName: string
  studentGrade: string
  note: string
  status: SessionStatus
  dateKey: DateKey
  weekday: Weekday
  startMin: number
  endMin: number
  startAt: TimestampLike
  endAt: TimestampLike
  /** Start of the next local day; rules refuse client edits once it has passed. */
  dayEndAt: TimestampLike
  visualOrder: number
  confirmedAt: TimestampLike | null
  confirmedBy: string | null
  source: 'manual' | 'paste' | 'duplicate_week' | 'master' | 'student_calendar' | 'seed' | 'import'
  isDeleted: boolean
  deletedAt: TimestampLike | null
  deletedBy: string | null
}

export interface AvailabilityRange {
  startMin: number
  endMin: number
}

/**
 * `availability/{staffId}_{dateKey}`: a coach's hours that day, which are also who's in: every coach in at a class's time
 * teaches it.
 */
export interface Availability extends AuditStamp {
  staffId: string
  /** Their name, so other coaches see who's in with them (they can't read each other's staff records). */
  staffName?: string
  /** Their role: the manager or the owner can be in without teaching (only coaches teach). */
  staffRole?: StaffRole
  dateKey: DateKey
  weekday: Weekday
  ranges: AvailabilityRange[]
  /** Explicitly not available that day. */
  unavailable: boolean
  /** Hide the row on the schedule when there is nothing on it. */
  hidden: boolean
  /** First instant of the day; rules use it for the coach lock window. */
  dayStartAt: TimestampLike
  updatedVia: 'coach' | 'admin'
}

export interface DayConfig extends AuditStamp {
  dateKey: DateKey
  isOpen: boolean
  openMin: number
  closeMin: number
}

// ---------------------------------------------------------------- time clock

/** `branches/{b}/clockShifts/{id}`: one clock-in to clock-out (the kiosk, an admin's time entry, or the automatic clock-out). */
export interface ClockShift {
  staffId: string
  staffName: string
  dateKey: DateKey
  inMin: number
  clockInAt: TimestampLike
  clockOutAt: TimestampLike | null
  outDateKey: DateKey | null
  outMin: number | null
  status: 'open' | 'closed'
  source: 'kiosk' | 'admin' | 'auto'
  autoClosed: boolean
  autoCorrected: boolean
  /** An admin's forced pay type for the whole shift (e.g. a meeting that is all admin time). */
  forcedType: PayType | null
  note: string
}

// -------------------------------------------------------------------- audit

export type AuditCategory = 'schedule' | 'event' | 'availability' | 'people' | 'pay' | 'announcements' | 'settings' | 'access' | 'drive' | 'reports' | 'website'

export interface AuditChange {
  field: string
  label: string
  from: string | number | boolean | null
  to: string | number | boolean | null
}

/** `branches/{b}/auditLog/{id}`: append-only. */
export interface AuditEntry {
  at: TimestampLike | null
  actorUid: string
  actorEmail: string
  actorName: string
  actorRole: Role | 'system'
  action: string
  category: AuditCategory
  entityType: string
  entityId: string
  summary: string
  context: string
  dateKey: DateKey | null
  studentId: string | null
  studentName: string | null
  coachId: string | null
  coachName: string | null
  changes: AuditChange[]
  /** Where the change was made: the website, the phone app, a Cloud Function or the kiosk. */
  via: 'web' | 'app' | 'function' | 'kiosk'
}
