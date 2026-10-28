import { REQUEST_STATUS_LABELS, seatLabelFor } from "@shared/schedule/requests";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarDays, Check, Inbox, X } from "lucide-react-native";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FactRow } from "@/components/FactRow";
import { Field } from "@/components/Field";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { ToastHost } from "@/components/ToastHost";
import { decideRequest, requestError } from "@/features/requests/api";
import { useClassRequest, useClassSeat } from "@/features/requests/data";
import { askedWhen, whatFor } from "@/features/requests/RequestRow";
import { shortDay, timeRange } from "@/features/schedule/format";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * A family's request, over the screen it was opened from (a sheet, loaded by its ID: the office's notices and lists open
 * it), as the website's review (web/src/features/requests/OfficeRequests.tsx): what it's for, the class asked for with
 * its seats taken, the class it makes up or moves, the seat's label once booked, and the family's message; then Approve
 * (the server books the seat, and cancels a moved class) or Decline with a note for the family. Both go through the
 * server (`decideClassRequest`), which tells the family. A full class can't be approved until a seat is free.
 */
export default function RequestSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { branchId, timezone, settings, isAdmin } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const request = useClassRequest(id ?? null);
  const r = request.data;
  const seats = useClassSeat(r?.classId ?? null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
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
  const waiting = r.status === "pending";
  const who = r.requestedBy.role === "student" ? "the student" : r.requestedBy.name || "a parent";
  const when = `${shortDay(r.dateKey)}, ${timeRange(r.startMin, r.endMin, hour12)}`;

  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    try {
      await decideRequest(branchId, r.id, decision, note.trim());
      toast.success(decision === "approve" ? "Approved" : "Declined", {
        description: decision === "approve" ? `${r.studentName} is booked ${when} (${seatLabelFor(r.kind, r.forDateKey)}). The family is told.` : "The family is told, and can ask for another time.",
      });
      close();
    } catch (e) {
      toast.error(decision === "approve" ? "Not approved" : "Not declined", { description: requestError(e) });
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

        {waiting ? null : (
          <View style={styles.status} testID="request-status">
            <Badge tone={r.status === "approved" ? "success" : "secondary"}>{r.status === "rejected" ? "Declined" : REQUEST_STATUS_LABELS[r.status]}</Badge>
            {r.status === "rejected" && r.decisionNote ? (
              <T variant="small" tone="muted" style={styles.grow}>
                “{r.decisionNote}”
              </T>
            ) : null}
          </View>
        )}

        <ListSection testID="request-facts">
          <FactRow
            label="Class"
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
        {waiting && r.kind === "reschedule" ? (
          <T variant="small" tone="muted" style={styles.note}>
            The class it moves is canceled when you approve; it stays booked if you decline.
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

        {waiting ? (
          <>
            <Field
              label="A note for the family, if you decline (optional)"
              value={note}
              onChangeText={setNote}
              maxLength={500}
              multiline
              placeholder="That class is for advanced shooters; try Thursday."
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
                The class is full: make room on the schedule first, or decline.
              </T>
            ) : null}
          </>
        ) : null}
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
  classValue: { alignItems: "flex-end", gap: 2, flexShrink: 1 },
  right: { textAlign: "right", fontVariant: ["tabular-nums"] },
  note: { paddingHorizontal: space.xs },
  buttons: { flexDirection: "row", gap: space.md },
});
