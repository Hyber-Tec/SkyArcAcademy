import { familyNote } from "@shared/schedule/family";
import { cancelRuleText, familyCancelCheck } from "@shared/schedule/requests";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarClock, CalendarDays, CalendarX2, X } from "lucide-react-native";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { confirmAsync } from "@/components/Confirm";
import { IconButton } from "@/components/IconButton";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { ToastHost } from "@/components/ToastHost";
import { useAcademyNow } from "@/features/data/hooks";
import { familyClassId, familyClasses } from "@/features/family/classes";
import { type SessionDoc, useAcademyContact, useFamilyRequests, useFamilySession, useFamilySessions } from "@/features/family/data";
import { AcademyContact } from "@/features/family/FamilyParts";
import { useFamily } from "@/features/family/FamilyProvider";
import { FamilyStatus } from "@/features/family/FamilyStatus";
import { hasEnded, isOnNow, relativeDay } from "@/features/family/format";
import { cancelClass, requestError } from "@/features/requests/api";
import { millis } from "@/features/requests/data";
import { duration, longDay, shortDay, startsIn, timeLeft, timeRange } from "@/features/schedule/format";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * A class, over the screen it was opened from (a sheet; loaded from its id, so a link opens it too): when, and each of
 * the family's students in it with their status and the class's note; then, while it's coming, Move to another time
 * (a request the academy approves: "Ask for a class") and Cancel, until the class is confirmed (the shared
 * `familyCancelCheck`, through the server), as on the website (web/src/features/family/FamilyWidgets.tsx, ClassDetails);
 * then how to reach the academy for anything else. No coach: every coach in at its time teaches it.
 */
