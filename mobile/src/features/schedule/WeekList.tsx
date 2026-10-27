import { type DateKey, WEEKDAY_SHORT, weekdayOf } from "@shared/time";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { Hatch } from "@/components/Hatch";
import { T } from "@/components/Text";
import type { EventDoc, StudentDoc, useClassesBetween } from "@/features/data/hooks";
import { radius, space, useColors } from "@/theme";
import { ClassCard } from "./ClassCard";
import { longDay, monthDay, plural, weekdayName } from "./format";
import { EventChips, type StaffLook, WhosIn } from "./parts";

type Group = { kind: "open"; dateKey: DateKey } | { kind: "closed"; days: DateKey[] };

/**
 * The week as the website's Week lays it out on a phone (web/src/features/schedule/WeekGrid.tsx): each open day in turn,
 * with its date (today marked) and its open seats, its events and who's in, then its classes as the sheets draw them
 * (ClassCard); closed days in a row fold into one quiet marker ("Fri–Sat closed"). A day's heading opens it in the Day
 * view.
 */
export function WeekList({
  days,
  data,
  eventsOn,
  today,
  nowMin,
  hour12,
  me,
  look,
  studentOf,
  clockedIn,
  onOpenDay,
}: {
  days: readonly DateKey[];
  data: ReturnType<typeof useClassesBetween>;
  eventsOn: (d: DateKey) => EventDoc[];
  today: DateKey;
  nowMin: number;
  hour12: boolean;
  /** The coach looking (null for the office): their classes stand out. */
  me: string | null;
  look: StaffLook;
  studentOf: (id: string) => StudentDoc | undefined;
  /** Today's who's clocked in, for the office. */
  clockedIn?: (staffId: string) => number | null;
  onOpenDay: (d: DateKey) => void;
}) {
  const groups: Group[] = [];
  for (const d of days) {
    const open = data.hoursOf(d).isOpen || (data.byDate.get(d) ?? []).length > 0;
    const last = groups[groups.length - 1];
    if (open) groups.push({ kind: "open", dateKey: d });
    else if (last?.kind === "closed") last.days.push(d);
    else groups.push({ kind: "closed", days: [d] });
  }
  return (
    <View style={styles.week} testID="schedule-week">
      {groups.map((g) =>
        g.kind === "open" ? (
          <WeekDay
            key={g.dateKey}
            dateKey={g.dateKey}
            data={data}
            events={eventsOn(g.dateKey)}
            today={today}
            nowMin={nowMin}
            hour12={hour12}
            me={me}
            look={look}
            studentOf={studentOf}
            clockedIn={g.dateKey === today ? clockedIn : undefined}
            onOpen={() => onOpenDay(g.dateKey)}
          />
        ) : (
          <ClosedDays key={g.days[0]} days={g.days} />
        ),
      )}
    </View>
  );
}

function WeekDay({
  dateKey,
  data,
  events,
  today,
  nowMin,
  hour12,
  me,
  look,
  studentOf,
  clockedIn,
  onOpen,
}: {
  dateKey: DateKey;
  data: ReturnType<typeof useClassesBetween>;
  events: EventDoc[];
  today: DateKey;
  nowMin: number;
  hour12: boolean;
  me: string | null;
  look: StaffLook;
  studentOf: (id: string) => StudentDoc | undefined;
  clockedIn?: (staffId: string) => number | null;
  onOpen: () => void;
}) {
  const colors = useColors();
  const classes = data.byDate.get(dateKey) ?? [];
  const open = classes.reduce((n, v) => n + Math.max(0, v.c.seats - v.taken), 0);
  const isToday = dateKey === today;
  const seats = classes.length ? (open ? `${open} open` : "Full") : null;
  return (
    <View style={styles.day} testID={`schedule-week-${dateKey}`}>
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${isToday ? "Today, " : ""}${longDay(dateKey)}${classes.length ? `, ${plural(classes.length, "class", "classes")}` : ""}${seats ? `, ${open ? plural(open, "open seat") : "full"}` : ""}`}
        accessibilityHint="Opens the day"
        style={({ pressed }) => [styles.dayHead, pressed && styles.pressed]}
        testID={`schedule-week-${dateKey}-open`}
      >
        <T variant="subheading" style={isToday ? { color: colors.brandText } : undefined}>
          {weekdayName(dateKey)}
        </T>
        <T variant="small" tone="muted">
          {monthDay(dateKey)}
        </T>
        {isToday ? (
          <View style={[styles.today, { backgroundColor: colors.brandSolid }]}>
            <T variant="tiny" style={styles.todayText}>
              Today
            </T>
          </View>
        ) : null}
        <View style={styles.grow} />
        {seats ? (
          <T variant="tiny" tone="muted" style={styles.figure}>
            {seats}
          </T>
        ) : null}
        <ChevronRight size={16} color={colors.mutedForeground} />
      </Pressable>
      <EventChips events={events} hour12={hour12} />
      <WhosIn people={data.inOn(dateKey)} look={look} me={me} hour12={hour12} clockedIn={clockedIn} testID={`schedule-week-${dateKey}-whos-in`} />
      {classes.length ? (
        <View style={styles.list}>
          {classes.map((v) => (
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
      ) : (
        <View style={[styles.none, { borderColor: colors.border }]}>
          <T variant="small" tone="muted">
            No classes
          </T>
        </View>
      )}
    </View>
  );
}

/** Days the academy is closed in a row ("Fri–Sat closed"): one slim, quiet marker, as on the website. */
function ClosedDays({ days }: { days: DateKey[] }) {
  const colors = useColors();
  const first = WEEKDAY_SHORT[weekdayOf(days[0])];
  const label = days.length > 1 ? `${first}–${WEEKDAY_SHORT[weekdayOf(days[days.length - 1])]}` : first;
  return (
    <View style={[styles.closed, { borderColor: colors.border }]} accessible accessibilityLabel={`${days.map(weekdayName).join(" and ")}: closed`} testID={`schedule-week-closed-${days[0]}`}>
      <Hatch />
      <T variant="small" tone="muted" style={styles.closedText}>
        {label} closed
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  week: { gap: space.xl },
  day: { gap: space.sm },
  dayHead: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 28 },
  pressed: { opacity: 0.6 },
  today: { borderRadius: radius.full, paddingHorizontal: 7, paddingVertical: 1 },
  todayText: { color: "#ffffff", fontWeight: "700" },
  grow: { flex: 1 },
  figure: { fontWeight: "600", fontVariant: ["tabular-nums"] },
  list: { gap: space.md },
  none: { borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", paddingVertical: space.lg, alignItems: "center" },
  closed: { borderRadius: radius.lg, borderWidth: 1, borderStyle: "dashed", paddingVertical: space.sm, alignItems: "center", overflow: "hidden" },
  closedText: { fontWeight: "500" },
});
