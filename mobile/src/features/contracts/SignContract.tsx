import { parseContract } from "@shared/contracts/document";
import { type ContractValues, carriedValues, prefillValues } from "@shared/contracts/fill";
import { type GateStudent, contractGate } from "@shared/contracts/gate";
import type { ContractPrefillResult, ContractSignRequest, ContractSignedResult, ContractTemplate } from "@shared/contracts/types";
import { todayKey } from "@shared/time";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HelpLinks } from "@/components/AuthParts";
import { SkyArcLogo } from "@/components/brand/SkyArc";
import { Button } from "@/components/Button";
import { ContactButtons } from "@/components/ContactButtons";
import { Loading } from "@/components/Loading";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { useFamily } from "@/features/family/FamilyProvider";
import { useAcademyContact, useCurrentContract, useSignedContracts } from "@/features/family/data";
import { callable, errorMessage } from "@/lib/api";
import { appVersion, deviceLabel } from "@/lib/device";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";
import { ContractSheet } from "./ContractForm";

const signCall = callable<ContractSignRequest & { branchId: string; studentId: string; where: "app"; device: string }, ContractSignedResult>("signContractSignedIn");
const prefillCall = callable<{ branchId: string }, ContractPrefillResult>("contractPrefill");

const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Signing before using the app (docs/DECISIONS.md §31: "they have to sign first"): once the academy has published its
 * enrollment contract, the family's part of the app opens only when each of their students at the academy has a signed
 * one (shared/src/contracts/gate.ts). A parent fills it in and signs it here, one contract for each child (§33); a
 * student waits for their parent. Until the gate is known, the app shows its loading screen; a contract that can't be
 * read never locks anyone out. A super admin viewing the app as a family isn't asked.
 */
export function ContractGate({ children }: { children: ReactNode }) {
  const { role, viewAs } = useBranch();
  const { ids, students, loading } = useFamily();
  const { template, loading: templateLoading } = useCurrentContract();
  const signed = useSignedContracts(ids);
  if (viewAs) return children;
  if (loading || templateLoading || signed.loading) return <Loading label="Opening Sky Arc" />;
  const gate = contractGate({ role, hasContract: !!template, students: [...students.values()], signed: new Set(signed.data.map((d) => d.id)) });
  if (gate.open || !template) return children;
  return role === "student" ? <WaitForParent /> : <SignBeforeUsing template={template} toSign={gate.toSign} />;
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
          Before you use {name}’s app, a parent or guardian signs the academy’s enrollment contract for you. They sign up in the app with the email they gave the academy and sign it there, or ask the academy for a link to sign it. This screen opens by itself once it’s signed.
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
 * A parent fills in and signs the contract for each of their children without one, one child at a time (the manager,
 * 2026-11-04: "the parent should sign both contracts for each child"), A to Z. What the records know fills the form
 * (the child's name and birth date, the parent's name, phone and email), and what the parent typed about themselves
 * carries to the next child's; the option, the child's details and the signature never do.
 */
function SignBeforeUsing({ template, toSign }: { template: ContractTemplate & { id: string }; toSign: GateStudent[] }) {
  const { branchId, name: academy, timezone } = useBranch();
  const { email, signOut } = useAuth();
  const doc = useMemo(() => parseContract(template.text ?? "").doc, [template.text]);
  const [prefill, setPrefill] = useState<ContractPrefillResult | null>(null);
  const [carry, setCarry] = useState<ContractValues>({});
  // Signed here: the next child shows at once, before the signed record comes back.
  const [signedHere, setSignedHere] = useState<string[]>([]);
  const left = toSign.filter((k) => !signedHere.includes(k.id));
  const child = left[0] ?? null;
  const childId = child?.id ?? "";
  const childName = child?.name ?? "";
  const known = prefill?.students.find((s) => s.id === childId) ?? null;

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

  const initial = { ...prefillValues(doc, { studentName: childName, email: email ?? "" }), ...carry };
  const late =
    prefill && childId
      ? {
          ...prefillValues(doc, { studentName: known?.name || childName, dob: known?.dob ?? null, signerName: prefill.signer.name, phone: prefill.signer.phone, email: prefill.signer.email || email || "" }),
          ...carry,
        }
      : null;

  if (!child) return <Loading label="Opening Sky Arc" />;
  const first = firstNameOf(child.name);
  const total = signedHere.length + left.length;
  const n = signedHere.length + 1;

  return (
    <ContractSheet
      key={child.id}
      doc={doc}
      firstName={first}
      today={todayKey(timezone)}
      initial={initial}
      prefill={late}
      insetTop
      testID="contract-sign"
      submitLabel={`Sign ${first}’s contract`}
      submitTestID="sign-contract"
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
            Before you use {academy}’s app, please read the academy’s contract for {first}, fill it in and sign it at the end.
            {total > 1 ? " Each child has their own contract." : ""}
          </T>
        </View>
      }
      onSubmit={async (s) => {
        try {
          const r = await signCall({
            branchId,
            studentId: child.id,
            where: "app",
            device: `Sky Arc app ${appVersion()} on ${deviceLabel()}`,
            values: s.values,
            name: s.name,
            relation: s.relation,
            signature: s.signature,
            agree: true,
          });
          toast.success(r.signed ? `Thank you. ${first}’s contract is signed.` : `${first}’s contract was signed already.`);
          setCarry(carriedValues(doc, s.values));
          setSignedHere((d) => [...d, child.id]);
        } catch (e) {
          const details = (e as { details?: { errors?: Record<string, string> } }).details;
          if (details?.errors) return { errors: details.errors };
          return { problem: errorMessage(e, "The contract couldn’t be signed just now. Check your connection and try again.") };
        }
      }}
      footer={
        <View style={styles.footer}>
          <T variant="small" tone="muted">
            Signing makes a PDF of this contract as you filled it in, with your signature and a page recording your name, the date and time, your internet address, this phone and the email you’re signed in with. The academy keeps it.
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

const styles = StyleSheet.create({
  page: { gap: space.lg, paddingHorizontal: space.lg },
  head: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
  footer: { gap: space.lg },
});
