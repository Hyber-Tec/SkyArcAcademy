import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { Field } from "@/components/Field";
import { T } from "@/components/Text";
import { space } from "@/theme";

/**
 * A name to type, as the website's (web/src/features/drive/dialogs.tsx): a new folder, or renaming a folder or a file.
 * A file's extension stays as it is and shows after the field (`suffix`), so only its name is typed. `problem` says
 * why a name can't be used (a folder of that name beside it); saving closes it at once (the change is kept on the
 * phone straight away).
 */
export function NameDialog({
  title,
  initial,
  suffix,
  confirmLabel = "Save",
  maxLength = 120,
  problem,
  onSubmit,
  onClose,
  testID = "drive-name",
}: {
  title: string;
  initial: string;
  suffix?: string;
  confirmLabel?: string;
  maxLength?: number;
  problem?: (name: string) => string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
  testID?: string;
}) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const typed = name.trim();
    if (!typed) return;
    const full = suffix ? `${typed}${suffix}` : typed;
    const why = problem?.(full) ?? null;
    if (why) return setError(why);
    onSubmit(full);
    onClose();
  };
  return (
    <Dialog
      open
      onRequestClose={onClose}
      testID={testID}
      footer={
        <View style={styles.buttons}>
          <Button variant="outline" onPress={onClose} style={styles.grow} testID={`${testID}-cancel`}>
            Cancel
          </Button>
          <Button onPress={submit} disabled={!name.trim()} style={styles.grow} testID={`${testID}-save`}>
            {confirmLabel}
          </Button>
        </View>
      }
    >
      <T variant="heading">{title}</T>
      <Field
        label="Name"
        value={name}
        onChangeText={(t) => {
          setName(t);
          setError(null);
        }}
        maxLength={maxLength - (suffix?.length ?? 0)}
        autoFocus
        selectTextOnFocus
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={submit}
        error={error}
        hint={suffix ? `It stays a ${suffix} file.` : undefined}
        right={
          suffix ? (
            <T tone="muted" numberOfLines={1}>
              {suffix}
            </T>
          ) : undefined
        }
        testID={`${testID}-field`}
      />
    </Dialog>
  );
}

const styles = StyleSheet.create({
  buttons: { flexDirection: "row", gap: space.md },
  grow: { flex: 1 },
});
