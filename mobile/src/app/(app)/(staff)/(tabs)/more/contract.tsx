import { dollarsText, parseContract, pricedChoice } from "@shared/contracts/document";
import { optionHeading, prefillValues } from "@shared/contracts/fill";
import { CONTRACT_PRICE_MAX, type ContractPdf, type ContractSignRequest } from "@shared/contracts/types";
import { todayKey } from "@shared/time";
import { FilePen } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { EmptyState } from "@/components/EmptyState";
import { Loading } from "@/components/Loading";
import { SegmentedControl } from "@/components/SegmentedControl";
import { T } from "@/components/Text";
import { ContractSheet } from "@/features/contracts/ContractForm";
import { PdfSheet, openPdf } from "@/features/contracts/PdfSheet";
import { useAcademySigner, useCurrentContract } from "@/features/family/data";
import { callable, errorMessage } from "@/lib/api";
import { toast } from "@/lib/toast";
import { useAuth } from "@/state/AuthProvider";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

const previewCall = callable<Partial<ContractSignRequest> & { branchId: string; studentName: string }, ContractPdf>("previewContract");
const pricesCall = callable<{ branchId: string; prices: Record<string, number> }, { version: number; changed: number }>("setContractPrices");

/** The made-up student a preview fills in for. */
const SAMPLE = "Sample Student";

type Tab = "parent" | "prices";

/**
 * More → Enrollment contract (owners and admins; docs/DECISIONS.md §34): the academy's contract as a parent sees it,
 * for a made-up student, where trying to sign makes the same PDF a family's signing makes, marked as a sample, to open
 * or share (nothing is filed and no one is told: `previewContract`); and its program prices, the one part the office
 * changes (`setContractPrices`: a new version, for the contracts sent from then on). The contract's words stay as the
 * manager approved them; each family's is sent from the student's screen.
 */
export default function ContractScreen() {
  const { isAdmin } = useBranch();
  const colors = useColors();
  const { template, loading } = useCurrentContract();
  const [tab, setTab] = useState<Tab>("parent");

  if (!isAdmin) {
    return <EmptyState title="Owners and admins only" text="The academy’s enrollment contract is the office’s." testID="contract-preview" />;
  }
  if (loading) return <Loading label="Opening the contract" />;
  if (!template) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="contract-preview">
        <EmptyState icon={<FilePen size={26} color={colors.mutedForeground} />} title="No contract yet" text="The academy’s contract isn’t set up yet." />
      </View>
    );
  }
  const tabs = <SegmentedControl<Tab> value={tab} onChange={setTab} options={[{ value: "parent", label: "As a parent sees it" }, { value: "prices", label: "Prices" }]} testID="contract-tab" />;
  return tab === "parent" ? <Preview text={template.text} version={template.version} tabs={tabs} /> : <Prices text={template.text} tabs={tabs} />;
}

