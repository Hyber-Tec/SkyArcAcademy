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

/** `branches/{b}/driveFolders/{id}`. */
export interface DriveFolder {
  name: string
  /** The folder it sits in; null at the top. */
  parentId: string | null
  /** A student's own folder (ID `student-{studentId}`, always at the top): its name follows the student's. */
  studentId: string | null
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
