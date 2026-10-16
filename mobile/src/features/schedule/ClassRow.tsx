import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, space, useColors, useStatusColors } from "@/theme";
import type { ClassGroup } from "./classes";
import { plural, timeRange } from "./format";

/**
 * One class as a card: its time, the coach (their schedule colour on the edge) and each student with their status and
 * the class's note ("MU for 10/12", "Trial 1"). Tapping it opens the class.
 */
export function ClassRow({
  group,
  color,
  hour12,
  showCoach = true,
  live = false,
  onPress,
  testID,
}: {
  group: ClassGroup;
  /** The coach's colour on the schedule. */
  color: string | null;
  hour12: boolean;
  showCoach?: boolean;
  /** Happening now. */
  live?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const status = useStatusColors();
  const count = group.active.length;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${timeRange(group.startMin, group.endMin, hour12)}, ${group.coachName}, ${plural(count, "student")}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, { backgroundColor: pressed ? colors.accent : colors.card, borderColor: colors.border }]}
    >
      <View style={[styles.edge, { backgroundColor: color ?? colors.mutedForeground }]} />
      <View style={styles.body}>
        <View style={styles.head}>
          <T variant="label" style={styles.grow} numberOfLines={1}>
            {timeRange(group.startMin, group.endMin, hour12)}
          </T>
          {live ? (
            <View style={[styles.live, { backgroundColor: colors.brandTint }]}>
              <View style={[styles.liveDot, { backgroundColor: colors.brand }]} />
              <T variant="tiny" style={{ color: colors.brandText, fontWeight: "700" }}>
                NOW
              </T>
            </View>
          ) : (
            <T variant="small" tone="muted">
              {plural(count, "student")}
            </T>
          )}
        </View>
        {showCoach ? (
          <T variant="small" tone="muted" numberOfLines={1}>
            {group.coachName}
          </T>
        ) : null}
        <View style={styles.students}>
          {group.sessions.map((s) => {
            const canceled = s.status === "canceled";
            return (
              <View key={s.id} style={styles.student}>
                <View style={[styles.dot, { backgroundColor: status[s.status].bar }]} />
                <T variant="small" numberOfLines={1} style={[styles.name, canceled && { color: colors.mutedForeground, textDecorationLine: "line-through" }]}>
                  {s.studentName}
                </T>
                <T variant="small" tone="muted" numberOfLines={1} style={styles.note}>
                  {[SESSION_STATUS_LABELS[s.status], s.note?.trim()].filter(Boolean).join(" · ")}
                </T>
              </View>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  edge: { width: 5 },
  body: { flex: 1, paddingHorizontal: space.md, paddingVertical: space.md, gap: 2 },
  head: { flexDirection: "row", alignItems: "center", gap: space.sm },
  grow: { flex: 1 },
  students: { marginTop: space.xs, gap: 3 },
  student: { flexDirection: "row", alignItems: "center", gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { flexShrink: 1, fontWeight: "500" },
  note: { flexShrink: 1, marginLeft: "auto", textAlign: "right" },
  live: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.full },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
});
