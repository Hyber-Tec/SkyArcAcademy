import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, space } from "@/theme";

/**
 * A plain heading over one part of a page that holds several kinds of things (the family's Classes: what needs an
 * answer, what waits, the makeups, the classes), each told apart by its colour: a small icon in that colour on its
 * tint, the words in sentence case, and a count when there's more than one.
 */
export function SectionHeading({ title, icon, color, tint, count, testID }: { title: string; icon: ReactNode; color: string; tint: string; count?: number; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      {/* Made again with its fill (the appearance changing): on Android a fill that comes after a circle is drawn is square. */}
      <View key={tint} style={[styles.icon, { backgroundColor: tint }]}>
        {icon}
      </View>
      <T variant="subheading" accessibilityRole="header" style={styles.title}>
        {title}
      </T>
      {count && count > 1 ? (
        <View key={`${tint}-count`} style={[styles.count, { backgroundColor: tint }]}>
          <T variant="small" style={[styles.countText, { color }]}>
            {count}
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.xs },
  icon: { width: 30, height: 30, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  title: { flexShrink: 1 },
  count: { minWidth: 24, paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.full, alignItems: "center" },
  countText: { fontWeight: "700", fontVariant: ["tabular-nums"] },
});
