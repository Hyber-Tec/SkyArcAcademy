import { type TrendLevel, trendLabel } from "@shared/reports/types";
import { Minus, TrendingDown, TrendingUp } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, useColors } from "@/theme";

/**
 * How the scores went over the period (computed from them, never written by hand), in the families' words ("Building
 * back up" for a dip), with an arrow so it never relies on colour alone.
 */
export function TrendChip({ level, size = "md", testID }: { level: TrendLevel; size?: "sm" | "md"; testID?: string }) {
  const colors = useColors();
  const look = {
    improving: { bg: colors.successTint, fg: colors.success, Icon: TrendingUp },
    steady: { bg: colors.infoTint, fg: colors.info, Icon: Minus },
    dipping: { bg: colors.warningTint, fg: colors.warning, Icon: TrendingDown },
  }[level];
  const md = size === "md";
  return (
    <View style={[styles.chip, md ? styles.md : styles.sm, { backgroundColor: look.bg }]} testID={testID}>
      <look.Icon size={md ? 16 : 12} color={look.fg} />
      <T variant={md ? "small" : "tiny"} style={[styles.text, { color: look.fg }]} numberOfLines={1}>
        {trendLabel(level, "family")}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", borderRadius: radius.full },
  md: { gap: 6, paddingHorizontal: 12, paddingVertical: 6 },
  sm: { gap: 4, paddingHorizontal: 8, paddingVertical: 3 },
  text: { fontWeight: "600" },
});
