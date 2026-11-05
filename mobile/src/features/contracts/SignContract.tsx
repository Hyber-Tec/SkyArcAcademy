import { type GateStudent, contractGate } from "@shared/contracts/gate";
import type { ContractLink } from "@shared/contracts/types";
import * as WebBrowser from "expo-web-browser";
import { FileSignature } from "lucide-react-native";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HelpLinks } from "@/components/AuthParts";
import { SkyArcLogo } from "@/components/brand/SkyArc";
import { Button } from "@/components/Button";
import { ContactButtons } from "@/components/ContactButtons";
import { LangSwitch } from "@/components/LangSwitch";
import { Loading } from "@/components/Loading";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { useFamily } from "@/features/family/FamilyProvider";
import { useAcademyContact, useWaitingContracts } from "@/features/family/data";
import { callable, errorMessage } from "@/lib/api";
import { env } from "@/lib/env";
import { useLang, useT } from "@/lib/lang";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

const linkCall = callable<{ branchId: string; studentId: string }, { path: string; linkId: string }>("contractLinkForFamily");

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || name;

type Waiting = ContractLink & { id: string };

/**
 * While a contract's page is open over the app, the word that it's signed waits until the parent is back in the app
 * (under the page, they wouldn't see it): on iPhone until the page closes, on Android until the app is in front again
 * (its browser tab doesn't say when it closes).
 */
let backFromPage: Promise<void> | null = null;

/** Marks a contract's page as open over the app; the function it returns says the parent is back. */
function pageOpen(): () => void {
  let back = () => {};
  const page = new Promise<void>((resolve) => {
    back = () => {
      if (backFromPage === page) backFromPage = null;
      resolve();
    };
  });
  backFromPage = page;
  return back;
}

/** The next time the app comes back to the front. */
function appInFront(): Promise<void> {
  return new Promise((resolve) => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      sub.remove();
      resolve();
    });
  });
}

/**
 * Signing before using the app (docs/DECISIONS.md §31: "they have to sign first", and §34): once the office has sent a
 * student's enrollment contract, the family's part of the app opens only when it's signed (shared/src/contracts/
 * gate.ts). The contract itself is the website's (Goo, 2026-11-05: "writing the contract can be all done by website,
 * just like the QR code"): a parent opens each child's contract from here, on its page on the website, in the language
 * they read the app in, and signs it there; the app opens by itself once every one is signed, and the copy is under More.
 * A student waits for their parent. Nothing is asked before the office sends one. Until the gate is known, the app shows
 * its loading screen; a contract that can't be read never locks anyone out. A super admin viewing the app as a family
 * isn't asked.
 */
export function ContractGate({ children }: { children: ReactNode }) {
  const { role, viewAs } = useBranch();
  const { ids, students, loading } = useFamily();
  const t = useT();
  const waiting = useWaitingContracts(ids);
  const byStudent = useMemo(() => {
    const map = new Map<string, Waiting>();
    for (const l of [...waiting.data].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))) if (!map.has(l.studentId)) map.set(l.studentId, l);
    return map;
  }, [waiting.data]);
  const gate = contractGate({ role, students: [...students.values()], waiting: new Set(byStudent.keys()) });
  useSignedNotice(gate.toSign, !loading && !waiting.loading && role === "parent");
  if (viewAs) return children;
  if (loading || waiting.loading) return <Loading label={t("Opening Sky Arc", "Sky Arc를 여는 중…")} />;
  if (gate.open) return children;
  if (role === "student") return <WaitForParent />;
  return <SignOnWebsite toSign={gate.toSign} />;
}

/**
 * A contract signed on the website while the app waited for it: a word that it's done, and where the copy is, once the
 * parent is back in the app.
 */
