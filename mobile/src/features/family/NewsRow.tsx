import type { DateKey } from "@shared/time";
import { ChevronRight, Image as ImageIcon, Megaphone, MessageSquare, Paperclip, Pin } from "lucide-react-native";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { newsPreview, postHolds, postedDay } from "@/features/announcements/format";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import type { NewsPost } from "./news";
import { NewBadge } from "./ReportRow";

/**
 * One of the academy's posts in a list (Home's "From the academy", the News page; the staff's News too), as the website
 * lists them: its title in full, "New" until this person opens it; whether it's pinned, its category, the day it went
 * up (in the academy's zone), how many pictures and files it has (and, for the staff, its comments); and a line or two
 * of its text. Tapping it opens the post.
 */
export function NewsRow({
  post: a,
  isNew,
  today,
  comments = 0,
  divider = false,
  onPress,
  testID,
}: {
  post: NewsPost;
  isNew: boolean;
  /** Today in the academy's zone ("Today", "Yesterday"). */
  today: DateKey;
  /** How many comments it has, shown when there are some (the staff's lists: families never see comments). */
  comments?: number;
  divider?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const { timezone } = useBranch();
  const preview = newsPreview(a);
  const day = postedDay(a, timezone, today);
  const category = a.category?.trim() || "General";
  const holds = postHolds(a);
  const talk = comments > 0 ? (comments === 1 ? "1 comment" : `${comments} comments`) : null;
  const label = [a.title, isNew ? "New" : null, a.pinned ? "Pinned" : null, category, day, holds.pictures, holds.files, talk, preview].filter(Boolean).join(", ");
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.secondary }]}>
        <Megaphone size={19} color={colors.foreground} />
      </View>
      <View style={styles.grow}>
        <View style={styles.top}>
          <T variant="label" style={styles.shrink}>
            {a.title}
          </T>
          {isNew ? <NewBadge /> : null}
        </View>
        {/* The day kept whole: it moves to the next line rather than breaking. */}
        <View style={styles.meta}>
          <View style={[styles.inline, styles.shrink]}>
            {a.pinned ? <Pin size={12} color={colors.warning} /> : null}
            <T variant="small" tone="muted" style={styles.shrink}>
              {a.pinned ? (
                <>
                  <Text style={[styles.pinned, { color: colors.warning }]}>Pinned</Text>
                  {" · "}
                </>
              ) : null}
              {`${category} · ${day.replace(/ /g, "\u00a0")}`}
            </T>
          </View>
          {holds.pictures ? (
            <View style={styles.inline}>
              <ImageIcon size={12} color={colors.mutedForeground} />
              <T variant="small" tone="muted">
                {holds.pictures}
              </T>
            </View>
          ) : null}
          {holds.files ? (
            <View style={styles.inline}>
              <Paperclip size={12} color={colors.mutedForeground} />
              <T variant="small" tone="muted">
                {holds.files}
              </T>
            </View>
          ) : null}
          {comments > 0 ? (
            <View style={styles.inline}>
              <MessageSquare size={12} color={colors.mutedForeground} />
              <T variant="small" tone="muted">
                {comments}
              </T>
            </View>
          ) : null}
        </View>
        {preview ? (
          <T variant="small" tone="muted" numberOfLines={2} style={styles.preview}>
            {preview}
          </T>
        ) : null}
      </View>
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * News rows while they load: a card of grey rows shaped like them (inside a card, so they show on the grouped page in
 * light and dark).
 */
export function NewsRowsLoading({ count = 3, testID }: { count?: number; testID?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.loading, { borderColor: colors.border, backgroundColor: colors.card }]} testID={testID}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
          <Skeleton width={40} height={40} rounded={radius.md} />
          <View style={styles.grow}>
            <Skeleton width="70%" height={15} />
            <Skeleton width="40%" height={11} />
            <Skeleton width="90%" height={11} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  grow: { flex: 1, gap: 2 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  shrink: { flexShrink: 1 },
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: space.sm, rowGap: 2 },
  inline: { flexDirection: "row", alignItems: "center", gap: 3 },
  pinned: { fontWeight: "600" },
  preview: { marginTop: 2 },
});
