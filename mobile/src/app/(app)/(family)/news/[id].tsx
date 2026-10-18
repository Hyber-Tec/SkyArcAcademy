import type { AnnouncementAttachment } from "@shared/comms";
import type { FileCategory } from "@shared/drive/files";
import { formatBytes } from "@shared/drive/model";
import { router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import { File as FileIcon, FileImage, FilePlay, FileSpreadsheet, FileText, Image as ImageIcon, type LucideIcon, Megaphone, Pin, Presentation, Tag } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ImageViewer } from "@/components/ImageViewer";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { attachmentCategory, isPicture, postedAt } from "@/features/announcements/format";
import { htmlBlocks } from "@/features/announcements/html";
import { type PostPicture, RichText } from "@/features/announcements/RichText";
import { useAcademyNow } from "@/features/data/hooks";
import { type NewsPost, useNewsPost, useReadReceipt } from "@/features/family/news";
import { reachable } from "@/lib/links";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * One of the academy's posts for families (loaded by ID, so a link opens it too): its category, pinned or not, the
 * title, who posted it and when (in the academy's zone), the content as the website's editor wrote it (RichText: a
 * picture opens full screen, a link in the phone's browser), and its attachments: pictures shown, as the website shows
 * them, and other files as rows; each opens full screen (news/attachment). Opening it leaves this person's read
 * receipt, once, so it stops being "New" for them. A post the academy archived, stopped showing to families or deleted
 * (or an unknown link) says it isn't available, in the website's words.
 */
export default function FamilyNewsPostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useColors();
  const { post, loading } = useNewsPost(id ?? null);
  useReadReceipt(post);

  if (loading) {
    return (
      <Screen typing={false} testID="news-post-screen">
        {/* Shaped like the post, inside its card (so it shows on the grouped page in light and dark). */}
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
      </Screen>
    );
  }
  if (!post) {
    return (
      <Screen typing={false} testID="news-post-screen">
        <EmptyState
          testID="news-post-missing"
          icon={<Megaphone size={26} color={colors.mutedForeground} />}
          title="This news isn’t available"
          text="It may have been taken down, or it isn’t shared with families."
          action={
            <Button variant="outline" onPress={() => (router.canGoBack() ? router.back() : router.replace("/news"))} testID="news-post-back">
              Back to news
            </Button>
          }
        />
      </Screen>
    );
  }
  return <PostBody a={post} />;
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

function PostBody({ a }: { a: NewsPost }) {
  const { timezone, settings, name } = useBranch();
  const colors = useColors();
  const { today } = useAcademyNow();
  const [picture, setPicture] = useState<PostPicture | null>(null);
  const blocks = useMemo(() => htmlBlocks(a.contentHtml), [a.contentHtml]);
  const hour12 = settings.general.timeFormat !== "24h";
  const files = a.attachments ?? [];
  const openFile = (f: AnnouncementAttachment) => router.push({ pathname: "/news/attachment", params: { id: a.id, path: f.path } });

  return (
    <>
      <Screen typing={false} testID="news-post-screen">
        <Card style={styles.post} testID="news-post">
          <View style={styles.chips}>
            {a.pinned ? (
              <Badge tone="warning" icon={<Pin size={11} color={colors.warning} />}>
                Pinned
              </Badge>
            ) : null}
            <Badge icon={<Tag size={11} color={colors.foreground} />}>{a.category?.trim() || "General"}</Badge>
          </View>
          <T variant="title" accessibilityRole="header" style={styles.title} testID="news-post-title">
            {a.title}
          </T>
          <T variant="small" tone="muted" testID="news-post-meta">
            {`${a.authorName?.trim() || name} · ${postedAt(a, timezone, today, hour12)}`}
          </T>
          {blocks.length ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
          <RichText blocks={blocks} onOpenPicture={setPicture} testID="news-post-content" />
        </Card>

        {files.length ? (
          <ListSection title={files.length === 1 ? "Attachment" : "Attachments"} testID="news-post-files">
            {files.map((f, i) => {
              if (isPicture(f)) return <AttachedPicture key={f.path || i} file={f} onPress={() => openFile(f)} testID={`news-post-file-${i}`} />;
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
                  onPress={() => openFile(f)}
                  accessibilityLabel={`${f.name}, ${kind.label}${f.size ? `, ${formatBytes(f.size)}` : ""}`}
                  testID={`news-post-file-${i}`}
                />
              );
            })}
          </ListSection>
        ) : null}
      </Screen>
      <ImageViewer image={picture} onClose={() => setPicture(null)} />
    </>
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

const styles = StyleSheet.create({
  post: { gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
  title: { fontSize: 24, lineHeight: 30, marginTop: space.xs },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space.sm },
  attached: { width: "100%", maxHeight: 320 },
  caption: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md },
  grow: { flex: 1 },
});
