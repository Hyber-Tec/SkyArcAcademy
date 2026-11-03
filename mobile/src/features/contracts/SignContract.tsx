import { type GateStudent, contractGate, firstNames, templatePagePath } from "@shared/contracts/gate";
import { type Signing, type SigningField, checkSigning } from "@shared/contracts/signing";
import { type ContractTemplate, SIGNER_RELATIONS, type SignerRelation } from "@shared/contracts/types";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import { Check, Eraser, FileText } from "lucide-react-native";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { ErrorBox, HelpLinks } from "@/components/AuthParts";
import { SkyArcLogo } from "@/components/brand/SkyArc";
import { Button } from "@/components/Button";
import { ChoiceRow } from "@/components/ChoiceRow";
import { ContactButtons } from "@/components/ContactButtons";
import { Field } from "@/components/Field";
import { ImageViewer } from "@/components/ImageViewer";
import { ListSection } from "@/components/List";
import { Loading } from "@/components/Loading";
import { T } from "@/components/Text";
import { DeleteAccountLink } from "@/features/account/DeleteAccount";
import { storageCopy } from "@/features/drive/download";
import { useFamily } from "@/features/family/FamilyProvider";
import { useAcademyContact, useCurrentContract, useSignedContracts } from "@/features/family/data";
import { callable, errorMessage } from "@/lib/api";
import { deviceLabel, appVersion } from "@/lib/device";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { SignaturePad, type SignaturePadHandle } from "./SignaturePad";

const signCall = callable<Signing & { branchId: string; studentIds: string[]; agree: true; where: "app"; device: string }, { signed: { studentId: string; fileName: string }[]; already: string[] }>(
  "signContractSignedIn",
);

/**
 * Signing before using the app (docs/DECISIONS.md §31: "they have to sign first"): once the academy has an enrollment
 * contract, the family's part of the app opens only when each of their students at the academy has a signed one
 * (shared/src/contracts/gate.ts). A parent reads it here and signs it for their children at once (a signed copy each);
 * a student waits for their parent. Until the gate is known, the app shows its loading screen; a contract that can't be
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

/** One page of the contract, as wide as the screen, at its own shape; a tap shows it on its own to zoom in. */
function ContractPage({ uri, n, total, onOpen }: { uri: string; n: number; total: number; onOpen: () => void }) {
  const colors = useColors();
  const [aspect, setAspect] = useState(8.5 / 11);
  return (
    <Pressable onPress={onOpen} accessibilityRole="imagebutton" accessibilityLabel={`Page ${n} of ${total}. Tap to zoom.`} style={[styles.pageBox, { borderColor: colors.border }]} testID={`contract-page-${n}`}>
      <Image source={{ uri }} style={{ width: "100%", aspectRatio: aspect, backgroundColor: "#ffffff" }} contentFit="contain" onLoad={(e) => e.source.width && setAspect(e.source.width / e.source.height)} />
      <T variant="tiny" tone="muted" style={[styles.pageCaption, { borderTopColor: colors.border, backgroundColor: colors.secondary }]}>
        Page {n} of {total}
      </T>
    </Pressable>
  );
}

