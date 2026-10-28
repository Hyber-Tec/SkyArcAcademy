import { MAKEUP_LOOKBACK_DAYS, makeupsLost, makeupsOwed } from "@shared/schedule/classes";
import { type ClassRequestStatus, REQUEST_STATUS_LABELS, requestHorizon, requestLine } from "@shared/schedule/requests";
import { addDays } from "@shared/time";
import { router } from "expo-router";
import { CalendarPlus } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { requestError, withdrawRequest } from "@/features/requests/api";
import { type RequestDoc, millis } from "@/features/requests/data";
import { clock, monthDay, shortDay } from "@/features/schedule/format";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";
import { useFamilyRequests, useFamilySessions } from "./data";
import { useFamily } from "./FamilyProvider";

/** Answered requests stay listed this long. */
const RECENT_MS = 14 * 86_400_000;

const TONE: Record<ClassRequestStatus, BadgeTone> = { pending: "warning", approved: "success", rejected: "secondary", withdrawn: "secondary" };

/**
 * The top of Classes, as the website's (web/src/features/requests/FamilyRequestsPanel.tsx): makeups still owed (each
 * with "Ask for a makeup"), the family's requests with the academy's answers (Withdraw for one still waiting), and
 * makeups missed (their credit is lost). Nothing shows when there's nothing to say.
 */
export function RequestsPanel() {
  const family = useFamily();
  const { branchId, settings } = useBranch();
  const { today, now } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS);
  // Classes canceled ahead count too (a makeup is owed as soon as a class is canceled).
  const seats = useFamilySessions(family.shown, since, requestHorizon(today, settings));
  const requests = useFamilyRequests(family.shown);
  const [busy, setBusy] = useState<string | null>(null);

  const owed = useMemo(() => makeupsOwed(seats.data, since), [seats.data, since]);
  const lost = useMemo(() => makeupsLost(seats.data, since), [seats.data, since]);
  const asked = new Set(requests.data.filter((r) => r.status === "pending").map((r) => r.forSessionId));
  const shown = requests.data.filter((r) => r.status === "pending" || now - millis(r.decidedAt ?? r.updatedAt) < RECENT_MS);
  // Each line names its child when the parent sees more than one.
  const whose = (id: string) => (family.shown.length > 1 ? `${family.firstName(id)}: ` : "");
  if (!owed.length && !lost.length && !shown.length) return null;

  const withdraw = async (r: RequestDoc) => {
    const ok = await confirmAsync({ title: "Withdraw this request?", message: "The academy won’t see it anymore. You can ask again any time.", confirmLabel: "Withdraw" });
    if (!ok) return;
    setBusy(r.id);
    try {
      await withdrawRequest(branchId, r.id);
      toast.success("Request withdrawn");
    } catch (e) {
      toast.error("Couldn’t withdraw it", { description: requestError(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.panel} testID="family-requests-panel">
      {owed.length ? (
        <ListSection title="Makeups to book" testID="family-makeups">
          {owed.map((s) => (
            <ListRow
              key={s.id}
              title={`${whose(s.studentId)}${shortDay(s.dateKey)}`}
              subtitle={`${clock(s.startMin, hour12)} · ${s.status === "no_show" ? "Missed" : "Canceled"}`}
              right={
                asked.has(s.id) ? (
                  <T variant="small" tone="muted">
                    Asked
                  </T>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={() => router.push({ pathname: "/ask", params: { studentId: s.studentId, kind: "makeup", forSessionId: s.id } })}
                    testID={`family-makeup-ask-${s.id}`}
                  >
                    Ask for a makeup
                  </Button>
                )
              }
              testID={`family-makeup-${s.id}`}
            />
          ))}
        </ListSection>
      ) : null}

      {shown.length ? (
        <ListSection title="Requests" testID="family-requests">
          {shown.map((r) => (
            <RequestLine key={r.id} r={r} prefix={whose(r.studentId)} busy={busy === r.id} onWithdraw={() => void withdraw(r)} />
          ))}
        </ListSection>
      ) : null}

      {lost.length ? (
        <View style={styles.lost} testID="family-makeups-lost">
          {lost.map((s) => {
            const was = /(\d+)\/(\d+)/.exec(s.note ?? "");
            const forDay = was ? ` for ${was[1]}/${was[2]}` : "";
            return (
              <T key={s.id} variant="small" tone="muted">
                {whose(s.studentId)}The makeup{forDay} was missed on {monthDay(s.dateKey)}, so it counts as used.
              </T>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** A request in a line ("Makeup for Oct 13 · Tue, Nov 3, 4:30–6:00 PM"), its answer, and Withdraw while it waits. */
function RequestLine({ r, prefix, busy, onWithdraw, divider = false }: { r: RequestDoc; prefix: string; busy: boolean; onWithdraw: () => void; divider?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.request, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]} testID={`family-request-${r.id}`}>
      <T variant="label">
        {prefix}
        {requestLine(r)}
      </T>
      {r.status === "rejected" && r.decisionNote ? (
        <T variant="small" tone="muted">
          “{r.decisionNote}”
        </T>
      ) : null}
      <View style={styles.requestFoot}>
        <Badge tone={TONE[r.status]}>{REQUEST_STATUS_LABELS[r.status]}</Badge>
        {r.status === "pending" ? (
          <Button size="sm" variant="ghost" disabled={busy} busy={busy} onPress={onWithdraw} testID={`family-request-withdraw-${r.id}`}>
            Withdraw
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/** "Ask for a class", for the top of Classes (and its months). */
export function AskButton({ testID = "family-ask" }: { testID?: string }) {
  const colors = useColors();
  const family = useFamily();
  return (
    <Button
      variant="outline"
      icon={<CalendarPlus size={18} color={colors.foreground} />}
      onPress={() => router.push({ pathname: "/ask", params: family.child !== "all" ? { studentId: family.child } : {} })}
      testID={testID}
    >
      Ask for a class
    </Button>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.lg },
  request: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.xs },
  requestFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, minHeight: 32 },
  lost: { gap: space.xs, paddingHorizontal: space.xs },
});
