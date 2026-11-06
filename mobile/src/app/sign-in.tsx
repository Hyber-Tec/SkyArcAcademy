import { looksLikeEmail } from "@shared/auth";
import { ACADEMY_NAME } from "@shared/brand";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { AppleButton } from "@/components/AppleButton";
import { AuthHeader, ErrorBox, HelpLinks, OrDivider } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { Field, PasswordField } from "@/components/Field";
import { GoogleMark } from "@/components/GoogleMark";
import { LangSwitch } from "@/components/LangSwitch";
import { T } from "@/components/Text";
import { env } from "@/lib/env";
import { appleProblem } from "@/lib/appleSignIn";
import { authErrorText } from "@/lib/authText";
import { useLang, useT } from "@/lib/lang";
import { googleSignInConfigured } from "@/lib/googleSignIn";
import { useAuth } from "@/state/AuthProvider";
import { space } from "@/theme";

/**
 * Sign in: Google (the recommended way), Apple on an iPhone, or an email and password (web/src/pages/public/Login.tsx),
 * and "Create an account" for someone new (docs/DECISIONS.md §31): with the email they gave the academy, the app finds
 * their child once it's confirmed.
 */
export default function SignInScreen() {
  const { signInWithGoogle, signInWithApple, signInWithPassword, appleAvailable } = useAuth();
  const t = useT();
  const lang = useLang();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "apple" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  async function google() {
    setError(null);
    setBusy("google");
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(authErrorText((e as { code?: string }).code, "google", lang));
    } finally {
      setBusy(null);
    }
  }

  async function apple() {
    setError(null);
    setBusy("apple");
    try {
      await signInWithApple();
    } catch (e) {
      setError(appleProblem(e, lang) ?? authErrorText((e as { code?: string }).code, "sign-in", lang));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setError(null);
    if (!looksLikeEmail(email)) return setError(authErrorText("invalid-email", "sign-in", lang));
    if (!password) return setError(authErrorText("missing-password", "sign-in", lang));
    setBusy("password");
    try {
      await signInWithPassword(email, password);
    } catch (e) {
      setError(authErrorText((e as { code?: string }).code, "sign-in", lang));
    } finally {
      setBusy(null);
    }
  }

  return (
    <CenteredCard testID="sign-in">
      {/* At the top, in sight before anything else (at the end it was below the fold). */}
      <LangSwitch />
      <AuthHeader title={t(`Sign in to ${ACADEMY_NAME}`, `${ACADEMY_NAME} 로그인`)} subtitle={t("Use the email the academy has for you.", "아카데미에 등록된 이메일로 로그인해 주세요.")} />
      {googleSignInConfigured && (
        <Button variant="outline" size="lg" icon={<GoogleMark />} onPress={() => void google()} busy={busy === "google"} disabled={busy !== null} testID="google-sign-in">
          {t("Continue with Google", "Google로 계속하기")}
        </Button>
      )}
      {appleAvailable && <AppleButton onPress={() => void apple()} busy={busy === "apple"} disabled={busy !== null} testID="apple-sign-in" />}
      {(googleSignInConfigured || appleAvailable) && <OrDivider label={t("or sign in with your email", "또는 이메일로 로그인")} />}
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
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
          placeholder="you@example.com"
          testID="email"
        />
        <PasswordField
          ref={passwordRef}
          label={t("Password", "비밀번호")}
          value={password}
          onChangeText={setPassword}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          testID="password"
        />
        <Button variant="link" style={styles.forgot} onPress={() => router.push({ pathname: "/forgot-password", params: email ? { email } : {} })} testID="forgot-password">
          {t("Forgot password?", "비밀번호 찾기")}
        </Button>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <Button size="lg" onPress={() => void submit()} busy={busy === "password"} disabled={busy !== null} testID="sign-in-submit">
          {t("Sign in", "로그인")}
        </Button>
      </View>
      <View style={styles.create}>
        <T tone="muted" style={styles.center}>
          {t("New here?", "처음이신가요?")}
        </T>
        <Button variant="outline" size="lg" onPress={() => router.push("/create-account")} disabled={busy !== null} testID="create-account">
          {t("Create an account", "계정 만들기")}
        </Button>
        <T variant="small" tone="muted" style={styles.center}>
          {t("Use the email you gave the academy: the app finds your child by it.", "아카데미에 등록된 이메일로 만들면 자녀 정보가 자동으로 연결돼요.")}
          {env.useEmulators ? "\n\nPractice copy: the local emulators on this Mac." : ""}
        </T>
      </View>
      <HelpLinks />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  create: { gap: space.sm },
  forgot: { alignSelf: "flex-end", marginTop: -space.xs },
  center: { textAlign: "center" },
});
