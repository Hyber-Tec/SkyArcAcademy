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
 * in it, is everyone's on staff. Documents from before (and the phone app's, until it writes it) have none: they read
 * as `staff`, and a function writes it in (functions/src/drive.ts).
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
 * The Contracts folder (F5): signed enrollment contracts, at the top, only owners and admins see it. It's made when an
 * admin opens Settings → Enrollment contract, or when the first contract is signed, and it can't be moved, renamed or
 * put in the Trash.
 */
export const CONTRACTS_FOLDER_ID = 'contracts'
export const CONTRACTS_FOLDER_NAME = 'Contracts'

/** A folder that stays as it is (a student's, or the Contracts folder): no renaming, moving or Trash. */
export function isFixedFolder(folder: { id: string; studentId?: string | null }): boolean {
  return !!folder.studentId || folder.id === CONTRACTS_FOLDER_ID
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
  /** The student whose folder holds it, at any depth; null elsewhere. Kept in step when it moves. */
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
