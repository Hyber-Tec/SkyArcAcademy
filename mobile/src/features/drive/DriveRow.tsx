import { type DriveIndex, type DriveItem, countLabel, formatBytes, itemUpdated, updatedText } from "@shared/drive/model";
import { DRIVE_ACCESS_LABELS, accessOf } from "@shared/drive/types";
import { type Evaluation, POSITION_COLORS, POSITION_LABELS, per10 } from "@shared/shooting/evaluation";
import { ChevronRight, Ellipsis, Folder, Lock } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { IconButton } from "@/components/IconButton";
import { T } from "@/components/Text";
import { scoreTotal } from "@/features/scores/format";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { FileGlyph, FolderGlyph } from "./DriveIcons";

/** An upload of this file from this phone: how far it has got (null when it isn't going up now), and whether it waits here. */
export interface RowUpload {
  progress: number | null;
  waiting: boolean;
}

/** What a folder holds: "2 folders · 14 files", or "Empty". */
export function contentsText(index: DriveIndex, folderId: string): string {
  const c = index.countsOf(folderId);
  if (!c.folders && !c.files) return "Empty";
  return [c.folders ? countLabel(c.folders, "folder") : null, c.files ? countLabel(c.files, "file") : null].filter(Boolean).join(" · ");
}

/** A result's score, as the website's Drive shows it beside the file: "Prone · 186.8", per 10 shots when not 10. */
export function scoreText(e: Pick<Evaluation, "position" | "source" | "total" | "shots">): string {
  const p10 = per10(e.total, e.shots);
  return `${POSITION_LABELS[e.position]} · ${scoreTotal(e)}${e.shots !== 10 && p10 !== null ? ` · ${p10} per 10` : ""}`;
}

/**
 * One folder or file in a Drive list: its picture, its name (two lines at most), a result's score (a student's folder;
 * tapping it opens the score), what a folder holds or when a file changed and its size, where it is (search results),
 * and "…" for what can be done with it (a long press does the same). A file on its way up says so, with how far it has
 * got.
 */
export function DriveRow({
  item,
  index,
  where = null,
  score = null,
  upload = null,
  divider = false,
  onPress,
  onScore,
  onMore,
  testID,
}: {
  item: DriveItem;
  index: DriveIndex;
  /** Search results: the folder it's in ("" at the top of the Drive). */
  where?: string | null;
  score?: Pick<Evaluation, "position" | "source" | "total" | "shots"> | null;
  upload?: RowUpload | null;
  divider?: boolean;
  onPress: () => void;
  /** Opens the result's score. */
  onScore?: () => void;
  onMore: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const { timezone } = useBranch();
  const isFolder = item.kind === "folder";
  const name = isFolder ? item.folder.name : item.file.name;
  // Only owners and admins see it (a coach's lists never hold such a thing).
  const adminsOnly = accessOf(isFolder ? item.folder : item.file) === "admins";
  const changed = itemUpdated(item, index);
  const when = updatedText(changed.at, changed.by, timezone);

  let detail: string;
  let tone: "muted" | "destructive" = "muted";
  let progress: number | null = null;
  if (item.kind === "folder") {
    detail = [contentsText(index, item.id), when].filter(Boolean).join(" · ");
  } else {
    const f = item.file;
    if (f.status === "uploading") {
      progress = upload?.progress ?? null;
      detail = progress !== null ? `Uploading ${Math.round(progress * 100)}%` : upload?.waiting ? "Waiting on this phone to upload" : "Uploading…";
    } else if (f.status === "error") {
      detail = f.error ? `Upload failed: ${f.error}` : "Upload failed";
      tone = "destructive";
    } else {
      detail = [when, formatBytes(f.size)].filter(Boolean).join(" · ");
    }
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[isFolder ? `Folder ${name}` : name, adminsOnly ? DRIVE_ACCESS_LABELS.admins : null, score ? scoreText(score) : null, detail, where !== null ? `in ${where || "the Drive"}` : null].filter(Boolean).join(", ")}
      accessibilityHint="Hold for more"
      onPress={onPress}
      onLongPress={onMore}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
    >
      <View style={styles.icon}>{item.kind === "folder" ? <FolderGlyph student={!!item.folder.studentId} /> : <FileGlyph kind={item.file.kind} />}</View>
      <View style={styles.grow}>
        <T variant="label" numberOfLines={2}>
          {name}
        </T>
        {score ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open the score: ${scoreText(score)}`}
            disabled={!onScore}
            onPress={onScore}
            hitSlop={6}
            style={({ pressed }) => [styles.score, { backgroundColor: pressed ? colors.accent : colors.secondary }]}
            testID={testID ? `${testID}-score` : undefined}
          >
            <View style={[styles.dot, { backgroundColor: POSITION_COLORS[score.position] }]} />
            <T variant="tiny" style={styles.scoreText} numberOfLines={1}>
              {scoreText(score)}
            </T>
            {onScore ? <ChevronRight size={11} color={colors.mutedForeground} /> : null}
          </Pressable>
        ) : null}
        {detail ? (
          <T variant="small" tone={tone} numberOfLines={2}>
            {detail}
          </T>
        ) : null}
        {adminsOnly ? (
          <View style={styles.where} testID={testID ? `${testID}-admins` : undefined}>
            <Lock size={12} color={colors.mutedForeground} />
            <T variant="small" tone="muted" numberOfLines={1} style={styles.shrink}>
              {DRIVE_ACCESS_LABELS.admins}
            </T>
          </View>
        ) : null}
        {progress !== null ? (
          <View style={[styles.track, { backgroundColor: colors.secondary }]}>
            <View style={[styles.bar, { backgroundColor: colors.foreground, width: `${Math.max(4, Math.round(progress * 100))}%` }]} />
          </View>
        ) : null}
        {where !== null ? (
          <View style={styles.where}>
            <Folder size={12} color={colors.mutedForeground} />
            <T variant="small" tone="muted" numberOfLines={1} style={styles.shrink}>
              {where || "Drive"}
            </T>
          </View>
        ) : null}
      </View>
      <IconButton icon={<Ellipsis size={20} color={colors.mutedForeground} />} accessibilityLabel={`More for ${name}`} onPress={onMore} size={36} testID={testID ? `${testID}-more` : undefined} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingLeft: space.lg, paddingRight: space.sm, paddingVertical: space.md, minHeight: 60 },
  icon: { width: 32, alignItems: "center" },
  grow: { flex: 1, gap: 3 },
  shrink: { flexShrink: 1 },
  score: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  scoreText: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  track: { height: 3, borderRadius: 2, overflow: "hidden", marginTop: 2 },
  bar: { height: 3, borderRadius: 2 },
  where: { flexDirection: "row", alignItems: "center", gap: 4 },
});
