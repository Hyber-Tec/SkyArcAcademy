import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";

/**
 * A label and its value, read-only, as the phone's Settings → About lists them: the value at the right, wrapping onto
 * more lines when it's long rather than pushing the label away. Goes in a ListSection, which draws the lines between
 * rows (`divider`). A value that isn't text (a badge) sits at the right as it is.
 */
export function FactRow({ label, value, divider = false, testID }: { label: string; value: ReactNode; divider?: boolean; testID?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={testID} accessible>
      <T style={styles.label}>{label}</T>
      {typeof value === "string" || typeof value === "number" ? (
        <T tone="muted" style={styles.value} selectable>
          {value}
        </T>
      ) : (
        <View style={styles.box}>{value}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 48 },
  label: { flexShrink: 0, maxWidth: "50%" },
  value: { flex: 1, textAlign: "right", fontVariant: ["tabular-nums"] },
  // A row, so a value that places itself (a Badge's alignSelf) still sits at the right.
  box: { flex: 1, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
});
