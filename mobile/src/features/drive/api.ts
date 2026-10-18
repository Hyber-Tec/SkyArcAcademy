import { type WriteBatch, collection, deleteDoc, doc, serverTimestamp, updateDoc, writeBatch } from "@react-native-firebase/firestore";
import { deleteObject, ref } from "@react-native-firebase/storage";
import { cleanFileName, cleanFolderName } from "@shared/drive/files";
import { type DriveIndex, planMove } from "@shared/drive/model";
import { type DriveActor, type DriveFile, type DriveFolder, driveObjectPath } from "@shared/drive/types";
import { COL, ROOT } from "@shared/paths";
import type { WithId } from "@shared/types";
import { type PendingUpload, keepForUpload, uploadAfter } from "@/features/scan/uploads";
import { addAudit } from "@/lib/audit";
import { db, storage } from "@/lib/firebase";
import type { Actor } from "@/state/BranchProvider";

/**
 * The Drive's changes from the phone, as the website makes them (web/src/features/drive/api.ts and upload.ts): the same
 * documents and the same audit entries, in one batch each. Moving something to the Trash flags that one document (what's
 * inside a folder comes back with it on Restore, on the website). Every change is kept on the phone at once and the
 * screens move on (the lists show it straight away); the returned promise settles when the server has it, so a refusal
 * can be said in a message.
 */

export const driveActor = (a: Actor): DriveActor => ({ uid: a.uid, email: a.email, name: a.name });

const folderRef = (branchId: string, id: string) => doc(db, ROOT.branches, branchId, COL.driveFolders, id);
const fileRef = (branchId: string, id: string) => doc(db, ROOT.branches, branchId, COL.driveFiles, id);

/** Firestore takes up to 500 writes in a batch; stay well under. */
const BATCH_MAX = 400;

/** Writes every batch at once (the phone keeps them all straight away); settles when the server has them all. */
function commitAll(writes: ((b: WriteBatch) => void)[]): Promise<void> {
  const commits: Promise<void>[] = [];
  for (let i = 0; i < writes.length; i += BATCH_MAX) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + BATCH_MAX)) w(batch);
    commits.push(batch.commit());
  }
  return Promise.all(commits).then(() => undefined);
}

/** Something landed in, left or changed inside a folder: its Updated moves. */
const touched = (a: Actor) => ({ updatedAt: serverTimestamp(), updatedBy: driveActor(a) });

/**
 * Makes sure a folder that will receive something has a document: a student's folder is a stand-in until its first
 * file. Nothing for the top of the Drive.
 */
function folderWrites(branchId: string, index: DriveIndex, folderId: string | null, actor: Actor): ((b: WriteBatch) => void)[] {
  if (!folderId) return [];
  const folder = index.folderOf(folderId);
  if (folder?.virtual) {
    const data = { name: folder.name, parentId: null, studentId: folder.studentId, createdAt: serverTimestamp(), createdBy: driveActor(actor), ...touched(actor) };
    return [(b) => b.set(folderRef(branchId, folderId), data)];
  }
  return [(b) => b.update(folderRef(branchId, folderId), touched(actor))];
}

export function createFolder(branchId: string, actor: Actor, index: DriveIndex, name: string, parentId: string | null): Promise<void> {
  const folder = doc(collection(db, ROOT.branches, branchId, COL.driveFolders));
  const clean = cleanFolderName(name);
  return commitAll([
    ...folderWrites(branchId, index, parentId, actor),
    (b) => b.set(folder, { name: clean, parentId, studentId: null, createdAt: serverTimestamp(), createdBy: driveActor(actor) }),
    (b) =>
      addAudit(b, branchId, actor, {
        action: "drive.folder_create",
        category: "drive",
        entityType: "driveFolder",
        entityId: folder.id,
        summary: `Made the folder “${clean}”${parentId ? ` in “${index.folderOf(parentId)?.name ?? "a folder"}”` : ""}`,
        studentId: index.studentOf(parentId),
      }),
  ]);
}

export function renameFolder(branchId: string, actor: Actor, folder: WithId<DriveFolder>, name: string): Promise<void> {
  const clean = cleanFolderName(name);
  const batch = writeBatch(db);
  batch.update(folderRef(branchId, folder.id), { name: clean, ...touched(actor) });
  addAudit(batch, branchId, actor, { action: "drive.folder_rename", category: "drive", entityType: "driveFolder", entityId: folder.id, summary: `Renamed the folder “${folder.name}” to “${clean}”` });
  return batch.commit();
}

export function renameFile(branchId: string, actor: Actor, file: WithId<DriveFile>, name: string): Promise<void> {
  const clean = cleanFileName(name);
  if (!clean) return Promise.reject(new Error("A file needs a name."));
  const batch = writeBatch(db);
  batch.update(fileRef(branchId, file.id), { name: clean, ...touched(actor) });
  if (file.folderId) batch.update(folderRef(branchId, file.folderId), touched(actor));
  addAudit(batch, branchId, actor, { action: "drive.file_rename", category: "drive", entityType: "driveFile", entityId: file.id, summary: `Renamed “${file.name}” to “${clean}”`, studentId: file.studentId });
  return batch.commit();
}

/**
 * Moves folders and files into `targetId` (null: the top). Files keep track of whose folder they're in, and a score's
 * file that leaves its student stops being a score's file (planMove in @shared/drive/model, as on the website).
 */
