import { reload } from "@react-native-firebase/auth";
import { type SignInMethods, authErrorMessage, passwordProblem, signInMethods } from "@shared/auth";
import { KeyRound } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { ErrorBox, StrengthMeter } from "@/components/AuthParts";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/Field";
import { GoogleMark } from "@/components/GoogleMark";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { confirmIdentity } from "@/features/account/api";
import { auth } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

const codeOf = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "");

/** How the signed-in account signs in now, from Firebase's copy on this phone. */
const currentMethods = (): SignInMethods | null => (auth.currentUser ? signInMethods(auth.currentUser.providerData.map((p) => p.providerId)) : null);

/**
 * More → Sign-in & security, for every role (the staff's More and the family's), as the website's Profile has it
 * (web/src/features/profile/SecuritySection.tsx, web/src/components/app/SignInSecurity.tsx): how the account signs in
 * (Google, a password), and its password, changed after the current one is confirmed, or added to an account that signs
 * in with Google only, with the website's checks and words (@shared/auth). Access never depends on how someone signs
 * in: it follows the email.
 */
export function SignInSecurityScreen({ testID = "security-screen" }: { testID?: string }) {
  const { name: academy } = useBranch();
  const { email, methods: known } = useAuth();
  const colors = useColors();
  // A password added on the website since this phone signed in only shows once Firebase's copy here is fetched again.
  const [fresh, setFresh] = useState<SignInMethods | null>(null);
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    let live = true;
    reload(u)
      .then(() => {
        if (live) setFresh(currentMethods());
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const methods = fresh ?? known;
  const [open, setOpen] = useState(false);

  return (
    <Screen testID={testID}>
      <T tone="muted" style={styles.intro}>
        Your access to {academy} follows your email, {email}, whichever way you sign in.
      </T>
      <ListSection title="Ways to sign in" footer="Use the same ones on the website and in the app." testID="security-methods">
        <ListRow
          icon={
            <RowIcon>
              <GoogleMark size={17} />
            </RowIcon>
          }
          title="Google"
          subtitle={methods.google ? (email ?? "") : "Not connected"}
          right={methods.google ? <Badge style={styles.center}>Connected</Badge> : undefined}
          testID="security-google"
        />
        <ListRow
          icon={
            <RowIcon>
              <KeyRound size={17} color={colors.foreground} />
            </RowIcon>
          }
          title="Password"
          subtitle={methods.password ? "You can sign in with your email and password." : "Add one to sign in without Google."}
          right={
            open ? undefined : (
              <Button size="sm" variant="outline" onPress={() => setOpen(true)} testID="security-password-open">
                {methods.password ? "Change" : "Add"}
              </Button>
            )
          }
          testID="security-password"
        />
      </ListSection>
      {open && email ? (
        <PasswordForm
          adding={!methods.password}
          email={email}
          onClose={(changed) => {
            setOpen(false);
            if (changed) setFresh(currentMethods());
          }}
        />
      ) : null}
    </Screen>
  );
}

/** Change the password (the current one first), or add one to a Google account: the website's PasswordDialog. */
function PasswordForm({ adding, email, onClose }: { adding: boolean; email: string; onClose: (changed: boolean) => void }) {
  const { changePassword, sendPasswordReset } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!adding && !current) return setError("Enter your current password.");
    const problem = passwordProblem(next, email);
    if (problem) return setError(problem);
    if (next !== confirm) return setError("The two new passwords don’t match.");
    setBusy(true);
    const attempt = () => changePassword(adding ? null : current, next);
    try {
      try {
        await attempt();
      } catch (e) {
        if (!adding || !/requires-recent-login/.test(codeOf(e))) throw e;
        // Firebase asks an account that signed in with Google a while ago to confirm it's them before a password is
        // added: Google's own window (as when deleting the account), then once more.
        if (!(await confirmIdentity("google"))) {
          setBusy(false);
          return;
        }
        await attempt();
      }
      toast.success(adding ? "Password added" : "Password changed", { description: adding ? "You can now sign in with your email and password too." : undefined });
      onClose(true);
    } catch (e) {
      setError(authErrorMessage(codeOf(e), "change-password"));
      setBusy(false);
    }
  }

  async function forgot() {
    setSending(true);
    try {
      await sendPasswordReset(email);
      toast.success("Reset link sent", { description: `Check ${email}.` });
    } catch (e) {
      toast.error(authErrorMessage(codeOf(e), "reset"));
    } finally {
      setSending(false);
    }
  }

  return (
    <ListSection title={adding ? "Add a password" : "Change your password"} testID="security-password-form">
      <View style={styles.form}>
        <T variant="small" tone="muted">
          {adding ? `Then you can also sign in with ${email} and this password, on the website or in the app.` : `For ${email}.`}
        </T>
        {!adding ? (
          <View>
            <PasswordField
              label="Current password"
              value={current}
              onChangeText={setCurrent}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="next"
              submitBehavior="submit"
              onSubmitEditing={() => nextRef.current?.focus()}
              autoFocus
              testID="security-current"
            />
            <Button variant="link" style={styles.forgot} onPress={() => void forgot()} disabled={sending} testID="security-forgot">
              {sending ? "Sending…" : "Forgot it?"}
            </Button>
          </View>
        ) : null}
        <PasswordField
          ref={nextRef}
          label="New password"
          value={next}
          onChangeText={setNext}
          placeholder="At least 8 characters"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => confirmRef.current?.focus()}
          autoFocus={adding}
          testID="security-new"
        />
        <StrengthMeter password={next} />
        <PasswordField
          ref={confirmRef}
          label="Type it again"
          value={confirm}
          onChangeText={setConfirm}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          testID="security-confirm"
        />
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <View style={styles.buttons}>
          <Button variant="outline" onPress={() => onClose(false)} disabled={busy} style={styles.grow} testID="security-cancel">
            Cancel
          </Button>
          <Button onPress={() => void submit()} busy={busy} style={styles.grow} testID="security-submit">
            {adding ? "Add password" : "Change password"}
          </Button>
        </View>
      </View>
    </ListSection>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: space.xs },
  center: { alignSelf: "center" },
  form: { padding: space.lg, gap: space.md },
  forgot: { alignSelf: "flex-end", marginTop: space.xs },
  buttons: { flexDirection: "row", gap: space.md, marginTop: space.xs },
  grow: { flex: 1 },
});
