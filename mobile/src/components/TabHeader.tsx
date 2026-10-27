import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DemoBadge } from "@/components/DemoBadge";
import { T } from "@/components/Text";
import { space } from "@/theme";

/**
 * A tab's title at the very top of its page, where the phone's large title would be but without the empty bar above it
 * (owner, 2026-10-17: use the space), as Home's greeting sits, with "Demo" beside it in the demo academy; an action (a
 * button) on its right.
 */
export function TabHeader({ title, right, testID }: { title: string; right?: ReactNode; testID?: string }) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.titleRow}>
        <T variant="title" accessibilityRole="header" numberOfLines={1} style={styles.title}>
          {title}
        </T>
        <DemoBadge />
      </View>
      {right}
    </View>
  );
}

/** Below the status bar the page fades in through these bands (opacity of the page's colour, 2 points each). */
const FADE = [0.86, 0.72, 0.57, 0.43, 0.29, 0.15, 0.05];

/**
 * Over a page without a header: the status bar's strip in the page's colour, fading into the page below it, so what
 * scrolls up under the clock doesn't show through. Plain views, so the colour follows light and dark at once.
 */
export function StatusBarScrim({ color }: { color: string }) {
  const insets = useSafeAreaInsets();
  if (!insets.top) return null;
  return (
    <View pointerEvents="none" style={styles.scrim}>
      <View style={{ height: insets.top, backgroundColor: color }} />
      {FADE.map((opacity) => (
        <View key={opacity} style={{ height: 2, backgroundColor: color, opacity }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 40 },
  titleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { flexShrink: 1 },
  scrim: { position: "absolute", top: 0, left: 0, right: 0 },
});
