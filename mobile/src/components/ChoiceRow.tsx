import * as Haptics from "expo-haptics";
import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

/**
 * One of a few choices in a ListSection, as the website's radio groups: a round mark (filled and checked when it's the
 * one chosen), its title with a line under it, and a detail at the right ("2 seats open"). A choice that can't be taken
 * shows faded and does nothing.
 */
export function ChoiceRow({
  title,
  subtitle,
  right,
  selected,
  disabled = false,
  onPress,
  divider = false,
  testID,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  /** Set by ListSection on every row after the first. */
  divider?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  const line = divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border };
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={() => {
        if (selected) return;
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [styles.row, line, pressed && { backgroundColor: colors.accent }, disabled && styles.faded]}
      testID={testID}
    >
      <View style={[styles.mark, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : "transparent" }]}>
        {selected ? <Check size={13} color={colors.primaryForeground} strokeWidth={3} /> : null}
      </View>
      <View style={styles.grow}>
        {typeof title === "string" ? <T variant="label">{title}</T> : title}
        {typeof subtitle === "string" ? (
          <T variant="small" tone="muted">
            {subtitle}
          </T>
        ) : (
          subtitle
        )}
      </View>
      {typeof right === "string" ? (
        <T variant="small" tone="muted" style={styles.right}>
          {right}
        </T>
      ) : (
        right
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 52 },
  faded: { opacity: 0.5 },
  mark: { width: 22, height: 22, borderRadius: radius.full, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  grow: { flex: 1, gap: 2 },
  right: { fontVariant: ["tabular-nums"] },
});
