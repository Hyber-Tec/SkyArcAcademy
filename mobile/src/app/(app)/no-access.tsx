import { ACADEMY_ID } from "@shared/academy";
import { type LinkResult, isHiddenEmail } from "@shared/access/onFile";
import { josa } from "@shared/i18n";
import { COL, ROOT } from "@shared/paths";
import type { SignupRequest } from "@shared/types";
import { router } from "expo-router";
import { Clock, Mail, UserRound } from "lucide-react-native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { HelpLinks } from "@/components/AuthParts";
import { SkyArcLogo } from "@/components/brand/SkyArc";
import { Button } from "@/components/Button";
import { CenteredCard } from "@/components/CenteredCard";
import { ListRow, ListSection } from "@/components/List";
import { Loading } from "@/components/Loading";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { callable } from "@/lib/api";
import { useDoc } from "@/lib/firestore";
import { useT } from "@/lib/lang";
import { useAuth } from "@/state/AuthProvider";
import { space, useColors } from "@/theme";

const linkMyAccount = callable<Record<string, never>, LinkResult>("linkMyAccount");

/**
 * Signed in, but not a member of the academy yet (the website's NoBranchAccess). First the server looks for the email
 * on the students' records (docs/DECISIONS.md §31): a parent's or a student's own links them, and the app opens by itself
 * (the member doc is watched). Otherwise: waiting for the academy (a request sent), or "Ask the academy" and another
 * email.
 */
export default function NoAccessScreen() {
  const { email, signOut } = useAuth();
  const colors = useColors();
  const t = useT();
  const request = useDoc<SignupRequest>(email ? `${ROOT.branches}/${ACADEMY_ID}/${COL.signupRequests}/${email}` : null);
  const [result, setResult] = useState<{ email: string | null; state: "checking" | "linked" | "not_found" | "error" }>({ email, state: "checking" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!email) return;
    let alive = true;
    linkMyAccount({})
      .then((r) => alive && setResult({ email, state: r.state === "not_found" ? "not_found" : "linked" }))
      .catch(() => alive && setResult({ email, state: "error" }));
    return () => {
      alive = false;
    };
  }, [email, attempt]);
  const state = result.email === email ? result.state : "checking";

  if (state === "checking" || request.loading) return <Loading label={t("Looking for you on the academy’s records", "아카데미 기록에서 찾고 있어요…")} />;
  if (state === "linked") return <Loading label={t("Opening Sky Arc", "Sky Arc를 여는 중…")} />;

  const waiting = request.data?.status === "pending";
  const declined = request.data?.status === "rejected";
  const roleKo = ({ parent: "학부모", student: "학생", coach: "코치" } as Record<string, string>)[request.data?.requestedRole ?? ""] ?? "회원";
  return (
    <CenteredCard testID="no-access">
      <View style={styles.head}>
        <SkyArcLogo height={64} />
        <T variant="title" style={styles.center}>
          {waiting
            ? t("Waiting for the academy", "아카데미 확인을 기다리고 있어요")
            : state === "error"
              ? t("We couldn’t check just now", "지금은 확인할 수 없어요")
              : t("This email isn’t on the academy’s records", "아카데미 기록에 없는 이메일이에요")}
        </T>
        <T tone="muted" style={styles.center}>
          {waiting
            ? t(
                `You’re signed in as ${email}, and you asked the academy to let you in. This screen opens the app by itself once they approve it.`,
                `${email} 계정으로 로그인했고, 아카데미에 이용을 요청했어요. 아카데미가 승인하면 앱이 바로 열려요.`,
              )
            : state === "error"
              ? t(`You’re signed in as ${email}. Check your connection, then try again.`, `${email} 계정으로 로그인했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.`)
              : t(
                  `You’re signed in as ${email}. Families are found by the email they gave the academy, and no student’s record has this one.`,
                  `${email} 계정으로 로그인했어요. 가족은 아카데미에 알려 준 이메일로 찾는데, 이 이메일은 학생 기록에 없어요.`,
                )}
        </T>
      </View>
      {!waiting && state === "not_found" ? (
        <ListSection>
          {isHiddenEmail(email) ? (
            <ListRow
              icon={<Mail size={18} color={colors.mutedForeground} />}
              title={t("Hidden with Apple", "Apple로 가린 이메일")}
              subtitle={t(
                "The academy can’t match an email Apple hides. Ask the academy, or use the email you gave them.",
                "Apple이 가린 이메일은 아카데미 기록과 맞춰 볼 수 없어요. 아카데미에 문의하거나, 아카데미에 알려 준 이메일로 로그인해 주세요.",
              )}
            />
          ) : (
            <ListRow
              icon={<Mail size={18} color={colors.mutedForeground} />}
              title={t("Gave the academy another email?", "아카데미에 다른 이메일을 알려 주셨나요?")}
              subtitle={t("Sign in with that one: the app finds your child by it.", "그 이메일로 로그인하면 자녀 정보가 연결돼요.")}
            />
          )}
          <ListRow
            icon={<UserRound size={18} color={colors.mutedForeground} />}
            title={declined ? t("The academy declined a request from this email", "아카데미가 이 이메일의 요청을 거절했어요") : t("New to the academy, or a coach?", "아카데미에 처음이시거나 코치이신가요?")}
            subtitle={
              declined
                ? request.data?.decisionNote
                  ? t(`Their note: ${request.data.decisionNote}`, `아카데미 메모: ${request.data.decisionNote}`)
                  : t("Contact the academy if that’s a mistake.", "잘못된 것 같으면 아카데미에 문의해 주세요.")
                : t("Ask the academy to let you in.", "아카데미에 이용을 요청해 주세요.")
            }
          />
        </ListSection>
      ) : waiting ? (
        <ListSection>
          <ListRow
            icon={<Clock size={18} color={colors.mutedForeground} />}
            title={t("Your request", "내 요청")}
            subtitle={t(
              `As a ${request.data?.requestedRole ?? "member"}${request.data?.studentNames ? `, for ${request.data.studentNames}` : ""}`,
              `${josa(roleKo, "으로/로")} 요청${request.data?.studentNames ? ` · ${request.data.studentNames}` : ""}`,
            )}
          />
        </ListSection>
      ) : null}
      <View style={styles.buttons}>
        {state === "error" ? (
          <Button size="lg" onPress={() => setAttempt((n) => n + 1)} testID="link-again">
            {t("Try again", "다시 시도")}
          </Button>
        ) : !waiting && !declined ? (
          <Button size="lg" onPress={() => router.push("/ask-access")} testID="ask-academy">
            {t("Ask the academy", "아카데미에 문의")}
          </Button>
        ) : null}
        <Button size="lg" variant="outline" onPress={() => void signOut()} testID="use-another-account">
          {t("Use another email", "다른 이메일 사용하기")}
        </Button>
      </View>
      <DeleteAccountLink />
      <HelpLinks />
    </CenteredCard>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
  buttons: { gap: space.sm },
});
