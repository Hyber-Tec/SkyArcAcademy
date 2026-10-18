import { doc, getDocFromServer, updateDoc } from "@react-native-firebase/firestore";
import { putFile, ref } from "@react-native-firebase/storage";
import { driveObjectPath } from "@shared/drive/types";
import { COL, ROOT } from "@shared/paths";
import { Directory, File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { db, storage } from "@/lib/firebase";
import { toast } from "@/lib/toast";

/**
 * Files on their way to the Drive: a scanned card's copy, and photos added to the Drive from the phone. Saving doesn't
 * wait for an upload, so the app may be closed (or the phone offline) before one ends: each file waits in the app's own
 * files (not the cache, which the phone may empty) with a note of where it goes, until the Drive has it. The app tries
 * again each time it opens. A few go up at a time, and the Drive's rows show how far each has got (useUploads).
 */
export interface PendingUpload {
  branchId: string;
  /** The Drive file's record, made first ("uploading", with the copy's exact size). */
  fileId: string;
  /** Its name in the Drive. */
  name: string;
  /** Whose card it is, for the messages ("" for a file added to the Drive). */
  studentName: string;
  /** When it was saved (ms): a record that never reaches the server is given up after a few days. */
  savedAt: number;
  /** A scanned card's copy (the default: a JPEG, with its scores saved) or a file added to the Drive. */
  what?: "card" | "file";
  /** A file's content type and extension (a card's copy is a JPEG). */
  mime?: string;
  ext?: string;
}

const GIVE_UP_MS = 3 * 24 * 60 * 60 * 1000;
/** Uploads at once: more only share the same connection. */
const AT_ONCE = 3;

const folder = () => {
  const d = new Directory(Paths.document, "uploads");
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};
const listFile = () => new File(folder(), "pending.json");
const copyOf = (fileId: string, ext = "jpg") => new File(folder(), `${fileId}.${ext}`);
/** A path as React Native Firebase reads it: the file URI without its scheme. */
const pathOf = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ""));

// What's waiting, as the list file has it (read once, then kept in step), and how far each running upload has got.
let list: PendingUpload[] | null = null;
const progress = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  listeners.forEach((l) => l());
};

function pending(): PendingUpload[] {
  if (list) return list;
  try {
    const f = listFile();
    const read: unknown = f.exists ? JSON.parse(f.textSync()) : [];
    list = Array.isArray(read) ? (read as PendingUpload[]) : [];
  } catch {
    list = [];
  }
  return list;
}

function setPending(next: PendingUpload[]): void {
  listFile().write(JSON.stringify(next));
  list = next;
  changed();
}

function finished(fileId: string): void {
  const entry = pending().find((p) => p.fileId === fileId);
  setPending(pending().filter((p) => p.fileId !== fileId));
  const copy = copyOf(fileId, entry?.ext);
  if (copy.exists) copy.delete();
}

/** Uploads under way in this run of the app, and the ones already said to be late (one message each). */
const running = new Set<string>();
const told = new Set<string>();

/** Keeps a file (moved out of the cache) until the Drive has it; throws if the phone can't, before anything is saved. */
export function keepForUpload(u: PendingUpload, uri: string): void {
  const copy = copyOf(u.fileId, u.ext);
  if (copy.exists) copy.delete();
  new File(uri).moveSync(copy);
  setPending([...pending().filter((p) => p.fileId !== u.fileId), u]);
}

/** Uploads a kept file once `saved` (the batch that made its record) is on the server; drops it if that failed. */
export function uploadAfter(u: PendingUpload, saved: Promise<unknown>): void {
  void saved.then(
    () => upload(u),
    () => finished(u.fileId),
  );
}

/** A file still waiting on this phone for the Drive (a file:// URI), so it shows before the upload ends. */
export function waitingCopy(fileId: string): string | null {
  try {
    const copy = copyOf(fileId, pending().find((p) => p.fileId === fileId)?.ext);
    return copy.exists ? copy.uri : null;
  } catch {
    return null;
  }
}

/** Uploads what was left waiting (the app was closed, or the phone offline): called when the office's app opens. */
export function resumeUploads(): void {
  for (const u of pending()) void upload(u);
}

/** Tries one file waiting on this phone again now (the person asked), saying so again if it still can't go. */
export function retryUpload(fileId: string): void {
  const u = pending().find((p) => p.fileId === fileId);
  if (!u) return;
  told.delete(fileId);
  void upload(u);
}

