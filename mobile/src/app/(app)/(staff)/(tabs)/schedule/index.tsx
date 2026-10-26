import { router } from "expo-router";
import { CalendarDays, CalendarX2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { type DateKey, addDays, diffDays, startOfWeek, weekDays } from "@shared/time";
import { Card } from "@/components/Card";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow, useHoursOf, useSessionsBetween, useStaffList } from "@/features/data/hooks";
import { ClassRow } from "@/features/schedule/ClassRow";
import { groupClasses } from "@/features/schedule/classes";
import { longDay, plural, timeRange, weekRange } from "@/features/schedule/format";
import { type StripDay, WeekStrip } from "@/features/schedule/WeekStrip";
import { useBranch } from "@/state/BranchProvider";
import { space, useColors } from "@/theme";

/**
 * The schedule, a day at a time: the week's days on top, then the chosen day's classes in time order (earliest first),
 * each with its coach, and that day's open hours. A coach sees their own classes. Read-only: changes are made on the
 * website, whose schedule keeps coaches as rows.
 */
export default function ScheduleScreen() {
  const { settings, isCoach } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const weekStartsOn = settings.general.weekStartsOn;
  const { today, nowMin } = useAcademyNow();
  const [selected, setSelected] = useState<DateKey>(today);
  const [picking, setPicking] = useState(false);

  const week = weekDays(selected, weekStartsOn);
  const sessions = useSessionsBetween(week[0], week[6]);
  const { hoursOf } = useHoursOf(week[0], week[6]);
  const staff = useStaffList();
  const staffById = useMemo(() => new Map(staff.data.map((s) => [s.id, s])), [staff.data]);
  const classes = useMemo(() => groupClasses(sessions.data), [sessions.data]);

  const days: StripDay[] = week.map((d) => ({ dateKey: d, isOpen: hoursOf(d).isOpen, classes: classes.filter((c) => c.dateKey === d && c.active.length > 0).length }));
  // In time order, as the day goes (groupClasses sorts by start, then end, then coach).
  const day = classes.filter((c) => c.dateKey === selected);
  const teaching = day.filter((c) => c.active.length > 0);
  const coachCount = new Set(teaching.map((c) => c.coachId)).size;
  const hours = hoursOf(selected);
  const weeksAway = Math.round(diffDays(startOfWeek(today, weekStartsOn), week[0]) / 7);
  const caption = weeksAway === 0 ? "This week" : weeksAway === 1 ? "Next week" : weeksAway === -1 ? "Last week" : weeksAway > 0 ? `In ${weeksAway} weeks` : `${-weeksAway} weeks ago`;

  return (
    <>
      <Screen
        title="Schedule"
        titleRight={<IconButton testID="schedule-pick-date" icon={<CalendarDays size={21} color={colors.foreground} />} accessibilityLabel="Go to a date" onPress={() => setPicking(true)} size={40} filled />}
        testID="schedule-screen"
      >
        <WeekStrip
          days={days}
          selected={selected}
          today={today}
          label={weekRange(week[0], week[6])}
          caption={caption}
          showToday={!week.includes(today) || selected !== today}
          onSelect={setSelected}
          onPrev={() => setSelected(addDays(selected, -7))}
          onNext={() => setSelected(addDays(selected, 7))}
          onToday={() => setSelected(today)}
        />
        <View style={styles.dayHead}>
          <T variant="heading" testID="schedule-day-title">
            {longDay(selected)}
          </T>
          <T variant="small" tone="muted" testID="schedule-day-hours">
            {[
              hours.isOpen ? `Open ${timeRange(hours.openMin, hours.closeMin, hour12)}` : "Closed",
              teaching.length ? plural(teaching.length, "class", "classes") : null,
              teaching.length && !isCoach ? plural(coachCount, "coach", "coaches") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </T>
        </View>
        {sessions.loading ? (
          <SkeletonCards count={3} height={92} />
        ) : sessions.error ? (
          <Card>
            <T variant="label">Couldn’t load the schedule</T>
            <T variant="small" tone="muted">
              Check your connection and try again.
            </T>
          </Card>
        ) : day.length ? (
          <View style={styles.list} testID="schedule-classes">
            {day.map((c) => (
              <ClassRow
                key={c.id}
                group={c}
                color={staffById.get(c.coachId)?.color ?? null}
                hour12={hour12}
                showCoach={!isCoach}
                live={c.dateKey === today && c.active.length > 0 && c.startMin <= nowMin && nowMin < c.endMin}
                onPress={() => router.push({ pathname: "/class/[id]", params: { id: c.id } })}
                testID={`schedule-class-${c.id}`}
              />
            ))}
          </View>
        ) : (
          <EmptyState
            testID="schedule-empty"
            icon={<CalendarX2 size={26} color={colors.mutedForeground} />}
            title={hours.isOpen ? "No classes" : "Closed"}
            text={hours.isOpen ? "Nothing is booked on this day." : "The academy is closed on this day."}
          />
        )}
      </Screen>
      <DatePickerDialog
        open={picking}
        title="Go to a date"
        value={selected}
        today={today}
        onPick={(d) => {
          setSelected(d);
          setPicking(false);
        }}
        onClose={() => setPicking(false)}
        testID="schedule-date-picker"
      />
    </>
  );
}

const styles = StyleSheet.create({
  dayHead: { gap: 2, marginTop: space.xs },
  list: { gap: space.md },
});
