import { collection, onSnapshot, query, where } from "@react-native-firebase/firestore";
import { type DriveIndex, type DriveStudent, buildDriveIndex } from "@shared/drive/model";
import type { DriveFile, DriveFolder } from "@shared/drive/types";
import { COL, ROOT } from "@shared/paths";
import type { WithId } from "@shared/types";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useStudentList } from "@/features/data/hooks";
import { db } from "@/lib/firebase";
import { MAX_RETRIES, isRetryable, refreshTokenOnce } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/**
 * The whole Drive, live, as one index shared by every Drive screen (the top, each folder, the Move picker), as the
 * website reads it (web/src/features/drive/useDriveIndex.ts): two live lists, every folder and every file. Owners and
 * admins read everything; a coach asks for what's everyone's on staff (`access == 'staff'`), the only lists the rules
 * give coaches (they refuse a coach's query that could return anything else), so folders only owners and admins see,
 * and what's in them, never reach a coach's phone. A query reads every document it matches when it starts, so the lists
 * belong to the academy, not to a screen: the first reader opens them, later ones share them, and they stay open for a
 * minute after the last one leaves, so going in and out of folders never starts over. An empty answer from the phone's
 * copy waits for the server; a refused one refreshes the sign-in and listens again a few times (src/lib/firestore.ts).
 */

/** Which lists: everything (owners and admins), or what's everyone's on staff (coaches). */
type Scope = "all" | "staff";

const KEEP_OPEN_MS = 60_000;

interface Lists {
  folders: WithId<DriveFolder>[] | null;
  files: WithId<DriveFile>[] | null;
  error: Error | null;
}

const IDLE: Lists = Object.freeze({ folders: null, files: null, error: null }) as Lists;

interface Store {
  refs: number;
  timer: ReturnType<typeof setTimeout> | null;
  retry: ReturnType<typeof setTimeout> | null;
  attempts: number;
  listeners: Set<() => void>;
  lists: Lists;
  stop: (() => void)[];
}

const stores = new Map<string, Store>();

/** A server time not confirmed yet reads as the phone's estimate, so what was just made sorts with the newest. */
const READ = { serverTimestamps: "estimate" } as const;

function listen(branchId: string, scope: Scope, store: Store): void {
  const publish = (patch: Partial<Lists>) => {
    store.lists = { ...store.lists, ...patch };
    for (const l of [...store.listeners]) l();
  };
  const fail = (error: Error) => {
    publish({ error });
    if (!isRetryable(error) || store.attempts >= MAX_RETRIES || store.retry) return;
    store.attempts += 1;
    refreshTokenOnce();
    store.retry = setTimeout(() => {
      store.retry = null;
      stopListening(store);
      if (store.refs > 0) listen(branchId, scope, store);
    }, 2000 * store.attempts);
  };
  const list = (name: string) => {
    const col = collection(db, ROOT.branches, branchId, name);
    return scope === "staff" ? query(col, where("access", "==", "staff")) : col;
  };
  store.stop = [
    onSnapshot(
      list(COL.driveFolders),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache && snap.empty) return;
        publish({ folders: snap.docs.map((d) => ({ id: d.id, ...(d.data(READ) as DriveFolder) })), error: null });
      },
      fail,
    ),
    onSnapshot(
      list(COL.driveFiles),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache && snap.empty) return;
        publish({ files: snap.docs.map((d) => ({ id: d.id, ...(d.data(READ) as DriveFile) })), error: null });
      },
      fail,
    ),
  ];
}

function stopListening(store: Store): void {
  for (const stop of store.stop) stop();
  store.stop = [];
}

const keyOf = (branchId: string, scope: Scope) => `${branchId}|${scope}`;

function close(key: string, store: Store): void {
  if (store.retry) clearTimeout(store.retry);
  store.retry = null;
  stopListening(store);
  if (stores.get(key) === store) stores.delete(key);
}

function acquire(branchId: string, scope: Scope): Store {
  const key = keyOf(branchId, scope);
  let store = stores.get(key);
  // Lists a rule refused for good start fresh with the next reader after everyone left.
  if (store && store.lists.error && store.refs === 0 && !store.retry) {
    close(key, store);
    store = undefined;
  }
  if (!store) {
    store = { refs: 0, timer: null, retry: null, attempts: 0, listeners: new Set(), lists: IDLE, stop: [] };
    stores.set(key, store);
    listen(branchId, scope, store);
  }
  if (store.timer) clearTimeout(store.timer);
  store.timer = null;
  store.refs += 1;
  return store;
}

function release(key: string, store: Store): void {
  store.refs = Math.max(0, store.refs - 1);
  if (store.refs > 0) return;
  store.timer = setTimeout(() => store.refs === 0 && close(key, store), KEEP_OPEN_MS);
}

/** Listens again from the start when the lists failed (pull to refresh); otherwise they're live already. */
export function reloadDrive(branchId: string): void {
  for (const scope of ["all", "staff"] as const) {
    const store = stores.get(keyOf(branchId, scope));
    if (!store || !store.lists.error) continue;
    if (store.retry) clearTimeout(store.retry);
    store.retry = null;
    store.attempts = 0;
    stopListening(store);
    store.lists = IDLE;
    for (const l of [...store.listeners]) l();
    listen(branchId, scope, store);
  }
}

function useDriveLists(): Lists {
  const { branchId, isAdmin } = useBranch();
  const scope: Scope = isAdmin ? "all" : "staff";
  const key = keyOf(branchId, scope);
  const subscribe = useCallback(
    (onChange: () => void) => {
      const store = acquire(branchId, scope);
      store.listeners.add(onChange);
      return () => {
        store.listeners.delete(onChange);
        release(key, store);
      };
    },
    [branchId, scope, key],
  );
  const getSnapshot = useCallback(() => stores.get(key)?.lists ?? IDLE, [key]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

export type LiveDriveIndex = DriveIndex & { loading: boolean; error: Error | null; students: DriveStudent[] };

/** The Drive as one index: everything in it that's visible (nothing in the Trash, nor inside a folder that is). */
export function useDriveIndex(): LiveDriveIndex {
  const lists = useDriveLists();
  const { data: studentList, loading: studentsLoading } = useStudentList();
  const students = useMemo<DriveStudent[]>(() => studentList.map((s) => ({ id: s.id, name: s.name, finished: s.status === "finished" })), [studentList]);
  return useMemo(() => {
    const index = buildDriveIndex(lists.folders, lists.files, students);
    const loading = !lists.error && (lists.folders === null || lists.files === null || studentsLoading);
    return { ...index, loading, error: lists.error, students };
  }, [lists, students, studentsLoading]);
}
