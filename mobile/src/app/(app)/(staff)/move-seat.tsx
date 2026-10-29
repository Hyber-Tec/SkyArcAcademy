import { COL, ROOT } from "@shared/paths";
import { type DateKey, addDays } from "@shared/time";
import type { Session } from "@shared/types";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { CalendarDays, X } from "lucide-react-native";
import { Platform, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { ChoiceRow } from "@/components/ChoiceRow";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { ListSection } from "@/components/List";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type ClassDoc, useClassesBetween } from "@/features/data/hooks";
import { moveSeat } from "@/features/schedule/api";
import { shortDay, timeRange } from "@/features/schedule/format";
import { useDoc } from "@/lib/firestore";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/** How far from the seat's day the office can move it here: the rest of its week, as on the website. */
const DAYS = 7;

/**
 * The office moves a student to another class, as the website's seat menu does ("Move to another class"): the classes of
 * the seat's day and the six after it (a day that's over too: the office puts the record right), each with its open
 * seats; this class, a class the student is already in and a full one can't be chosen. A tap moves them (they take its
 * whole time) and comes back. Opened with the seat's ID (`sessionId`).
 */
export default function MoveSeatScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const { branchId, actor, timezone, settings, isAdmin } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const seat = useDoc<Session>(sessionId ? `${ROOT.branches}/${branchId}/${COL.sessions}/${sessionId}` : null);
  const s = seat.data;
  const from = s ? s.dateKey : null;
  const to = s ? addDays(s.dateKey, DAYS - 1) : null;
  const data = useClassesBetween(from, to);

  if (seat.loading || (from && data.loading)) {
    return (
      <Screen typing={false} testID="move-seat-screen">
        <SkeletonCards count={5} height={52} />
      </Screen>
    );
  }
  if (!s || s.isDeleted || !isAdmin) {
    return (
      <Screen typing={false} testID="move-seat-screen">
        <EmptyState
          icon={<CalendarDays size={26} color={colors.mutedForeground} />}
          title="This seat isn’t on the schedule"
          text="It may have been changed on the website."
          action={
            <Button variant="outline" onPress={() => router.back()} testID="move-seat-back">
              Back
            </Button>
          }
        />
      </Screen>
    );
  }

  const days: DateKey[] = [];
  for (let i = 0; i < DAYS; i++) {
    const d = addDays(s.dateKey, i);
    if ((data.byDate.get(d) ?? []).length) days.push(d);
  }
  const move = (c: ClassDoc, order: number) => {
    moveSeat(branchId, actor, timezone, s, c, order);
    toast.success(`${s.studentName} moved`, { description: `To ${shortDay(c.dateKey)}, ${timeRange(c.startMin, c.endMin, hour12)}` });
    router.back();
  };

  return (
    <>
      <CloseOnIPhone />
      <Screen typing={false} testID="move-seat-screen">
        <View style={styles.head}>
          <T variant="label">{s.studentName}</T>
          <T variant="small" tone="muted">
            Now in {shortDay(s.dateKey)}, {timeRange(s.startMin, s.endMin, hour12)}
            {s.note?.trim() ? ` · ${s.note.trim()}` : ""}
          </T>
        </View>
        {days.length ? (
          days.map((d) => (
            <ListSection key={d} title={shortDay(d)} testID={`move-seat-day-${d}`}>
              {(data.byDate.get(d) ?? []).map((x) => {
                const left = x.c.seats - x.taken;
                const here = x.c.id === s.classId;
                const already = !here && x.seats.some((o) => o.studentId === s.studentId && o.status !== "canceled");
                const order = Math.max(-1, ...x.seats.map((o) => o.visualOrder ?? 0)) + 1;
                return (
                  <ChoiceRow
                    key={x.c.id}
                    selected={here}
                    disabled={here || already || left <= 0}
                    title={timeRange(x.c.startMin, x.c.endMin, hour12)}
                    right={here ? "This class" : already ? "In it" : left > 0 ? `${left} open` : "Full"}
                    onPress={() => move(x.c, order)}
                    testID={`move-seat-class-${x.c.id}`}
                  />
                );
              })}
            </ListSection>
          ))
        ) : (
          <EmptyState icon={<CalendarDays size={26} color={colors.mutedForeground} />} title="No other classes this week" text="Add a class on the website first." testID="move-seat-none" />
        )}
      </Screen>
    </>
  );
}

/** The iPhone opens this over the class's sheet, where it has no back button: a Close in its place. */
function CloseOnIPhone() {
  const colors = useColors();
  if (Platform.OS !== "ios") return null;
  return (
    <Stack.Screen
      options={{
        headerLeft: () => <IconButton icon={<X size={22} color={colors.foreground} />} accessibilityLabel="Close" onPress={() => router.back()} testID="move-seat-close" />,
      }}
    />
  );
}

const styles = StyleSheet.create({
  head: { gap: 2, paddingHorizontal: space.xs },
});
