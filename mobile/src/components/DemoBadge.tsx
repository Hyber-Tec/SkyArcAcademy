import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { useOptionalBranch } from "@/state/BranchProvider";
import { radius, useColors } from "@/theme";

/**
 * "Demo" beside the lockup and each tab's title while the app shows the demo academy (docs/DECISIONS.md §22), as the
 * website's top bar marks it (web/src/components/app/DemoBadge.tsx), so its made-up people are never taken for the
 * academy's own. Nothing otherwise.
 */
export function DemoBadge() {
  const branch = useOptionalBranch();
  const colors = useColors();
  if (!branch?.isDemo) return null;
  return (
    <View style={[styles.pill, { backgroundColor: colors.demoTint }]} accessible accessibilityLabel="Demo data: made-up students and classes" testID="demo-badge">
      <T style={[styles.text, { color: colors.demo }]}>Demo</T>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "center" },
  text: { fontSize: 11, lineHeight: 15, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
});
