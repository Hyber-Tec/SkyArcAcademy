import { ChartLine, ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { T } from "@/components/Text";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { one, stateLabel } from "./format";
import type { StaffReport } from "./staff";
import { TrendChip } from "./TrendChip";

/**
 * A progress report in the staff's list, as the website's Reports table has it: whose it is, the period (and the name
 * staff gave it), its state (a draft, shared, or viewed by the family), how the scores went in the staff's words, who
 * prepared it, and the average per 10 shots. Tapping it opens the report.
 */
export function StaffReportRow({ report: r, divider = false, onPress, testID }: { report: StaffReport; divider?: boolean; onPress: () => void; testID?: string }) {
  const colors = useColors();
  const { timezone } = useBranch();
  const average = r.facts?.average ?? null;
  const level = r.facts?.trend?.level ?? null;
  const state = stateLabel(r, timezone);
  const name = r.student?.name || r.studentName;
  const by = r.generatedBy?.name ? `by ${r.generatedBy.name}` : null;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={[name, r.period.label, r.customName, state, by ? `prepared ${by}` : null, average !== null ? `average ${one(average)} per 10 shots` : null].filter(Boolean).join(", ")}
      onPress={onPress}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
    >
      <View style={[styles.icon, { backgroundColor: colors.brandTint }]}>
        <ChartLine size={20} color={colors.brandText} />
      </View>
      <View style={styles.grow}>
        <T variant="label" numberOfLines={2}>
          {name}
        </T>
        <T variant="small" tone="muted" numberOfLines={2}>
          {[r.period.label, r.customName].filter(Boolean).join(" · ")}
        </T>
        <View style={styles.meta}>
          <Badge tone={r.status === "shared" ? "success" : "secondary"}>{state}</Badge>
          {level ? <TrendChip level={level} size="sm" audience="staff" /> : null}
          {by ? (
            <T variant="small" tone="muted" numberOfLines={1}>
              {by}
            </T>
          ) : null}
        </View>
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
  meta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm, rowGap: 4, marginTop: 4 },
  average: { alignItems: "flex-end" },
  number: { fontVariant: ["tabular-nums"] },
});
