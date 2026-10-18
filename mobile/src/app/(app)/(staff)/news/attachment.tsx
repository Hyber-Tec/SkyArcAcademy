import { useLocalSearchParams } from "expo-router";
import { attachmentCategory, attachmentKind } from "@/features/announcements/format";
import { useStaffPost } from "@/features/announcements/staffNews";
import { fileName, useStorageCopy } from "@/features/drive/download";
import { FileViewer } from "@/features/drive/FileView";

/**
 * An announcement's attachment, full screen, as the family's open theirs (loaded by the post's ID and the file's place
 * in Storage, so a link opens it too): a picture to zoom into, a PDF in a viewer, or the way to open it in another app,
 * with Share. Downloaded through the Storage rules into the app's cache. Once the post isn't the person's to read, or
 * the file is no longer on it, it says the file isn't available.
 */
export default function StaffNewsAttachmentScreen() {
  const { id, path } = useLocalSearchParams<{ id: string; path: string }>();
  const { post, loading } = useStaffPost(id ?? null);
  const f = post?.attachments?.find((x) => x.path === path) ?? null;
  // Kept in a folder of its own, under its name on the post.
  const folder = f && id ? ["announcements", id, f.path.split("/").pop() ?? "file"] : null;
  const copy = useStorageCopy(f && folder ? { path: f.path, folder, name: fileName({ name: f.name, kind: attachmentKind(f) }), size: f.size } : null);
  return (
    <FileViewer
      file={f ? { name: f.name, mime: f.contentType || "application/octet-stream", size: f.size, category: attachmentCategory(f) } : null}
      loading={loading}
      unavailable={f ? null : { title: "This file isn’t available", text: "It may have been taken off the announcement, or the announcement was deleted." }}
      copy={copy}
    />
  );
}
