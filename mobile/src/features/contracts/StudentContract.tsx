import { collection, doc, query, serverTimestamp, where, writeBatch } from "@react-native-firebase/firestore";
import { academyChecks, dollarsText, parseContract, pricedChoice } from "@shared/contracts/document";
import { type ContractValues, RELATION_LABELS, contractSummary, optionHeading, optionPrices, suggestedOption, tuitionOf, tuitionText } from "@shared/contracts/fill";
import { signUrl, studentContract } from "@shared/contracts/signing";
import {
  CONTRACT_TOKEN_DOC,
  type ContractLink,
  type ContractLinkToken,
  type ContractSendRequest,
  type ContractSendResult,
  SIGNED_VIA_LABELS,
  type SignedContract,
} from "@shared/contracts/types";
import { COL, ROOT, emailKey } from "@shared/paths";
import { formatInstant } from "@shared/time";
import type { Member, Student, StudentPrivateProfile } from "@shared/types";
import { router } from "expo-router";
import { Check, FileSignature, FileText, Mail, QrCode as QrIcon, RotateCcw, Send, Share2, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { ChoiceRow } from "@/components/ChoiceRow";
import { confirmAsync } from "@/components/Confirm";
import { ListRow, ListSection, ToneIcon } from "@/components/List";
import { SHEET_EDGES } from "@/components/Sheet";
import { SwitchRow } from "@/components/SwitchRow";
import { T } from "@/components/Text";
import { useCurrentContract } from "@/features/family/data";
import { addAudit } from "@/lib/audit";
import { callable, errorMessage } from "@/lib/api";
import { env } from "@/lib/env";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { openUrl } from "@/lib/links";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";
import { QrCode } from "./ContractQr";

const sendCall = callable<ContractSendRequest, ContractSendResult>("sendContract");
const emailCall = callable<{ branchId: string; linkId: string }, Pick<ContractSendResult, "emailed" | "emailedTo">>("emailContract");

type Link = ContractLink & { id: string };

/** Why a contract wasn't emailed. */
const NOT_EMAILED: Record<Exclude<ContractSendResult["emailed"], "sent" | "off">, string> = {
  demo: "The demo academy doesn’t send email.",
  test_address: "Those are test addresses, which never get email.",
  not_configured: "Email isn’t set up yet, so it wasn’t emailed.",
  failed: "The email didn’t go: show them the QR code instead.",
  no_address: "There’s no email on the record.",
};

/** A student's contracts sent, their signed one, and the academy's contract now (the office's). */
function useStudentContracts(studentId: string) {
  const { branchId } = useBranch();
  const links = useQuery<ContractLink>(`contract-links-${branchId}-${studentId}`, () => query(collection(db, ROOT.branches, branchId, COL.contractLinks), where("studentId", "==", studentId)));
  const signed = useDoc<SignedContract>(`${ROOT.branches}/${branchId}/${COL.signedContracts}/${studentId}`);
  return { links, signed };
}

/** The parents in the app (an active login linked to the student). */
function useParentsInApp(studentId: string) {
  const { branchId } = useBranch();
  return useQuery<Member>(`parents-in-app-${branchId}-${studentId}`, () => query(collection(db, ROOT.branches, branchId, COL.members), where("studentIds", "array-contains", studentId)));
}

/**
 * A student's enrollment contract on their screen (owners and admins; docs/DECISIONS.md §34), as on the website's
 * student page: not sent, sent and waiting (the program suggested, the discounts, the price after them; its QR code for
 * a parent at the front desk, Email it, Change and send again, Withdraw), or signed (by whom, when, how, what was
 * chosen; the signed copy in the Drive), with Send (the program, the discounts, the email switch, off at first).
 */
export function StudentContract({ student, profile }: { student: Student & { id: string }; profile: StudentPrivateProfile | null }) {
  const { branchId, actor, timezone } = useBranch();
  const { links, signed } = useStudentContracts(student.id);
  const { template } = useCurrentContract();
  const [sheet, setSheet] = useState<"send" | "qr" | null>(null);
  const [emailing, setEmailing] = useState(false);
  const c = studentContract(links.data);
  const first = student.firstName || student.name.split(" ")[0];
  const day = (t: { toMillis?: () => number } | null | undefined) => (t?.toMillis ? formatInstant(t.toMillis(), timezone, { month: "short", day: "numeric", year: "numeric" }) : "today");
  const sc = signed.data;

  async function withdraw(link: Link) {
    const ok = await confirmAsync({
      title: `Withdraw ${first}’s contract?`,
      message: `${first}’s family can’t sign it any more, in the app or with its link. Send it again with the right program or discounts.`,
      confirmLabel: "Withdraw",
      destructive: true,
    });
    if (!ok) return;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, ROOT.branches, branchId, COL.contractLinks, link.id), { status: "canceled", canceledAt: serverTimestamp(), canceledBy: { uid: actor.uid, email: actor.email, name: actor.name } });
      addAudit(batch, branchId, actor, {
        action: "contract.cancel",
        category: "contracts",
        entityType: "contractLink",
        entityId: link.id,
        summary: `Withdrew ${link.studentName}’s enrollment contract, sent but not signed`,
        studentId: link.studentId,
        studentName: link.studentName,
      });
      await batch.commit();
      toast.success(`${first}’s contract is withdrawn`);
    } catch (e) {
      toast.error(errorMessage(e, "It couldn’t be withdrawn just now."));
    }
  }

  async function email(link: Link) {
    setEmailing(true);
    try {
      const r = await emailCall({ branchId, linkId: link.id });
      if (r.emailed === "sent") toast.success(`Emailed to ${r.emailedTo.join(", ")}`);
      else toast.error(r.emailed === "off" ? "It wasn’t emailed" : NOT_EMAILED[r.emailed]);
    } catch (e) {
      toast.error(errorMessage(e, "It couldn’t be emailed just now."));
    } finally {
      setEmailing(false);
    }
  }

  const waiting = c.waiting;
  const status = waiting
    ? `Sent ${day(waiting.createdAt)} by ${waiting.createdBy?.name?.split(" ")[0] || "the office"}: waiting for a parent to sign it`
    : sc
      ? sc.via === "paper"
        ? `Signed on paper, recorded ${day(sc.signedAt)}`
        : `Signed ${SIGNED_VIA_LABELS[sc.via]} by ${sc.signerName || "a parent"}${sc.relation ? ` (${RELATION_LABELS[sc.relation].toLowerCase()})` : ""}, ${day(sc.signedAt)}`
      : c.withdrawn
        ? `The one sent ${day(c.withdrawn.createdAt)} was withdrawn`
        : "Not sent yet";

  const summary = useSummary(waiting ? waiting.templateId : (sc?.templateId ?? null), waiting ? (waiting.preset ?? {}) : (sc?.values ?? null), !!waiting);
  // ListSection gives each row its divider: the rows go in one by one, never in a fragment.
  const rows = [
    <ListRow key="status" title={waiting ? "Waiting to sign" : sc ? "Signed" : "Not signed"} subtitle={status} testID="student-contract-status" />,
    ...summary.map((r) => <ListRow key={`sum-${r.label}`} title={<T variant="small" tone="muted">{r.label}</T>} subtitle={<T variant="small">{r.value}</T>} />),
    ...(!waiting && sc && c.lastSigned?.id === sc.linkId && c.lastSigned?.copyEmailedTo?.length
      ? [<ListRow key="copy" title={<T variant="small" tone="muted">Their copy, emailed to</T>} subtitle={<T variant="small">{c.lastSigned.copyEmailedTo.join(", ")}</T>} testID="student-contract-copy" />]
      : []),
    ...(waiting
      ? [
          <ListRow key="qr" icon={<ToneIcon icon={QrIcon} tone="blue" />} title="QR code to sign here" subtitle="A parent at the front desk scans it with their phone" onPress={() => setSheet("qr")} testID="student-contract-qr" />,
          <ListRow key="email" icon={<ToneIcon icon={Mail} tone="blue" />} title={emailing ? "Emailing…" : "Email it to the parents"} onPress={emailing ? undefined : () => void email(waiting)} testID="student-contract-email" />,
          <ListRow key="change" icon={<ToneIcon icon={RotateCcw} tone="amber" />} title="Change and send again" subtitle="Another program or other discounts" onPress={template ? () => setSheet("send") : undefined} testID="student-contract-change" />,
          <ListRow key="withdraw" icon={<ToneIcon icon={X} tone="red" />} title="Withdraw it" onPress={() => void withdraw(waiting)} testID="student-contract-withdraw" />,
        ]
      : [
          <ListRow
            key="send"
            icon={<ToneIcon icon={Send} tone="green" />}
            title={sc ? "Send a new contract" : "Send the contract"}
            subtitle="Choose the program and the discounts"
            onPress={template ? () => setSheet("send") : undefined}
            testID="student-contract-send"
          />,
        ]),
    ...(sc?.fileId ? [<ListRow key="open" icon={<ToneIcon icon={FileText} tone="grey" />} title="Open the signed contract" onPress={() => router.push({ pathname: "/file/[id]", params: { id: sc.fileId! } })} testID="student-contract-open" />] : []),
  ];

  return (
    <>
      <ListSection title="Enrollment contract" icon={FileSignature} tone="green" footer={template ? undefined : "The academy’s contract isn’t set up yet."} testID="student-contract">
        {rows}
      </ListSection>
      {sheet === "send" && template ? <SendSheet student={student} profile={profile} templateText={template.text} lastValues={sc?.values ?? null} start={waiting?.preset ?? null} onClose={() => setSheet(null)} /> : null}
      {sheet === "qr" && waiting ? <QrSheet linkId={waiting.id} firstName={first} onClose={() => setSheet(null)} /> : null}
    </>
  );
}

