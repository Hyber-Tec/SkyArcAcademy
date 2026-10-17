import { ChartLine, ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { one, sharedOn } from "@/features/reports/format";
import { TrendChip } from "@/features/reports/TrendChip";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import type { ReportDoc } from "./data";

/** "NEW", on a report nobody in the family has opened yet. */
export function NewBadge() {
  const colors = useColors();
  return (
    <View style={[styles.new, { backgroundColor: colors.brand }]} accessibilityLabel="New">
      <T variant="tiny" style={styles.newText}>
        NEW
      </T>
    </View>
  );
}

/**
 * A shared progress report in a list: its name and period, whose it is (a parent with several children), how the
 * scores went (when the report shows it), when it was shared, "New" until someone in the family opens it, and the
 * average per 10 shots. Tapping it opens the report.
 */
export function ReportRow({
  report: r,
  name,
  isNew,
  divider = false,
  onPress,
  testID,
}: {
  report: ReportDoc;
  /** The student's first name, when the list mixes children. */
  name?: string | null;
  isNew: boolean;
  divider?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const { timezone } = useBranch();
  const average = r.facts?.average ?? null;
  const level = r.options?.showStatus !== false ? (r.facts?.trend?.level ?? null) : null;
  const shared = sharedOn(r, timezone);
  const title = r.customName || "Progress report";
  const detail = [name, shared ? `Shared ${shared}` : null].filter(Boolean).join(" · ");
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[title, r.period.label, name, isNew ? "New" : null, average !== null ? `average ${one(average)} per 10 shots` : null].filter(Boolean).join(", ")}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.brandTint }]}>
        <ChartLine size={20} color={colors.brandText} />
      </View>
      <View style={styles.grow}>
        <View style={[styles.line, styles.top]}>
          <T variant="label" numberOfLines={2} style={styles.shrink}>
            {title}
          </T>
          {isNew ? <NewBadge /> : null}
        </View>
        <T variant="small" tone="muted">
          {r.period.label}
        </T>
        {level || detail ? (
          <View style={[styles.line, styles.meta]}>
            {level ? <TrendChip level={level} size="sm" /> : null}
            {detail ? (
              <T variant="small" tone="muted">
                {detail}
              </T>
            ) : null}
          </View>
        ) : null}
      </View>
      {average !== null ? (
        <View style={styles.average}>
          <T variant="subheading" style={styles.number}>
            {one(average)}
          </T>
          <T variant="tiny" tone="muted">
            per 10
          </T>
        </View>
      ) : null}
      <ChevronRight size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  icon: { width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  grow: { flex: 1, gap: 2 },
  line: { flexDirection: "row", alignItems: "center", gap: space.sm },
  top: { alignItems: "flex-start" },
  meta: { marginTop: 4, flexWrap: "wrap", rowGap: 4 },
  shrink: { flexShrink: 1 },
  average: { alignItems: "flex-end" },
  number: { fontVariant: ["tabular-nums"] },
  new: { borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 2, marginTop: 1 },
  newText: { color: "#ffffff", fontWeight: "700", letterSpacing: 0.4 },
});
