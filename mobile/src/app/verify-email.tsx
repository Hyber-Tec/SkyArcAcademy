import { SENDER_EMAIL } from "@shared/brand";
import { MailCheck } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { T } from "@/components/Text";
import { authErrorText } from "@/lib/authText";
import { useLang, useT } from "@/lib/lang";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { radius, space, useColors } from "@/theme";

/**
 * "Confirm your email": a password account waits here until its address is confirmed (the rules trust confirmed emails
 * only). It checks by itself every few seconds and whenever the app comes back to the front, so opening the link in the
 * mail app is enough.
 */
export default function VerifyEmailScreen() {
  const { user, sendVerification, checkVerified, signOut } = useAuth();
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const busy = useRef(false);

  const check = useCallback(
    async (quiet: boolean) => {
      if (busy.current) return;
      busy.current = true;
      if (!quiet) setChecking(true);
      try {
        const ok = await checkVerified();
        if (!ok && !quiet) toast.info(t("Not confirmed yet", "아직 확인되지 않았어요"), { description: t("Open the link in the email, then try again.", "이메일의 링크를 연 뒤 다시 눌러 주세요.") });
      } catch (e) {
        if (!quiet) toast.error(authErrorText((e as { code?: string }).code, "verify", lang));
      } finally {
        busy.current = false;
        if (!quiet) setChecking(false);
      }
    },
    [checkVerified, t, lang],
  );

  useEffect(() => {
    const t = setInterval(() => void check(true), 5000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && void check(true));
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [check]);

  useEffect(() => {
    if (cooldownUntil <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownUntil, now]);
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  async function resend() {
    setSending(true);
    try {
      const r = await sendVerification();
      if (r === "verified") return void check(false);
      if (r === "throttled") toast.info(t("Already sent", "이미 보냈어요"), { description: t("Give it a minute, and check your spam folder too.", "1분쯤 기다려 보고, 스팸함도 확인해 주세요.") });
      else toast.success(t("Email sent", "이메일을 보냈어요"), { description: t(`Check ${user?.email}.`, `${user?.email} 메일함을 확인해 주세요.`) });
      setNow(Date.now());
      setCooldownUntil(Date.now() + 60_000);
    } catch (e) {
      toast.error(authErrorText((e as { code?: string }).code, "verify", lang));
    } finally {
      setSending(false);
    }
  }

  return (
    <CenteredCard testID="verify-email">
      <View style={styles.icon}>
        <View style={[styles.circle, { backgroundColor: colors.secondary }]}>
          <MailCheck size={28} color={colors.foreground} />
        </View>
      </View>
      <T variant="title" style={styles.center}>
        {t("Confirm your email", "이메일 주소를 확인해 주세요")}
      </T>
      <T tone="muted" style={styles.center}>
        {t(
          `We sent a link to ${user?.email}. Open it to confirm the address; this screen moves on by itself once you have.`,
          `${user?.email} 메일함으로 확인 링크를 보냈어요. 링크를 열어 주소를 확인하면 이 화면은 저절로 넘어가요.`,
        )}
      </T>
      <View style={styles.buttons}>
        {Platform.OS === "ios" ? (
          <Button size="lg" onPress={() => void Linking.openURL("message://").catch(() => undefined)} testID="open-mail">
            {t("Open Mail", "메일 앱 열기")}
          </Button>
        ) : null}
        <Button size="lg" variant={Platform.OS === "ios" ? "outline" : "default"} onPress={() => void check(false)} busy={checking} testID="check-verified">
          {t("I've confirmed it", "확인했어요")}
        </Button>
        <Button variant="outline" onPress={() => void resend()} busy={sending} disabled={cooldown > 0} testID="resend">
          {cooldown > 0 ? t(`Send again in ${cooldown}s`, `${cooldown}초 후 다시 보내기`) : t("Send the email again", "이메일 다시 보내기")}
        </Button>
      </View>
      <T variant="small" tone="muted" style={styles.center}>
        {t(
          `The email comes from Sky Arc (${SENDER_EMAIL}). Not there after a minute? Check your spam folder.`,
          `이메일은 Sky Arc(${SENDER_EMAIL})에서 보내요. 1분이 지나도 오지 않으면 스팸함을 확인해 주세요.`,
        )}
      </T>
      <Button variant="link" onPress={() => void signOut()} testID="use-another">
        {t("Use another account", "다른 계정 사용하기")}
      </Button>
      <DeleteAccountLink />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: "center" },
  circle: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
