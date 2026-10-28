import { PUSH_CHANNELS } from "@shared/push";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

/**
 * The phone's side of notifications (expo-notifications): whether Sky Arc may show them, Android's channels, what a
 * push does while the app is open, and the number on the app's icon. The pushes themselves come through Firebase
 * Cloud Messaging (src/lib/push.ts, src/state/PushProvider.tsx).
 */

export type PermissionState = "granted" | "prompt" | "denied" | "unsupported";

/** A notification the server pushed, rather than one the phone made. */
export const isPush = (trigger: Notifications.NotificationTrigger | null | undefined): boolean => !!trigger && "type" in trigger && trigger.type === "push";

// While Sky Arc is open, a push from the server isn't also shown as the phone's banner: the app says the same in a
// toast that opens it (src/state/PushProvider.tsx).
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const show = !isPush(n.request.trigger);
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

if (Platform.OS === "android") {
  // The channels a push names (shared/src/push.ts), made before anything asks: Android 13 shows its question only once
  // one exists. People can mute either in the phone's settings.
  for (const c of Object.values(PUSH_CHANNELS)) {
    void Notifications.setNotificationChannelAsync(c.id, { name: c.name, description: c.description, importance: Notifications.AndroidImportance.HIGH }).catch(() => undefined);
  }
}

const stateOf = (p: Notifications.NotificationPermissionsStatus): PermissionState => (p.granted ? "granted" : p.canAskAgain ? "prompt" : "denied");

/** The phone's answer for notifications, without asking. */
export async function notificationPermission(): Promise<PermissionState> {
  try {
    return stateOf(await Notifications.getPermissionsAsync());
  } catch {
    return "unsupported";
  }
}

/** Asks the phone's question (once it's been answered no, the phone's Settings is the only way back). */
export async function requestNotificationPermission(): Promise<PermissionState> {
  try {
    return stateOf(await Notifications.requestPermissionsAsync());
  } catch {
    return "unsupported";
  }
}

/** The number on the app's icon (iPhone; most Android launchers show a dot). */
export async function setAppBadge(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(Math.max(0, count)).catch(() => undefined);
}
