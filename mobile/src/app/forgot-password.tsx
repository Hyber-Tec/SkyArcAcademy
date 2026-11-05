import { looksLikeEmail } from "@shared/auth";
import { router, useLocalSearchParams } from "expo-router";
import { MailCheck } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { AuthHeader, ErrorBox } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { Field } from "@/components/Field";
import { T } from "@/components/Text";
import { authErrorText } from "@/lib/authText";
import { useLang, useT } from "@/lib/lang";
import { useAuth } from "@/state/AuthProvider";
import { radius, space, useColors } from "@/theme";

/** "Forgot password?": emails a link to choose a new one. It never says whether the address has an account. */
export default function ForgotPasswordScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { sendPasswordReset } = useAuth();
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const [email, setEmail] = useState(params.email ?? "");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/sign-in"));

  async function submit() {
    setError(null);
    if (!looksLikeEmail(email)) return setError(authErrorText("invalid-email", "reset", lang));
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setSentTo(email.trim().toLowerCase());
    } catch (e) {
      setError(authErrorText((e as { code?: string }).code, "reset", lang));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo)
    return (
      <CenteredCard testID="reset-sent">
        <View style={styles.icon}>
          <View style={[styles.circle, { backgroundColor: colors.secondary }]}>
            <MailCheck size={28} color={colors.foreground} />
          </View>
        </View>
        <T variant="title" style={styles.center}>
          {t("Check your email", "이메일을 확인해 주세요")}
        </T>
        <T tone="muted" style={styles.center}>
          {t(
            `If there's a Sky Arc account for ${sentTo}, we sent it a link to choose a new password. The link works once, for an hour. Then come back and sign in.`,
            `Sky Arc에 ${sentTo} 계정이 있다면 새 비밀번호를 정하는 링크를 보냈어요. 링크는 1시간 안에 한 번만 쓸 수 있어요. 비밀번호를 바꾼 뒤 돌아와서 로그인해 주세요.`,
          )}
        </T>
        <Button size="lg" onPress={back}>
          {t("Back to sign in", "로그인으로 돌아가기")}
        </Button>
        <T variant="small" tone="muted" style={styles.center}>
          {t("Use Google to sign in? Then you don't need a password: use “Continue with Google”.", "Google로 로그인하나요? 그렇다면 비밀번호 없이 “Google로 계속하기”를 눌러 주세요.")}
        </T>
      </CenteredCard>
    );

  return (
    <CenteredCard testID="forgot-password">
      <AuthHeader
        title={t("Reset your password", "비밀번호 재설정")}
        subtitle={t("Enter the email you sign in with. We'll email you a link to choose a new password.", "로그인할 때 쓰는 이메일을 입력해 주세요. 새 비밀번호를 정하는 링크를 보내 드려요.")}
      />
      <View style={styles.form}>
        <Field
          label={t("Email", "이메일")}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          autoComplete="email"
          returnKeyType="send"
          onSubmitEditing={() => void submit()}
          placeholder="you@example.com"
          autoFocus
          testID="email"
        />
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <Button size="lg" onPress={() => void submit()} busy={busy} testID="send-reset">
          {t("Send reset link", "재설정 링크 보내기")}
        </Button>
        <Button variant="ghost" onPress={back}>
          {t("Back to sign in", "로그인으로 돌아가기")}
        </Button>
      </View>
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  icon: { alignItems: "center" },
  circle: { width: 64, height: 64, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  center: { textAlign: "center" },
});
