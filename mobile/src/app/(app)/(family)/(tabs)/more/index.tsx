import { type SignInMethods, signInWays } from "@shared/auth";
import { LANG_NAMES, type Lang, dateText } from "@shared/i18n";
import { ROLE_LABELS } from "@shared/roles";
import { dateKeyOf, formatDateKey, formatInstant } from "@shared/time";
import * as Application from "expo-application";
import { router } from "expo-router";
import type { ContractPdf } from "@shared/contracts/types";
import { Bell, Compass, Eye, FileSignature, Globe, KeyRound, Languages, LifeBuoy, LogOut, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { ListRow, ListSection, RowIcon, ToneIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { PdfSheet, openPdf } from "@/features/contracts/PdfSheet";
import { useSignedContracts } from "@/features/family/data";
import { AcademyContact } from "@/features/family/FamilyParts";
import { useFamily } from "@/features/family/FamilyProvider";
import { studentLine } from "@/features/students/format";
import { tourSignals } from "@/features/tour/state";
import { callable, errorMessage } from "@/lib/api";
import { env } from "@/lib/env";
import { useLang, useT } from "@/lib/lang";
import { openWebsite } from "@/lib/links";
import { toast } from "@/lib/toast";
import { type AppearancePref, useAppearance } from "@/state/AppearanceProvider";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/** "Oct 16, 2026, 5:41 PM" for when this copy was built. */
function builtWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** "You sign in with Google", as the website's Account says how (in Korean: "Google로 로그인해요"). */
function signInLine(methods: SignInMethods, lang: Lang): string {
  if (lang === "en") return `You sign in with ${signInWays(methods).replace(/email and password$/i, "your email and password")}`;
  const ways = [methods.google ? "Google" : null, methods.apple ? "Apple" : null, methods.password ? "이메일과 비밀번호" : null].filter(Boolean).join(" 또는 ");
  return `${ways || "이메일과 비밀번호"}로 로그인해요`;
}

/** A parent's role in Korean; anyone else's in English (they read English). */
const ROLE_KO: Record<string, string> = { parent: "학부모", student: "학생" };

const copyCall = callable<{ branchId: string; studentId: string }, ContractPdf>("getMySignedContract");

/**
 * Everything else, kept short: the account signed in and how it signs in (Sign-in & security), the children (or the
 * student's own record) as the academy has them, each one's enrollment contract (who signed it and when, to view or
 * save: docs/DECISIONS.md §34), the appearance, how to reach the academy, help, the privacy policy, the website, which
 * version this is, signing out, and deleting the account: the website's Profile, for families.
 */
export default function FamilyMoreScreen() {
  const { actor, member, name, portal, canViewAs, viewAs, timezone, branchId } = useBranch();
  const { email, methods, signOut } = useAuth();
  const { pref, setPref } = useAppearance();
  const family = useFamily();
  const signed = useSignedContracts(family.ids);
  const signedById = new Map(signed.data.map((d) => [d.id, d]));
  const colors = useColors();
  const version = `${Application.nativeApplicationVersion ?? "1.0.0"} (${Application.nativeBuildVersion ?? "1"})`;
  const built = [env.buildCommit, env.builtAt ? builtWhen(env.builtAt) : ""].filter(Boolean).join(", ");
  const parent = family.who === "parent";
  const t = useT();
  const lang = useLang();
  const [opening, setOpening] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ uri: string; name: string } | null>(null);
  async function openCopy(studentId: string) {
    setOpening(studentId);
    try {
      await openPdf(await copyCall({ branchId, studentId }), setPdf, lang);
    } catch (e) {
      toast.error(errorMessage(e, t("The signed copy couldn’t be opened just now.", "지금은 서명한 계약서를 열 수 없어요."), lang));
    } finally {
      setOpening(null);
    }
  }

  return (
    <Screen title={t("More", "더보기")} typing={false} testID="family-more">
      <PdfSheet pdf={pdf} onClose={() => setPdf(null)} />
      <ListSection title={t("Signed in", "로그인 계정")}>
        <ListRow
          icon={<Avatar name={actor.name} url={member.photoURL} size={40} />}
          title={<T variant="label">{actor.name}</T>}
          subtitle={`${email} · ${lang === "ko" ? (ROLE_KO[actor.role] ?? ROLE_LABELS[actor.role]) : ROLE_LABELS[actor.role]}`}
          testID="family-more-account"
        />
        {canViewAs ? (
          <ListRow
            icon={<ToneIcon icon={Eye} tone="violet" />}
            title={t("View the app as…", "다른 사람으로 앱 보기…")}
            subtitle={viewAs?.person ? t(`Now: ${viewAs.person.name}`, `지금: ${viewAs.person.name}`) : t("An admin, a coach, a parent or a student", "관리자, 코치, 학부모, 학생")}
            onPress={() => router.push("/view-as")}
            testID="family-more-view-as"
          />
        ) : null}
        <ListRow
          icon={<ToneIcon icon={KeyRound} tone="grey" />}
          title={t("Sign-in & security", "로그인과 보안")}
          subtitle={signInLine(methods, lang)}
          onPress={() => router.push("/more/security")}
          testID="family-more-security"
        />
        <ListRow
          icon={<ToneIcon icon={Bell} tone="red" />}
          title={t("Notifications", "알림")}
          subtitle={t("On this phone, and what you’re told about", "이 기기의 알림과 받을 소식")}
          onPress={() => router.push("/more/notifications")}
          testID="family-more-notifications"
        />
        {parent ? (
          <ListRow
            icon={<ToneIcon icon={Languages} tone="blue" />}
            title="Language · 언어"
            subtitle={LANG_NAMES[lang]}
            onPress={() => router.push("/more/language")}
            testID="family-more-language"
          />
        ) : null}
      </ListSection>

      <ListSection
        title={parent ? t(family.ids.length === 1 ? "Your child" : "Your children", "자녀") : t("Your record", "내 정보")}
        footer={family.ids.length ? t(`Something out of date? Ask ${name} to change it.`, `바뀐 정보가 있으면 ${name}에 알려 주세요.`) : undefined}
        testID="family-more-students"
      >
        {family.ids.length ? (
          family.ids.map((id) => {
            const s = family.students.get(id);
            const line = s ? studentLine(s, lang) : "";
            // The rest of what the website's Account shows: the school, and since when the classes go.
            const since = s?.firstSessionDate
              ? lang === "ko"
                ? `${dateText(s.firstSessionDate, "monthYear", "ko")}부터 수업`
                : `Classes since ${formatDateKey(s.firstSessionDate, "monthYear")}`
              : null;
            const more = s ? [s.school?.trim(), since].filter(Boolean).join(" · ") : "";
            return (
              <ListRow
                key={id}
                icon={<Avatar name={s?.name ?? family.firstName(id)} size={40} />}
                title={<T variant="label">{s?.name ?? (family.loading ? t("Loading…", "불러오는 중…") : family.firstName(id))}</T>}
                subtitle={
                  s ? (
                    <View style={styles.lines}>
                      <T variant="small" tone="muted">
                        {line || t("No grade or level yet", "학년이나 레벨 정보가 아직 없어요")}
                      </T>
                      {more ? (
                        <T variant="small" tone="muted">
                          {more}
                        </T>
                      ) : null}
                    </View>
                  ) : undefined
                }
                testID={`family-more-student-${id}`}
              />
            );
          })
        ) : (
          <ListRow
            title={parent ? t("No children linked yet", "아직 연결된 자녀가 없어요") : t("Not linked yet", "아직 연결되지 않았어요")}
            subtitle={
              parent
                ? t(`Ask ${name} to link your child to your account.`, `${name}에 자녀 연결을 요청해 주세요.`)
                : t(`Ask ${name} to link your account to your student record.`, `${name}에 계정 연결을 요청해 주세요.`)
            }
          />
        )}
      </ListSection>

      {family.ids.length ? (
        <ListSection
          title={t(family.ids.length === 1 || !parent ? "Enrollment contract" : "Enrollment contracts", "등록 계약서")}
          footer={t(`${name} sends each contract when it’s time to sign.`, `서명할 때가 되면 ${name}에서 계약서를 보내요.`)}
          testID="family-more-contracts"
        >
          {family.ids.map((id) => {
            const s = family.students.get(id);
            const contract = signedById.get(id);
            const signedMs = contract?.signedAt?.toMillis ? contract.signedAt.toMillis() : null;
            const when = signedMs === null ? "" : lang === "ko" ? dateText(dateKeyOf(signedMs, timezone), "medium", "ko") : formatInstant(signedMs, timezone, { month: "short", day: "numeric", year: "numeric" });
            const canOpen = !!contract?.fileId && !viewAs;
            return (
              <ListRow
                key={id}
                icon={<ToneIcon icon={FileSignature} tone="green" />}
                title={family.ids.length > 1 || parent ? (s?.name ?? family.firstName(id)) : t("Your contract", "내 계약서")}
                subtitle={
                  !contract
                    ? t("None yet", "아직 없어요")
                    : contract.via === "paper"
                      ? t(`Signed on paper${when ? `, recorded ${when}` : ""}`, `종이로 서명${when ? ` · ${when} 기록` : ""}`)
                      : t(
                          `Signed by ${contract.signerName || "a parent"}${when ? ` on ${when}` : ""}${canOpen ? " · View or save" : ""}`,
                          `${contract.signerName || "부모님"} 서명${when ? ` · ${when}` : ""}${canOpen ? " · 보기 또는 저장" : ""}`,
                        )
                }
                right={opening === id ? <ActivityIndicator /> : undefined}
                onPress={canOpen ? () => void openCopy(id) : undefined}
                testID={`family-more-contract-${id}`}
              />
            );
          })}
        </ListSection>
      ) : null}

      <ListSection title={t("Appearance", "화면")}>
        <View style={[styles.segment, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SegmentedControl<AppearancePref>
            value={pref}
            onChange={setPref}
            options={[
              { value: "system", label: t("System", "시스템 설정") },
              { value: "light", label: t("Light", "라이트") },
              { value: "dark", label: t("Dark", "다크") },
            ]}
            testID="family-more-appearance"
          />
        </View>
      </ListSection>

      {/* The website's Contact & help: nothing when the academy hasn't given its details. */}
      <AcademyContact
        title={t(`Contact ${name}`, `${name} 연락처`)}
        footer={t(`Classes, records and reports are kept by ${name}: ask it about any of them.`, `수업, 기록, 리포트는 ${name}에서 관리해요. 궁금한 점은 언제든 문의해 주세요.`)}
      />

      <ListSection title={t("About", "정보")}>
        <ListRow
          icon={<ToneIcon icon={Globe} tone="blue" />}
          title={t("Open the website", "웹사이트 열기")}
          subtitle={t("The same, on a bigger screen, and reports to download as PDFs", "큰 화면에서 같은 내용을 보고, 리포트를 PDF로 내려받을 수 있어요")}
          onPress={() => void openWebsite(`/${portal}`, lang)}
          testID="family-more-website"
        />
        <ListRow
          icon={<ToneIcon icon={Compass} tone="violet" />}
          title={t("Take the tour", "앱 둘러보기")}
          subtitle={t("How the app works, tab by tab", "탭마다 무엇을 할 수 있는지 다시 볼 수 있어요")}
          onPress={() => tourSignals.replay()}
          testID="family-more-tour"
        />
        <ListRow
          icon={<ToneIcon icon={LifeBuoy} tone="blue" />}
          title={t("Help", "도움말")}
          subtitle={t("Whom to ask, signing in, and reporting a problem with the app", "문의처, 로그인, 앱 문제 신고")}
          onPress={() => void openWebsite(lang === "ko" ? "/ko/help" : "/help", lang)}
          testID="family-more-help"
        />
        <ListRow
          icon={<ToneIcon icon={ShieldCheck} tone="grey" />}
          title={t("Privacy policy", "개인정보 처리방침")}
          onPress={() => void openWebsite(lang === "ko" ? "/ko/privacy" : "/privacy", lang)}
          testID="family-more-privacy"
        />
        <ListRow title={t("Version", "버전")} right={version} subtitle={built || undefined} testID="family-more-version" />
      </ListSection>

      <ListSection>
        <ListRow
          icon={
            <RowIcon color={colors.destructiveTint}>
              <LogOut size={17} color={colors.destructive} />
            </RowIcon>
          }
          title={t("Sign out", "로그아웃")}
          destructive
          chevron={false}
          onPress={() => void signOut()}
          testID="family-more-sign-out"
        />
      </ListSection>
      <View style={styles.delete}>
        <DeleteAccountLink academyName={name} />
        {env.useEmulators ? (
          <T variant="small" tone="muted" style={styles.center}>
            Practice copy: the local emulators on this Mac.
          </T>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: space.sm },
  lines: { gap: 1 },
  delete: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
});
