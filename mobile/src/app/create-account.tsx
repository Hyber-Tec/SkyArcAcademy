import { looksLikeEmail } from "@shared/auth";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { AppleButton } from "@/components/AppleButton";
import { AuthHeader, ErrorBox, HelpLinks, OrDivider, StrengthMeter } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { Field, PasswordField } from "@/components/Field";
import { GoogleMark } from "@/components/GoogleMark";
import { T } from "@/components/Text";
import { appleProblem } from "@/lib/appleSignIn";
import { authErrorText, passwordProblemText } from "@/lib/authText";
import { useLang, useT } from "@/lib/lang";
import { googleSignInConfigured } from "@/lib/googleSignIn";
import { useAuth } from "@/state/AuthProvider";
import { space } from "@/theme";

/**
 * Create an account (docs/DECISIONS.md §31; the website's web/src/pages/public/SignUp.tsx): Google or Apple (no
 * password), or a name, an email and a password, which then confirms its email ("Confirm your email"). With the email
 * the academy has, the app finds the person's child once it's confirmed; anyone else asks the academy.
 */
export default function CreateAccountScreen() {
  const { createAccount, signInWithGoogle, signInWithApple, appleAvailable } = useAuth();
  const t = useT();
  const lang = useLang();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "apple" | "password" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/sign-in"));

  async function withProvider(which: "google" | "apple") {
    setError(null);
    setBusy(which);
    try {
      await (which === "google" ? signInWithGoogle() : signInWithApple());
    } catch (e) {
      setError((which === "apple" ? appleProblem(e, lang) : null) ?? authErrorText((e as { code?: string }).code, which === "google" ? "google" : "sign-up", lang));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setError(null);
    if (!name.trim()) return setError(t("Enter your full name.", "이름을 입력해 주세요."));
    if (!looksLikeEmail(email)) return setError(authErrorText("invalid-email", "sign-up", lang));
    const problem = passwordProblemText(password, email, lang);
    if (problem) return setError(problem);
    setBusy("password");
    try {
      await createAccount(name, email, password);
    } catch (e) {
      setError(authErrorText((e as { code?: string }).code, "sign-up", lang));
      setBusy(null);
    }
  }

  return (
    <CenteredCard testID="create-account-screen">
      <AuthHeader
        title={t("Create your account", "계정 만들기")}
        subtitle={t("Use the email you gave the academy: that’s how the app finds your child.", "아카데미에 등록된 이메일로 만들면 자녀 정보가 자동으로 연결돼요.")}
      />
      {googleSignInConfigured && (
        <Button variant="outline" size="lg" icon={<GoogleMark />} onPress={() => void withProvider("google")} busy={busy === "google"} disabled={busy !== null} testID="google-create">
          {t("Continue with Google", "Google로 계속하기")}
        </Button>
      )}
      {appleAvailable && <AppleButton onPress={() => void withProvider("apple")} busy={busy === "apple"} disabled={busy !== null} testID="apple-create" />}
      {(googleSignInConfigured || appleAvailable) && <OrDivider label={t("or make a password", "또는 비밀번호로 만들기")} />}
      <View style={styles.form}>
        <Field
          label={t("Full name", "이름")}
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          onSubmitEditing={() => emailRef.current?.focus()}
          testID="create-name"
        />
        <Field
          ref={emailRef}
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
          testID="create-email"
        />
        <View>
          <PasswordField
            ref={passwordRef}
            label={t("Password", "비밀번호")}
            value={password}
            onChangeText={setPassword}
            textContentType="newPassword"
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            placeholder={t("At least 8 characters", "8자 이상")}
            testID="create-password"
          />
          <StrengthMeter password={password} />
        </View>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <Button size="lg" onPress={() => void submit()} busy={busy === "password"} disabled={busy !== null} testID="create-submit">
          {t("Create account", "계정 만들기")}
        </Button>
        <T variant="small" tone="muted" style={styles.center}>
          {t("We’ll email you a link to confirm the address first.", "먼저 이메일 주소를 확인하는 링크를 보내 드려요.")}
        </T>
      </View>
      <Button variant="link" onPress={back} testID="create-back">
        {t("I have an account: sign in", "이미 계정이 있나요? 로그인")}
      </Button>
      <HelpLinks />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  center: { textAlign: "center" },
});