function Preview({ text, version, tabs }: { text: string; version: number; tabs: React.ReactNode }) {
  const { branchId, actor, timezone } = useBranch();
  const { email } = useAuth();
  const signer = useAcademySigner();
  const [pdf, setPdf] = useState<{ uri: string; name: string } | null>(null);
  const doc = useMemo(() => parseContract(text).doc, [text]);
  const initial = useMemo(() => prefillValues(doc, { studentName: SAMPLE, signerName: actor.name.includes("@") ? "" : actor.name, email: email ?? "" }), [doc, actor.name, email]);
  return (
    <>
      <ContractSheet
        key={`${version}`}
        doc={doc}
        firstName="Sample"
        today={todayKey(timezone)}
        initial={initial}
        testID="contract-preview"
        submitLabel="Try signing"
        submitTestID="contract-preview-sign"
        offer={{ suggested: null, academySigner: signer.data ? { name: signer.data.name, title: signer.data.title, image: signer.data.image ?? null } : null }}
        header={
          <View style={styles.head}>
            {tabs}
            <T tone="muted">What a parent sees once the office sends a student’s contract. Nothing you do here is saved.</T>
            <T variant="small" tone="muted">
              Version {version}. Each family’s is sent from the student’s screen, with the program and the discounts.
            </T>
          </View>
        }
        onSubmit={async (s) => {
          try {
            await openPdf(await previewCall({ branchId, studentName: SAMPLE, values: s.values, name: s.name, relation: s.relation, signature: s.signature, agree: true }), setPdf);
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
      <PdfSheet pdf={pdf} onClose={() => setPdf(null)} />
    </>
  );
}

/**
 * The program prices (the owner, 2026-11-05: "the admin is able to see the program and fix the price"): saving makes
 * a new version, for the contracts sent from then on; one already sent keeps its prices until it's sent again.
 */
function Prices({ text, tabs }: { text: string; tabs: React.ReactNode }) {
  const { branchId } = useBranch();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const doc = useMemo(() => parseContract(text).doc, [text]);
  const choice = pricedChoice(doc);
  const options = (choice?.options ?? []).filter((o) => o.amount !== null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const typed = (id: string, amount: number) => draft[id] ?? String(amount);
  const parsed = Object.fromEntries(options.map((o) => [o.id, Number(typed(o.id, o.amount!).replace(/[$,\s]/g, ""))]));
  const bad = options.filter((o) => !typed(o.id, o.amount!).trim() || !Number.isFinite(parsed[o.id]) || parsed[o.id] < 0 || parsed[o.id] > CONTRACT_PRICE_MAX || Math.round(parsed[o.id] * 100) !== parsed[o.id] * 100);
  const changed = options.filter((o) => !bad.includes(o) && parsed[o.id] !== o.amount);

  async function save() {
    const ok = await confirmAsync({
      title: "Save the new prices?",
      message: `${changed.map((o) => `${optionHeading(o.title).name}: ${dollarsText(o.amount!)} → ${dollarsText(parsed[o.id])}`).join("\n")}\n\nThe contracts you send from now on show them. One already sent keeps its prices until you send it again.`,
      confirmLabel: "Save",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await pricesCall({ branchId, prices: Object.fromEntries(changed.map((o) => [o.id, parsed[o.id]])) });
      setDraft({});
      toast.success(`The new prices are saved (version ${r.version})`);
    } catch (e) {
      toast.error(errorMessage(e, "The prices couldn’t be saved just now."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={{ backgroundColor: colors.grouped }} contentContainerStyle={[styles.page, { paddingBottom: insets.bottom + space.xl }]} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets testID="contract-prices">
      {tabs}
      <T tone="muted">{choice?.priceLabel || "The price"} of each program. The contracts you send from now on show the new prices; ones already signed keep theirs.</T>
      <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
        {options.map((o, i) => {
          const { name, sub } = optionHeading(o.title);
          const invalid = bad.includes(o);
          return (
            <View key={o.id} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
              <View style={styles.fill}>
                <T variant="label">{name}</T>
                {sub ? (
                  <T variant="tiny" tone="muted">
                    {sub}
                  </T>
                ) : null}
              </View>
              <T tone="muted">$</T>
              <TextInput
                value={typed(o.id, o.amount!)}
                onChangeText={(v) => setDraft((d) => ({ ...d, [o.id]: v }))}
                keyboardType="decimal-pad"
                style={[styles.input, { color: colors.foreground, borderColor: invalid ? colors.destructive : colors.border, backgroundColor: colors.background }]}
                accessibilityLabel={`${o.title}: price in dollars`}
                testID={`price-${o.id}`}
              />
            </View>
          );
        })}
      </View>
      {bad.length ? (
        <T variant="small" tone="destructive">
          Type each price in dollars, like 495 or 495.50.
        </T>
      ) : null}
      <Button size="lg" wrap onPress={() => void save()} busy={busy} disabled={!changed.length || !!bad.length} testID="prices-save">
        Save prices
      </Button>
      {changed.length ? (
        <Button variant="ghost" onPress={() => setDraft({})} disabled={busy}>
          Undo
        </Button>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { gap: space.sm },
  page: { gap: space.lg, padding: space.lg },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm },
  input: { width: 92, height: 40, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.sm, textAlign: "right", fontVariant: ["tabular-nums"], fontSize: 16 },
});
