import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Switch, View } from "react-native";
import { T } from "@/components/Text";
import { space, useColors } from "@/theme";

/**
 * A setting that's on or off: its name with a line under it, and the phone's own switch at the right (the iPhone's
 * green). The whole row toggles it, as the website's labels do. Goes in a ListSection, which draws the lines between
 * rows (`divider`).
 */
export function SwitchRow({
  icon,
  title,
  subtitle,
  value,
  onValueChange,
  disabled = false,
  divider = false,
  testID,
}: {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
  disabled?: boolean;
  divider?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const toggle = (on: boolean) => {
    void Haptics.selectionAsync().catch(() => undefined);
    onValueChange(on);
  };
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => toggle(!value)}
      style={({ pressed }) => [styles.row, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, pressed && { backgroundColor: colors.accent }]}
      testID={testID}
    >
      {icon}
      <View style={styles.grow}>
        <T variant="label">{title}</T>
        {subtitle ? (
          <T variant="small" tone="muted">
            {subtitle}
          </T>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={toggle}
        disabled={disabled}
        // The iPhone's own look (green when on); Android's in the app's colours.
        {...(Platform.OS === "android" ? { trackColor: { false: colors.input, true: colors.success }, thumbColor: "#ffffff" } : null)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID={testID ? `${testID}-switch` : undefined}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
  grow: { flex: 1, gap: 2 },
});
