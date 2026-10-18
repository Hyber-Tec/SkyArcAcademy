import { type WriteBatch, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { deleteObject, ref as storageRef } from 'firebase/storage'
import { cleanFileName, cleanFolderName } from '@shared/drive/files'
import type { DriveIndex } from '@shared/drive/model'
import { type DriveActor, type DriveFile, type DriveFolder, driveObjectPath, studentFolderId } from '@shared/drive/types'
import { COL } from '@shared/paths'
import type { WithId } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db, storage } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'

/**
 * The Drive's writes. Moving something to the Trash flags that one document (what's inside a folder comes back with
 * it on Restore); nothing is deleted until someone deletes it from the Trash. Every change writes an audit entry.
 */

export const driveActor = (a: Actor): DriveActor => ({ uid: a.uid, email: a.email, name: a.name })

const folderRef = (branchId: string, id: string) => branchDocRef(branchId, COL.driveFolders, id)
const fileRef = (branchId: string, id: string) => branchDocRef(branchId, COL.driveFiles, id)

/** Firestore takes up to 500 writes in a batch; stay well under. */
const BATCH_MAX = 400

async function commitAll(writes: ((b: WriteBatch) => void)[]) {
  for (let i = 0; i < writes.length; i += BATCH_MAX) {
    const batch = writeBatch(db)
    for (const w of writes.slice(i, i + BATCH_MAX)) w(batch)
    await batch.commit()
  }
}

/** Something landed in, left or changed inside a folder: its Updated moves. */
const touched = (a: Actor) => ({ updatedAt: serverTimestamp(), updatedBy: driveActor(a) })

/**
 * Makes sure a folder that will receive files has a document: a student's folder exists from the start as a stand-in
 * until its first file. Adds the write to `writes` and returns nothing when it's already there.
 */
export function folderWrites(branchId: string, index: DriveIndex, folderId: string | null, actor: Actor): ((b: WriteBatch) => void)[] {
  if (!folderId) return []
  const folder = index.folderOf(folderId)
  if (folder && (folder as { virtual?: boolean }).virtual) {
    const data = { name: folder.name, parentId: null, studentId: folder.studentId, createdAt: serverTimestamp(), createdBy: driveActor(actor), ...touched(actor) }
    return [(b) => b.set(folderRef(branchId, folderId), data)]
  }
  return [(b) => b.update(folderRef(branchId, folderId), touched(actor))]
}

export function newFileId(branchId: string): string {
  return doc(branchCol(branchId, COL.driveFiles)).id
}

export async function createFolder(branchId: string, actor: Actor, index: DriveIndex, name: string, parentId: string | null): Promise<string> {
  const ref = doc(branchCol(branchId, COL.driveFolders))
  const clean = cleanFolderName(name)
  const writes = [
    ...folderWrites(branchId, index, parentId, actor),
    (b: WriteBatch) => b.set(ref, { name: clean, parentId, studentId: null, createdAt: serverTimestamp(), createdBy: driveActor(actor) }),
    (b: WriteBatch) =>
      addAudit(b, branchId, actor, {
        action: 'drive.folder_create',
        category: 'drive',
        entityType: 'driveFolder',
        entityId: ref.id,
        summary: `Made the folder “${clean}”${parentId ? ` in “${index.folderOf(parentId)?.name ?? 'a folder'}”` : ''}`,
        studentId: index.studentOf(parentId),
      }),
  ]
  await commitAll(writes)
  return ref.id
}

/**
 * The folders a dropped desktop folder needs, made first and in one pass, so its files land together; a folder of
 * the same name already there is reused (dropping "Old results" twice merges, as on a computer).
 */
export async function ensureFolderPaths(branchId: string, actor: Actor, index: DriveIndex, baseId: string | null, paths: string[][]): Promise<Map<string, string | null>> {
  const fold = (s: string) => cleanFolderName(s).toLowerCase()
  const byParent = new Map<string, Map<string, string>>()
  const note = (parentId: string | null, name: string, id: string) => {
    const key = parentId ?? ''
    if (!byParent.has(key)) byParent.set(key, new Map())
    const names = byParent.get(key)!
    if (!names.has(fold(name))) names.set(fold(name), id)
  }
  for (const f of index.folders) note(f.parentId, f.name, f.id)
  const out = new Map<string, string | null>([['', baseId]])
  const writes: ((b: WriteBatch) => void)[] = [...folderWrites(branchId, index, baseId, actor)]
  for (const chain of paths) {
    let parent = baseId
    const segs: string[] = []
    for (const seg of chain) {
      segs.push(seg)
      const key = segs.map(cleanFolderName).join('/')
      if (!out.has(key)) {
        let id = byParent.get(parent ?? '')?.get(fold(seg))
        if (!id) {
          const ref = doc(branchCol(branchId, COL.driveFolders))
          id = ref.id
          const data = { name: cleanFolderName(seg), parentId: parent, studentId: null, createdAt: serverTimestamp(), createdBy: driveActor(actor) }
          writes.push((b) => b.set(ref, data))
          note(parent, seg, id)
        }
        out.set(key, id)
      }
      parent = out.get(key) ?? null
    }
  }
  await commitAll(writes)
  return out
}