/**
 * The uploads this phone holds, for the Drive's rows: how far one under way has got (0 to 1, null when it isn't going
 * up now), and whether a file waits on this phone for the Drive. Re-renders as they move.
 */
export function useUploads(): { progress: (fileId: string) => number | null; waiting: (fileId: string) => boolean } {
  useSyncExternalStore(subscribe, currentVersion);
  return { progress: (fileId) => progress.get(fileId) ?? null, waiting: (fileId) => pending().some((p) => p.fileId === fileId) };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const currentVersion = () => version;

// A few at a time: the rest wait for a turn, which the one finishing hands on.
let active = 0;
const turns: (() => void)[] = [];
async function turn(): Promise<() => void> {
  if (active < AT_ONCE) active++;
  else await new Promise<void>((resolve) => turns.push(resolve));
  return () => {
    const next = turns.shift();
    if (next) next();
    else active--;
  };
}

// Files added to the Drive that haven't gone up yet, said in one message rather than one each.
let late: string[] = [];
let lateTimer: ReturnType<typeof setTimeout> | null = null;
function tellLate(name: string): void {
  late.push(name);
  if (lateTimer) clearTimeout(lateTimer);
  lateTimer = setTimeout(() => {
    const names = late;
    late = [];
    lateTimer = null;
    toast.error(names.length === 1 ? `“${names[0]}” hasn’t uploaded yet` : `${names.length} files haven’t uploaded yet`, {
      description: `${names.length === 1 ? "It’s" : "They’re"} kept on this phone. The app tries again the next time it opens.`,
    });
  }, 1500);
}

async function upload(u: PendingUpload): Promise<void> {
  if (running.has(u.fileId)) return;
  running.add(u.fileId);
  const done = await turn();
  const card = u.what !== "file";
  const record = doc(db, ROOT.branches, u.branchId, COL.driveFiles, u.fileId);
  try {
    const copy = copyOf(u.fileId, u.ext);
    const snap = await getDocFromServer(record);
    if (!snap.exists()) {
      // The batch that makes its record hasn't reached the server yet (it waits on the phone), or never will.
      if (Date.now() - u.savedAt > GIVE_UP_MS) finished(u.fileId);
      return;
    }
    // Already in the Drive (or given up on, on the website): nothing left to do.
    if (snap.data()?.status !== "uploading") return finished(u.fileId);
    if (!copy.exists) {
      const lost = card ? "The card’s copy was lost on the phone before it uploaded." : "The phone’s copy was lost before it uploaded.";
      await updateDoc(record, { status: "error", error: lost }).catch(() => undefined);
      return finished(u.fileId);
    }
    const t0 = Date.now();
    const task = putFile(ref(storage, driveObjectPath(u.branchId, u.fileId)), pathOf(copy.uri), {
      contentType: u.mime ?? "image/jpeg",
      contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(u.name)}`,
    });
    progress.set(u.fileId, 0);
    changed();
    task.on(
      "state_changed",
      (s) => {
        // In steps of 5%, so the lists showing it redraw a few times rather than at every packet.
        const step = Math.floor((s.totalBytes ? s.bytesTransferred / s.totalBytes : 0) * 20) / 20;
        if (step === progress.get(u.fileId)) return;
        progress.set(u.fileId, step);
        changed();
      },
      () => undefined,
    );
    await task;
    await updateDoc(record, { status: "ready" });
    finished(u.fileId);
    if (__DEV__) console.log(`[upload] “${u.name}” uploaded in ${Date.now() - t0} ms`);
  } catch (e) {
    const code = String((e as { code?: string })?.code ?? "");
    if (/unauthorized/.test(code)) {
      // The Drive won't take it (its record changed): trying again won't help.
      await updateDoc(record, { status: "error", error: "The Drive didn’t accept this file." }).catch(() => undefined);
      finished(u.fileId);
      if (card) toast.error(`${u.studentName}’s card photo didn’t upload`, { description: "The scores are saved. Upload the photo again from the Drive on the website." });
      else toast.error(`“${u.name}” didn’t upload`, { description: "The Drive didn’t accept it. Add it again." });
    } else if (!told.has(u.fileId)) {
      told.add(u.fileId);
      if (card) toast.error(`${u.studentName}’s card photo hasn’t uploaded yet`, { description: "The scores are saved. The app tries again the next time it opens." });
      else tellLate(u.name);
    }
  } finally {
    progress.delete(u.fileId);
    running.delete(u.fileId);
    done();
    changed();
  }
}