/** The contract's pages, as the website saved them for the phone; the PDF itself when there are none. */
function ContractPages({ template }: { template: ContractTemplate & { id: string } }) {
  const { branchId } = useBranch();
  const colors = useColors();
  const count = template.pageImages ?? 0;
  const [pages, setPages] = useState<(string | null)[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const [pdf, setPdf] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (!count) return;
    let live = true;
    Promise.all(
      Array.from({ length: count }, (_, i) =>
        storageCopy({ path: templatePagePath(branchId, template.id, i + 1), folder: ["contracts", template.id], name: `page-${i + 1}.jpg`, size: 0 }).then((uri) => {
          if (live) setPages((p) => Object.assign([...p], { [i]: uri }));
          return uri;
        }),
      ),
    ).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [branchId, template.id, count, attempt]);

  async function openPdf() {
    setOpening(true);
    try {
      const uri = await storageCopy({ path: template.path, folder: ["contracts", template.id], name: template.name.toLowerCase().endsWith(".pdf") ? template.name : `${template.name}.pdf`, size: template.size });
      if (Platform.OS === "ios") setPdf(uri);
      else await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: template.name });
    } catch (e) {
      toast.error("Couldn’t open the contract", { description: errorMessage(e, "Check your connection and try again.") });
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={styles.pages}>
      {count ? (
        failed && pages.filter(Boolean).length < count ? (
          <View style={styles.failed}>
            <T tone="muted">The contract didn’t load. Check your connection, then try again.</T>
            <Button
              variant="outline"
              onPress={() => {
                setFailed(false);
                setAttempt((n) => n + 1);
              }}
              testID="contract-retry"
            >
              Try again
            </Button>
          </View>
        ) : (
          Array.from({ length: count }, (_, i) =>
            pages[i] ? (
              <ContractPage key={i} uri={pages[i] as string} n={i + 1} total={count} onOpen={() => setZoom(i)} />
            ) : (
              <View key={i} style={[styles.pageBox, styles.pageWait, { borderColor: colors.border }]}>
                <T variant="small" tone="muted">
                  Page {i + 1}…
                </T>
              </View>
            ),
          )
        )
      ) : null}
      <Button variant="outline" onPress={() => void openPdf()} busy={opening} icon={<FileText size={18} color={colors.foreground} />} wrap testID="contract-open-pdf">
        {count ? "Open the contract as a PDF" : "Read the contract (PDF)"}
      </Button>
      <ImageViewer image={zoom !== null && pages[zoom] ? { uri: pages[zoom] as string, alt: `Page ${zoom + 1} of the contract` } : null} onClose={() => setZoom(null)} />
      <Modal visible={!!pdf} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPdf(null)}>
        <View style={[styles.fill, { backgroundColor: colors.background }]}>
          <View style={[styles.sheetBar, { borderBottomColor: colors.border }]}>
            <T variant="label" numberOfLines={1} style={styles.fill}>
              {template.name}
            </T>
            <Button variant="ghost" onPress={() => setPdf(null)} testID="contract-pdf-done">
              Done
            </Button>
          </View>
          {pdf ? <WebView source={{ uri: pdf }} originWhitelist={["*"]} allowFileAccess allowingReadAccessToURL={pdf} style={styles.fill} /> : null}
        </View>
      </Modal>
    </View>
  );
}

