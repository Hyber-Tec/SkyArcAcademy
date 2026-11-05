import type { Lang } from "@shared/i18n";
import { useEffect, useState } from "react";
import { AppState, Linking, StyleSheet, View } from "react-native";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { type PermissionState, notificationPermission, requestNotificationPermission } from "@/lib/notify";
import { useLang, useT } from "@/lib/lang";
import { currentPushToken, onPushTokenChange, pushPossible, registerThisDevice } from "@/lib/push";
import { toast } from "@/lib/toast";
import { type BranchState, useBranch } from "@/state/BranchProvider";
import { space } from "@/theme";

/**
 * What notifications bring this person today, by role (the server's notices, functions/src/notify.ts): the app's
 * question after sign-in and More → Notifications both say it. New kinds of notices add to these lines.
 */
export function pushReason({ isCoach, isAdmin, name }: Pick<BranchState, "isCoach" | "isAdmin" | "name">, lang: Lang = "en"): string {
  if (isCoach) return `Get told on this phone when one of your classes changes, and when ${name} posts news.`;
  if (isAdmin) return "Get told on this phone when a family cancels or asks for a class, and when a trial request or a question comes in from the website.";
  if (lang === "ko") return `수업이 바뀌거나 ${name}에서 신청에 답할 때, 새 점수와 성장 리포트, 소식이 있을 때 이 기기로 알려 드려요.`;
  return `Get told on this phone when a class changes, when ${name} answers a request, and about new scores, progress reports and news.`;
}

type PhoneState = { badge: string; tone: BadgeTone; text: string };

const STATE: Record<Lang, Record<PermissionState, PhoneState>> = {
  en: {
    granted: { badge: "On", tone: "success", text: "Notifications reach this phone, even when the app is closed." },
    prompt: { badge: "Off", tone: "secondary", text: "Turn them on to be told on this phone." },
    denied: { badge: "Off", tone: "warning", text: "Notifications are turned off for Sky Arc in your phone’s settings." },
    unsupported: { badge: "Unavailable", tone: "secondary", text: "This phone can’t show notifications." },
  },
  ko: {
    granted: { badge: "켜짐", tone: "success", text: "앱을 닫아 두어도 이 기기로 알림이 와요." },
    prompt: { badge: "꺼짐", tone: "secondary", text: "알림을 켜면 이 기기로 알려 드려요." },
    denied: { badge: "꺼짐", tone: "warning", text: "기기 설정에서 Sky Arc 알림이 꺼져 있어요." },
    unsupported: { badge: "사용 불가", tone: "secondary", text: "이 기기는 알림을 표시할 수 없어요." },
  },
};

/** Allowed, but no token: the iPhone Simulator and the practice copy never get one; a phone does once it's online. */
const NOT_REACHABLE: Record<Lang, PhoneState> = {
  en: { badge: "On", tone: "secondary", text: "Allowed, but this phone isn’t reachable yet: check the connection." },
  ko: { badge: "켜짐", tone: "secondary", text: "허용했지만 아직 이 기기에 연결되지 않았어요. 인터넷 연결을 확인해 주세요." },
};
const PRACTICE: Record<Lang, PhoneState> = {
  en: { badge: "Practice", tone: "secondary", text: "The practice copy can’t get notifications; the real Sky Arc can." },
  ko: { badge: "연습용", tone: "secondary", text: "연습용 사본에서는 알림을 받을 수 없어요. 실제 Sky Arc에서는 받을 수 있어요." },
};

/**
 * "This phone" in More → Notifications: whether this phone may show notifications, with the way to turn them on (the
 * phone's question, or its Settings once it was answered no), and what they bring. Read again whenever the app comes
 * back, since the answer can change in the phone's Settings.
 */
export function PhoneNotifications() {
  const branch = useBranch();
  const lang = useLang();
  const t = useT();
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
        await registerThisDevice(true, lang);
        toast.success(t("Notifications are on", "알림을 켰어요"));
      }
    } finally {
      setBusy(false);
    }
  };

  const state = !permission
    ? null
    : permission === "granted" && !pushPossible()
      ? PRACTICE[lang]
      : permission === "granted" && token === null
        ? NOT_REACHABLE[lang]
        : STATE[lang][permission];
  return (
    <View style={styles.wrap}>
      <ListSection
        title={t("This phone", "이 기기")}
        footer={
          branch.isDemo
            ? t("The demo academy sends no notifications: they come with your own account.", "데모 아카데미는 알림을 보내지 않아요. 알림은 내 계정으로 로그인했을 때 와요.")
            : pushReason(branch, lang)
        }
        testID="push-phone"
      >
        <ListRow title={t("Notifications", "알림")} subtitle={state?.text ?? " "} right={state ? <Badge tone={state.tone}>{state.badge}</Badge> : undefined} testID="push-permission" />
      </ListSection>
      {permission === "prompt" ? (
        <Button size="lg" busy={busy} onPress={() => void turnOn()} testID="push-turn-on">
          {t("Turn on notifications", "알림 켜기")}
        </Button>
      ) : permission === "denied" ? (
        <View style={styles.settings}>
          <Button size="lg" variant="outline" onPress={() => void Linking.openSettings()} testID="push-open-settings">
            {t("Open Settings", "설정 열기")}
          </Button>
          <T variant="small" tone="muted" style={styles.hint}>
            {t("In Settings, choose Notifications and allow them, then come back.", "설정에서 알림을 허용한 뒤 돌아와 주세요.")}
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
