import { doc, getDocFromServer, updateDoc } from "@react-native-firebase/firestore";
import { putFile, ref } from "@react-native-firebase/storage";
import { driveObjectPath } from "@shared/drive/types";
import { COL, ROOT } from "@shared/paths";
import { Directory, File, Paths } from "expo-file-system";
import { db, storage } from "@/lib/firebase";
import { toast } from "@/lib/toast";

/**
 * Cards' copies on their way to the Drive. Saving a card doesn't wait for its upload, so the app may be closed (or the
 * phone offline) before one ends: each copy waits in the app's own files (not the cache, which the phone may empty)
 * with a note of where it goes, until the Drive has it. The app tries again each time it opens.
 */
export interface PendingUpload {
  branchId: string;
  /** The Drive file's record, made with the card's scores ("uploading", with the copy's exact size). */
  fileId: string;
  /** Its name in the Drive. */
  name: string;
  studentName: string;
  /** When it was saved (ms): a record that never reaches the server is given up after a few days. */
  savedAt: number;
}

const GIVE_UP_MS = 3 * 24 * 60 * 60 * 1000;

const folder = () => {
  const d = new Directory(Paths.document, "uploads");
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};
const listFile = () => new File(folder(), "pending.json");
const copyOf = (fileId: string) => new File(folder(), `${fileId}.jpg`);
/** A path as React Native Firebase reads it: the file URI without its scheme. */
const pathOf = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ""));

function pending(): PendingUpload[] {
  try {
    const f = listFile();
    const list: unknown = f.exists ? JSON.parse(f.textSync()) : [];
    return Array.isArray(list) ? (list as PendingUpload[]) : [];
  } catch {
    return [];
  }
}

function setPending(list: PendingUpload[]): void {
  listFile().write(JSON.stringify(list));
}

function finished(fileId: string): void {
  setPending(pending().filter((p) => p.fileId !== fileId));
  const copy = copyOf(fileId);
  if (copy.exists) copy.delete();
}

/** Uploads under way in this run of the app, and the ones already said to be late (one message each). */
const running = new Set<string>();
const told = new Set<string>();

/** Keeps a card's copy (moved out of the cache) until the Drive has it; throws if the phone can't, before anything is saved. */
export function keepForUpload(u: PendingUpload, uri: string): void {
  const copy = copyOf(u.fileId);
  if (copy.exists) copy.delete();
  new File(uri).moveSync(copy);
  setPending([...pending().filter((p) => p.fileId !== u.fileId), u]);
}

/** Uploads a kept copy once `saved` (the batch that made its record) is on the server; drops it if that failed. */
export function uploadAfter(u: PendingUpload, saved: Promise<unknown>): void {
  void saved.then(
    () => upload(u),
    () => finished(u.fileId),
  );
}

/** A card's copy still waiting on this phone for the Drive (a file:// URI), so it shows before the upload ends. */
export function waitingCopy(fileId: string): string | null {
  try {
    const copy = copyOf(fileId);
    return copy.exists ? copy.uri : null;
  } catch {
    return null;
  }
}

/** Uploads what was left waiting (the app was closed, or the phone offline): called when the office's app opens. */
export function resumeUploads(): void {
  for (const u of pending()) void upload(u);
}

async function upload(u: PendingUpload): Promise<void> {
  if (running.has(u.fileId)) return;
  running.add(u.fileId);
  const record = doc(db, ROOT.branches, u.branchId, COL.driveFiles, u.fileId);
  try {
    const copy = copyOf(u.fileId);
    const snap = await getDocFromServer(record);
    if (!snap.exists()) {
      // The scores' batch hasn't reached the server yet (it waits on the phone), or never will.
      if (Date.now() - u.savedAt > GIVE_UP_MS) finished(u.fileId);
      return;
    }
    // Already in the Drive (or given up on, on the website): nothing left to do.
    if (snap.data()?.status !== "uploading") return finished(u.fileId);
    if (!copy.exists) {
      await updateDoc(record, { status: "error", error: "The card’s copy was lost on the phone before it uploaded." }).catch(() => undefined);
      return finished(u.fileId);
    }
    const t0 = Date.now();
    await putFile(ref(storage, driveObjectPath(u.branchId, u.fileId)), pathOf(copy.uri), {
      contentType: "image/jpeg",
      contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(u.name)}`,
    });
    await updateDoc(record, { status: "ready" });
    finished(u.fileId);
    if (__DEV__) console.log(`[scan] ${u.studentName}'s card uploaded in ${Date.now() - t0} ms`);
  } catch (e) {
    const code = String((e as { code?: string })?.code ?? "");
    if (/unauthorized/.test(code)) {
      // The Drive won't take it (its record changed): trying again won't help.
      await updateDoc(record, { status: "error", error: "The Drive didn’t accept this file." }).catch(() => undefined);
      finished(u.fileId);
      toast.error(`${u.studentName}’s card photo didn’t upload`, { description: "The scores are saved. Upload the photo again from the Drive on the website." });
    } else if (!told.has(u.fileId)) {
      told.add(u.fileId);
      toast.error(`${u.studentName}’s card photo hasn’t uploaded yet`, { description: "The scores are saved. The app tries again the next time it opens." });
    }
  } finally {
    running.delete(u.fileId);
  }
}
