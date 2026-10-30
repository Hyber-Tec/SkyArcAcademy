import { cleanFolderName } from '../drive/files'
import { CONTRACTS_FOLDER_NAME, type DriveAccess, type DriveActor, type DriveFolder, contractsFolderId, studentFolderId } from '../drive/types'

/**
 * Where a signed enrollment contract is filed (docs/DECISIONS.md §23, F5): the student's Contracts folder, right in
 * their own folder in the Drive, which only owners and admins see. The server files each one as it's signed
 * (functions/src/contracts.ts), the website makes the folder when the office first puts something in it
 * (web/src/features/drive/api.ts), and scripts/contracts-to-students.ts moved there the ones from the single Contracts
 * folder there was before.
 */

/** Where a signed contract goes: the student's Contracts folder, owners' and admins' only, with no `studentId` (see contractsFolderId). */
export function contractFilePlace(studentId: string): { folderId: string; studentId: null; access: DriveAccess } {
  return { folderId: contractsFolderId(studentId), studentId: null, access: 'admins' }
}

/** A folder document to make, stamped with `at` (the server's timestamp, or a date). */
export interface FolderToMake<T> {
  id: string
  data: Omit<DriveFolder, 'createdAt' | 'updatedAt' | 'trashed' | 'trashedAt' | 'trashedBy'> & { createdAt: T; updatedAt: T }
}

/**
 * The folders a student's contracts need, those not there yet (`has`): the student's own folder (at the top, everyone's
 * on staff, as the first file filed for them makes it; the Drive shows it with the student's current name) and, right in
 * it, their Contracts folder, owners' and admins' only.
 */
export function contractFoldersToMake<T>(input: {
  studentId: string
  studentName: string
  has: { studentFolder: boolean; contractsFolder: boolean }
  by: DriveActor
  at: T
}): FolderToMake<T>[] {
  const { studentId, by, at } = input
  const stamp = { createdAt: at, createdBy: by, updatedAt: at, updatedBy: by }
  const out: FolderToMake<T>[] = []
  if (!input.has.studentFolder) {
    out.push({ id: studentFolderId(studentId), data: { name: input.studentName.trim() ? cleanFolderName(input.studentName) : 'Student', parentId: null, studentId, access: 'staff', ...stamp } })
  }
  if (!input.has.contractsFolder) {
    out.push({ id: contractsFolderId(studentId), data: { name: CONTRACTS_FOLDER_NAME, parentId: studentFolderId(studentId), studentId: null, access: 'admins', ...stamp } })
  }
  return out
}
