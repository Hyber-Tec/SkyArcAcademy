import { cleanFolderName } from "@shared/drive/files";
import { type DriveItem, type IndexFile, type IndexFolder, folderNameProblem, trashQuestion } from "@shared/drive/model";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type SheetAction, showActions } from "@/components/ActionSheet";
import { confirmAsync } from "@/components/Confirm";
import { retryUpload, useUploads } from "@/features/scan/uploads";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { addFiles, createFolder, moveItems, removeFailedUpload, renameFile, renameFolder, trashItems } from "./api";
import { localCopy } from "./download";
import { MovePicker } from "./MovePicker";
import { NameDialog } from "./NameDialog";
import { choosePhotos, photoStem, preparePhotos } from "./photos";
import type { LiveDriveIndex } from "./useDriveIndex";

type Dialog =
  | { kind: "newFolder"; parentId: string | null }
  | { kind: "renameFolder"; id: string }
  | { kind: "renameFile"; id: string }
  | { kind: "move"; folderIds: string[]; fileIds: string[] };

/** Where the Trash is, for the question before it: the phone has none, the website does. */
const TRASH = "the Drive’s Trash on the website";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * What can be done in the Drive, as the website lets the staff (coaches and the office alike: the owner's call,
 * 2026-10-17): open, share, rename, move, move to the Trash (never a student's own folder), remove a failed upload, make
 * a folder and add photos. Each change is kept on the phone at once and the lists show it straight away; a refusal from
 * the server comes back as a message. `here` is the folder the screen shows (null: the top). Render `dialogs`.
 */
export function useDriveActions(index: LiveDriveIndex, here: string | null) {
  const { branchId, actor, isAdmin, timezone } = useBranch();
  const uploads = useUploads();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [adding, setAdding] = useState(0);
  // The Drive as it is now, for what runs after a wait (the photo picker), when the index may have moved on.
  const latest = useRef(index);
  useEffect(() => {
    latest.current = index;
  }, [index]);

  const fail = (what: string) => (e: unknown) => toast.error(what, { description: message(e) });

  const openFolder = (id: string) => router.push({ pathname: "/drive/[id]", params: { id } });
  const openFile = (f: IndexFile) => {
    if (f.status === "uploading") return toast("Still uploading", { description: "It opens once it’s in the Drive." });
    if (f.status === "error") return toast.error("This upload failed", { description: f.error || "Remove it, then add it again." });
    router.push({ pathname: "/file/[id]", params: { id: f.id } });
  };
  const open = (it: DriveItem) => (it.kind === "folder" ? openFolder(it.id) : openFile(it.file));

  const share = async (f: IndexFile) => {
    try {
      if (!(await Sharing.isAvailableAsync())) return void toast.error("Sharing isn’t available on this phone");
      const uri = await localCopy(branchId, { id: f.id, kind: f.kind, size: f.size, name: f.name });
      await Sharing.shareAsync(uri, { mimeType: f.mime, dialogTitle: f.name });
    } catch {
      toast.error("Couldn’t share the file", { description: "Check your connection and try again." });
    }
  };

  const trash = async (folderIds: string[], fileIds: string[], leave = false) => {
    const now = latest.current;
    const q = trashQuestion(now, folderIds, fileIds, { isAdmin, trash: TRASH });
    if (!(await confirmAsync({ title: q.title, message: q.message, confirmLabel: "Move to Trash", destructive: true }))) return;
    const folders = folderIds.map((id) => latest.current.folderOf(id)).filter((f): f is IndexFolder => !!f);
    const files = fileIds.map((id) => latest.current.fileOf(id)).filter((f): f is IndexFile => !!f);
    void trashItems(branchId, actor, folders, files).catch(fail("Couldn’t move it to the Trash"));
    toast.success("Moved to the Trash");
    if (leave) {
      if (router.canGoBack()) router.back();
      else router.replace("/drive");
    }
  };

  const remove = async (f: IndexFile) => {
    const failed = f.status === "error";
    const ok = await confirmAsync({
      title: `Remove “${f.name}”?`,
      message: failed ? "Its upload failed, so the Drive doesn’t have it. Add it again to keep it." : "It hasn’t finished uploading. If it’s still going up from another phone or computer, that upload stops.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    removeFailedUpload(branchId, f).then(() => toast.success(`Removed “${f.name}”`), fail("Couldn’t remove it"));
  };

  /** A folder's menu; `inside`: the screen of that very folder (no Open, and leaving it after the Trash). */
  const folderMenu = (f: IndexFolder, inside = false) => {
    const actions: SheetAction[] = inside ? [] : [{ label: "Open", onPress: () => openFolder(f.id) }];
    if (f.studentId) {
      const studentId = f.studentId;
      actions.push({ label: "Student’s page", onPress: () => router.push({ pathname: "/student/[id]", params: { id: studentId } }) });
      return showActions(f.name, actions, "A student’s folder stays at the top of the Drive, named after the student.");
    }
    actions.push(
      { label: "Rename", onPress: () => setDialog({ kind: "renameFolder", id: f.id }) },
      { label: "Move to…", onPress: () => setDialog({ kind: "move", folderIds: [f.id], fileIds: [] }) },
      { label: "Move to Trash", destructive: true, onPress: () => void trash([f.id], [], inside) },
    );
    showActions(f.name, actions);
  };

  /** A file's menu; `scoreId`: the score made from it, when it's a result. */
  const fileMenu = (f: IndexFile, scoreId: string | null) => {
    const settled = f.status !== "uploading";
    const ready = f.status === "ready";
    const waitingHere = uploads.waiting(f.id);
    const actions: SheetAction[] = [];
    if (ready) actions.push({ label: "Open", onPress: () => openFile(f) });
    if (scoreId) actions.push({ label: "Open the score", onPress: () => router.push({ pathname: "/score/[id]", params: { id: scoreId } }) });
    if (ready) actions.push({ label: "Share…", onPress: () => void share(f) });
    if (settled) {
      actions.push({ label: "Rename", onPress: () => setDialog({ kind: "renameFile", id: f.id }) }, { label: "Move to…", onPress: () => setDialog({ kind: "move", folderIds: [], fileIds: [f.id] }) });
    }
    if (waitingHere) {
      actions.push({
        label: "Try uploading again",
        onPress: () => {
          retryUpload(f.id);
          toast("Trying the upload again");
        },
      });
    }
    // An upload that failed, or one this phone isn't sending (it may have stopped on another phone or computer).
    if (f.status === "error" || (f.status === "uploading" && !waitingHere)) actions.push({ label: "Remove", destructive: true, onPress: () => void remove(f) });
    if (settled) actions.push({ label: "Move to Trash", destructive: true, onPress: () => void trash([], [f.id]) });
    const note = f.status === "uploading" ? (waitingHere ? "It’s waiting on this phone to upload." : "It’s still uploading.") : f.status === "error" ? (f.error ?? "Its upload failed.") : undefined;
    showActions(f.name, actions, note);
  };

  const menu = (it: DriveItem, scoreId: string | null = null) => (it.kind === "folder" ? folderMenu(it.folder) : fileMenu(it.file, scoreId ?? it.file.evaluationId ?? null));

  const addPhotos = async (folderId: string | null) => {
    let assets: Awaited<ReturnType<typeof choosePhotos>>;
    try {
      assets = await choosePhotos();
    } catch (e) {
      return void toast.error("Couldn’t open Photos", { description: message(e) });
    }
    if (!assets) return;
    const count = assets.length;
    setAdding((n) => n + count);
    try {
      const { ready, refused } = await preparePhotos(assets, photoStem(timezone));
      const { added, failed, saved } = addFiles(branchId, actor, latest.current, folderId, ready);
      saved.catch(fail(added.length === 1 ? "The photo wasn’t added" : "The photos weren’t added"));
      const left = [...refused, ...failed.map((name) => ({ name, reason: "The phone couldn’t keep a copy to upload." }))];
      const why = left.length ? `${left.length === 1 ? "One photo wasn’t added" : `${left.length} photos weren’t added`}: “${left[0].name}”: ${left[0].reason}` : null;
      const background = added.length === 1 ? "It uploads in the background; the phone keeps it until it’s in." : "They upload in the background; the phone keeps them until they’re in.";
      if (added.length) toast.success(added.length === 1 ? `Adding “${added[0]}”` : `Adding ${added.length} photos`, { description: why ?? background, duration: why ? 8000 : undefined });
      else if (why) toast.error(left.length === 1 ? "The photo wasn’t added" : "The photos weren’t added", { description: why });
    } catch (e) {
      toast.error("Couldn’t add the photos", { description: message(e) });
    } finally {
      setAdding((n) => Math.max(0, n - count));
    }
  };

  /** "+": add photos or make a folder here. */
  const add = (folderId: string | null) => {
    const name = folderId ? index.folderOf(folderId)?.name : null;
    showActions(
      name ? `Add to “${name}”` : "Add to the Drive",
      [
        { label: "Add photos", onPress: () => void addPhotos(folderId) },
        { label: "New folder", onPress: () => setDialog({ kind: "newFolder", parentId: folderId }) },
      ],
      "SIUS PDFs and other files are added on the website.",
    );
  };

  let dialogs: ReactNode = null;
  if (dialog?.kind === "newFolder") {
    const parentId = dialog.parentId;
    dialogs = (
      <NameDialog
        title="New folder"
        initial="Untitled folder"
        confirmLabel="Make folder"
        problem={(name) => folderNameProblem(latest.current, parentId, name)}
        onSubmit={(name) => {
          void createFolder(branchId, actor, latest.current, name, parentId).catch(fail("Couldn’t make the folder"));
          toast.success(`Made the folder “${cleanFolderName(name)}”`);
        }}
        onClose={() => setDialog(null)}
        testID="drive-new-folder"
      />
    );
  } else if (dialog?.kind === "renameFolder") {
    const folder = index.folderOf(dialog.id);
    if (folder) {
      dialogs = (
        <NameDialog
          title="Rename folder"
          initial={folder.name}
          problem={(name) => folderNameProblem(latest.current, folder.parentId, name, folder.id)}
          onSubmit={(name) => {
            if (cleanFolderName(name) === folder.name) return;
            void renameFolder(branchId, actor, folder, name).catch(fail("Couldn’t rename the folder"));
            toast.success("Folder renamed");
          }}
          onClose={() => setDialog(null)}
          testID="drive-rename"
        />
      );
    }
  } else if (dialog?.kind === "renameFile") {
    const file = index.fileOf(dialog.id);
    if (file) {
      // The extension stays as the file has it (the record's kind can't change), typed only once.
      const ending = file.kind && file.name.toLowerCase().endsWith(`.${file.kind.toLowerCase()}`) ? file.name.slice(file.name.length - file.kind.length - 1) : "";
      dialogs = (
        <NameDialog
          title="Rename file"
          initial={ending ? file.name.slice(0, -ending.length) : file.name}
          suffix={ending || undefined}
          maxLength={200}
          onSubmit={(name) => {
            if (name === file.name) return;
            void renameFile(branchId, actor, file, name).catch(fail("Couldn’t rename the file"));
            toast.success("File renamed");
          }}
          onClose={() => setDialog(null)}
          testID="drive-rename"
        />
      );
    }
  } else if (dialog?.kind === "move") {
    const { folderIds, fileIds } = dialog;
    // Moving the folder the screen shows starts beside it, not inside it.
    const start = here && folderIds.includes(here) ? (index.folderOf(here)?.parentId ?? null) : here;
    dialogs = (
      <MovePicker
        index={index}
        folderIds={folderIds}
        fileIds={fileIds}
        startAt={start}
        onMove={(target) => {
          try {
            void moveItems(branchId, actor, latest.current, folderIds, fileIds, target).catch(fail("Couldn’t move it"));
            toast.success(`Moved to ${target ? `“${latest.current.folderOf(target)?.name ?? "the folder"}”` : "the top of the Drive"}`);
          } catch (e) {
            fail("Couldn’t move it")(e);
          }
        }}
        onClose={() => setDialog(null)}
      />
    );
  }

  return { open, menu, folderMenu, add, addPhotos, newFolder: (parentId: string | null) => setDialog({ kind: "newFolder", parentId }), adding, uploads, dialogs };
}