/** What was chosen in a contract (or what the office set on one it sent), read with its version: label and value rows. */
function useSummary(templateId: string | null, values: ContractValues | null, offered: boolean) {
  const { branchId } = useBranch();
  const template = useDoc<{ text: string }>(templateId ? `${ROOT.branches}/${branchId}/${COL.contractTemplates}/${templateId}` : null);
  const text = template.data?.text ?? "";
  return useMemo(() => {
    if (!text || !values) return [];
    return contractSummary(parseContract(text).doc, values).map((r, i) => ({
      label: i === 0 && offered ? "Program suggested" : r.label,
      value: r.value === "—" && offered ? (i === 0 ? "The family chooses" : "Once the family chooses") : r.value,
    }));
  }, [text, values, offered]);
}

/** A contract's link on the website this app uses (the live site, or the practice copy's): the server's names the live one. */
const here = (url: string) => url.replace(/^https?:\/\/[^/]+/, env.webUrl);

/** Shares a contract's link (Messages, Mail, Copy…). */
async function shareLink(url: string, firstName: string) {
  try {
    await Share.share({ message: `Please read and sign ${firstName}’s enrollment contract: ${url}`, url });
  } catch {
    toast.error("Couldn’t share the link");
  }
}

/** A sheet for the front desk: the contract's QR code, its link to share, and signing on this phone instead. */
function QrBody({ url, firstName, children }: { url: string; firstName: string; children?: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.qr}>
      {children}
      <View style={[styles.qrCard, { borderColor: colors.border }]}>
        <QrCode value={url} size={240} testID="contract-qr" />
      </View>
      <T tone="muted" style={styles.center}>
        The parent scans it with their phone’s camera, then reads and signs {firstName}’s contract there. No account or app needed.
      </T>
      <Button size="lg" wrap variant="outline" icon={<Share2 size={18} color={colors.foreground} />} onPress={() => void shareLink(url, firstName)} testID="contract-share-link">
        Share the link
      </Button>
      <Button size="lg" wrap variant="outline" onPress={() => void openUrl(url)} testID="contract-open-here">
        Sign on this phone instead
      </Button>
    </View>
  );
}

