import type { Announcement, AnnouncementAttachment } from "@shared/comms";
import type { FileCategory } from "@shared/drive/files";
import { formatBytes } from "@shared/drive/model";
import { Image } from "expo-image";
import { File as FileIcon, FileImage, FilePlay, FileSpreadsheet, FileText, Image as ImageIcon, type LucideIcon, Pin, Presentation, Tag } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { reachable } from "@/lib/links";
import { radius, space, useColors } from "@/theme";
import { attachmentCategory, isPicture } from "./format";
import { htmlBlocks } from "./html";
import { type PostPicture, RichText } from "./RichText";

type Post = Announcement & { id: string };

/**
 * A post as the family's news and the staff's both show it: its chips (pinned, archived, its category), the title, who
 * posted it and when (`meta`, in the academy's zone, with an optional line under it, `detail`), and the content as the
 * website's editor wrote it (RichText: a picture opens full screen through `onOpenPicture`, a link in the phone's
 * browser).
 */
export function PostCard({ post: a, meta, detail, onOpenPicture }: { post: Post; meta: string; detail?: string; onOpenPicture: (picture: PostPicture) => void }) {
  const colors = useColors();
  const blocks = useMemo(() => htmlBlocks(a.contentHtml), [a.contentHtml]);
  return (
    <Card style={styles.post} testID="news-post">
      <View style={styles.chips}>
        {a.pinned ? (
          <Badge tone="warning" icon={<Pin size={11} color={colors.warning} />}>
            Pinned
          </Badge>
        ) : null}
        {a.archived ? <Badge tone="outline">Archived</Badge> : null}
        <Badge icon={<Tag size={11} color={colors.foreground} />}>{a.category?.trim() || "General"}</Badge>
      </View>
      <T variant="title" accessibilityRole="header" style={styles.title} testID="news-post-title">
        {a.title}
      </T>
      <T variant="small" tone="muted" testID="news-post-meta">
        {meta}
      </T>
      {detail ? (
        <T variant="small" tone="muted" testID="news-post-detail">
          {detail}
        </T>
      ) : null}
      {blocks.length ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
      <RichText blocks={blocks} onOpenPicture={onOpenPicture} testID="news-post-content" />
    </Card>
  );
}

const FILE_KINDS: Record<FileCategory, { icon: LucideIcon; label: string }> = {
  pdf: { icon: FileText, label: "PDF" },
  image: { icon: FileImage, label: "Picture" },
  document: { icon: FileText, label: "Document" },
  spreadsheet: { icon: FileSpreadsheet, label: "Spreadsheet" },
  presentation: { icon: Presentation, label: "Presentation" },
  video: { icon: FilePlay, label: "Video" },
  text: { icon: FileText, label: "Text" },
  other: { icon: FileIcon, label: "File" },
};

/**
 * A post's attachments (nothing when it has none): pictures shown, as the website shows them, and other files as rows;
 * each opens full screen (`onOpen`: the screen's news/attachment).
 */
export function PostAttachments({ post: a, onOpen }: { post: Post; onOpen: (file: AnnouncementAttachment) => void }) {
  const colors = useColors();
  const files = a.attachments ?? [];
  if (!files.length) return null;
  return (
    <ListSection title={files.length === 1 ? "Attachment" : "Attachments"} testID="news-post-files">
      {files.map((f, i) => {
        if (isPicture(f)) return <AttachedPicture key={f.path || i} file={f} onPress={() => onOpen(f)} testID={`news-post-file-${i}`} />;
        const kind = FILE_KINDS[attachmentCategory(f)];
        const Icon = kind.icon;
        return (
          <ListRow
            key={f.path || i}
            icon={
              <RowIcon>
                <Icon size={17} color={colors.foreground} />
              </RowIcon>
            }
            title={
              <T variant="label" numberOfLines={2}>
                {f.name}
              </T>
            }
            subtitle={f.size ? `${kind.label} · ${formatBytes(f.size)}` : kind.label}
            onPress={() => onOpen(f)}
            accessibilityLabel={`${f.name}, ${kind.label}${f.size ? `, ${formatBytes(f.size)}` : ""}`}
            testID={`news-post-file-${i}`}
          />
        );
      })}
    </ListSection>
  );
}

/** An attached picture, shown in its own shape (at most 320 points tall), with its name and size; a tap opens it full screen. */
function AttachedPicture({ file: f, divider = false, onPress, testID }: { file: AnnouncementAttachment; divider?: boolean; onPress: () => void; testID?: string }) {
  const colors = useColors();
  const [ratio, setRatio] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Picture: ${f.name}${f.size ? `, ${formatBytes(f.size)}` : ""}`}
      accessibilityHint="Opens it full screen"
      style={({ pressed }) => [divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
      testID={testID}
    >
      {failed ? null : (
        <Image
          source={{ uri: reachable(f.url) }}
          style={[styles.attached, { aspectRatio: ratio ?? 4 / 3, backgroundColor: colors.cardMuted }]}
          contentFit="contain"
          transition={150}
          accessibilityIgnoresInvertColors
          onLoad={(e) => e.source.width > 0 && e.source.height > 0 && setRatio(e.source.width / e.source.height)}
          onError={() => setFailed(true)}
        />
      )}
      <View style={[styles.caption, !failed && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
        <ImageIcon size={15} color={colors.mutedForeground} />
        <T variant="small" numberOfLines={1} style={styles.grow}>
          {f.name}
        </T>
        {f.size ? (
          <T variant="small" tone="muted">
            {formatBytes(f.size)}
          </T>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A post while it loads: shaped like it, inside its card (so it shows on the grouped page in light and dark). */
export function PostLoading() {
  const colors = useColors();
  return (
    <Card style={styles.post} testID="news-post-loading">
      <Skeleton width={84} height={20} rounded={radius.full} />
      <Skeleton width="85%" height={26} />
      <Skeleton width="55%" height={26} />
      <Skeleton width="45%" height={12} />
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <Skeleton width="100%" height={14} />
      <Skeleton width="95%" height={14} />
      <Skeleton width="70%" height={14} />
    </Card>
  );
}

const styles = StyleSheet.create({
  post: { gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  title: { fontSize: 24, lineHeight: 30, marginTop: space.xs },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.sm },
  attached: { width: "100%", maxHeight: 320 },
  caption: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  grow: { flex: 1 },
});