export async function renameFolder(branchId: string, actor: Actor, folder: WithId<DriveFolder>, name: string) {
  const clean = cleanFolderName(name)
  const batch = writeBatch(db)
  batch.update(folderRef(branchId, folder.id), { name: clean, ...touched(actor) })
  addAudit(batch, branchId, actor, { action: 'drive.folder_rename', category: 'drive', entityType: 'driveFolder', entityId: folder.id, summary: `Renamed the folder “${folder.name}” to “${clean}”` })
  await batch.commit()
}

export async function renameFile(branchId: string, actor: Actor, file: WithId<DriveFile>, name: string) {
  const clean = cleanFileName(name)
  if (!clean) throw new Error('A file needs a name.')
  const batch = writeBatch(db)
  batch.update(fileRef(branchId, file.id), { name: clean, ...touched(actor) })
  if (file.folderId) batch.update(folderRef(branchId, file.folderId), touched(actor))
  addAudit(batch, branchId, actor, { action: 'drive.file_rename', category: 'drive', entityType: 'driveFile', entityId: file.id, summary: `Renamed “${file.name}” to “${clean}”`, studentId: file.studentId })
  await batch.commit()
}

/** A file leaving its student's folder stops being a score's file, if it was one. */
const unlinked = (f: Pick<DriveFile, 'evaluationId'>) => (f.evaluationId ? { evaluationId: null } : {})

/**
 * Moves folders and files into `targetId` (null: the top). A move keeps what moves as it was; the folder it lands in
 * has changed. Files keep track of whose folder they're in, at any depth; a score's file that leaves its student stops
 * being a score's file (`evaluationId` cleared), so neither family sees it (storage.rules).
 */
export async function moveItems(branchId: string, actor: Actor, index: DriveIndex, folderIds: string[], fileIds: string[], targetId: string | null) {
  if (!index.canMoveInto(folderIds, targetId)) throw new Error('A folder can’t go inside itself, and a student’s folder stays where it is.')
  const student = index.studentOf(targetId)
  const writes: ((b: WriteBatch) => void)[] = [...folderWrites(branchId, index, targetId, actor)]
  for (const id of folderIds) {
    if (id === targetId) continue
    writes.push((b) => b.update(folderRef(branchId, id), { parentId: targetId }))
    for (const f of index.subtreeFiles(id)) if ((f.studentId ?? null) !== student) writes.push((b) => b.update(fileRef(branchId, f.id), { studentId: student, ...unlinked(f) }))
  }
  for (const id of fileIds) {
    const f = index.fileOf(id)
    writes.push((b) => b.update(fileRef(branchId, id), { folderId: targetId, studentId: student, ...(f && (f.studentId ?? null) !== student ? unlinked(f) : {}) }))
  }
  const names = [...folderIds.map((id) => index.folderOf(id)?.name), ...fileIds.map((id) => index.fileOf(id)?.name)].filter(Boolean)
  const into = targetId ? `“${index.folderOf(targetId)?.name ?? 'a folder'}”` : 'the top of the Drive'
  writes.push((b) =>
    addAudit(b, branchId, actor, {
      action: 'drive.move',
      category: 'drive',
      entityType: 'drive',
      entityId: targetId ?? 'top',
      summary: `Moved ${names.length === 1 ? `“${names[0]}”` : `${names.length} items`} to ${into}`,
      studentId: student,
    }),
  )
  await commitAll(writes)
}

/** Moves folders and files to the Trash: one flag each; what's inside a folder stays as it is. */
export async function trashItems(branchId: string, actor: Actor, folders: WithId<DriveFolder>[], files: WithId<DriveFile>[]) {
  if (folders.some((f) => f.studentId)) throw new Error('A student’s folder can’t go to the Trash.')
  const stamp = { trashed: true, trashedAt: serverTimestamp(), trashedBy: driveActor(actor) }
  const leaving = new Set(folders.map((f) => f.id))
  const writes: ((b: WriteBatch) => void)[] = []
  for (const id of new Set([...folders.map((f) => f.parentId), ...files.map((f) => f.folderId)])) {
    if (id && !leaving.has(id)) writes.push((b) => b.update(folderRef(branchId, id), touched(actor)))
  }
  for (const f of folders) writes.push((b) => b.update(folderRef(branchId, f.id), stamp))
  for (const f of files) writes.push((b) => b.update(fileRef(branchId, f.id), stamp))
  const all = [...folders.map((f) => f.name), ...files.map((f) => f.name)]
  writes.push((b) =>
    addAudit(b, branchId, actor, {
      action: 'drive.trash',
      category: 'drive',
      entityType: 'drive',
      entityId: folders[0]?.id ?? files[0]?.id ?? 'trash',
      summary: `Moved ${all.length === 1 ? `“${all[0]}”` : `${all.length} items`} to the Trash`,
      studentId: files[0]?.studentId ?? null,
    }),
  )
  await commitAll(writes)
}

