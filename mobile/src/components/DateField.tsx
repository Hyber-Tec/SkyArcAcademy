import { type DateKey, type Weekday, formatDateKey } from "@shared/time";
import { CalendarDays, X } from "lucide-react-native";
import { useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

/**
 * A labelled date in a form, looking like the app's text fields (Field): tapping it opens the months to pick from
 * (DatePickerDialog, `yearJump` for far dates such as a birthday), and an × clears it when `onClear` is given.
 */
export function DateField({
  label,
  value,
  onChange,
  onClear,
  today,
  weekStartsOn,
  min,
  max,
  yearJump = false,
  placeholder = "Pick a date",
  hint,
  pickerTitle,
  testID,
}: {
  label: string;
  value: DateKey | null;
  onChange: (date: DateKey) => void;
  onClear?: () => void;
  /** The academy's today (marked in the months). */
  today: DateKey;
  weekStartsOn: Weekday;
  min?: DateKey | null;
  max?: DateKey | null;
  yearJump?: boolean;
  placeholder?: string;
  hint?: string;
  /** The picker's title; the label otherwise. */
  pickerTitle?: string;
  testID?: string;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const shown = value ? formatDateKey(value, "long") : null;
  return (
    <View style={styles.wrap}>
      <T variant="label">{label}</T>
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${shown ?? "not given"}`}
          accessibilityHint="Opens the months to pick a date"
          onPress={() => {
            Keyboard.dismiss();
            setOpen(true);
          }}
          style={({ pressed }) => [
            styles.box,
            { borderColor: colors.input, backgroundColor: pressed ? colors.accent : colors.card },
            !!onClear && !!value && styles.roomForClear,
          ]}
          testID={testID}
        >
          <CalendarDays size={18} color={colors.mutedForeground} />
          <T style={[styles.text, { color: shown ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
            {shown ?? placeholder}
          </T>
        </Pressable>
        {onClear && value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()}`} hitSlop={8} onPress={onClear} style={styles.clear} testID={testID ? `${testID}-clear` : undefined}>
            <X size={18} color={colors.mutedForeground} />
          </Pressable>
        ) : null}
      </View>
      {hint ? (
        <T variant="small" tone="muted">
          {hint}
        </T>
      ) : null}
      <DatePickerDialog
        open={open}
        title={pickerTitle ?? label}
        value={value}
        today={today}
        weekStartsOn={weekStartsOn}
        min={min}
        max={max}
        yearJump={yearJump}
        onPick={(d) => {
          onChange(d);
          setOpen(false);
        }}
        onClose={() => setOpen(false)}
        testID={testID ? `${testID}-picker` : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  // The same box as a Field's text input.
  box: { flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12 },
  roomForClear: { paddingRight: 48 },
  text: { flex: 1, fontSize: 16 },
  clear: { position: "absolute", right: 0, top: 0, bottom: 0, width: 48, alignItems: "center", justifyContent: "center" },
});
