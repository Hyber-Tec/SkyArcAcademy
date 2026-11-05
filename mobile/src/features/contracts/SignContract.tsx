import { parseContract, pricedChoice } from "@shared/contracts/document";
import { type ContractValues, carriedValues, prefillValues, presetValues } from "@shared/contracts/fill";
import { type GateStudent, contractGate } from "@shared/contracts/gate";
import type { ContractLink, ContractPdf, ContractPrefillResult, ContractSignRequest, ContractSignedResult } from "@shared/contracts/types";
import { todayKey } from "@shared/time";
import { CircleCheck, Download } from "lucide-react-native";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { HelpLinks } from "@/components/AuthParts";
import { SkyArcLogo } from "@/components/brand/SkyArc";
import { Button } from "@/components/Button";
import { ContactButtons } from "@/components/ContactButtons";
import { Loading } from "@/components/Loading";
import { SHEET_EDGES } from "@/components/Sheet";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { useFamily } from "@/features/family/FamilyProvider";
import { useAcademyContact, useAcademySigner, useContractTemplate, useWaitingContracts } from "@/features/family/data";
import { callable, errorMessage } from "@/lib/api";
import { appVersion, deviceLabel } from "@/lib/device";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";
import { ContractSheet } from "./ContractForm";
import { PdfView, openPdf } from "./PdfSheet";

const signCall = callable<ContractSignRequest & { branchId: string; studentId: string; linkId: string; where: "app"; device: string }, ContractSignedResult>("signContractSignedIn");
const prefillCall = callable<{ branchId: string }, ContractPrefillResult>("contractPrefill");
const copyCall = callable<{ branchId: string; studentId: string }, ContractPdf>("getMySignedContract");

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || name;

type Waiting = ContractLink & { id: string };

/**
 * Signing before using the app (docs/DECISIONS.md §31: "they have to sign first", and §34): once the office has sent a
 * student's enrollment contract, the family's part of the app opens only when it's signed (shared/src/contracts/
 * gate.ts). A parent fills it in and signs it here, one contract for each child (§33); a student waits for their
 * parent. Nothing is asked before the office sends one. Once signed, the parent is asked whether to save their copy (it
 * stays under More, by the child). Until the gate is known, the app shows its loading screen; a contract that can't be
 * read never locks anyone out. A super admin viewing the app as a family isn't asked.
 */
export function ContractGate({ children }: { children: ReactNode }) {
  const { role, viewAs } = useBranch();
  const { ids, students, loading } = useFamily();
  const waiting = useWaitingContracts(ids);
  // The children signed for here, for the copy to save (asked over the next contract, or the app).
  const [justSigned, setJustSigned] = useState<{ id: string; name: string }[]>([]);
  const byStudent = useMemo(() => {
    const map = new Map<string, Waiting>();
    for (const l of [...waiting.data].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))) if (!map.has(l.studentId)) map.set(l.studentId, l);
    return map;
  }, [waiting.data]);
  if (viewAs) return children;
  if ((loading || waiting.loading) && !justSigned.length) return <Loading label="Opening Sky Arc" />;
  const gate = contractGate({ role, students: [...students.values()], waiting: new Set(byStudent.keys()) });
  const saved = <SaveCopies kids={justSigned} onDone={() => setJustSigned([])} />;
  if (gate.open) {
    return (
      <>
        {children}
        {saved}
      </>
    );
  }
  if (role === "student") return <WaitForParent />;
  return (
    <>
      <SignBeforeUsing toSign={gate.toSign} waiting={byStudent} onSigned={(kid) => setJustSigned((d) => [...d, kid])} />
      {saved}
    </>
  );
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
 * A parent fills in and signs each contract the office sent, one child at a time (the manager, 2026-11-04: "the parent
 * should sign both contracts for each child"), A to Z, each as the office sent it (its version, the program it
 * suggested, its discounts). What the records know fills the form (the child's name and birth date, the parent's name,
 * phone and email), and what the parent typed about themselves carries to the next child's; the program, the child's
 * details and the signature never do.
 */
