import { Eye, EyeOff } from "lucide-react-native";
import { forwardRef, useId, useState } from "react";
import { InputAccessoryView, Keyboard, Platform, Pressable, StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { T } from "@/components/Text";
import { radius, space, useColors } from "@/theme";

type FieldProps = TextInputProps & { label?: string; hint?: string; error?: string | null; right?: React.ReactNode };

/**
 * A labelled text field. A multiline one with `flex: 1` in its style grows to fill its container. On an iPhone a
 * multiline field's keyboard has a Done bar (its return key starts a new line, so it can't close the keyboard).
 */
export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, hint, error, right, style, ...props }, ref) {
  const colors = useColors();
  const grows = StyleSheet.flatten(style)?.flex === 1;
  const bar = useId();
  const done = Platform.OS === "ios" && !!props.multiline && !props.inputAccessoryViewID;
  return (
    <View style={[styles.wrap, grows && styles.grow]}>
      {label ? <T variant="label">{label}</T> : null}
      <View>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.mutedForeground}
          {...props}
          inputAccessoryViewID={done ? bar : props.inputAccessoryViewID}
          style={[
            styles.input,
            { color: colors.foreground, borderColor: error ? colors.destructive : colors.input, backgroundColor: colors.card },
            props.multiline && styles.multiline,
            !!right && { paddingRight: 48 },
            style,
          ]}
        />
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      {done ? (
        <InputAccessoryView nativeID={bar}>
          <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <Pressable accessibilityRole="button" accessibilityLabel="Done typing" hitSlop={10} onPress={() => Keyboard.dismiss()} testID={props.testID ? `${props.testID}-done` : undefined}>
              <T variant="label">Done</T>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
      {error ? (
        <T variant="small" tone="destructive">
          {error}
        </T>
      ) : hint ? (
        <T variant="small" tone="muted">
          {hint}
        </T>
      ) : null}
    </View>
  );
});

/**
 * A password field with a show/hide eye. Shown, it stays a password to the keyboard on Android (no suggestions, nothing
 * learned); on an iPhone it takes the person's usual keyboard, which is also how to get round a password keyboard that
 * misbehaves.
 */
export const PasswordField = forwardRef<TextInput, Omit<FieldProps, "secureTextEntry" | "right">>(function PasswordField(props, ref) {
  const colors = useColors();
  const [shown, setShown] = useState(false);
  return (
    <Field
      ref={ref}
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      keyboardType={shown && Platform.OS === "android" ? "visible-password" : props.keyboardType}
      secureTextEntry={!shown}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel={shown ? "Hide password" : "Show password"} hitSlop={8} onPress={() => setShown((s) => !s)}>
          {shown ? <EyeOff size={20} color={colors.mutedForeground} /> : <Eye size={20} color={colors.mutedForeground} />}
        </Pressable>
      }
    />
  );
});

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  grow: { flex: 1 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: 12, fontSize: 16 },
  multiline: { minHeight: 132, textAlignVertical: "top", paddingTop: space.md },
  right: { position: "absolute", right: 0, top: 0, bottom: 0, width: 48, alignItems: "center", justifyContent: "center" },
  bar: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: space.lg, paddingVertical: space.sm + 2, borderTopWidth: StyleSheet.hairlineWidth },
});