function Sheet({ title, onClose, children, testID }: { title: string; onClose: () => void; children: React.ReactNode; testID?: string }) {
  const colors = useColors();
  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.grouped }]} edges={SHEET_EDGES}>
        <View style={[styles.bar, { borderBottomColor: colors.border }]}>
          <T variant="label" numberOfLines={1} style={styles.fill}>
            {title}
          </T>
          <Button variant="ghost" onPress={onClose} testID="contract-sheet-close">
            Done
          </Button>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled" testID={testID}>
          {children}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

/** A contract still waiting: its QR code (the token is the office's to read). */
function QrSheet({ linkId, firstName, onClose }: { linkId: string; firstName: string; onClose: () => void }) {
  const { branchId } = useBranch();
  const token = useDoc<ContractLinkToken>(`${ROOT.branches}/${branchId}/${COL.contractLinks}/${linkId}/private/${CONTRACT_TOKEN_DOC}`);
  return (
    <Sheet title={`Sign ${firstName}’s contract here`} onClose={onClose} testID="contract-qr-sheet">
      {token.data?.token ? <QrBody url={signUrl(token.data.token, env.webUrl)} firstName={firstName} /> : <T tone="muted">{token.loading ? "Opening…" : "The link couldn’t be read."}</T>}
    </Sheet>
  );
}

