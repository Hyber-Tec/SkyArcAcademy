import { router } from "expo-router";
import { CalendarPlus } from "lucide-react-native";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/Button";
import { DemoBadge } from "@/components/DemoBadge";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { useT } from "@/lib/lang";
import { space, useColors } from "@/theme";
import { useFamily } from "./FamilyProvider";

export type ClassesMode = "list" | "month";

/** List / Month's width at the phone's usual text size; it grows with a larger text size, up to twice. */
const SWITCH_WIDTH = 108;

/** "Ask", small, with the calendar in the academy's red: asking for a class, for the child chosen on the tabs (else the first). */
export function AskButton({ testID = "family-ask" }: { testID?: string }) {
  const colors = useColors();
  const family = useFamily();
  const t = useT();
  return (
    <Button
      variant="outline"
      size="sm"
      wrap
      icon={<CalendarPlus size={17} color={colors.brand} />}
      onPress={() => router.push({ pathname: "/ask", params: family.child !== "all" ? { studentId: family.child } : {} })}
      accessibilityLabel={t("Ask for a class", "수업 신청")}
      testID={testID}
    >
      {t("Ask", "신청")}
    </Button>
  );
}

/**
 * The top of Classes, the same in both views: its title (with "Demo" in the demo academy), then List / Month and Ask at
 * the right, which go under the title, still at the right, when a larger text size leaves no room beside it. Only the
 * title before a student is linked.
 */
export function ClassesHeader({ mode, onMode, linked }: { mode: ClassesMode; onMode: (m: ClassesMode) => void; linked: boolean }) {
  const { fontScale } = useWindowDimensions();
  const t = useT();
  return (
    <View style={styles.row} testID="family-classes-title">
      <View style={styles.title}>
        <T variant="title" accessibilityRole="header">
          {t("Classes", "수업")}
        </T>
        <DemoBadge />
      </View>
      {linked ? (
        <View style={styles.controls}>
          <View style={{ width: Math.round(SWITCH_WIDTH * Math.min(2, Math.max(1, fontScale))) }}>
            <SegmentedControl<ClassesMode>
              value={mode}
              onChange={onMode}
              options={[
                { value: "list", label: t("List", "목록") },
                { value: "month", label: t("Month", "달력") },
              ]}
              testID="family-classes-view"
            />
          </View>
          <AskButton />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The controls wrap under the title (still at the right) rather than squeezing it.
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.sm, rowGap: space.sm, minHeight: 40 },
  title: { flexDirection: "row", alignItems: "center", gap: space.sm, flexGrow: 1 },
  controls: { flexDirection: "row", alignItems: "center", gap: space.sm, marginLeft: "auto" },
});
