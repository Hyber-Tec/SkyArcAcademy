import { type FolderToMake, contractFoldersToMake } from '../../shared/src/contracts/filing'
import { type DriveActor, OLD_CONTRACTS_FOLDER_ID, contractsFolderId, studentFolderId } from '../../shared/src/drive/types'
import type { StoredDoc } from './drive-access'

/**
 * What scripts/contracts-to-students.ts does for one academy (docs/DECISIONS.md §23, F5): every file in the Contracts
 * folder at the top goes in its student's Contracts folder, the student being the one whose signing link filed it
 * (`contractLinks`, by `fileId`), with the student's folder and their Contracts folder made first when they aren't
 * there. A file no link names, and a folder someone made in the old folder, stay where they are, for the office to sort
 * on the website; once nothing is left in it, the old folder goes.
 */

export interface StudentContracts {
  studentId: string
  /** The student's name now (or the one on the link, for a student no longer in the academy's list). */
  studentName: string
  /** The folders made first: the student's (when it isn't there) and their Contracts folder (when it isn't). */
  folders: FolderToMake<Date>[]
  /** The files to move, A to Z. */
  files: { id: string; name: string }[]
}

export interface ContractsPlan {
  /** The Contracts folder at the top is there. */
  oldFolder: boolean
  students: StudentContracts[]
  /** Files in the old folder no signing link names: they stay. */
  unmatched: { id: string; name: string }[]
  /** Folders in the old folder: they stay. */
  folders: { id: string; name: string }[]
  /** Nothing is left in the old folder once the files move: it can go. */
  emptied: boolean
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en', { numeric: true })

export function planContractsMove(input: {
  folders: readonly StoredDoc[]
  files: readonly StoredDoc[]
  links: readonly StoredDoc[]
  students: readonly StoredDoc[]
  by: DriveActor
  at: Date
}): ContractsPlan {
  const folderIds = new Set(input.folders.map((f) => f.id))
  const names = new Map(input.students.map((s) => [s.id, text(s.data.name).trim()]))
  // The signing link that filed each file (one per signature).
  const linkOf = new Map<string, { studentId: string; studentName: string }>()
  for (const l of input.links) {
    const fileId = text(l.data.fileId)
    const studentId = text(l.data.studentId)
    if (fileId && studentId && !linkOf.has(fileId)) linkOf.set(fileId, { studentId, studentName: text(l.data.studentName).trim() })
  }
  const inOld = input.files
    .filter((f) => f.data.folderId === OLD_CONTRACTS_FOLDER_ID)
    .map((f) => ({ id: f.id, name: text(f.data.name) || f.id }))
    .sort(byName)
  const students = new Map<string, StudentContracts>()
  const unmatched: { id: string; name: string }[] = []
  for (const f of inOld) {
    const link = linkOf.get(f.id)
    if (!link) {
      unmatched.push(f)
      continue
    }
    let s = students.get(link.studentId)
    if (!s) {
      const studentName = names.get(link.studentId) || link.studentName || 'Student'
      const has = { studentFolder: folderIds.has(studentFolderId(link.studentId)), contractsFolder: folderIds.has(contractsFolderId(link.studentId)) }
      s = { studentId: link.studentId, studentName, folders: contractFoldersToMake({ studentId: link.studentId, studentName, has, by: input.by, at: input.at }), files: [] }
      students.set(link.studentId, s)
    }
    s.files.push(f)
  }
  const folders = input.folders
    .filter((f) => f.data.parentId === OLD_CONTRACTS_FOLDER_ID)
    .map((f) => ({ id: f.id, name: text(f.data.name) || f.id }))
    .sort(byName)
  return {
    oldFolder: folderIds.has(OLD_CONTRACTS_FOLDER_ID),
    students: [...students.values()].sort((a, b) => byName({ name: a.studentName }, { name: b.studentName })),
    unmatched,
    folders,
    emptied: !unmatched.length && !folders.length,
  }
}
