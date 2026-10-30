import type { TimestampLike } from '../types'

/**
 * The Drive: the academy's files as folders and files, with one folder per student at the top (modeled on the drive
 * of another app Goo built, docs/DECISIONS.md §7). SIUS PDFs and target photos are dragged into a student's folder;
 * their scores become evaluations (shooting/evaluation.ts) and the reports are built from those. Only staff open the
 * Drive: families never see these files.
 */

/** Who did something, as the Drive shows it ("Oct 16, 2026 by Paige"). */
export interface DriveActor {
  uid: string
  email: string
  name: string
}

/**
 * Who sees a folder or a file (docs/DECISIONS.md §23, F6): everyone on staff (owners, admins and coaches), or owners and
 * admins only. Admins choose it for a folder, and it covers everything inside: each folder and file carries its own, so
 * the security rules can check it (coaches' lists ask for `access == 'staff'`). Moving something into a folder only
 * owners and admins see makes it theirs; out of one, it's everyone's on staff again. A student's folder, and everything
 * in it, is everyone's on staff, but for the student's Contracts folder (contractsFolderId) and what's in it. Documents
 * from before (and the phone app's, until it writes it) have none: they read as `staff`, and a function writes it in
 * (functions/src/drive.ts).
 */
export type DriveAccess = 'staff' | 'admins'

export const DRIVE_ACCESS_LABELS: Record<DriveAccess, string> = {
  staff: 'Everyone on staff',
  admins: 'Owners and admins',
}

/** A folder's or a file's access, reading a missing one as everyone on staff's. */
export function accessOf(item: { access?: DriveAccess | null } | null | undefined): DriveAccess {
  return item?.access === 'admins' ? 'admins' : 'staff'
}

/**
 * A student's Contracts folder (F5; the owner, 2026-10-29: "each student needs a contract folder, that's where we hold
 * that student's contract"): `contracts-{studentId}`, right in the student's folder, for owners and admins only. Their
 * signed enrollment contracts land in it: the server makes it (and the student's folder, if need be) with the first one
 * (functions/src/contracts.ts), and until then the website shows owners and admins a stand-in in every student's folder.
 * It can't be renamed, moved, put in the Trash or opened to coaches. What's in it carries no `studentId`: a coach's list
 * of one student's files (the phone's student page) asks by student alone, so the rules let coaches list a file with a
 * student only because every such file is everyone's on staff (firestore.rules).
 */
export function contractsFolderId(studentId: string): string {
  return `contracts-${studentId}`
}

export const CONTRACTS_FOLDER_NAME = 'Contracts'

/**
 * The one Contracts folder at the top that held every student's signed contract before each had theirs.
 * scripts/contracts-to-students.ts moves each into its student's Contracts folder and removes it; until then it stays
 * as it was: at the top, owners' and admins' only, fixed.
 */
export const OLD_CONTRACTS_FOLDER_ID = 'contracts'

const CONTRACTS_PREFIX = 'contracts-'

/** The student whose Contracts folder this is (null: it isn't a student's Contracts folder). */
export function contractsFolderStudent(folderId: string | null | undefined): string | null {
  return folderId && folderId.startsWith(CONTRACTS_PREFIX) && folderId.length > CONTRACTS_PREFIX.length ? folderId.slice(CONTRACTS_PREFIX.length) : null
}

/** A Contracts folder: a student's, or the one at the top from before. */
export function isContractsFolder(folderId: string | null | undefined): boolean {
  return folderId === OLD_CONTRACTS_FOLDER_ID || contractsFolderStudent(folderId) !== null
}

/** A folder that stays as it is (a student's, or a Contracts folder): no renaming, moving or Trash. */
export function isFixedFolder(folder: { id: string; studentId?: string | null }): boolean {
  return !!folder.studentId || isContractsFolder(folder.id)
}

/** `branches/{b}/driveFolders/{id}`. */
export interface DriveFolder {
  name: string
  /** The folder it sits in; null at the top. */
  parentId: string | null
  /** A student's own folder (ID `student-{studentId}`, always at the top): its name follows the student's. */
  studentId: string | null
  /** Who sees it and everything in it; missing reads as `staff`. */
  access?: DriveAccess
  createdAt: TimestampLike | null
  createdBy: DriveActor | null
  updatedAt?: TimestampLike | null
  updatedBy?: DriveActor | null
  /** In the Trash. Only this folder is flagged; what's inside comes back with it on Restore. */
  trashed?: boolean
  trashedAt?: TimestampLike | null
  trashedBy?: DriveActor | null
}

export type DriveFileStatus = 'uploading' | 'ready' | 'error'

/** `branches/{b}/driveFiles/{id}`; the bytes are at `branches/{b}/drive/{id}` in Storage. */
export interface DriveFile {
  name: string
  size: number
  /** Lower-case extension, e.g. "pdf". */
  kind: string
  mime: string
  status: DriveFileStatus
  /** Why an upload failed. */
  error?: string | null
  folderId: string | null
  /**
   * The student whose folder holds it, at any depth; null elsewhere, and in the student's Contracts folder (owners' and
   * admins', see contractsFolderId). Kept in step when it moves.
   */
  studentId: string | null
  /** Who sees it: its folder's (`staff` at the top); missing reads as `staff`. */
  access?: DriveAccess
  /** The evaluation made from it (a SIUS result, or a paper card's scores). */
  evaluationId?: string | null
  /** Its name on the computer it came from, when the Drive renamed it (SIUS results are named by date). */
  originalName?: string | null
  uploadedAt: TimestampLike | null
  uploadedBy: DriveActor | null
  updatedAt?: TimestampLike | null
  updatedBy?: DriveActor | null
  trashed?: boolean
  trashedAt?: TimestampLike | null
  trashedBy?: DriveActor | null
}

/** A student's own folder. */
export function studentFolderId(studentId: string): string {
  return `student-${studentId}`
}

/** Where a file's bytes live in Storage. */
export function driveObjectPath(branchId: string, fileId: string): string {
  return `branches/${branchId}/drive/${fileId}`
}
