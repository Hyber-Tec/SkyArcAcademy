import { reload } from "@react-native-firebase/auth";
import { type SignInMethods, signInMethods } from "@shared/auth";
import { KeyRound } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View, type TextInput } from "react-native";
import { ErrorBox, StrengthMeter } from "@/components/AuthParts";
import { AppleMark } from "@/components/AppleMark";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/Field";
import { GoogleMark } from "@/components/GoogleMark";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { confirmIdentity } from "@/features/account/api";
import { authErrorText, passwordProblemText } from "@/lib/authText";
import { auth } from "@/lib/firebase";
import { useLang, useT } from "@/lib/lang";
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
 * (Google, Apple on an iPhone, a password), and its password, changed after the current one is confirmed, or added to
 * an account that signs in with Google or Apple only, with the website's checks and words (@shared/auth). Access never depends on how someone signs
 * in: it follows the email.
 */
export function SignInSecurityScreen({ testID = "security-screen" }: { testID?: string }) {
  const { name: academy } = useBranch();
  const { email, methods: known } = useAuth();
  const colors = useColors();
  const t = useT();
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
        {t(`Your access to ${academy} follows your email, ${email}, whichever way you sign in.`, `어떤 방법으로 로그인하든 ${academy} 이용 권한은 이메일(${email})을 따라가요.`)}
      </T>
      <ListSection title={t("Ways to sign in", "로그인 방법")} footer={t("Use the same ones on the website and in the app.", "웹사이트와 앱에서 같은 방법을 쓸 수 있어요.")} testID="security-methods">
        <ListRow
          icon={
            <RowIcon>
              <GoogleMark size={17} />
            </RowIcon>
          }
          title="Google"
          subtitle={methods.google ? (email ?? "") : t("Not connected", "연결 안 됨")}
          right={methods.google ? <Badge style={styles.center}>{t("Connected", "연결됨")}</Badge> : undefined}
          testID="security-google"
        />
        {methods.apple ? (
          <ListRow
            icon={
              <RowIcon>
                <AppleMark size={17} color={colors.foreground} />
              </RowIcon>
            }
            title="Apple"
            subtitle={email ?? ""}
            right={<Badge style={styles.center}>{t("Connected", "연결됨")}</Badge>}
            testID="security-apple"
          />
        ) : null}
        <ListRow
          icon={
            <RowIcon>
              <KeyRound size={17} color={colors.foreground} />
            </RowIcon>
          }
          title={t("Password", "비밀번호")}
          subtitle={
            methods.password
              ? t("You can sign in with your email and password.", "이메일과 비밀번호로 로그인할 수 있어요.")
              : t(`Add one to sign in without ${methods.apple ? "Apple" : "Google"}.`, `비밀번호를 추가하면 ${methods.apple ? "Apple" : "Google"} 없이도 로그인할 수 있어요.`)
          }
          right={
            open ? undefined : (
              <Button size="sm" variant="outline" onPress={() => setOpen(true)} testID="security-password-open">
                {methods.password ? t("Change", "변경") : t("Add", "추가")}
              </Button>
            )
          }
          testID="security-password"
        />
      </ListSection>
      {open && email ? (
        <PasswordForm
          adding={!methods.password}
          confirmWith={methods.apple && !methods.google ? "apple" : "google"}
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
function PasswordForm({ adding, confirmWith, email, onClose }: { adding: boolean; confirmWith: "google" | "apple"; email: string; onClose: (changed: boolean) => void }) {
  const { changePassword, sendPasswordReset } = useAuth();
  const t = useT();
  const lang = useLang();
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
    if (!adding && !current) return setError(t("Enter your current password.", "현재 비밀번호를 입력해 주세요."));
    const problem = passwordProblemText(next, email, lang);
    if (problem) return setError(problem);
    if (next !== confirm) return setError(t("The two new passwords don’t match.", "새 비밀번호가 서로 달라요."));
    setBusy(true);
    const attempt = () => changePassword(adding ? null : current, next);
    try {
      try {
        await attempt();
      } catch (e) {
        if (!adding || !/requires-recent-login/.test(codeOf(e))) throw e;
        // Firebase asks an account that signed in with Google (or Apple) a while ago to confirm it's them before a
        // password is added: Google's own window or Apple's sheet (as when deleting the account), then once more.
        if (!(await confirmIdentity(confirmWith))) {
          setBusy(false);
          return;
        }
        await attempt();
      }
      toast.success(adding ? t("Password added", "비밀번호를 추가했어요") : t("Password changed", "비밀번호를 바꿨어요"), {
        description: adding ? t("You can now sign in with your email and password too.", "이제 이메일과 비밀번호로도 로그인할 수 있어요.") : undefined,
      });
      onClose(true);
    } catch (e) {
      setError(authErrorText(codeOf(e), "change-password", lang));
      setBusy(false);
    }
  }

  async function forgot() {
    setSending(true);
    try {
      await sendPasswordReset(email);
      toast.success(t("Reset link sent", "재설정 링크를 보냈어요"), { description: t(`Check ${email}.`, `${email} 메일함을 확인해 주세요.`) });
    } catch (e) {
      toast.error(authErrorText(codeOf(e), "reset", lang));
    } finally {
      setSending(false);
    }
  }

  return (
    <ListSection title={adding ? t("Add a password", "비밀번호 추가") : t("Change your password", "비밀번호 변경")} testID="security-password-form">
      <View style={styles.form}>
        <T variant="small" tone="muted">
          {adding
            ? t(`Then you can also sign in with ${email} and this password, on the website or in the app.`, `추가하면 웹사이트와 앱에서 ${email} 계정과 이 비밀번호로도 로그인할 수 있어요.`)
            : t(`For ${email}.`, `${email} 계정`)}
        </T>
        {!adding ? (
          <View>
            <PasswordField
              label={t("Current password", "현재 비밀번호")}
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
              {sending ? t("Sending…", "보내는 중…") : t("Forgot it?", "비밀번호 찾기")}
            </Button>
          </View>
        ) : null}
        <PasswordField
          ref={nextRef}
          label={t("New password", "새 비밀번호")}
          value={next}
          onChangeText={setNext}
          placeholder={t("At least 8 characters", "8자 이상")}
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
          label={t("Type it again", "새 비밀번호 확인")}
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
            {t("Cancel", "취소")}
          </Button>
          <Button onPress={() => void submit()} busy={busy} style={styles.grow} testID="security-submit">
            {adding ? t("Add password", "비밀번호 추가") : t("Change password", "비밀번호 변경")}
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
