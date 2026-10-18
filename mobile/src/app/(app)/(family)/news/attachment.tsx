import { useLocalSearchParams } from "expo-router";
import { attachmentCategory, attachmentKind } from "@/features/announcements/format";
import { fileName, useStorageCopy } from "@/features/drive/download";
import { FileViewer } from "@/features/drive/FileView";
import { useNewsPost } from "@/features/family/news";
import { useBranch } from "@/state/BranchProvider";

/**
 * A news post's attachment, full screen (loaded by the post's ID and the file's place in Storage, so a link opens it
 * too): a picture to zoom into, a PDF in a viewer, or the way to open it in another app, with Share (FileViewer, as a
 * Drive file opens). Downloaded through the Storage rules into the app's cache. Once the post is no longer shown to
 * families, or the file is no longer on it, it says the file isn't available.
 */
export default function NewsAttachmentScreen() {
  const { id, path } = useLocalSearchParams<{ id: string; path: string }>();
  const { name } = useBranch();
  const { post, loading } = useNewsPost(id ?? null);
  const f = post?.attachments?.find((x) => x.path === path) ?? null;
  // Kept in a folder of its own, under its name on the post.
  const folder = f && id ? ["announcements", id, f.path.split("/").pop() ?? "file"] : null;
  const copy = useStorageCopy(f && folder ? { path: f.path, folder, name: fileName({ name: f.name, kind: attachmentKind(f) }), size: f.size } : null);
  return (
    <FileViewer
      file={f ? { name: f.name, mime: f.contentType || "application/octet-stream", size: f.size, category: attachmentCategory(f) } : null}
      loading={loading}
      unavailable={f ? null : { title: "This file isn’t available", text: `It may have been taken off the news. Ask ${name} if you need it.` }}
      copy={copy}
    />
  );
}
