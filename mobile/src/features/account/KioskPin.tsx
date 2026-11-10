import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { ErrorBox } from "@/components/AuthParts";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { callable, errorMessage } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space } from "@/theme";

const setMyKioskPin = callable<{ branchId: string; pin: string; via: "app" }, { ok: boolean }>("setMyKioskPin");

/**
 * More → Kiosk PIN: the coach sets or changes the PIN they clock in and out with on the front desk's tablet, typed
 * twice (the fourth meeting's B2; the website's Profile has the same, web/src/features/coach/profile/KioskPinSection.tsx).
 * The server keeps it unique and stores only its hash; the office can still set or remove it on the website.
 */
export function KioskPinScreen() {
  const { branchId, settings, staff, viewAs } = useBranch();
  const len = settings.timeClock.kiosk.pinLength;
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const againRef = useRef<TextInput>(null);

  if (!staff) {
    return (
      <Screen testID="kiosk-pin-screen">
        <T tone="muted" style={styles.intro}>
          Your employee record isn’t linked to your account yet. Ask an admin.
        </T>
      </Screen>
    );
  }

  const digits = (v: string) => v.replace(/\D/g, "").slice(0, len);
  const mismatch = pin.length === len && again.length === len && pin !== again;
  const ready = pin.length === len && again === pin;

  async function save() {
    if (!ready || busy) return;
    setError(null);
    setBusy(true);
    try {
      await setMyKioskPin({ branchId, pin, via: "app" });
      toast.success("Your kiosk PIN is saved", { description: "The tablet takes it within a minute." });
      router.back();
    } catch (e) {
      setError(errorMessage(e, "Couldn’t save your PIN. Try again."));
      setBusy(false);
    }
  }

  return (
    <Screen testID="kiosk-pin-screen">
      <View style={styles.status}>
        <T tone="muted" style={styles.grow}>
          You type it on the front desk’s tablet to clock in and out.
        </T>
        <Badge tone={staff.hasKioskPin ? "secondary" : "outline"}>
          {staff.hasKioskPin ? "Set" : "Not set"}
        </Badge>
      </View>
      {viewAs ? (
        <T tone="muted" style={styles.intro}>
          You’re viewing the app as {staff.name}. Only they can set their PIN here; admins can on the website, in Employees.
        </T>
      ) : (
        <ListSection
          title={staff.hasKioskPin ? "Change your PIN" : "Set your PIN"}
          footer="It’s stored encrypted, so nobody can look it up, the office included. Forgot it? Set a new one here."
          testID="kiosk-pin-form"
        >
          <View style={styles.form}>
            <Field
              label={`New PIN (${len} digits)`}
              value={pin}
              onChangeText={(v) => {
                const next = digits(v);
                setPin(next);
                setError(null);
                if (next.length === len) againRef.current?.focus();
              }}
              keyboardType="number-pad"
              secureTextEntry
              textContentType="none"
              autoComplete="off"
              maxLength={len}
              autoFocus
              style={styles.pin}
              testID="kiosk-pin-new"
            />
            <Field
              ref={againRef}
              label="Type it again"
              value={again}
              onChangeText={(v) => {
                setAgain(digits(v));
                setError(null);
              }}
              keyboardType="number-pad"
              secureTextEntry
              textContentType="none"
              autoComplete="off"
              maxLength={len}
              style={styles.pin}
              error={mismatch ? "The two PINs don’t match." : null}
              testID="kiosk-pin-again"
            />
            {error ? <ErrorBox>{error}</ErrorBox> : null}
            <Button onPress={() => void save()} disabled={!ready} busy={busy} testID="kiosk-pin-save">
              Save PIN
            </Button>
          </View>
        </ListSection>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.xs },
  intro: { paddingHorizontal: space.xs },
  grow: { flex: 1 },
  form: { padding: space.lg, gap: space.md },
  pin: { fontSize: 22, letterSpacing: 8 },
});