/** A parent reads the contract and signs it for their children who don't have one signed: one signature, a copy each. */
function SignBeforeUsing({ template, toSign }: { template: ContractTemplate & { id: string }; toSign: GateStudent[] }) {
  const { branchId, name: academy } = useBranch();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const [chosen, setChosen] = useState<string[]>(() => toSign.map((k) => k.id));
  const [name, setName] = useState("");
  const [relation, setRelation] = useState<SignerRelation | null>(null);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<SigningField, string>>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pad = useRef<SignaturePadHandle>(null);
  // A child signed for meanwhile (by the other parent) leaves the list.
  const ids = chosen.filter((id) => toSign.some((k) => k.id === id));
  const who = firstNames((ids.length ? toSign.filter((k) => ids.includes(k.id)) : toSign).map((k) => k.name));
  const clear = (field: SigningField) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));

  async function sign() {
    setProblem(null);
    if (!ids.length) return setProblem("Choose the child or children you sign for.");
    const checked = checkSigning({ name, relation, signature: pad.current?.toPng() ?? "", agree });
    if (!checked.ok) return setErrors(checked.errors);
    setErrors({});
    setBusy(true);
    try {
      const r = await signCall({ branchId, studentIds: ids, ...checked.value, agree: true, where: "app", device: `Sky Arc app ${appVersion()} on ${deviceLabel()}` });
      toast.success(r.signed.length ? "Thank you. The contract is signed." : "It was signed already.", r.signed.length ? { description: `The academy has ${r.signed.length === 1 ? "its copy" : "a copy for each child"}.` } : undefined);
    } catch (e) {
      const details = (e as { details?: { errors?: Partial<Record<SigningField, string>> } }).details;
      if (details?.errors) setErrors(details.errors);
      else setProblem(errorMessage(e, "The contract couldn’t be signed just now. Check your connection and try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.grouped }}
      contentContainerStyle={[styles.page, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      testID="contract-sign"
    >
      <View style={styles.head}>
        <SkyArcLogo height={56} />
        <T variant="title" style={styles.center}>
          Sign the enrollment contract
        </T>
        <T tone="muted" style={styles.center}>
          Before you use {academy}’s app, please read the academy’s enrollment contract and sign it for {firstNames(toSign.map((k) => k.name))}. It takes a few minutes.
        </T>
      </View>

      <ContractPages template={template} />

      <T variant="heading">Sign the contract</T>
      {toSign.length > 1 ? (
        <ListSection title="You sign for" footer="One signature, and a signed copy for each child." testID="sign-for">
          {toSign.map((k) => {
            const on = chosen.includes(k.id);
            return (
              <Pressable
                key={k.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setChosen((c) => (on ? c.filter((x) => x !== k.id) : [...c, k.id]))}
                style={styles.check}
                testID={`sign-for-${k.id}`}
              >
                <View style={[styles.box, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>
                  {on ? <Check size={14} color={colors.primaryForeground} strokeWidth={3} /> : null}
                </View>
                <T variant="label">{k.name}</T>
              </Pressable>
            );
          })}
        </ListSection>
      ) : null}

      <Field
        label="Your full name"
        value={name}
        onChangeText={(v) => {
          setName(v);
          clear("name");
        }}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={100}
        error={errors.name}
        testID="signer-name"
      />
      <ListSection title={`You are ${who}’s`} testID="signer-relation">
        {(Object.keys(SIGNER_RELATIONS) as SignerRelation[]).map((r) => (
          <ChoiceRow
            key={r}
            title={SIGNER_RELATIONS[r]}
            selected={relation === r}
            onPress={() => {
              setRelation(r);
              clear("relation");
            }}
            testID={`signer-${r}`}
          />
        ))}
      </ListSection>
      {errors.relation ? <T tone="destructive">{errors.relation}</T> : null}

      <View style={styles.padHead}>
        <T variant="label">Your signature</T>
        <Button size="sm" variant="ghost" icon={<Eraser size={16} color={colors.foreground} />} onPress={() => pad.current?.clear()} testID="signature-clear">
          Clear
        </Button>
      </View>
      <SignaturePad ref={pad} invalid={!!errors.signature} onChange={(ink) => ink && clear("signature")} testID="signature-pad" />
      {errors.signature ? <T tone="destructive">{errors.signature}</T> : null}

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agree }}
        onPress={() => {
          setAgree((a) => !a);
          clear("agree");
        }}
        style={styles.check}
        testID="signer-agree"
      >
        <View style={[styles.box, { borderColor: agree ? colors.primary : errors.agree ? colors.destructive : colors.border, backgroundColor: agree ? colors.primary : "transparent" }]}>
          {agree ? <Check size={14} color={colors.primaryForeground} strokeWidth={3} /> : null}
        </View>
        <View style={styles.fill}>
          <T variant="label">I agree to sign this contract electronically</T>
          <T variant="small" tone="muted">
            My typed name and the signature I drew are my signature on it.
          </T>
        </View>
      </Pressable>
      {errors.agree ? <T tone="destructive">{errors.agree}</T> : null}
      {problem ? <ErrorBox>{problem}</ErrorBox> : null}

      <Button size="lg" onPress={() => void sign()} busy={busy} testID="sign-contract">
        Sign the contract
      </Button>
      <T variant="small" tone="muted">
        Signing adds a page to the contract with your name, the date and time, your internet address, this phone and the email you’re signed in with. The academy keeps the signed copy.
      </T>
      <Button variant="outline" onPress={() => void signOut()} testID="contract-sign-out">
        Sign out
      </Button>
      <DeleteAccountLink academyName={academy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  page: { gap: space.lg, paddingHorizontal: space.lg },
  head: { alignItems: "center", gap: space.sm },
  center: { textAlign: "center" },
  pages: { gap: space.md },
  pageBox: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, overflow: "hidden" },
  pageWait: { aspectRatio: 8.5 / 11, alignItems: "center", justifyContent: "center", backgroundColor: "#ffffff" },
  pageCaption: { textAlign: "center", paddingVertical: space.xs, borderTopWidth: StyleSheet.hairlineWidth },
  failed: { gap: space.md, alignItems: "flex-start" },
  sheetBar: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  check: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm, paddingHorizontal: space.md },
  box: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  padHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