export function moveItems(branchId: string, actor: Actor, index: DriveIndex, folderIds: string[], fileIds: string[], targetId: string | null): Promise<void> {
  const plan = planMove(index, folderIds, fileIds, targetId);
  return commitAll([
    ...folderWrites(branchId, index, targetId, actor),
    ...plan.folderIds.map((id) => (b: WriteBatch) => b.update(folderRef(branchId, id), { parentId: targetId })),
    ...plan.files.map((f) => (b: WriteBatch) => b.update(fileRef(branchId, f.id), f.patch)),
    (b) => addAudit(b, branchId, actor, { action: "drive.move", category: "drive", entityType: "drive", entityId: targetId ?? "top", summary: plan.summary, studentId: plan.student }),
  ]);
}

/** Moves folders and files to the Trash: one flag each; what's inside a folder stays as it is. */
export function trashItems(branchId: string, actor: Actor, folders: WithId<DriveFolder>[], files: WithId<DriveFile>[]): Promise<void> {
  if (folders.some((f) => f.studentId)) return Promise.reject(new Error("A student’s folder can’t go to the Trash."));
  const stamp = { trashed: true, trashedAt: serverTimestamp(), trashedBy: driveActor(actor) };
  const leaving = new Set(folders.map((f) => f.id));
  const writes: ((b: WriteBatch) => void)[] = [];
  for (const id of new Set([...folders.map((f) => f.parentId), ...files.map((f) => f.folderId)])) {
    if (id && !leaving.has(id)) writes.push((b) => b.update(folderRef(branchId, id), touched(actor)));
  }
  for (const f of folders) writes.push((b) => b.update(folderRef(branchId, f.id), stamp));
  for (const f of files) writes.push((b) => b.update(fileRef(branchId, f.id), stamp));
  const all = [...folders.map((f) => f.name), ...files.map((f) => f.name)];
  writes.push((b) =>
    addAudit(b, branchId, actor, {
      action: "drive.trash",
      category: "drive",
      entityType: "drive",
      entityId: folders[0]?.id ?? files[0]?.id ?? "trash",
      summary: `Moved ${all.length === 1 ? `“${all[0]}”` : `${all.length} items`} to the Trash`,
      studentId: files[0]?.studentId ?? null,
    }),
  );
  return commitAll(writes);
}

/** An upload that never finished (or failed) is removed: marked failed, then its bytes and its record deleted. */
export async function removeFailedUpload(branchId: string, file: WithId<DriveFile>): Promise<void> {
  if (file.status !== "error") await updateDoc(fileRef(branchId, file.id), { status: "error", error: "The upload didn’t finish." });
  await deleteObject(ref(storage, driveObjectPath(branchId, file.id))).catch(() => undefined);
  await deleteDoc(fileRef(branchId, file.id));
}

/** A file from this phone, ready to go into the Drive: its copy here, and its record's name, size and type. */
export interface PhoneFile {
  uri: string;
  name: string;
  size: number;
  kind: string;
  mime: string;
}

/**
 * Adds files from the phone to a folder (null: the top), as the website uploads them: their records ("uploading", with
 * each copy's exact size, which the Storage rules check the bytes against), the folder's change (a student's stand-in
 * folder gets its document) and the audit entry, in one batch the phone keeps at once. Each copy is moved into the
 * app's own files and uploads once the records are on the server, in the background, tried again whenever the app opens
 * until the Drive has it (src/features/scan/uploads.ts). `saved` settles when the server has the records; `added` names
 * the files on their way, `failed` the ones the phone couldn't keep for the upload (nothing was saved for them).
 */
export function addFiles(branchId: string, actor: Actor, index: DriveIndex, folderId: string | null, files: PhoneFile[]): { added: string[]; failed: string[]; saved: Promise<void> } {
  const student = index.studentOf(folderId);
  const by = driveActor(actor);
  const kept: { upload: PendingUpload; file: PhoneFile }[] = [];
  const failed: string[] = [];
  for (const f of files) {
    const upload: PendingUpload = { branchId, fileId: doc(collection(db, ROOT.branches, branchId, COL.driveFiles)).id, name: f.name, studentName: "", savedAt: Date.now(), what: "file", mime: f.mime, ext: f.kind };
    try {
      keepForUpload(upload, f.uri);
      kept.push({ upload, file: f });
    } catch {
      failed.push(f.name);
    }
  }
  if (!kept.length) return { added: [], failed, saved: Promise.resolve() };
  const where = folderId ? index.pathOf(folderId).map((c) => c.name).join(" / ") : "the top of the Drive";
  const first = kept[0];
  const saved = commitAll([
    ...folderWrites(branchId, index, folderId, actor),
    ...kept.map(
      ({ upload, file }) =>
        (b: WriteBatch) =>
          b.set(fileRef(branchId, upload.fileId), { name: file.name, size: file.size, kind: file.kind, mime: file.mime, status: "uploading", folderId, studentId: student, uploadedAt: serverTimestamp(), uploadedBy: by }),
    ),
    (b) =>
      addAudit(b, branchId, actor, {
        action: "drive.upload",
        category: "drive",
        entityType: "driveFile",
        entityId: first.upload.fileId,
        summary: `Uploaded ${kept.length === 1 ? `“${first.file.name}”` : `${kept.length} files`} to ${where || "the Drive"}`,
        studentId: student,
      }),
  ]);
  for (const { upload } of kept) uploadAfter(upload, saved);
  return { added: kept.map((k) => k.file.name), failed, saved };
}
