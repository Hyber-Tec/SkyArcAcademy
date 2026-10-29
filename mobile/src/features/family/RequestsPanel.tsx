import { MAKEUP_LOOKBACK_DAYS, makeupsLost, makeupsOwed } from "@shared/schedule/classes";
import { type ClassRequestStatus, REQUEST_STATUS_LABELS, isOpenRequest, offerText, requestHistory, requestHorizon, requestLine } from "@shared/schedule/requests";
import { addDays } from "@shared/time";
import { router } from "expo-router";
import { CalendarPlus, Check, ChevronDown, ChevronUp } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Badge, type BadgeTone } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { confirmAsync } from "@/components/Confirm";
import { ListRow, ListSection } from "@/components/List";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { answerOffer, requestError, withdrawRequest } from "@/features/requests/api";
import { type RequestDoc, millis, useClassSeat } from "@/features/requests/data";
import { RequestHistory } from "@/features/requests/History";
import { clock, monthDay, shortDay, timeRange } from "@/features/schedule/format";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";
import { useFamilyRequests, useFamilySessions } from "./data";
import { useFamily } from "./FamilyProvider";

/** Answered requests stay listed this long. */
const RECENT_MS = 14 * 86_400_000;

const TONE: Record<ClassRequestStatus, BadgeTone> = { pending: "warning", offered: "info", approved: "success", rejected: "secondary", withdrawn: "secondary" };

/**
 * The top of Classes, as the website's (web/src/features/requests/FamilyRequestsPanel.tsx): a time the academy suggests
 * instead of the one asked for comes first, to accept or to answer by asking for another; then makeups still owed (each
 * with "Ask for a makeup"), the family's requests with the academy's answers (Withdraw for one still open, and each
 * one's back and forth folded under it), and makeups missed (their credit is lost). Nothing shows when there's nothing
 * to say.
 */
