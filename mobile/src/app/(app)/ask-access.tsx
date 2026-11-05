import { doc, serverTimestamp, setDoc } from "@react-native-firebase/firestore";
import { ACADEMY_ID } from "@shared/academy";
import { COL, DOC, ROOT } from "@shared/paths";
import type { Role } from "@shared/roles";
import type { BranchPublicProfile } from "@shared/types";
import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ErrorBox } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { ChoiceRow } from "@/components/ChoiceRow";
import { Field } from "@/components/Field";
import { FooterBar } from "@/components/FooterBar";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { T } from "@/components/Text";
import { errorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { useDoc } from "@/lib/firestore";
import { useLang, useT } from "@/lib/lang";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { space } from "@/theme";

const CHOICES: { role: Role; title: string; subtitle: string; ko: { title: string; subtitle: string } }[] = [
  { role: "parent", title: "Parent or guardian", subtitle: "My child takes classes at the academy.", ko: { title: "부모 또는 보호자", subtitle: "자녀가 아카데미에서 수업을 들어요." } },
  { role: "student", title: "Student", subtitle: "I take classes at the academy.", ko: { title: "학생", subtitle: "제가 아카데미에서 수업을 들어요." } },
  { role: "coach", title: "Coach or employee", subtitle: "I work at the academy.", ko: { title: "코치 또는 직원", subtitle: "아카데미에서 일해요." } },
];

/**
 * "Ask the academy" (docs/DECISIONS.md §31): someone the app couldn't find by their email asks to join, as the
 * website's /join does: who they are, the child or children they're signing up for, a phone and a message. The office
 * hears of it and approves it on the website; the app opens by itself then (the member doc is watched).
 */
export default function AskAccessScreen() {
  const { user, email } = useAuth();
  const t = useT();
  const lang = useLang();
  const profile = useDoc<BranchPublicProfile>(`${ROOT.branches}/${ACADEMY_ID}/${COL.public}/${DOC.publicProfile}`);
  const [first, ...rest] = (user?.displayName ?? "").split(" ");
  const [role, setRole] = useState<Role | null>(null);
  const [firstName, setFirstName] = useState(first ?? "");
  const [lastName, setLastName] = useState(rest.join(" "));
  const [phone, setPhone] = useState("");
  const [children, setChildren] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = profile.data?.status === "active" && profile.data.signupEnabled;
  const choices = CHOICES.filter((c) => profile.data?.signupRoles?.includes(c.role));

  async function send() {
    setError(null);
    if (!user || !email) return;
    if (!role) return setError(t("Choose who you are.", "어떤 분인지 골라 주세요."));
    if (!firstName.trim() || !lastName.trim()) return setError(t("Enter your first and last name.", "이름과 성을 입력해 주세요."));
    if (role === "parent" && !children.trim()) return setError(t("Enter your child’s name.", "자녀 이름을 입력해 주세요."));
    setBusy(true);
    try {
      await setDoc(doc(db, ROOT.branches, ACADEMY_ID, COL.signupRequests, email), {
        email,
        uid: user.uid,
        photoURL: user.photoURL ?? null,
        requestedRole: role,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        message: message.trim(),
        studentNames: role === "parent" ? children.trim() : "",
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success(t("Request sent", "요청을 보냈어요"), {
        description: t("The academy will look at it. The app opens by itself once they approve it.", "아카데미에서 확인한 뒤 승인하면 앱이 바로 열려요."),
      });
      if (router.canGoBack()) router.back();
    } catch (e) {
      setError(errorMessage(e, t("Couldn’t send the request. Try again.", "요청을 보내지 못했어요. 다시 시도해 주세요."), lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      testID="ask-access"
      footer={
        <FooterBar>
          <Button size="lg" onPress={() => void send()} busy={busy} disabled={!open} testID="ask-send">
            {t("Send the request", "요청 보내기")}
          </Button>
        </FooterBar>
      }
    >
      <T tone="muted" style={styles.intro}>
        {open
          ? t(`Signed in as ${email}. The academy looks at your request and lets you in; you’ll get an email.`, `${email} 계정으로 로그인했어요. 아카데미에서 요청을 확인하고 승인하면 이메일로 알려 드려요.`)
          : t("The academy isn’t taking requests in the app right now. Please contact them.", "지금은 앱에서 요청을 받지 않아요. 아카데미에 직접 문의해 주세요.")}
      </T>
      {open ? (
        <>
          <ListSection title={t("I am a", "저는")}>
            {choices.map((c) => (
              <ChoiceRow
                key={c.role}
                title={lang === "ko" ? c.ko.title : c.title}
                subtitle={lang === "ko" ? c.ko.subtitle : c.subtitle}
                selected={role === c.role}
                onPress={() => setRole(c.role)}
                testID={`ask-role-${c.role}`}
              />
            ))}
          </ListSection>
          <View style={styles.form}>
            <Field label={t("First name", "이름")} value={firstName} onChangeText={setFirstName} autoCapitalize="words" autoComplete="given-name" testID="ask-first" />
            <Field label={t("Last name", "성")} value={lastName} onChangeText={setLastName} autoCapitalize="words" autoComplete="family-name" testID="ask-last" />
            {role === "parent" ? (
              <Field
                label={t("Child’s name", "자녀 이름")}
                hint={t("Several children at the academy? Name them all.", "아카데미에 다니는 자녀가 여럿이면 모두 적어 주세요.")}
                value={children}
                onChangeText={setChildren}
                autoCapitalize="words"
                placeholder={t("e.g. Ava Monroe", "예: Ava Monroe")}
                testID="ask-children"
              />
            ) : null}
            <Field label={t("Phone (optional)", "전화번호 (선택)")} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" testID="ask-phone" />
            <Field
              label={t("Message (optional)", "메시지 (선택)")}
              hint={t("New to the academy? Say so here.", "아카데미가 처음이라면 여기에 적어 주세요.")}
              value={message}
              onChangeText={setMessage}
              multiline
              testID="ask-message"
            />
            {error ? <ErrorBox>{error}</ErrorBox> : null}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { paddingHorizontal: space.lg, paddingTop: space.md },
  form: { gap: space.md, paddingHorizontal: space.lg, paddingBottom: space.xl },
});
