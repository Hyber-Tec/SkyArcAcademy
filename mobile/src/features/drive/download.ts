import { ref, writeToFile } from "@react-native-firebase/storage";
import { driveObjectPath } from "@shared/drive/types";
import { Directory, File, Paths } from "expo-file-system";
import { useEffect, useState } from "react";
import { storage } from "@/lib/firebase";
import { useBranch } from "@/state/BranchProvider";

/** A path as React Native Firebase writes to it: the file URI without its scheme. */
const pathOf = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ""));

/**
 * A Drive file on this phone, as a file:// URI: downloaded once into the app's cache through the Storage rules (staff
 * only), never through a public link (CLAUDE.md, "Minors' data"). A copy whose size no longer matches the record is
 * downloaded again.
 */
export async function localCopy(branchId: string, file: { id: string; kind: string; size: number }): Promise<string> {
  const dir = new Directory(Paths.cache, "drive");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const local = new File(dir, `${file.id}.${file.kind || "bin"}`);
  if (local.exists && (!file.size || local.size === file.size)) return local.uri;
  if (local.exists) local.delete();
  await writeToFile(ref(storage, driveObjectPath(branchId, file.id)), pathOf(local.uri));
  return local.uri;
}

/** A Drive file's local copy, fetched when the record is known; `retry` tries again after a failure. */
export function useLocalCopy(file: { id: string; kind: string; size: number } | null) {
  const { branchId } = useBranch();
  const id = file?.id ?? null;
  const kind = file?.kind ?? "";
  const size = file?.size ?? 0;
  const [attempt, setAttempt] = useState(0);
  const key = id ? `${id}:${size}:${attempt}` : null;
  const [state, setState] = useState<{ key: string | null; uri: string | null; error: string | null }>({ key: null, uri: null, error: null });
  useEffect(() => {
    if (!id || !key) return;
    let live = true;
    localCopy(branchId, { id, kind, size }).then(
      (uri) => live && setState({ key, uri, error: null }),
      (e: unknown) => live && setState({ key, uri: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [key, id, kind, size, branchId]);
  const current = state.key === key ? state : { uri: null, error: null };
  return { uri: current.uri, error: current.error, loading: !!key && !current.uri && !current.error, retry: () => setAttempt((a) => a + 1) };
}
