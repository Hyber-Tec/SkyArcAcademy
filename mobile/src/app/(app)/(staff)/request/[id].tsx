import { REQUEST_OFFICE_STATUS_LABELS, isOpenRequest, offerText, seatLabelFor } from "@shared/schedule/requests";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarDays, Check, Inbox, X } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { confirmAsync } from "@/components/Confirm";
import { EmptyState } from "@/components/EmptyState";
import { FactRow } from "@/components/FactRow";
import { Field } from "@/components/Field";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { ToastHost } from "@/components/ToastHost";
import { decideRequest, requestError } from "@/features/requests/api";
import { ClassChoices } from "@/features/requests/ClassChoices";
import { useClassChoices, useClassRequest, useClassSeat } from "@/features/requests/data";
import { RequestHistory } from "@/features/requests/History";
import { askedWhen, whatFor } from "@/features/requests/RequestRow";
import { shortDay, timeRange } from "@/features/schedule/format";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * A family's request, over the screen it was opened from (a sheet, loaded by its ID: the office's notices and lists open
 * it), as the website's review (web/src/features/requests/OfficeRequests.tsx): what it's for, the class asked for with
 * its seats taken, the class it makes up or moves, the seat's label once booked, the family's message, and the back and
 * forth so far. While it's open (waiting on the office, or on the family's answer to a class suggested): Approve (the
 * server books the class asked for, and cancels a moved class), Decline with a note, or Suggest another time: a class
 * with a seat open (tapped, then confirmed: the list is long, and a button at its end would be far away), with the
 * note, which the family accepts or answers by asking for another. Each goes through the server
 * (`decideClassRequest`), which checks it again and tells the family.
 */
