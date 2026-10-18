import { ref, writeToFile } from "@react-native-firebase/storage";
import { driveObjectPath } from "@shared/drive/types";
import { Directory, File, Paths } from "expo-file-system";
import { useEffect, useState } from "react";
import { storage } from "@/lib/firebase";
import { useBranch } from "@/state/BranchProvider";

/** A path as React Native Firebase writes to it: the file URI without its scheme. */
const pathOf = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ""));

/** A Drive file's name as a file on the phone ("2026-10-15 Kneeling 176.3.pdf"), safe for any file system. */
export function fileName(file: { name?: string; kind: string }): string {
  const ext = file.kind || "bin";
  const base = (file.name ?? "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")
    .trim()
    .slice(0, 120);
  if (!base) return `file.${ext}`;
  return base.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? base : `${base}.${ext}`;
}

/**
 * A file in Storage to keep on this phone: its object's `path`, the `folder` of the app's cache it goes in, the `name`
 * it has there (the one sharing or saving it gives) and its `size` as recorded (0 when unknown).
 */
export interface StorageObject {
  path: string;
  folder: string[];
  name: string;
  size: number;
}

/**
 * A file in Storage on this phone, as a file:// URI: downloaded once into the app's cache through the Storage rules,
 * never through a public link (CLAUDE.md, "Minors' data"). A copy whose size no longer matches the record is downloaded
 * again.
 */
export async function storageCopy(object: StorageObject): Promise<string> {
  const dir = new Directory(Paths.cache, ...object.folder);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const local = new File(dir, object.name);
  if (local.exists && (!object.size || local.size === object.size)) return local.uri;
  if (local.exists) local.delete();
  await writeToFile(ref(storage, object.path), pathOf(local.uri));
  return local.uri;
}

type DriveCopy = { id: string; kind: string; size: number; name?: string };

/** A Drive file's object: it keeps its Drive name, in a folder of its own, so a shared copy has a name people recognise. */
const driveObject = (branchId: string, file: DriveCopy): StorageObject => ({ path: driveObjectPath(branchId, file.id), folder: ["drive", file.id], name: fileName(file), size: file.size });

/**
 * A Drive file on this phone (staff, and a family for its own child's score's file), as a file:// URI (storageCopy).
 */
export async function localCopy(branchId: string, file: DriveCopy): Promise<string> {
  return storageCopy(driveObject(branchId, file));
}

/** A file's local copy, fetched once the file is known (null until then); `retry` tries again after a failure. */
export function useStorageCopy(object: StorageObject | null) {
  const path = object?.path ?? null;
  const folder = object?.folder.join("/") ?? "";
  const name = object?.name ?? "";
  const size = object?.size ?? 0;
  const [attempt, setAttempt] = useState(0);
  const key = path ? `${path}:${size}:${name}:${attempt}` : null;
  const [state, setState] = useState<{ key: string | null; uri: string | null; error: string | null }>({ key: null, uri: null, error: null });
  useEffect(() => {
    if (!path || !key) return;
    let live = true;
    storageCopy({ path, folder: folder.split("/"), name, size }).then(
      (uri) => live && setState({ key, uri, error: null }),
      (e: unknown) => live && setState({ key, uri: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [key, path, folder, name, size]);
  const current = state.key === key ? state : { uri: null, error: null };
  return { uri: current.uri, error: current.error, loading: !!key && !current.uri && !current.error, retry: () => setAttempt((a) => a + 1) };
}

/** A Drive file's local copy, fetched when the record is known; `retry` tries again after a failure. */
export function useLocalCopy(file: DriveCopy | null) {
  const { branchId } = useBranch();
  return useStorageCopy(file ? driveObject(branchId, file) : null);
}
