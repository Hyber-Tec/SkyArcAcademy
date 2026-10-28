import { effectiveRanges } from "@shared/availability";
import { KIND_COLORS } from "@shared/schedule/seatColors";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { type DateKey, addDays, diffDays, startOfWeek, weekDays } from "@shared/time";
import { router } from "expo-router";
import { CalendarCheck, CalendarDays, CalendarX2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Card } from "@/components/Card";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { EmptyState } from "@/components/EmptyState";
import { Hatch } from "@/components/Hatch";
import { IconButton } from "@/components/IconButton";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow, useClassesBetween, useClockedIn, useEventsBetween, useStudentList } from "@/features/data/hooks";
import { usePendingRequests } from "@/features/requests/data";
import { ClassCard } from "@/features/schedule/ClassCard";
import { teaches } from "@/features/schedule/classes";
import { longDay, plural, timeRange, weekRange } from "@/features/schedule/format";
import { EventChips, StatusMark, WhosIn, useLevelFill, useSeatFill, useStaffLook } from "@/features/schedule/parts";
import { type StripDay, WeekStrip } from "@/features/schedule/WeekStrip";
import { WeekList } from "@/features/schedule/WeekList";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";


/**
 * The schedule, as the website's (docs/DECISIONS.md §21), by Day or by Week (the academy's default view first, as on
 * the website): the week's days on top; then the chosen day's opening hours, events and who's in, and its classes in
 * time order, or the whole week's days one after another. Each class is laid out like the academy's sheets
 * (ClassCard): the coaches in, the seats two across with every student in their level's colour and rifle code, the
 * labels in theirs. Coaches see every class; theirs (in their hours) stand out. A class opens its sheet; the office
 * marks who's here there and adds, moves or takes out students. The office's Requests (with their count) are the
 * families' requests waiting for an answer, as the website's schedule has them.
 */
export default function ScheduleScreen() {
  const { settings, isCoach, isAdmin, staffId } = useBranch();
  const colors = useColors();
  const hour12 = settings.general.timeFormat !== "24h";
  const weekStartsOn = settings.general.weekStartsOn;
  const { today, nowMin } = useAcademyNow();
  const [selected, setSelected] = useState<DateKey>(today);
  const [view, setView] = useState<"day" | "week">(settings.schedule.defaultView === "week" ? "week" : "day");
  const [picking, setPicking] = useState(false);
  const requests = usePendingRequests(isAdmin);

  const week = weekDays(selected, weekStartsOn);
  const data = useClassesBetween(week[0], week[6]);
  const events = useEventsBetween(week[0], week[6]);
  const clockedIn = useClockedIn(today);
  const look = useStaffLook();
  const students = useStudentList();
  const studentById = useMemo(() => new Map(students.data.map((s) => [s.id, s])), [students.data]);
  const studentOf = (id: string) => studentById.get(id);
  const me = isCoach ? staffId : null;
  const openDay = (d: DateKey) => {
    setSelected(d);
    setView("day");
  };

  const days: StripDay[] = week.map((d) => ({ dateKey: d, isOpen: data.hoursOf(d).isOpen, classes: (data.byDate.get(d) ?? []).length }));
  const day = data.byDate.get(selected) ?? [];
  const hours = data.hoursOf(selected);
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
        titleRight={
          <View style={styles.actions}>
            <View style={styles.views}>
              <SegmentedControl
                value={view}
                options={[
                  { value: "day", label: "Day" },
                  { value: "week", label: "Week" },
                ]}
                onChange={setView}
                testID="schedule-view"
              />
            </View>
            {requests.data.length ? (
              <IconButton
                testID="schedule-requests"
                icon={<CalendarCheck size={21} color={colors.foreground} />}
                badge={requests.data.length}
                accessibilityLabel="Requests from families"
                onPress={() => router.push("/requests")}
                size={40}
                filled
              />
            ) : null}
            <IconButton testID="schedule-pick-date" icon={<CalendarDays size={21} color={colors.foreground} />} accessibilityLabel="Go to a date" onPress={() => setPicking(true)} size={40} filled />
          </View>
        }
        testID="schedule-screen"
      >
        <WeekStrip
          days={days}
          selected={view === "day" ? selected : null}
          today={today}
          label={weekRange(week[0], week[6])}
          caption={caption}
          showToday={!week.includes(today) || (view === "day" && selected !== today)}
          onSelect={openDay}
          onPrev={() => setSelected(addDays(selected, -7))}
          onNext={() => setSelected(addDays(selected, 7))}
          onToday={() => setSelected(today)}
        />
        {view === "day" ? (
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
        ) : null}
        {data.loading ? (
          <SkeletonCards count={3} height={180} />
        ) : data.error ? (
          <Card>
            <T variant="label">Couldn’t load the schedule</T>
            <T variant="small" tone="muted">
              Check your connection and try again.
            </T>
          </Card>
        ) : view === "week" ? (
          <>
            <WeekList
              days={week}
              data={data}
              eventsOn={events.eventsOn}
              today={today}
              nowMin={nowMin}
              hour12={hour12}
              me={me}
              look={look}
              studentOf={studentOf}
              clockedIn={clockedIn}
              onOpenDay={openDay}
            />
            <Legend />
          </>
        ) : (
          <>
            <EventChips events={events.eventsOn(selected)} hour12={hour12} testID="schedule-events" />
            {hours.isOpen || day.length ? (
              <WhosIn people={data.inOn(selected)} look={look} me={me} hour12={hour12} clockedIn={selected === today ? clockedIn : undefined} testID="schedule-whos-in" />
            ) : null}
            {day.length ? (
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
          </>
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

/** What the colours and marks mean, as the website's legend: each level's (the academy's list), the labels', the marks and an open seat. */
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
      </View>
      <View style={styles.legendItems}>
        {(["present", "no_show", "canceled"] as const).map((s) => (
          <View key={s} style={styles.legendMark}>
            <StatusMark status={s} size={15} />
            <T variant="tiny" tone="muted" style={{ fontWeight: "600" }}>
              {SESSION_STATUS_LABELS[s]}
            </T>
          </View>
        ))}
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
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm },
  views: { width: 124 },
  dayHead: { gap: 2, marginTop: space.xs },
  list: { gap: space.md },
  legend: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.md, gap: space.sm },
  legendItems: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  legendChip: { borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 2, overflow: "hidden" },
  legendMark: { flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 4 },
  legendOpen: { borderWidth: 1, borderStyle: "dashed" },
});