/** Brings items back from the Trash, with everything inside them; one whose folder is gone lands at the top. */
export async function restoreItems(branchId: string, actor: Actor, items: { kind: 'folder' | 'file'; id: string; name: string }[], liveFolderIds: Set<string>, rawFolders: WithId<DriveFolder>[], rawFiles: WithId<DriveFile>[]) {
  const clear = { trashed: false, trashedAt: null, trashedBy: null }
  const writes: ((b: WriteBatch) => void)[] = []
  for (const it of items) {
    if (it.kind === 'folder') {
      const f = rawFolders.find((x) => x.id === it.id)
      const parentGone = !!f?.parentId && !liveFolderIds.has(f.parentId)
      writes.push((b) => b.update(folderRef(branchId, it.id), { ...clear, ...(parentGone ? { parentId: null } : {}) }))
    } else {
      const f = rawFiles.find((x) => x.id === it.id)
      const folderGone = !!f?.folderId && !liveFolderIds.has(f.folderId)
      writes.push((b) => b.update(fileRef(branchId, it.id), { ...clear, ...(folderGone ? { folderId: null, studentId: null } : {}) }))
    }
  }
  writes.push((b) =>
    addAudit(b, branchId, actor, {
      action: 'drive.restore',
      category: 'drive',
      entityType: 'drive',
      entityId: items[0]?.id ?? 'trash',
      summary: `Restored ${items.length === 1 ? `“${items[0].name}”` : `${items.length} items`} from the Trash`,
    }),
  )
  await commitAll(writes)
}

/**
 * Deletes items from the Trash for good: a folder with everything inside it, files with their bytes. Whatever is
 * inside a trashed folder is flagged first (the rules delete only what's in the Trash), then the bytes go, then the
 * records. Evaluations made from deleted files stay.
 */
export async function deleteForever(branchId: string, actor: Actor, items: { kind: 'folder' | 'file'; id: string; name: string }[], rawFolders: WithId<DriveFolder>[], rawFiles: WithId<DriveFile>[]) {
  const folderIds = new Set<string>()
  const fileIds = new Set<string>()
  for (const it of items) {
    if (it.kind === 'file') fileIds.add(it.id)
    else {
      folderIds.add(it.id)
      let grew = true
      while (grew) {
        grew = false
        for (const f of rawFolders) if (f.parentId && folderIds.has(f.parentId) && !folderIds.has(f.id)) {
          folderIds.add(f.id)
          grew = true
        }
      }
    }
  }
  for (const f of rawFiles) if (f.folderId && folderIds.has(f.folderId)) fileIds.add(f.id)
  const flag = { trashed: true }
  await commitAll([
    ...[...folderIds].filter((id) => !rawFolders.find((f) => f.id === id)?.trashed).map((id) => (b: WriteBatch) => b.update(folderRef(branchId, id), flag)),
    ...[...fileIds].filter((id) => !rawFiles.find((f) => f.id === id)?.trashed).map((id) => (b: WriteBatch) => b.update(fileRef(branchId, id), flag)),
  ])
  for (const id of fileIds) {
    await deleteObject(storageRef(storage, driveObjectPath(branchId, id))).catch((e: { code?: string }) => {
      if (e?.code !== 'storage/object-not-found') throw e
    })
  }
  await commitAll([
    ...[...fileIds].map((id) => (b: WriteBatch) => b.delete(fileRef(branchId, id))),
    ...[...folderIds].map((id) => (b: WriteBatch) => b.delete(folderRef(branchId, id))),
    (b: WriteBatch) =>
      addAudit(b, branchId, actor, {
        action: 'drive.delete',
        category: 'drive',
        entityType: 'drive',
        entityId: items[0]?.id ?? 'trash',
        summary: `Deleted ${items.length === 1 ? `“${items[0].name}”` : `${items.length} items`} from the Trash for good (${fileIds.size} ${fileIds.size === 1 ? 'file' : 'files'})`,
      }),
  ])
}

/** An upload that never finished (the tab closed mid-way) is removed: marked failed, then deleted. */
export async function removeFailedUpload(branchId: string, file: WithId<DriveFile>) {
  if (file.status !== 'error') await updateDoc(fileRef(branchId, file.id), { status: 'error', error: 'The upload didn’t finish.' })
  await deleteObject(storageRef(storage, driveObjectPath(branchId, file.id))).catch(() => undefined)
  await deleteDoc(fileRef(branchId, file.id))
}

export { studentFolderId }