function SignBeforeUsing({ toSign, waiting, onSigned }: { toSign: GateStudent[]; waiting: Map<string, Waiting>; onSigned: (kid: { id: string; name: string }) => void }) {
  const { branchId } = useBranch();
  const { email } = useAuth();
  const [prefill, setPrefill] = useState<ContractPrefillResult | null>(null);
  const [carry, setCarry] = useState<ContractValues>({});
  // Signed here: the next child shows at once, before the contract's record comes back.
  const [signedHere, setSignedHere] = useState<string[]>([]);
  const [total] = useState(toSign.length);
  const left = toSign.filter((k) => !signedHere.includes(k.id));
  const child = left[0] ?? null;
  const link = child ? waiting.get(child.id) : undefined;

  useEffect(() => {
    let live = true;
    prefillCall({ branchId }).then(
      (r) => live && setPrefill(r),
      // Without the records the form starts with the student's name and the account's email: nothing is locked.
      () => live && setPrefill({ students: [], signer: { name: "", phone: "", email: email ?? "" } }),
    );
    return () => {
      live = false;
    };
  }, [branchId, email]);

  if (!child || !link) return <Loading label="Opening Sky Arc" />;
  return (
    <OneContract
      key={link.id}
      child={child}
      link={link}
      n={Math.min(signedHere.length + 1, Math.max(total, 1))}
      total={Math.max(total, signedHere.length + left.length)}
      prefill={prefill}
      carry={carry}
      onSigned={(values) => {
        setCarry(values);
        setSignedHere((d) => [...d, child.id]);
        onSigned({ id: child.id, name: child.name });
      }}
    />
  );
}

/** One child's contract, as the office sent it. */
function OneContract({
  child,
  link,
  n,
  total,
  prefill,
  carry,
  onSigned,
}: {
  child: GateStudent;
  link: Waiting;
  n: number;
  total: number;
  prefill: ContractPrefillResult | null;
  carry: ContractValues;
  onSigned: (carried: ContractValues) => void;
}) {
  const { branchId, name: academy, timezone } = useBranch();
  const { email, signOut } = useAuth();
  const template = useContractTemplate(link.templateId);
  const signer = useAcademySigner();
  const text = template.data?.text ?? "";
  const doc = useMemo(() => parseContract(text).doc, [text]);
  if (template.loading || signer.loading) return <Loading label="Opening the contract" />;
  if (!text) return <Loading label="Opening the contract" />;

  const first = firstNameOf(child.name);
  const known = prefill?.students.find((s) => s.id === child.id) ?? null;
  const preset = presetValues(doc, link.preset ?? {});
  const initial = { ...prefillValues(doc, { studentName: child.name, email: email ?? "" }), ...preset, ...carry };
  const late = prefill
    ? {
        ...prefillValues(doc, { studentName: known?.name || child.name, dob: known?.dob ?? null, signerName: prefill.signer.name, phone: prefill.signer.phone, email: prefill.signer.email || email || "" }),
        ...preset,
        ...carry,
      }
    : null;
  const choice = pricedChoice(doc);
  const suggested = choice && typeof link.preset?.[choice.id] === "string" ? (link.preset[choice.id] as string) : null;

  return (
    <ContractSheet
      doc={doc}
      firstName={first}
      today={todayKey(timezone)}
      initial={initial}
      prefill={late}
      insetTop
      testID="contract-sign"
      submitLabel={`Sign ${first}’s contract`}
      submitTestID="sign-contract"
      offer={{ suggested, academySigner: signer.data ? { name: signer.data.name, title: signer.data.title, image: signer.data.image } : null }}
      header={
        <View style={styles.head}>
          <SkyArcLogo height={56} />
          {total > 1 ? (
            <T variant="label" tone="muted" style={styles.center} testID="contract-count">
              Contract {n} of {total}
            </T>
          ) : null}
          <T variant="title" style={styles.center} testID="contract-child-title">
            Enrollment contract for {first}
          </T>
          <T tone="muted" style={styles.center}>
            {academy} sent you {first}’s contract. Please read it, check the program, fill it in and sign it at the end.
            {total > 1 ? " Each child has their own contract." : ""}
          </T>
        </View>
      }
      onSubmit={async (s) => {
        try {
          const r = await signCall({
            branchId,
            studentId: child.id,
            linkId: link.id,
            where: "app",
            device: `Sky Arc app ${appVersion()} on ${deviceLabel()}`,
            values: s.values,
            name: s.name,
            relation: s.relation,
            signature: s.signature,
            agree: true,
          });
          if (!r.signed) toast.success(`${first}’s contract was signed already`);
          onSigned(carriedValues(doc, s.values));
        } catch (e) {
          const details = (e as { details?: { errors?: Record<string, string> } }).details;
          if (details?.errors) return { errors: details.errors };
          return { problem: errorMessage(e, "The contract couldn’t be signed just now. Check your connection and try again.") };
        }
      }}
      footer={
        <View style={styles.footer}>
          <T variant="small" tone="muted">
            Signing makes a PDF of this contract as you filled it in, with your signature and a page recording your name, the date and time, your internet address, this phone and the email you’re signed in with. The academy keeps it, and you can save your copy.
          </T>
          <Button variant="outline" onPress={() => void signOut()} testID="contract-sign-out">
            Sign out
          </Button>
          <DeleteAccountLink academyName={academy} />
        </View>
      }
    />
  );
}