export function RequestsPanel() {
  const family = useFamily();
  const { branchId, settings, timezone, actor } = useBranch();
  const { today, now } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS);
  // Classes canceled ahead count too (a makeup is owed as soon as a class is canceled).
  const seats = useFamilySessions(family.shown, since, requestHorizon(today, settings));
  const requests = useFamilyRequests(family.shown);
  const [busy, setBusy] = useState<string | null>(null);

  const owed = useMemo(() => makeupsOwed(seats.data, since), [seats.data, since]);
  const lost = useMemo(() => makeupsLost(seats.data, since), [seats.data, since]);
  const asked = new Set(requests.data.filter(isOpenRequest).map((r) => r.forSessionId));
  const offers = requests.data.filter((r) => r.status === "offered" && r.offer);
  const shown = requests.data.filter((r) => r.status === "pending" || (!isOpenRequest(r) && now - millis(r.decidedAt ?? r.updatedAt) < RECENT_MS));
  // Each line names its child when the parent sees more than one.
  const whose = (id: string) => (family.shown.length > 1 ? `${family.firstName(id)}: ` : "");
  if (!owed.length && !lost.length && !shown.length && !offers.length) return null;

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

  const accept = async (r: RequestDoc) => {
    const o = r.offer;
    if (!o) return;
    const when = `${shortDay(o.dateKey)}, ${timeRange(o.startMin, o.endMin, hour12)}`;
    const ok = await confirmAsync({ title: `Book ${when}?`, message: `${family.who === "parent" ? `${family.firstName(r.studentId)} is` : "You’re"} booked in that class at once.`, confirmLabel: "Book it" });
    if (!ok) return;
    setBusy(r.id);
    try {
      await answerOffer(branchId, r.id, "accept", o.classId);
      toast.success("Booked", { description: `${when}. The academy is told.` });
    } catch (e) {
      toast.error("Not booked", { description: requestError(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.panel} testID="family-requests-panel">
      {offers.map((r) => (
        <OfferCard
          key={r.id}
          r={r}
          prefix={whose(r.studentId)}
          busy={busy === r.id}
          onAccept={() => void accept(r)}
          onAnother={() => router.push({ pathname: "/another", params: { requestId: r.id } })}
          onWithdraw={() => void withdraw(r)}
          history={<HistoryFold r={r} me={actor.email} timezone={timezone} hour12={hour12} />}
        />
      ))}

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
            <RequestLine key={r.id} r={r} prefix={whose(r.studentId)} busy={busy === r.id} onWithdraw={() => void withdraw(r)}>
              <HistoryFold r={r} me={actor.email} timezone={timezone} hour12={hour12} />
            </RequestLine>
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

/**
 * A time the academy suggests instead of the one asked for: what the request is for, the suggestion with its seats
 * open now and the academy's note, then Accept (booked at once, if a seat is still open), Ask for another time, or
 * Withdraw.
 */
function OfferCard({
  r,
  prefix,
  busy,
  onAccept,
  onAnother,
  onWithdraw,
  history,
}: {
  r: RequestDoc;
  prefix: string;
  busy: boolean;
  onAccept: () => void;
  onAnother: () => void;
  onWithdraw: () => void;
  history: React.ReactNode;
}) {
  const colors = useColors();
  const o = r.offer;
  const seats = useClassSeat(o?.classId ?? null);
  if (!o) return null;
  const full = !!seats.data && seats.data.taken >= seats.data.seats;
  return (
    <Card style={styles.offer} testID={`family-offer-${r.id}`}>
      <View style={styles.offerHead}>
        <Badge tone="info">{REQUEST_STATUS_LABELS.offered}</Badge>
      </View>
      <T variant="label">
        {prefix}
        {requestLine(r)}
      </T>
      <T variant="subheading" testID={`family-offer-when-${r.id}`}>
        {offerText(o, "family")}
      </T>
      {seats.data ? (
        <T variant="small" tone={full ? "destructive" : "muted"}>
          {full ? "That class has filled up since: ask for another time." : `${seats.data.seats - seats.data.taken} of ${seats.data.seats} seats open.`}
        </T>
      ) : null}
      {o.note ? (
        <T variant="small" tone="muted">
          “{o.note}”
        </T>
      ) : null}
      <View style={styles.offerButtons}>
        <Button variant="outline" style={styles.grow} disabled={busy} onPress={onAnother} testID={`family-offer-another-${r.id}`}>
          Ask for another
        </Button>
        <Button style={styles.grow} icon={<Check size={18} color={colors.primaryForeground} />} disabled={busy || full} busy={busy} onPress={onAccept} testID={`family-offer-accept-${r.id}`}>
          Accept
        </Button>
      </View>
      <View style={styles.requestFoot}>
        {history}
        <Button size="sm" variant="ghost" disabled={busy} onPress={onWithdraw} testID={`family-request-withdraw-${r.id}`}>
          Withdraw
        </Button>
      </View>
    </Card>
  );
}

/** A request in a line ("Makeup for Oct 13 · Tue, Nov 3, 4:30–6:00 PM"), its answer, Withdraw while it waits, and its back and forth. */
function RequestLine({ r, prefix, busy, onWithdraw, divider = false, children }: { r: RequestDoc; prefix: string; busy: boolean; onWithdraw: () => void; divider?: boolean; children?: React.ReactNode }) {
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
      {children}
    </View>
  );
}

/** "History", folded: a request's back and forth, when it has more than the ask. */
function HistoryFold({ r, me, timezone, hour12 }: { r: RequestDoc; me: string; timezone: string; hour12: boolean }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  if (requestHistory(r).length < 2) return null;
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View style={styles.fold}>
      <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={8} style={styles.foldHead} testID={`family-request-history-${r.id}`}>
        <T variant="small" tone="muted">
          History
        </T>
        <Chevron size={14} color={colors.mutedForeground} />
      </Pressable>
      {open ? <RequestHistory r={r} viewer="family" me={me} timezone={timezone} hour12={hour12} /> : null}
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
  offer: { gap: space.sm },
  offerHead: { flexDirection: "row" },
  offerButtons: { flexDirection: "row", gap: space.md, marginTop: space.xs },
  grow: { flex: 1 },
  request: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.xs },
  requestFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, minHeight: 32 },
  fold: { gap: space.sm },
  foldHead: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 28 },
  lost: { gap: space.xs, paddingHorizontal: space.xs },
});
