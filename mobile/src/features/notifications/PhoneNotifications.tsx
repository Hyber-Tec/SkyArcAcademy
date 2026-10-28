import { useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { type PermissionState, notificationPermission, requestNotificationPermission } from "@/lib/notify";
import { currentPushToken, onPushTokenChange, pushPossible, registerThisDevice } from "@/lib/push";
import { toast } from "@/lib/toast";
import { type BranchState, useBranch } from "@/state/BranchProvider";
import { space } from "@/theme";

/**
 * What notifications bring this person today, by role (the server's notices, functions/src/notify.ts): the app's
 * question after sign-in and More → Notifications both say it. New kinds of notices add to these lines.
 */
export function pushReason({ isCoach, isAdmin, name }: Pick<BranchState, "isCoach" | "isAdmin" | "name">): string {
  if (isCoach) return `Get told on this phone when one of your classes changes, and when ${name} posts news.`;
  if (isAdmin) return "Get told on this phone when a trial request or a question comes in from the website.";
  return `Get told on this phone when ${name} shares a progress report with you.`;
}

const STATE: Record<PermissionState, { badge: string; tone: BadgeTone; text: string }> = {
  granted: { badge: "On", tone: "success", text: "Notifications reach this phone, even when the app is closed." },
  prompt: { badge: "Off", tone: "secondary", text: "Turn them on to be told on this phone." },
  denied: { badge: "Off", tone: "warning", text: "Notifications are turned off for Sky Arc in your phone’s settings." },
  unsupported: { badge: "Unavailable", tone: "secondary", text: "This phone can’t show notifications." },
};

/** Allowed, but no token: the iPhone Simulator and the practice copy never get one; a phone does once it's online. */
const NOT_REACHABLE = { badge: "On", tone: "secondary" as const, text: "Allowed, but this phone isn’t reachable yet: check the connection." };
const PRACTICE = { badge: "Practice", tone: "secondary" as const, text: "The practice copy can’t get notifications; the real Sky Arc can." };

/**
 * "This phone" in More → Notifications: whether this phone may show notifications, with the way to turn them on (the
 * phone's question, or its Settings once it was answered no), and what they bring. Read again whenever the app comes
 * back, since the answer can change in the phone's Settings.
 */
export function PhoneNotifications() {
  const branch = useBranch();
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const read = () => void notificationPermission().then(setPermission);
    read();
    const sub = AppState.addEventListener("change", (s) => s === "active" && read());
    return () => sub.remove();
  }, []);
  // The token can come after the permission (the phone's registration with Apple, a slow connection): ask again when
  // the app comes back, keep the last one through a failed try, and take a new one when Firebase replaces it.
  useEffect(() => {
    if (permission !== "granted" || !pushPossible()) return;
    let live = true;
    const read = () => void currentPushToken().then((t) => live && setToken((last) => t ?? last ?? null));
    read();
    const sub = AppState.addEventListener("change", (s) => s === "active" && read());
    const off = onPushTokenChange((t) => live && setToken(t));
    return () => {
      live = false;
      sub.remove();
      off();
    };
  }, [permission]);

  const turnOn = async () => {
    setBusy(true);
    try {
      const p = await requestNotificationPermission();
      setPermission(p);
      if (p === "granted") {
        await registerThisDevice(true);
        toast.success("Notifications are on");
      }
    } finally {
      setBusy(false);
    }
  };

  const state = !permission ? null : permission === "granted" && !pushPossible() ? PRACTICE : permission === "granted" && token === null ? NOT_REACHABLE : STATE[permission];
  return (
    <View style={styles.wrap}>
      <ListSection
        title="This phone"
        footer={branch.isDemo ? "The demo academy sends no notifications: they come with your own account." : pushReason(branch)}
        testID="push-phone"
      >
        <ListRow title="Notifications" subtitle={state?.text ?? " "} right={state ? <Badge tone={state.tone}>{state.badge}</Badge> : undefined} testID="push-permission" />
      </ListSection>
      {permission === "prompt" ? (
        <Button size="lg" busy={busy} onPress={() => void turnOn()} testID="push-turn-on">
          Turn on notifications
        </Button>
      ) : permission === "denied" ? (
        <View style={styles.settings}>
          <Button size="lg" variant="outline" onPress={() => void Linking.openSettings()} testID="push-open-settings">
            Open Settings
          </Button>
          <T variant="small" tone="muted" style={styles.hint}>
            In Settings, choose Notifications and allow them, then come back.
          </T>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  settings: { gap: space.sm },
  hint: { textAlign: "center" },
});
