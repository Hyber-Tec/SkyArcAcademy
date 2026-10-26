import { effectiveRanges } from "@shared/availability";
import { KIND_COLORS } from "@shared/schedule/seatColors";
import { type DateKey, addDays, diffDays, startOfWeek, weekDays } from "@shared/time";
import { router } from "expo-router";
import { CalendarDays, CalendarX2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/Card";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { EmptyState } from "@/components/EmptyState";
import { Hatch } from "@/components/Hatch";
import { IconButton } from "@/components/IconButton";
import { Screen } from "@/components/Screen";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow, useClassesBetween, useStudentList } from "@/features/data/hooks";
import { ClassCard } from "@/features/schedule/ClassCard";
import { teaches } from "@/features/schedule/classes";
import { longDay, plural, timeRange, weekRange } from "@/features/schedule/format";
import { WhosIn, useLevelFill, useSeatFill, useStaffLook } from "@/features/schedule/parts";
import { type StripDay, WeekStrip } from "@/features/schedule/WeekStrip";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * The schedule, a day at a time, as the website's (docs/DECISIONS.md §21): the week's days on top, then the chosen day's
 * opening hours and who's in, and its classes in time order, each laid out like the academy's sheets (ClassCard): the
 * coaches in, the seats two across with every student in their level's colour and rifle code, the labels in theirs.
 * Coaches see every class; theirs (in their hours) stand out. A class opens its sheet; the office marks who's here
 * there, and makes other changes on the website.
 */
export default function ScheduleScreen() {
  const { settings, isCoach, staffId } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const weekStartsOn = settings.general.weekStartsOn;
  const { today, nowMin } = useAcademyNow();
  const [selected, setSelected] = useState<DateKey>(today);
  const [picking, setPicking] = useState(false);

  const week = weekDays(selected, weekStartsOn);
  const data = useClassesBetween(week[0], week[6]);
  const look = useStaffLook();
  const students = useStudentList();
  const studentById = useMemo(() => new Map(students.data.map((s) => [s.id, s])), [students.data]);
  const studentOf = (id: string) => studentById.get(id);
  const me = isCoach ? staffId : null;

  const days: StripDay[] = week.map((d) => ({ dateKey: d, isOpen: data.hoursOf(d).isOpen, classes: (data.byDate.get(d) ?? []).length }));
  const day = data.byDate.get(selected) ?? [];
  const hours = data.hoursOf(selected);
  const people = data.inOn(selected);
  const teachers = new Set(day.flatMap((v) => v.coaches.map((k) => k.staffId))).size;
  // A coach's own hours that day, inside its opening hours.
  const mine = me ? data.availability.find((a) => a.staffId === me && a.dateKey === selected) : undefined;
  const myHours = mine && !mine.unavailable ? effectiveRanges(mine.ranges ?? [], hours) : [];
  const theirs = me ? day.filter((v) => teaches(v, me)).length : 0;
  const weeksAway = Math.round(diffDays(startOfWeek(today, weekStartsOn), week[0]) / 7);
  const caption = weeksAway === 0 ? "This week" : weeksAway === 1 ? "Next week" : weeksAway === -1 ? "Last week" : weeksAway > 0 ? `In ${weeksAway} weeks` : `${-weeksAway} weeks ago`;
  const summary = [
    hours.isOpen ? `Open ${timeRange(hours.openMin, hours.closeMin, hour12)}` : "Closed",
    day.length ? plural(day.length, "class", "classes") : null,
    day.length && !me ? (teachers ? `${plural(teachers, "coach", "coaches")} in` : "no coach in") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const you = !me
    ? null
    : myHours.length
      ? `You’re in ${myHours.map((r) => timeRange(r.startMin, r.endMin, hour12)).join(" and ")}${day.length ? ` · ${theirs ? `${plural(theirs, "class", "classes")} in your hours` : "no class in your hours"}` : ""}`
      : mine?.unavailable
        ? "You’re not available this day"
        : hours.isOpen
          ? "Your hours aren’t set this day"
          : null;

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
            {summary}
          </T>
          {you && !data.loading ? (
            <T variant="small" style={{ color: myHours.length ? colors.brandText : colors.mutedForeground, fontWeight: "600" }} testID="schedule-day-you">
              {you}
            </T>
          ) : null}
        </View>
        {!data.loading && people.length ? <WhosIn people={people} look={look} me={me} hour12={hour12} testID="schedule-whos-in" /> : null}
        {data.loading ? (
          <SkeletonCards count={3} height={180} />
        ) : data.error ? (
          <Card>
            <T variant="label">Couldn’t load the schedule</T>
            <T variant="small" tone="muted">
              Check your connection and try again.
            </T>
          </Card>
        ) : day.length ? (
          <>
            <View style={styles.list} testID="schedule-classes">
              {day.map((v) => (
                <ClassCard
                  key={v.c.id}
                  v={v}
                  today={today}
                  nowMin={nowMin}
                  hour12={hour12}
                  me={me}
                  look={look}
                  studentOf={studentOf}
                  onPress={() => router.push({ pathname: "/class/[id]", params: { id: v.c.id } })}
                  testID={`schedule-class-${v.c.id}`}
                />
              ))}
            </View>
            <Legend />
          </>
        ) : (
          <EmptyState
            testID="schedule-empty"
            icon={<CalendarX2 size={26} color={colors.mutedForeground} />}
            title={hours.isOpen ? "No classes" : "Closed"}
            text={hours.isOpen ? "No classes on this day yet." : "The academy is closed on this day."}
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

/** What the colours mean: each level's (the academy's list), the labels', and an open seat. */
function Legend() {
  const { settings } = useBranch();
  const colors = useColors();
  const levelFill = useLevelFill();
  const seatFill = useSeatFill();
  return (
    <View style={[styles.legend, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="schedule-legend">
      <View style={styles.legendItems}>
        {settings.students.levels.map((l) => {
          const f = levelFill(l);
          return (
            <View key={l} style={[styles.legendChip, { backgroundColor: f.bg }]}>
              <T variant="tiny" style={{ color: f.ink, fontWeight: "600" }}>
                {l}
              </T>
            </View>
          );
        })}
      </View>
      <View style={styles.legendItems}>
        {(["makeup", "practice", "trial"] as const).map((k) => {
          const f = seatFill(KIND_COLORS[k]);
          return (
            <View key={k} style={[styles.legendChip, { backgroundColor: f.bg }]}>
              <T variant="tiny" style={{ color: f.ink, fontWeight: "700" }}>
                {k === "makeup" ? "MU · Make-up" : KIND_COLORS[k].name}
              </T>
            </View>
          );
        })}
        <View style={[styles.legendChip, styles.legendOpen, { borderColor: colors.border }]}>
          <Hatch />
          <T variant="tiny" tone="muted" style={{ fontWeight: "600" }}>
            Open seat
          </T>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dayHead: { gap: 2, marginTop: space.xs },
  list: { gap: space.md },
  legend: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  legendItems: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  legendChip: { borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2, overflow: "hidden" },
  legendOpen: { borderWidth: 1, borderStyle: "dashed" },
});