export default function RequestSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { branchId, timezone, settings, isAdmin, actor } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const request = useClassRequest(id ?? null);
  const r = request.data;
  const seats = useClassSeat(r?.classId ?? null);
  const offered = useClassSeat(r?.status === "offered" ? (r.offer?.classId ?? null) : null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | "offer" | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const open = !!r && isOpenRequest(r);
  const choices = useClassChoices({
    studentId: suggesting && r ? r.studentId : null,
    forSessionId: r?.forSessionId ?? null,
    requestId: r?.id ?? null,
    exclude: [r?.classId, r?.offer?.classId],
  });
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (request.loading) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="request-sheet">
        <View style={styles.content}>
          <Skeleton width="70%" height={28} />
          <Skeleton width="45%" height={18} />
          <Skeleton height={160} rounded={radius.lg} />
        </View>
      </View>
    );
  }
  if (!r || !isAdmin) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="request-sheet">
        <EmptyState
          icon={<Inbox size={26} color={colors.mutedForeground} />}
          title="This request isn’t here any more"
          text="The family may have withdrawn it."
          action={
            <Button variant="outline" onPress={close} testID="request-close">
              Close
            </Button>
          }
        />
      </View>
    );
  }

  const c = seats.data;
  const full = !!c && c.taken >= c.seats;
  const who = r.requestedBy.role === "student" ? "the student" : r.requestedBy.name || "a parent";
  const when = `${shortDay(r.dateKey)}, ${timeRange(r.startMin, r.endMin, hour12)}`;
  const o = r.status === "offered" ? (r.offer ?? null) : null;

  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    try {
      await decideRequest(branchId, r.id, decision, note.trim(), decision === "approve" ? r.classId : undefined);
      toast.success(decision === "approve" ? "Approved" : "Declined", {
        description: decision === "approve" ? `${r.studentName} is booked ${when} (${seatLabelFor(r.kind, r.forDateKey)}). The family is told.` : "The family is told, and can ask for another time.",
      });
      close();
    } catch (e) {
      toast.error(decision === "approve" ? "Not approved" : "Not declined", { description: requestError(e) });
      setBusy(null);
    }
  };

  const suggest = async (classId: string) => {
    const picked = choices.choices.find((x) => x.id === classId);
    if (!picked || busy) return;
    setSuggestion(classId);
    const at = `${shortDay(picked.dateKey)}, ${timeRange(picked.startMin, picked.endMin, hour12)}`;
    const ok = await confirmAsync({
      title: `Suggest ${at}?`,
      message: `${note.trim() ? `With your note: “${note.trim()}”. ` : ""}The family accepts it, or asks for another time.`,
      confirmLabel: "Suggest",
    });
    if (!ok) return setSuggestion(null);
    setBusy("offer");
    try {
      await decideRequest(branchId, r.id, "offer", note.trim(), picked.id);
      toast.success("Suggestion sent", { description: `The family is asked about ${at}: they accept it, or ask for another time.` });
      close();
    } catch (e) {
      toast.error("The suggestion wasn’t sent", { description: requestError(e) });
      setBusy(null);
    }
  };

  return (
    <>
      <ScrollView style={[styles.fill, { backgroundColor: colors.grouped }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" testID="request-sheet">
        <View style={styles.top}>
          <View style={styles.grow}>
            <T variant="title" accessibilityRole="header" testID="request-title">
              {whatFor(r)}
            </T>
            <T variant="label">{r.studentName}</T>
            <T variant="small" tone="muted">
              Asked by {who}, {askedWhen(r.createdAt, timezone, hour12)}.
            </T>
          </View>
          <IconButton icon={<X size={20} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} filled testID="request-close" />
        </View>

        {r.status === "pending" ? null : (
          <View style={styles.status} testID="request-status">
            <Badge tone={r.status === "approved" ? "success" : r.status === "offered" ? "info" : "secondary"}>{REQUEST_OFFICE_STATUS_LABELS[r.status]}</Badge>
            {r.status === "rejected" && r.decisionNote ? (
              <T variant="small" tone="muted" style={styles.grow}>
                “{r.decisionNote}”
              </T>
            ) : null}
          </View>
        )}

        {o ? (
          <Card style={styles.offer} testID="request-offer">
            <T variant="label">{offerText(o, "office", actor.email)}</T>
            {offered.data ? (
              <T variant="small" tone={offered.data.taken >= offered.data.seats ? "destructive" : "muted"} testID="request-offer-seats">
                {offered.data.taken >= offered.data.seats ? "Full now: suggest another time." : `${offered.data.seats - offered.data.taken} of ${offered.data.seats} seats open.`}
              </T>
            ) : null}
            {o.note ? (
              <T variant="small" tone="muted">
                “{o.note}”
              </T>
            ) : null}
            <T variant="small" tone="muted">
              The family accepts it or asks for another time. You can still approve the time they asked for, or decline.
            </T>
          </Card>
        ) : null}

        <ListSection testID="request-facts">
          <FactRow
            label={o ? "Asked for" : "Class"}
            value={
              <View style={styles.classValue}>
                <T tone="muted" style={styles.right}>
                  {when}
                </T>
                {c ? (
                  <T variant="small" style={[styles.right, { color: full ? colors.destructive : colors.mutedForeground, fontWeight: full ? "600" : "400" }]} testID="request-seats">
                    {c.taken} of {c.seats} seats taken{full ? " (full)" : ""}
                  </T>
                ) : null}
              </View>
            }
          />
          {r.kind !== "extra" && r.forDateKey ? <FactRow label={r.kind === "makeup" ? "Makes up" : "Moves"} value={`The class on ${shortDay(r.forDateKey)}`} /> : null}
          <FactRow label="Seat label" value={seatLabelFor(r.kind, r.forDateKey)} />
          {r.message ? <FactRow label="Message" value={`“${r.message}”`} /> : null}
        </ListSection>
        {open && r.kind === "reschedule" ? (
          <T variant="small" tone="muted" style={styles.note}>
            The class it moves is canceled when it’s booked; it stays booked if you decline.
          </T>
        ) : null}

        <ListSection>
          <ListRow
            icon={<CalendarDays size={18} color={colors.foreground} />}
            title="See the class"
            subtitle="Who’s in, and room for another student"
            onPress={() => router.push({ pathname: "/class/[id]", params: { id: r.classId } })}
            testID="request-open-class"
          />
        </ListSection>

        {open ? (
          <>
            <Field
              label="A note for the family (optional)"
              value={note}
              onChangeText={setNote}
              maxLength={500}
              multiline
              placeholder="Tuesday is full; Thursday has two seats."
              testID="request-note"
            />
            <View style={styles.buttons}>
              <Button variant="outline" style={styles.grow} icon={<X size={18} color={colors.foreground} />} disabled={busy !== null} busy={busy === "reject"} onPress={() => void decide("reject")} testID="request-decline">
                Decline
              </Button>
              <Button style={styles.grow} icon={<Check size={18} color={colors.primaryForeground} />} disabled={busy !== null || full} busy={busy === "approve"} onPress={() => void decide("approve")} testID="request-approve">
                Approve
              </Button>
            </View>
            {full ? (
              <T variant="small" tone="muted" style={styles.note} testID="request-full">
                The class asked for is full: suggest another time, make room on the schedule, or decline.
              </T>
            ) : null}
            {suggesting ? (
              <View style={styles.suggest} testID="request-suggest-list">
                <T variant="label" style={styles.note}>
                  {o ? "Suggest a different time" : "Suggest another time"}
                </T>
                <T variant="small" tone="muted" style={styles.note}>
                  Tap a time to suggest it{note.trim() ? ", with your note" : ""}.
                </T>
                <ClassChoices choices={choices.choices} selected={suggestion} onSelect={(classId) => void suggest(classId)} hour12={hour12} loading={choices.loading} horizon={choices.horizon} testID="request-suggest" />
              </View>
            ) : (
              <Button variant="outline" icon={<CalendarDays size={18} color={colors.foreground} />} disabled={busy !== null} onPress={() => setSuggesting(true)} testID="request-suggest-open">
                {o ? "Suggest a different time" : "Suggest another time"}
              </Button>
            )}
          </>
        ) : null}

        <RequestHistory r={r} viewer="office" me={actor.email} timezone={timezone} hour12={hour12} testID="request-history" />
      </ScrollView>
      {/* A sheet is drawn above the app's toasts: its own layer shows them over it, whatever is scrolled. */}
      <ToastHost />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl * 2 },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1, gap: 2 },
  status: { flexDirection: "row", alignItems: "center", gap: space.sm },
  offer: { gap: space.xs },
  classValue: { alignItems: "flex-end", gap: 2, flexShrink: 1 },
  right: { textAlign: "right", fontVariant: ["tabular-nums"] },
  note: { paddingHorizontal: space.xs },
  buttons: { flexDirection: "row", gap: space.md },
  suggest: { gap: space.md },
});