/**
 * Sending a student's contract (as the website's dialog): the program the office suggests (the family can choose
 * another), the discounts only the office checks, the price after them, who gets it and whether each has the app, and
 * the email switch (off at first). Then its QR code.
 */
function SendSheet({
  student,
  profile,
  templateText,
  lastValues,
  start,
  onClose,
}: {
  student: Student & { id: string };
  profile: StudentPrivateProfile | null;
  templateText: string;
  lastValues: ContractValues | null;
  /** What the contract waiting was sent with: sending again starts from it. */
  start: ContractValues | null;
  onClose: () => void;
}) {
  const { branchId, isDemo } = useBranch();
  const colors = useColors();
  const parentsInApp = useParentsInApp(student.id);
  const contract = useMemo(() => parseContract(templateText).doc, [templateText]);
  const choice = pricedChoice(contract);
  const boxes = academyChecks(contract);
  const first = student.firstName || student.name.split(" ")[0];
  const last = choice && typeof lastValues?.[choice.id] === "string" ? (lastValues[choice.id] as string) : null;
  const [program, setProgram] = useState<string | null>(() => (start ? (Object.values(start).find((v): v is string => typeof v === "string") ?? "") : null));
  const [discounts, setDiscounts] = useState<Record<string, string[]>>(() => Object.fromEntries(Object.entries(start ?? {}).filter((e): e is [string, string[]] => Array.isArray(e[1]))));
  const [email, setEmail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ContractSendResult | null>(null);
  const picked = program ?? (choice ? suggestedOption(contract, [last, student.level, student.program]) : "");
  const preset: ContractValues = { ...(choice && picked ? { [choice.id]: picked } : {}), ...discounts };
  const prices = optionPrices(contract, preset);
  const tuition = tuitionOf(contract, preset);
  const inApp = new Set(parentsInApp.data.filter((m) => m.status === "active" && m.role === "parent").map((m) => emailKey(m.email)));
  const parents = (profile?.parents ?? []).filter((p) => p.name.trim() || p.email.trim());
  const hasEmail = parents.some((p) => p.email.includes("@")) || !!profile?.email?.includes("@");

  async function send() {
    setBusy(true);
    try {
      setResult(await sendCall({ branchId, studentId: student.id, preset, email }));
    } catch (e) {
      toast.error(errorMessage(e, "The contract couldn’t be sent just now."));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Sheet title={`${first}’s contract is sent`} onClose={onClose} testID="contract-sent">
        <QrBody url={here(result.url)} firstName={first}>
          <View style={styles.lines}>
            <T>{result.told.length ? `In the app: ${result.told.join(", ")} ${result.told.length > 1 ? "were" : "was"} told.` : "No parent has the app yet: show them this QR code, or send the email."}</T>
            {result.emailed !== "off" ? <T tone="muted">{result.emailed === "sent" ? `Emailed to ${result.emailedTo.join(", ")}.` : NOT_EMAILED[result.emailed]}</T> : null}
          </View>
        </QrBody>
      </Sheet>
    );
  }

  return (
    <Sheet title={start ? `Change ${first}’s contract` : `Send ${first}’s contract`} onClose={onClose} testID="contract-send">
      <T tone="muted">
        {start ? "The one waiting is withdrawn as this one goes. " : ""}Choose the program and the discounts. {first}’s parent reads the contract, can pick another program, and signs it in the app, on the website, or with its QR code.
      </T>
      {choice ? (
        <ListSection title="Program" testID="send-programs">
          {choice.options.map((o) => {
            const { name, sub } = optionHeading(o.title);
            const p = prices.get(o.id);
            return (
              <ChoiceRow
                key={o.id}
                title={name}
                subtitle={sub || undefined}
                right={
                  <View style={styles.price}>
                    {p?.was ? (
                      <T variant="tiny" tone="muted" style={styles.was}>
                        {p.was}
                      </T>
                    ) : null}
                    <T variant="label">{p?.now ?? o.price}</T>
                  </View>
                }
                selected={picked === o.id}
                onPress={() => setProgram(o.id)}
                testID={`send-program-${o.id}`}
              />
            );
          })}
          <ChoiceRow title="Let the family choose" selected={!picked} onPress={() => setProgram("")} testID="send-program-none" />
        </ListSection>
      ) : null}
      {boxes.map((b) => (
        <ListSection key={b.id} title={b.label} footer="Only the office checks these: the family sees them, and can’t change them." testID="send-discounts">
          {b.options.map((o) => {
            const list = discounts[b.id] ?? [];
            const on = list.includes(o.id);
            const left = !!picked && o.except.includes(picked);
            return (
              <Pressable
                key={o.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => setDiscounts((d) => ({ ...d, [b.id]: on ? list.filter((x) => x !== o.id) : [...list, o.id] }))}
                style={({ pressed }) => [styles.checkRow, { backgroundColor: pressed ? colors.accent : colors.card }]}
                testID={`send-discount-${o.id}`}
              >
                <View style={[styles.box, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : "transparent" }]}>{on ? <Check size={14} color={colors.primaryForeground} strokeWidth={3} /> : null}</View>
                <View style={styles.fill}>
                  <T tone={left ? "muted" : "default"}>{o.text}</T>
                  {left ? (
                    <T variant="small" tone="muted">
                      Doesn’t apply to the program chosen.
                    </T>
                  ) : null}
                </View>
                {o.amount !== null ? <T variant="label">−{dollarsText(o.amount)}</T> : null}
              </Pressable>
            );
          })}
        </ListSection>
      ))}
      {tuition ? (
        <View style={[styles.tuition, { backgroundColor: colors.card, borderColor: colors.border }]} testID="send-tuition">
          <T variant="small" tone="muted">
            {tuition.label.replace(/\s*\(\$\)\s*$/, "")}
          </T>
          <T variant="label">{tuitionText(tuition)}</T>
        </View>
      ) : null}
      <ListSection title="Goes to" testID="send-recipients">
        {parents.length ? (
          parents.map((p) => (
            <ListRow key={p.email || p.name} title={`${p.name.trim() || p.email}${p.relation ? ` (${p.relation.toLowerCase()})` : ""}`} subtitle={`${p.email || "No email"} · ${inApp.has(emailKey(p.email ?? "")) ? "Has the app" : "Not in the app yet"}`} />
          ))
        ) : (
          <ListRow title="No parent on the record" subtitle="Show the QR code after sending" />
        )}
        <SwitchRow
          title="Also email them the link"
          subtitle={!hasEmail ? "There’s no email on the record." : inApp.size ? "The parents in the app are told there either way." : `No parent has the app yet: turn this on, or show them the QR code.${isDemo ? " The demo academy doesn’t send email." : ""}`}
          value={email}
          onValueChange={setEmail}
          disabled={!hasEmail}
          testID="send-email"
        />
      </ListSection>
      <Button size="lg" wrap icon={<Send size={18} color={colors.primaryForeground} />} busy={busy} onPress={() => void send()} testID="send-contract">
        {start ? "Send it again" : "Send the contract"}
      </Button>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: "center" },
  bar: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  sheetBody: { gap: space.lg, padding: space.lg, paddingBottom: space.xxl },
  qr: { gap: space.md, alignItems: "stretch" },
  qrCard: { alignSelf: "center", backgroundColor: "#ffffff", borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.sm },
  lines: { gap: space.xs },
  price: { alignItems: "flex-end" },
  was: { textDecorationLine: "line-through" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.md, paddingVertical: space.md },
  box: { width: 22, height: 22, borderRadius: radius.sm, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  tuition: { gap: 2, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.lg, padding: space.md },
});