function useSignedNotice(toSign: GateStudent[], ready: boolean) {
  const t = useT();
  const before = useRef<GateStudent[] | null>(null);
  const key = toSign.map((k) => k.id).join(",");
  useEffect(() => {
    if (!ready) return;
    const last = before.current;
    before.current = toSign;
    for (const kid of last ?? []) {
      if (toSign.some((k) => k.id === kid.id)) continue;
      const first = firstNameOf(kid.name);
      void (backFromPage ?? Promise.resolve()).then(() =>
        toast.success(t(`${first}’s contract is signed`, `${first} 학생 계약서에 서명했어요`), {
          description: t("Your copy is under More → Enrollment contract.", "사본은 더보기 → 등록 계약서에서 볼 수 있어요."),
        }),
      );
    }
    // Only when the list changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ready]);
}

/** A student's own login, until a parent signs: who signs, and how to reach the academy. */
function WaitForParent() {
  const { signOut } = useAuth();
  const { name } = useBranch();
  const contact = useAcademyContact();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <ScrollView style={{ backgroundColor: colors.grouped }} contentContainerStyle={[styles.page, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]} testID="contract-wait">
      <View style={styles.head}>
        <SkyArcLogo height={64} />
        <T variant="title" style={styles.center}>
          Your parent signs first
        </T>
        <T tone="muted" style={styles.center}>
          {name} sent your enrollment contract to your parent or guardian. Once they sign it, in the app or on the website, this screen opens by itself.
        </T>
      </View>
      {contact && (contact.phone || contact.email) ? <ContactButtons phone={contact.phone} email={contact.email} name={name} /> : null}
      <Button size="lg" variant="outline" onPress={() => void signOut()} testID="contract-sign-out">
        Sign out
      </Button>
      <DeleteAccountLink academyName={name} />
      <HelpLinks />
    </ScrollView>
  );
}

/**
 * A parent's contracts to sign, one per child (the manager, 2026-11-04: "the parent should sign both contracts for each
 * child"), A to Z: each opens on the website in the phone's in-app browser, in the language the parent reads the app
 * in, and closes back here. The website's page is the QR code's: it shows the contract as the office sent it (its
 * version, the program it suggested, its discounts), and the copy to download and by email once signed.
 */
function SignOnWebsite({ toSign }: { toSign: GateStudent[] }) {
  const { branchId, name: academy } = useBranch();
  const { signOut } = useAuth();
  const contact = useAcademyContact();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const t = useT();
  const lang = useLang();
  const [opening, setOpening] = useState<string | null>(null);
  const one = toSign.length === 1;
  const first = firstNameOf(toSign[0]?.name ?? "");

  async function open(kid: GateStudent) {
    setOpening(kid.id);
    const back = pageOpen();
    try {
      const { path } = await linkCall({ branchId, studentId: kid.id });
      await WebBrowser.openBrowserAsync(`${env.webUrl}${path}?lang=${lang}&from=app`, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: "#0A0A0A",
        dismissButtonStyle: "done",
      });
      // On iPhone the page is closed by now; on Android it's open over the app until the app is in front again.
      if (Platform.OS === "android") void appInFront().then(back);
      else back();
    } catch (e) {
      back();
      toast.error(errorMessage(e, t("The contract couldn’t be opened. Check your connection and try again.", "계약서를 열지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요."), lang));
    } finally {
      setOpening(null);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.grouped }} contentContainerStyle={[styles.page, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.xl }]} testID="contract-sign">
      <View style={styles.head}>
        <SkyArcLogo height={56} />
        <T variant="title" style={styles.center} testID="contract-child-title">
          {one ? t(`Please sign ${first}’s enrollment contract`, `${first} 학생 등록 계약서에 서명해 주세요`) : t("Please sign your children’s enrollment contracts", "자녀 등록 계약서에 서명해 주세요")}
        </T>
        <T tone="muted" style={styles.center}>
          {one
            ? t(
                `${academy} sent you ${first}’s contract. It opens on the academy’s website: read it, fill it in and sign it there. It takes a few minutes, and the app opens once it’s signed.`,
                `${academy}에서 ${first} 학생 계약서를 보냈어요. 아카데미 웹사이트에서 계약서를 읽고 작성한 뒤 서명해 주세요. 몇 분이면 끝나고, 서명하면 앱이 바로 열려요.`,
              )
            : t(
                `${academy} sent you a contract for each child. Each opens on the academy’s website: read it, fill it in and sign it there. It takes a few minutes, and the app opens once they’re all signed.`,
                `${academy}에서 자녀마다 계약서를 보냈어요. 아카데미 웹사이트에서 하나씩 읽고 작성한 뒤 서명해 주세요. 몇 분이면 끝나고, 모두 서명하면 앱이 바로 열려요.`,
              )}
        </T>
      </View>
      <View style={styles.list}>
        {toSign.map((kid) => (
          <View key={kid.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={`contract-to-sign-${kid.id}`}>
            <View style={styles.cardHead}>
              <FileSignature size={20} color={colors.foreground} />
              <T variant="label" style={styles.fill}>
                {t(`${firstNameOf(kid.name)}’s enrollment contract`, `${firstNameOf(kid.name)} 학생 등록 계약서`)}
              </T>
            </View>
            <Button size="lg" wrap busy={opening === kid.id} disabled={opening !== null && opening !== kid.id} onPress={() => void open(kid)} testID={`contract-open-${kid.id}`}>
              {t("Read and sign", "읽고 서명하기")}
            </Button>
          </View>
        ))}
      </View>
      <T variant="small" tone="muted" style={styles.center}>
        {t(
          "Once it’s signed, your copy comes by email, and it stays under More → Enrollment contract.",
          "서명하면 사본이 이메일로 오고, 더보기 → 등록 계약서에서도 언제든 볼 수 있어요.",
        )}
      </T>
      {contact && (contact.phone || contact.email) ? <ContactButtons phone={contact.phone} email={contact.email} name={academy} /> : null}
      <Button size="lg" variant="outline" onPress={() => void signOut()} testID="contract-sign-out">
        {t("Sign out", "로그아웃")}
      </Button>
      <DeleteAccountLink academyName={academy} />
      <HelpLinks />
      <LangSwitch />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { gap: space.lg, paddingHorizontal: space.lg },
  head: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
  list: { gap: space.md },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md, gap: space.md },
  cardHead: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
