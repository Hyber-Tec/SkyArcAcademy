import { isRequestable, requestHorizon } from "@shared/schedule/requests";
import { type DateKey, isDateKey } from "@shared/time";
import { router, useLocalSearchParams } from "expo-router";
import { CalendarPlus, CalendarX2, X } from "lucide-react-native";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { ListSection } from "@/components/List";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow, useHoursOf } from "@/features/data/hooks";
import { FamilyClassRow } from "@/features/family/ClassCards";
import { familyClasses } from "@/features/family/classes";
import { useFamilySessions } from "@/features/family/data";
import { useFamily } from "@/features/family/FamilyProvider";
import { relativeDay } from "@/features/family/format";
import { useChildColor } from "@/features/family/tints";
import { millis, useClassSeats } from "@/features/requests/data";
import { longDay, shortDay } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

const close = () => (router.canGoBack() ? router.back() : router.replace("/classes"));

/**
 * A day of the family's classes, as a sheet over Classes' months (`/day?date=YYYY-MM-DD`; the owner, 2026-10-29: tap a
 * day, it opens from the bottom; close it, open another). Its root is its ScrollView (a sheet's rule).
 */
export default function FamilyDaySheet() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const colors = useColors();
  if (!isDateKey(date)) {
    return (
      <ScrollView style={[styles.fill, { backgroundColor: colors.grouped }]} contentContainerStyle={styles.content} testID="family-day-sheet">
        <EmptyState
          icon={<CalendarX2 size={26} color={colors.mutedForeground} />}
          title="This day couldn’t be opened"
          text="Go back to Classes and pick a day."
          action={
            <Button variant="outline" onPress={close} testID="family-day-close">
              Close
            </Button>
          }
        />
      </ScrollView>
    );
  }
  return <DaySheet key={date} date={date} />;
}

/**
 * The day (Today or Tomorrow above it, when it's one of those), then its classes as the list shows them (each child in
 * their colour beside their name, as the months mark them), each opening its sheet in this one's place; or "No classes
 * on …", or that the academy is closed. A day the family can still ask for (open, from today to as far ahead as the
 * academy takes requests, `requestHorizon`, with a seat open in a class still to start: what `ask` offers) has "Ask for
 * a class on this day", which opens asking with the day chosen; one without a seat open says so.
 */
function DaySheet({ date }: { date: DateKey }) {
  const family = useFamily();
  const { settings } = useBranch();
  const colors = useColors();
  const dotOf = useChildColor();
  const { today, nowMin, now } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const sessions = useFamilySessions(family.ids, date, date);
  const hours = useHoursOf(date, date);
  const open = hours.hoursOf(date).isOpen;
  const horizon = requestHorizon(today, settings);
  const inWindow = family.ids.length > 0 && date >= today && date <= horizon;
  const seats = useClassSeats(date, date, inWindow);
  const shown = new Set(family.shown);
  const groups = familyClasses(sessions.data.filter((s) => shown.has(s.studentId)));
  const openClasses = seats.data.filter((c) => isRequestable({ ...c, startMs: millis(c.startAt) }, now, horizon)).length;
  const loading = sessions.loading || hours.loading || (inWindow && seats.loading);
  const near = relativeDay(date, today);
  const askable = inWindow && open;

  // Asking takes the sheet's place, set to this day (and to the child chosen on the tabs).
  const ask = () => router.replace({ pathname: "/ask", params: { date, ...(family.child !== "all" ? { studentId: family.child } : {}) } });

  return (
    <ScrollView style={[styles.fill, { backgroundColor: colors.grouped }]} contentContainerStyle={styles.content} testID="family-day-sheet">
      <View style={styles.top}>
        <View style={styles.grow}>
          {near ? (
            <T variant="small" style={[styles.near, { color: date === today ? colors.brandText : colors.mutedForeground }]}>
              {near.toUpperCase()}
            </T>
          ) : null}
          <T variant="title" accessibilityRole="header" testID="family-day-title">
            {longDay(date)}
          </T>
        </View>
        <IconButton icon={<X size={20} color={colors.foreground} />} accessibilityLabel="Close" onPress={close} filled testID="family-day-close" />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <Skeleton height={64} rounded={radius.lg} />
          <Skeleton height={52} rounded={radius.md} />
        </View>
      ) : (
        <>
          {groups.length ? (
            <ListSection footer={open ? undefined : "The academy is closed on this day."} testID="family-day-classes">
              {groups.map((g) => (
                <FamilyClassRow
                  key={g.id}
                  group={g}
                  when={{ today, nowMin, hour12 }}
                  dotOf={dotOf}
                  onPress={() => router.replace({ pathname: "/session/[id]", params: { id: g.sessions[0].id } })}
                  testID={`family-day-class-${g.sessions[0].id}`}
                />
              ))}
            </ListSection>
          ) : (
            <Card style={styles.none} testID={open ? "family-day-none" : "family-day-closed"}>
              <CalendarX2 size={20} color={colors.mutedForeground} />
              <T tone="muted" style={styles.grow}>
                {open ? `No classes on ${shortDay(date)}.` : "The academy is closed on this day."}
              </T>
            </Card>
          )}

          {askable && openClasses > 0 ? (
            <View style={styles.ask}>
              <Button size="lg" wrap icon={<CalendarPlus size={18} color={colors.primaryForeground} />} onPress={ask} testID="family-day-ask">
                Ask for a class on this day
              </Button>
              <T variant="small" tone="muted" style={styles.center}>
                The academy approves each request, or suggests another time.
              </T>
            </View>
          ) : askable ? (
            <T variant="small" tone="muted" style={styles.center} testID="family-day-full">
              No seats are open on this day right now. Seats open up when students cancel.
            </T>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space.md },
  grow: { flex: 1, gap: 2 },
  near: { fontWeight: "700", letterSpacing: 0.5 },
  loading: { gap: space.md },
  none: { flexDirection: "row", alignItems: "center", gap: space.md },
  ask: { gap: space.sm },
  center: { textAlign: "center" },
});
