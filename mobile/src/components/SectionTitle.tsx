import type { LucideIcon } from "lucide-react-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { type Accent, space, useAccents } from "@/theme";

/**
 * A small title over a group of cards, as ListSection's over its rows ("NEXT CLASS"), with something at its right (a
 * count, a link). With `icon`, the title shows it and takes its `tone`, as ListSection's.
 */
export function SectionTitle({ title, detail, icon: Icon, tone = "grey", testID }: { title: string; detail?: ReactNode; icon?: LucideIcon; tone?: Accent; testID?: string }) {
  const accent = useAccents()[tone];
  return (
    <View style={styles.head} testID={testID}>
      {Icon ? <Icon size={14} color={accent.fg} strokeWidth={2.4} style={styles.icon} /> : null}
      <T variant="small" tone="muted" style={[styles.title, Icon && { color: accent.fg }]} accessibilityRole="header">
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
  head: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.xs },
  icon: { marginTop: -1 },
  title: { flex: 1, fontWeight: "600", letterSpacing: 0.5 },
  detail: { fontWeight: "600", fontVariant: ["tabular-nums"] },
});