export default function FamilyClassSheet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings, name, branchId } = useBranch();
  const colors = useColors();
  const family = useFamily();
  const { today, nowMin, now } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const session = useFamilySession(id ?? null);
  // Only the family's own students' classes (a copy this phone kept from an earlier sign-in never shows).
  const s = session.data && family.ids.includes(session.data.studentId) ? session.data : null;
  // The family's classes that day: brothers and sisters in the same class show together.
  const day = useFamilySessions(s ? family.ids : [], s?.dateKey ?? today, s?.dateKey ?? today);
  const group = useMemo(() => {
    if (!s) return null;
    const same = day.data.filter((x) => familyClassId(x) === familyClassId(s));
    return familyClasses(same.length ? same : [s])[0] ?? null;
  }, [s, day.data]);
  const contact = useAcademyContact();
  // A move already asked for shows instead of its button.
  const kids = useMemo(() => (group ? group.sessions.map((x) => x.studentId) : []), [group]);
  const requests = useFamilyRequests(kids);
  const [canceling, setCanceling] = useState<string | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (session.loading) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="family-session-sheet">
        <View style={styles.content}>
          <Skeleton width="60%" height={28} />
          <Skeleton width="40%" height={18} />
          <Skeleton height={64} rounded={radius.lg} />
          <Skeleton height={64} rounded={radius.lg} />
        </View>
      </View>
    );
  }
  if (!s || !group || s.isDeleted) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="family-session-sheet">
        <EmptyState
          icon={<CalendarDays size={26} color={colors.mutedForeground} />}
          title="This class isn’t on the schedule any more"
          text={`It may have been moved or canceled. Ask ${name} if you’re not sure.`}
          action={
            <Button variant="outline" onPress={close} testID="family-session-close">
              Close
            </Button>
          }
        />
      </View>
    );
  }

  const ended = hasEnded(group, today, nowMin);
  const live = isOnNow(group, today, nowMin);
  const near = relativeDay(group.dateKey, today);
  const soon = group.dateKey === today && !ended ? (live ? timeLeft(group.endMin - nowMin) : startsIn(group.startMin - nowMin)) : null;
  const shown = family.who === "parent" ? group.sessions : group.sessions.filter((x) => x.id === s.id);
  // The seats that can still change: coming (not canceled or marked), and the class not over.
  const coming = ended ? [] : shown.filter((x) => !x.isDeleted && (x.status === "pending" || x.status === "confirmed"));
  const checks = new Map(coming.map((x) => [x.id, familyCancelCheck({ status: x.status, isDeleted: x.isDeleted, startMs: millis(x.startAt) }, now, settings)]));
  const named = shown.length > 1;

  const cancelIt = async (x: SessionDoc) => {
    const whose = family.who === "parent" ? `${family.firstName(x.studentId, x.studentName)}’s class` : "Your class";
    const ok = await confirmAsync({
      title: "Cancel this class?",
      message: `${whose} on ${shortDay(x.dateKey)} at ${timeRange(x.startMin, x.endMin, hour12)}. The academy is told, and a makeup can be asked for afterwards.`,
      confirmLabel: "Cancel class",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!ok) return;
    setCanceling(x.id);
    try {
      await cancelClass(branchId, x.id);
      toast.success("Class canceled", { description: "The academy has been told. Ask for a makeup from Classes when you’re ready." });
    } catch (e) {
      toast.error("The class wasn’t canceled", { description: requestError(e) });
    } finally {
      setCanceling(null);
    }
  };
  // "Ask for a class" takes the sheet's place, set to move this seat.
  const move = (x: SessionDoc) => router.replace({ pathname: "/ask", params: { studentId: x.studentId, kind: "reschedule", forSessionId: x.id } });

  return (
    <>
      <ScrollView style={[styles.fill, { backgroundColor: colors.grouped }]} contentContainerStyle={styles.content} testID="family-session-sheet">
        <View style={styles.top}>
          <View style={styles.grow}>
            <T variant="title" accessibilityRole="header" testID="family-session-time">
              {timeRange(group.startMin, group.endMin, hour12)}
            </T>
            <T tone="muted">
              {near ? `${near}, ` : ""}
              {longDay(group.dateKey)} · {duration(group.endMin - group.startMin)}
            </T>
            {soon ? (
              <T variant="small" style={{ color: colors.brandText, fontWeight: "600" }}>
                {live ? `On now · ${soon}` : `Starts ${soon}`}
              </T>
            ) : null}
          </View>
          <IconButton icon={<X size={20} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} filled testID="family-session-close" />
        </View>

        <ListSection title={family.who === "parent" ? (shown.length > 1 ? "Your children" : "Your child") : "You"} testID="family-session-students">
          {shown.map((x) => {
            const note = familyNote(x.note);
            return (
              <ListRow
                key={x.id}
                icon={<Avatar name={x.studentName} size={38} />}
                title={<T variant="label">{family.firstName(x.studentId, x.studentName)}</T>}
                subtitle={
                  note ? (
                    <T variant="small" tone="muted">
                      {note}
                    </T>
                  ) : undefined
                }
                right={<FamilyStatus status={x.status} ended={ended} />}
                testID={`family-session-student-${x.studentId}`}
              />
            );
          })}
        </ListSection>

        {coming.length ? (
          // The rule, unless a seat already says it (too late to cancel).
          <ListSection title="Changes" footer={[...checks.values()].every((k) => k.ok) ? cancelRuleText(settings) : undefined} testID="family-session-actions">
            {coming.flatMap((x) => {
              const check = checks.get(x.id) ?? { ok: false as const, reason: "gone" as const, message: "" };
              const moving = requests.data.find((r) => r.status === "pending" && r.kind === "reschedule" && r.forSessionId === x.id);
              const who = named ? family.firstName(x.studentId, x.studentName) : null;
              return [
                moving ? (
                  <ListRow
                    key={`${x.id}-moving`}
                    icon={
                      <RowIcon color={colors.warningTint}>
                        <CalendarClock size={17} color={colors.warning} />
                      </RowIcon>
                    }
                    title={who ? `Moving ${who}` : "Moving to another time"}
                    subtitle={`To ${shortDay(moving.dateKey)}, ${timeRange(moving.startMin, moving.endMin, hour12)}: waiting for the academy.`}
                    testID={`family-session-moving-${x.studentId}`}
                  />
                ) : (
                  <ListRow
                    key={`${x.id}-move`}
                    icon={
                      <RowIcon>
                        <CalendarClock size={17} color={colors.foreground} />
                      </RowIcon>
                    }
                    title={who ? `Move ${who} to another time` : "Move to another time"}
                    subtitle="Ask for a class with a seat open"
                    onPress={() => move(x)}
                    testID={`family-session-move-${x.studentId}`}
                  />
                ),
                <ListRow
                  key={`${x.id}-cancel`}
                  icon={
                    <RowIcon color={check.ok ? colors.destructiveTint : undefined}>
                      <CalendarX2 size={17} color={check.ok ? colors.destructive : colors.mutedForeground} />
                    </RowIcon>
                  }
                  title={
                    <T variant="label" tone={check.ok ? "destructive" : "muted"}>
                      {canceling === x.id ? "Canceling…" : who ? `Cancel ${who}’s class` : "Cancel class"}
                    </T>
                  }
                  subtitle={check.ok ? undefined : check.message}
                  onPress={check.ok && canceling !== x.id ? () => void cancelIt(x) : undefined}
                  chevron={false}
                  testID={`family-session-cancel-${x.studentId}`}
                />,
              ];
            })}
          </ListSection>
        ) : null}

        {contact?.phone?.trim() || contact?.email?.trim() ? (
          <AcademyContact
            title={coming.length ? "Anything else?" : "A question?"}
            footer={coming.length ? `To change it some other way, contact ${name}.` : `A question about this class? Contact ${name}.`}
            reachOnly
          />
        ) : (
          <T variant="small" tone="muted" style={styles.note}>
            {coming.length ? `To change it some other way, contact ${name}.` : `A question about this class? Contact ${name}.`}
          </T>
        )}
      </ScrollView>
      {/* A sheet is drawn above the app's toasts: its own layer shows them over it, whatever is scrolled. */}
      <ToastHost />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1, gap: 2 },
  note: { paddingHorizontal: space.xs },
});
