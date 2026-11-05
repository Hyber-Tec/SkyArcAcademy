import { parseContract } from "@shared/contracts/document";
import { prefillValues } from "@shared/contracts/fill";
import { CONTRACT_DRAFT_ID, type ContractDraft, type ContractPdf, type ContractPreviewUse, type ContractSignRequest } from "@shared/contracts/types";
import { COL, ROOT } from "@shared/paths";
import { todayKey } from "@shared/time";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { FilePen } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Modal, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import WebView from "react-native-webview";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SHEET_EDGES } from "@/components/Sheet";
import { T } from "@/components/Text";
import { ContractSheet } from "@/features/contracts/ContractForm";
import { useCurrentContract } from "@/features/family/data";
import { callable, errorMessage } from "@/lib/api";
import { useDoc } from "@/lib/firestore";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

const previewCall = callable<Partial<ContractSignRequest> & { branchId: string; use: ContractPreviewUse; studentName: string }, ContractPdf>("previewContract");

/** The made-up student a preview fills in for. */
const SAMPLE = "Sample Student";

/** A PDF a function sent, saved in the app's cache to open or share. */
function cachePdf(pdf: ContractPdf): string {
  const dir = new Directory(Paths.cache, "contracts");
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const base = pdf.name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").trim() || "Sample contract";
  const file = new File(dir, base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`);
  if (file.exists) file.delete();
  const bin = atob(pdf.data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  file.write(bytes);
  return file.uri;
}

/**
 * More → Enrollment contract (owners and admins): the contract as a parent sees it before using the app, the draft the
 * office is writing on the website or the one families sign now, for a made-up student. Trying to sign it makes the
 * same PDF a family's signing makes, marked as a sample, to open or share (for the manager to review): nothing is
 * filed and no one is told (`previewContract`).
 */
export default function ContractPreviewScreen() {
  const { branchId, isAdmin, actor, timezone } = useBranch();
  const { email } = useAuth();
  const colors = useColors();
  const draft = useDoc<ContractDraft>(isAdmin ? `${ROOT.branches}/${branchId}/${COL.contractTemplates}/${CONTRACT_DRAFT_ID}` : null);
  const { template, loading } = useCurrentContract();
  const [picked, setPicked] = useState<ContractPreviewUse | null>(null);
  const [pdf, setPdf] = useState<{ uri: string; name: string } | null>(null);
  const hasDraft = !!draft.data?.text?.trim();
  const use: ContractPreviewUse | null = picked && (picked === "draft" ? hasDraft : !!template) ? picked : hasDraft ? "draft" : template ? "current" : null;
  const text = use === "draft" ? (draft.data?.text ?? "") : use === "current" ? (template?.text ?? "") : "";
  const doc = useMemo(() => parseContract(text).doc, [text]);
  const initial = useMemo(() => prefillValues(doc, { studentName: SAMPLE, signerName: actor.name.includes("@") ? "" : actor.name, email: email ?? "" }), [doc, actor.name, email]);

  async function share(uri: string, name: string) {
    try {
      if (!(await Sharing.isAvailableAsync())) return void toast.error("Sharing isn’t available on this phone");
      await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: name });
    } catch {
      toast.error("Couldn’t share the PDF");
    }
  }

  if (!isAdmin) {
    return <EmptyState title="Owners and admins only" text="The academy’s enrollment contract is the office’s." testID="contract-preview" />;
  }
  if (draft.loading || loading) return <Loading label="Opening the contract" />;
  if (!use) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="contract-preview">
        <EmptyState icon={<FilePen size={26} color={colors.mutedForeground} />} title="No contract yet" text="The academy has no contract yet. Write it on the website, in Settings → Enrollment contract." />
      </View>
    );
  }

  return (
    <>
      <ContractSheet
        key={`${use}:${text.length}:${text.slice(0, 40)}`}
        doc={doc}
        firstName="Sample"
        today={todayKey(timezone)}
        initial={initial}
        testID="contract-preview"
        submitLabel="Try signing"
        submitTestID="contract-preview-sign"
        header={
          <View style={styles.head}>
            {hasDraft && template ? (
              <SegmentedControl<ContractPreviewUse>
                value={use}
                onChange={setPicked}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "current", label: "Published" },
                ]}
                testID="contract-preview-use"
              />
            ) : null}
            <T tone="muted">What a parent sees before using the app. Nothing you do here is saved.</T>
            <T variant="small" tone="muted">
              {use === "draft" ? "The draft, as the website has it now: families don’t see it until it’s published." : `Version ${template?.version ?? 1}, the one families sign now.`}
            </T>
          </View>
        }
        onSubmit={async (s) => {
          try {
            const r = await previewCall({ branchId, use, studentName: SAMPLE, values: s.values, name: s.name, relation: s.relation, signature: s.signature, agree: true });
            const uri = cachePdf(r);
            if (Platform.OS === "ios") setPdf({ uri, name: r.name });
            else await share(uri, r.name);
          } catch (e) {
            const details = (e as { details?: { errors?: Record<string, string> } }).details;
            if (details?.errors) return { errors: details.errors };
            return { problem: errorMessage(e, "The sample couldn’t be made just now. Check your connection and try again.") };
          }
        }}
        footer={
          <T variant="small" tone="muted">
            Trying to sign makes the PDF a family’s signing makes, marked as a sample, with the page that records the signing. It isn’t filed, and no one is told.
          </T>
        }
      />
      <Modal visible={!!pdf} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPdf(null)}>
        <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]} edges={SHEET_EDGES}>
          <View style={[styles.sheetBar, { borderBottomColor: colors.border }]}>
            <T variant="label" numberOfLines={1} style={styles.fill}>
              {pdf?.name ?? "Sample contract"}
            </T>
            {pdf ? (
              <Button variant="ghost" onPress={() => void share(pdf.uri, pdf.name)} testID="contract-pdf-share">
                Share
              </Button>
            ) : null}
            <Button variant="ghost" onPress={() => setPdf(null)} testID="contract-pdf-done">
              Done
            </Button>
          </View>
          {/* The web view may read this one file only (a folder there leaves an iPhone's page blank). */}
          {pdf ? <WebView source={{ uri: pdf.uri }} originWhitelist={["*"]} allowFileAccess allowingReadAccessToURL={pdf.uri} style={styles.fill} testID="contract-pdf" /> : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { gap: space.sm },
  sheetBar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});
