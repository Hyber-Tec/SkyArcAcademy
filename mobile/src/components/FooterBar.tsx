import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space, useColors } from "@/theme";

/**
 * A page's bottom bar for its actions (`Screen`'s `footer`): the page's colour with a hairline over it, its buttons side
 * by side (each with `flex: 1`), clear of the home indicator. A bare button as a footer sat on the screen's rounded
 * bottom edge, cut off on an iPhone 15.
 */
export function FooterBar({ children, testID }: { children: ReactNode; testID?: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { borderTopColor: colors.border, backgroundColor: colors.grouped, paddingBottom: insets.bottom + space.sm }]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
});