/**
 * Once signed: their copy to save now (the share sheet: Save to Files, Mail…), or later from More, by the child (the
 * owner, 2026-11-05: "ask, hey, you want to download the contract or not").
 */
function SaveCopies({ kids, onDone }: { kids: { id: string; name: string }[]; onDone: () => void }) {
  const { branchId } = useBranch();
  const colors = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // On an iPhone the PDF opens in the same sheet (one sheet at a time); on Android, the share sheet.
  const [pdf, setPdf] = useState<{ uri: string; name: string } | null>(null);
  const one = kids.length === 1;
  async function save(kid: { id: string; name: string }) {
    setBusy(kid.id);
    try {
      await openPdf(await copyCall({ branchId, studentId: kid.id }), setPdf);
      setSaved(true);
    } catch (e) {
      toast.error(errorMessage(e, "The signed copy couldn’t be downloaded just now."));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal visible={kids.length > 0} animationType="slide" presentationStyle="pageSheet" onRequestClose={onDone}>
      {pdf ? (
        <PdfView pdf={pdf} onClose={() => setPdf(null)} />
      ) : (
        <SafeAreaView style={[styles.fill, { backgroundColor: colors.grouped }]} edges={SHEET_EDGES}>
          <ScrollView contentContainerStyle={styles.saved} testID="contract-signed">
            <View style={styles.icon}>
              <CircleCheck size={44} color={colors.success} />
            </View>
            <T variant="title" style={styles.center}>
              {one ? `${firstNameOf(kids[0]?.name ?? "")}’s contract is signed` : "Your contracts are signed"}
            </T>
            <T tone="muted" style={styles.center}>
              Thank you. The academy has its copy. Would you like to save yours?
            </T>
            {kids.map((k) => (
              <Button key={k.id} size="lg" wrap variant={one ? "default" : "outline"} icon={<Download size={18} color={one ? colors.primaryForeground : colors.foreground} />} busy={busy === k.id} onPress={() => void save(k)} testID={`save-copy-${k.id}`}>
                {one ? "Save the contract (PDF)" : `${firstNameOf(k.name)}’s contract (PDF)`}
              </Button>
            ))}
            <Button size="lg" variant="ghost" onPress={onDone} testID="contract-signed-later">
              {saved ? "Done" : "Not now"}
            </Button>
            <T variant="small" tone="muted" style={styles.center}>
              You can save it any time from More, under {one ? firstNameOf(kids[0]?.name ?? "") : "each child"}.
            </T>
          </ScrollView>
        </SafeAreaView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { gap: space.lg, paddingHorizontal: space.lg },
  head: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
  footer: { gap: space.lg },
  saved: { alignItems: "stretch", gap: space.md, padding: space.xl, paddingTop: space.xxl },
  icon: { alignSelf: "center" },
});
