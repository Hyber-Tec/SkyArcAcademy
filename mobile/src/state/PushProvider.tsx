import AsyncStorage from "@react-native-async-storage/async-storage";
import { type RemoteMessage, getInitialNotification, getMessaging, onMessage, onNotificationOpenedApp } from "@react-native-firebase/messaging";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { T } from "@/components/Text";
import { useInbox } from "@/features/notifications/inbox";
import { pushReason } from "@/features/notifications/PhoneNotifications";
import { type PushOpen, dataOfNotification, firstTime, openFamilyNotice, openStaffNotice, pushOpenOf } from "@/features/notifications/pushOpen";
import { isPush, notificationPermission, requestNotificationPermission, setAppBadge } from "@/lib/notify";
import { onPushTokenChange, registerThisDevice } from "@/lib/push";
import { toast } from "@/lib/toast";
import { space } from "@/theme";
import { useBranch } from "./BranchProvider";

/** Set once the person has answered the app's question (either way): it's asked once per install. */
const ASKED_KEY = "skyarc.push-asked";

/**
 * What the server tells the person, wherever they are in the app (docs/mobile-push.md), adapted from HyberCRM's phone
 * app:
 * - this phone's push token, kept on their record (again when the app comes back to the front, and when Firebase
 *   replaces it), so their notices reach the phone with the app closed;
 * - a push that arrives while the app is open becomes a toast that opens it;
 * - tapping a notification opens its screen and marks it read, also when it started the app (once signed in), and
 *   Home when it's about the other academy;
 * - the app icon's badge is the unread inbox count;
 * - once after sign-in, the app asks whether to turn notifications on, saying what they bring (Apple's guideline
 *   4.5.4: never a condition for using the app).
 * The demo academy sends nothing, so it registers nothing and asks nothing. Either library may hand over a push (React
 * Native Firebase, or expo-notifications on the phone that gives it to that one): both are listened to, and each push
 * opens or shows once.
 */
export function PushProvider({ children }: { children: ReactNode }) {
  const { branchId, isDemo, isStaff } = useBranch();
  const inbox = useInbox(!isDemo);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (isDemo) return;
    void registerThisDevice();
    const sub = AppState.addEventListener("change", (s) => s === "active" && void registerThisDevice());
    const off = onPushTokenChange(() => void registerThisDevice(true));
    return () => {
      sub.remove();
      off();
    };
  }, [isDemo]);

  // The badge follows the inbox once it's known (not 0 while it loads), and goes when the person signs out.
  const unread = inbox.data.filter((n) => !n.readAt).length;
  useEffect(() => {
    if (isDemo) void setAppBadge(0);
    else if (!inbox.loading && !inbox.error) void setAppBadge(unread);
  }, [isDemo, inbox.loading, inbox.error, unread]);
  useEffect(() => () => void setAppBadge(0), []);

  /** Opens what a tapped notification is about: its screen in this academy, or Home for another. */
  const open = useEffectEvent((push: PushOpen) => {
    if (push.branchId && push.branchId !== branchId) return void router.navigate("/");
    if (isStaff) openStaffNotice(branchId, push);
    else openFamilyNotice(branchId, push);
  });
  const tapped = useEffectEvent((data: Record<string, unknown> | null | undefined, messageId?: string | null) => {
    const push = pushOpenOf(data);
    if (push && firstTime("tap", push.id ?? messageId)) open(push);
  });

  /** A push that arrives while the app is open: a toast that opens it (the phone shows no banner then, lib/notify.ts). */
  const arrived = useEffectEvent((title: string | null | undefined, body: string | null | undefined, data: Record<string, unknown> | null | undefined, messageId?: string | null) => {
    const push = pushOpenOf(data);
    if (!firstTime("shown", push?.id ?? messageId)) return;
    toast.info(title || "New notification", { description: body ?? undefined, duration: 7000, onPress: push ? () => open(push) : undefined });
  });

  useEffect(() => {
    const m = getMessaging();
    // The tap that started the app: Firebase and expo-notifications keep it until asked, so it waits through sign-in.
    // A moment's wait lets the tabs mount before it opens a screen over them.
    const startup = setTimeout(() => {
      getInitialNotification(m).then((msg) => msg && tapped(msg.data, msg.messageId), () => undefined);
      Notifications.getLastNotificationResponseAsync().then((r) => r && isPush(r.notification.request.trigger) && tapped(dataOfNotification(r.notification), r.notification.request.identifier), () => undefined);
    }, 500);
    const offOpened = onNotificationOpenedApp(m, (msg: RemoteMessage) => tapped(msg.data, msg.messageId));
    const offForeground = onMessage(m, (msg: RemoteMessage) => arrived(msg.notification?.title, msg.notification?.body, msg.data, msg.messageId));
    const tapSub = Notifications.addNotificationResponseReceivedListener((r) => {
      if (isPush(r.notification.request.trigger)) tapped(dataOfNotification(r.notification), r.notification.request.identifier);
    });
    const receivedSub = Notifications.addNotificationReceivedListener((n) => {
      if (isPush(n.request.trigger)) arrived(n.request.content.title, n.request.content.body, dataOfNotification(n), n.request.identifier);
    });
    return () => {
      clearTimeout(startup);
      offOpened();
      offForeground();
      tapSub.remove();
      receivedSub.remove();
    };
  }, []);

  // Once per install, a little after sign-in (the app settled first), while the phone hasn't been asked.
  useEffect(() => {
    if (isDemo) return;
    let live = true;
    const t = setTimeout(() => {
      void (async () => {
        const asked = await AsyncStorage.getItem(ASKED_KEY).catch(() => "unknown");
        if (live && !asked && (await notificationPermission()) === "prompt") setAsking(true);
      })();
    }, 1500);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [isDemo]);

  const answer = async (turnOn: boolean) => {
    setAsking(false);
    await AsyncStorage.setItem(ASKED_KEY, new Date().toISOString()).catch(() => undefined);
    if (!turnOn) return;
    if ((await requestNotificationPermission()) === "granted") {
      await registerThisDevice(true);
      toast.success("Notifications are on");
    }
  };

  return (
    <>
      {children}
      <AskForNotifications open={asking} onAnswer={(on) => void answer(on)} />
    </>
  );
}

/** The app's own question before the phone's: what notifications bring, and where to change it later. */
function AskForNotifications({ open, onAnswer }: { open: boolean; onAnswer: (turnOn: boolean) => void }) {
  const branch = useBranch();
  return (
    <Dialog
      open={open}
      onRequestClose={() => onAnswer(false)}
      testID="push-ask"
      footer={
        <View style={styles.buttons}>
          <Button size="lg" onPress={() => onAnswer(true)} testID="push-ask-on">
            Turn on notifications
          </Button>
          <Button size="lg" variant="outline" onPress={() => onAnswer(false)} testID="push-ask-later">
            Not now
          </Button>
        </View>
      }
    >
      <T variant="heading">Get notified?</T>
      <T>{pushReason(branch)}</T>
      <T variant="small" tone="muted">
        You can change it any time in More → Notifications.
      </T>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  buttons: { gap: space.sm },
});
