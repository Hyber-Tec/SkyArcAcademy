import { authErrorMessage, looksLikeEmail } from "@shared/auth";
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
import { T } from "@/components/Text";
import { env } from "@/lib/env";
import { appleProblem } from "@/lib/appleSignIn";
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
      setError(authErrorMessage((e as { code?: string }).code, "google"));
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
      setError(appleProblem(e) ?? authErrorMessage((e as { code?: string }).code, "sign-in"));
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setError(null);
    if (!looksLikeEmail(email)) return setError(authErrorMessage("invalid-email"));
    if (!password) return setError(authErrorMessage("missing-password"));
    setBusy("password");
    try {
      await signInWithPassword(email, password);
    } catch (e) {
      setError(authErrorMessage((e as { code?: string }).code, "sign-in"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <CenteredCard testID="sign-in">
      <AuthHeader title={`Sign in to ${ACADEMY_NAME}`} subtitle="Use the email the academy has for you." />
      {googleSignInConfigured && (
        <Button variant="outline" size="lg" icon={<GoogleMark />} onPress={() => void google()} busy={busy === "google"} disabled={busy !== null} testID="google-sign-in">
          Continue with Google
        </Button>
      )}
      {appleAvailable && <AppleButton onPress={() => void apple()} busy={busy === "apple"} disabled={busy !== null} testID="apple-sign-in" />}
      {(googleSignInConfigured || appleAvailable) && <OrDivider label="or sign in with your email" />}
      <View style={styles.form}>
        <Field
          label="Email"
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
          label="Password"
          value={password}
          onChangeText={setPassword}
          textContentType="password"
          autoComplete="current-password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          testID="password"
        />
        <Button variant="link" style={styles.forgot} onPress={() => router.push({ pathname: "/forgot-password", params: email ? { email } : {} })} testID="forgot-password">
          Forgot password?
        </Button>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <Button size="lg" onPress={() => void submit()} busy={busy === "password"} disabled={busy !== null} testID="sign-in-submit">
          Sign in
        </Button>
      </View>
      <View style={styles.create}>
        <T tone="muted" style={styles.center}>
          New here?
        </T>
        <Button variant="outline" size="lg" onPress={() => router.push("/create-account")} disabled={busy !== null} testID="create-account">
          Create an account
        </Button>
        <T variant="small" tone="muted" style={styles.center}>
          Use the email you gave the academy: the app finds your child by it.
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
