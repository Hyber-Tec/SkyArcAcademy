import { TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ErrorBox } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { Dialog } from "@/components/Dialog";
import { PasswordField } from "@/components/Field";
import { GoogleMark } from "@/components/GoogleMark";
import { T } from "@/components/Text";
import { confirmIdentity, deleteMyAccount } from "./api";
import { errorMessage } from "@/lib/api";
import { appleProblem } from "@/lib/appleSignIn";
import { authErrorText } from "@/lib/authText";
import { useLang, useT } from "@/lib/lang";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { radius, space, useColors } from "@/theme";

/**
 * Delete my account (the stores' rule: an app people can sign in to lets them delete the account): what goes and what
 * the academy keeps, then the person confirms who they are (their password, Google, or Apple, whose tokens for the app
 * are revoked then, as Apple asks) and the server's
 * `deleteMyAccount` removes the sign-in and the personal profile; the app then signs out. In More, and on every screen
 * an account can be stuck on (no access, email not confirmed, a part not in the app yet, paused access).
 */
export function DeleteAccountForm({ academyName, onDone }: { academyName?: string | null; onDone?: () => void }) {
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const { methods, email, signOut } = useAuth();
  // An account made with Apple confirms with Apple, which also revokes the app's Apple tokens (Apple's rule).
  const withApple = methods.apple;
  const withPassword = methods.password && !withApple;
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setError(null);
    if (withPassword && !password) return setError(t("Enter your password to confirm it’s you.", "본인 확인을 위해 비밀번호를 입력해 주세요."));
    const sure = await confirmAsync({
      title: t("Delete your account?", "계정을 삭제할까요?"),
      message: t("Your sign-in and personal profile are removed for good. You can’t undo this.", "로그인 정보와 개인 프로필이 완전히 삭제되고, 되돌릴 수 없어요."),
      confirmLabel: t("Delete account", "계정 삭제"),
      cancelLabel: t("Cancel", "닫기"),
      destructive: true,
    });
    if (!sure) return;
    setBusy(true);
    try {
      if (!(await confirmIdentity(withApple ? "apple" : withPassword ? { password } : "google", { revoke: true }))) return;
      await deleteMyAccount({});
      onDone?.();
      await signOut().catch(() => undefined);
      toast.success(t("Your account was deleted", "계정을 삭제했어요"));
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
      if (/wrong-password|invalid-credential|invalid-login-credentials/.test(code)) setError(t("That password isn’t right.", "비밀번호가 맞지 않아요."));
      else if (appleProblem(e, lang)) setError(appleProblem(e, lang));
      else if (code.startsWith("auth/")) setError(authErrorText(code, "sign-in", lang));
      else setError(errorMessage(e, t("Couldn’t delete your account. Try again.", "계정을 삭제하지 못했어요. 다시 시도해 주세요."), lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.form} testID="delete-account-form">
      <View style={[styles.warning, { backgroundColor: colors.destructiveTint }]}>
        <TriangleAlert size={20} color={colors.destructive} />
        <T style={[styles.grow, { color: colors.destructive, fontWeight: "600" }]}>{t("This can’t be undone.", "되돌릴 수 없어요.")}</T>
      </View>
      <View style={styles.text}>
        <T variant="label">{t("What is deleted", "삭제되는 정보")}</T>
        <T tone="muted">{t(`Your sign-in (${email}) and your personal profile.`, `로그인 정보(${email})와 개인 프로필`)}</T>
        <T variant="label" style={styles.next}>
          {academyName ? t(`What ${academyName} keeps`, `${academyName}에 남는 정보`) : t("What the academy keeps", "아카데미에 남는 정보")}
        </T>
        <T tone="muted">
          {t(
            "Its own records: classes, scores and reports, and for employees their employee record and pay. Your access stays with your email; ask an admin of the academy if you want it removed too.",
            "아카데미의 기록(수업, 점수, 리포트, 직원이라면 직원 기록과 급여)은 남아요. 이용 권한도 이메일에 남아 있으니, 이것도 지우려면 아카데미 관리자에게 요청해 주세요.",
          )}
        </T>
      </View>
      {withPassword ? (
        <PasswordField label={t("Your password", "비밀번호")} value={password} onChangeText={setPassword} autoComplete="current-password" textContentType="password" returnKeyType="done" testID="delete-password" />
      ) : (
        <T tone="muted">{t(`You’ll confirm with ${withApple ? "Apple" : "Google"} that it’s you.`, `${withApple ? "Apple" : "Google"}로 본인 확인을 해요.`)}</T>
      )}
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      <Button size="lg" variant="destructive" busy={busy} icon={withPassword || withApple ? undefined : <GoogleMark size={18} />} onPress={() => void remove()} testID="delete-account-confirm">
        {withPassword ? t("Delete my account", "계정 삭제") : withApple ? t("Confirm with Apple and delete", "Apple로 확인하고 삭제") : t("Confirm with Google and delete", "Google로 확인하고 삭제")}
      </Button>
    </View>
  );
}

/** A quiet "Delete my account" link that opens the form in a dialog (screens outside the portal). */
export function DeleteAccountLink({ academyName }: { academyName?: string | null }) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <>
      <Button variant="link" onPress={() => setOpen(true)} testID="delete-account-link">
        {t("Delete my account", "계정 삭제")}
      </Button>
      <Dialog
        open={open}
        onRequestClose={() => setOpen(false)}
        testID="delete-account-dialog"
        footer={
          <Button variant="ghost" onPress={() => setOpen(false)}>
            {t("Cancel", "닫기")}
          </Button>
        }
      >
        <T variant="heading">{t("Delete my account", "계정 삭제")}</T>
        <DeleteAccountForm academyName={academyName} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.lg },
  warning: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.lg, padding: space.lg },
  grow: { flex: 1 },
  text: { gap: space.xs },
  next: { marginTop: space.md },
});
