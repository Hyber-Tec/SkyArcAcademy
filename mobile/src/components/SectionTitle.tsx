import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { space } from "@/theme";

/**
 * A small title over a group of cards, as ListSection's over its rows ("NEXT CLASS"), with something at its right (a
 * count, a link).
 */
export function SectionTitle({ title, detail, testID }: { title: string; detail?: ReactNode; testID?: string }) {
  return (
    <View style={styles.head} testID={testID}>
      <T variant="small" tone="muted" style={styles.title} accessibilityRole="header">
        {title.toUpperCase()}
      </T>
      {typeof detail === "string" ? (
        <T variant="small" tone="muted" style={styles.detail}>
          {detail}
        </T>
      ) : (
        detail
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", gap: space.sm, paddingHorizontal: space.xs },
  title: { flex: 1, fontWeight: "600", letterSpacing: 0.5 },
  detail: { fontWeight: "600", fontVariant: ["tabular-nums"] },
});
