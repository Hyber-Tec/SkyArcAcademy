import { collection, onSnapshot } from "@react-native-firebase/firestore";
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
 * website reads it (web/src/features/drive/useDriveIndex.ts): two live lists, every folder and every file, which the
 * rules give the staff (coaches too). A query reads every document it matches when it starts, so the lists belong to
 * the academy, not to a screen: the first reader opens them, later ones share them, and they stay open for a minute
 * after the last one leaves, so going in and out of folders never starts over. An empty answer from the phone's copy
 * waits for the server; a refused one refreshes the sign-in and listens again a few times (src/lib/firestore.ts).
 */

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

function listen(branchId: string, store: Store): void {
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
      if (store.refs > 0) listen(branchId, store);
    }, 2000 * store.attempts);
  };
  const col = (name: string) => collection(db, ROOT.branches, branchId, name);
  store.stop = [
    onSnapshot(
      col(COL.driveFolders),
      { includeMetadataChanges: true },
      (snap) => {
        if (snap.metadata.fromCache && snap.empty) return;
        publish({ folders: snap.docs.map((d) => ({ id: d.id, ...(d.data(READ) as DriveFolder) })), error: null });
      },
      fail,
    ),
    onSnapshot(
      col(COL.driveFiles),
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

function close(branchId: string, store: Store): void {
  if (store.retry) clearTimeout(store.retry);
  store.retry = null;
  stopListening(store);
  if (stores.get(branchId) === store) stores.delete(branchId);
}

function acquire(branchId: string): Store {
  let store = stores.get(branchId);
  // Lists a rule refused for good start fresh with the next reader after everyone left.
  if (store && store.lists.error && store.refs === 0 && !store.retry) {
    close(branchId, store);
    store = undefined;
  }
  if (!store) {
    store = { refs: 0, timer: null, retry: null, attempts: 0, listeners: new Set(), lists: IDLE, stop: [] };
    stores.set(branchId, store);
    listen(branchId, store);
  }
  if (store.timer) clearTimeout(store.timer);
  store.timer = null;
  store.refs += 1;
  return store;
}

function release(branchId: string, store: Store): void {
  store.refs = Math.max(0, store.refs - 1);
  if (store.refs > 0) return;
  store.timer = setTimeout(() => store.refs === 0 && close(branchId, store), KEEP_OPEN_MS);
}

/** Listens again from the start when the lists failed (pull to refresh); otherwise they're live already. */
export function reloadDrive(branchId: string): void {
  const store = stores.get(branchId);
  if (!store || !store.lists.error) return;
  if (store.retry) clearTimeout(store.retry);
  store.retry = null;
  store.attempts = 0;
  stopListening(store);
  store.lists = IDLE;
  for (const l of [...store.listeners]) l();
  listen(branchId, store);
}

function useDriveLists(): Lists {
  const { branchId } = useBranch();
  const subscribe = useCallback(
    (onChange: () => void) => {
      const store = acquire(branchId);
      store.listeners.add(onChange);
      return () => {
        store.listeners.delete(onChange);
        release(branchId, store);
      };
    },
    [branchId],
  );
  const getSnapshot = useCallback(() => stores.get(branchId)?.lists ?? IDLE, [branchId]);
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
