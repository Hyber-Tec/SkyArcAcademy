import { Search, X } from "lucide-react-native";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { radius, space, useColors } from "@/theme";

/** A search box (a list's own, at the top of its page): a magnifier, what's typed, and a button that clears it. */
export function SearchField({ value, onChangeText, placeholder, testID }: { value: string; onChangeText: (text: string) => void; placeholder: string; testID?: string }) {
  const colors = useColors();
  return (
    <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Search size={18} color={colors.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel={placeholder}
        style={[styles.input, { color: colors.foreground }]}
        testID={testID}
      />
      {value ? (
        <Pressable onPress={() => onChangeText("")} accessibilityRole="button" accessibilityLabel="Clear the search" hitSlop={10} testID={testID ? `${testID}-clear` : undefined}>
          <View style={[styles.clear, { backgroundColor: colors.mutedForeground }]}>
            <X size={12} color={colors.card} strokeWidth={3} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", alignItems: "center", gap: space.sm, height: 42, paddingHorizontal: space.md, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, fontSize: 16, paddingVertical: 0 },
  clear: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
});
