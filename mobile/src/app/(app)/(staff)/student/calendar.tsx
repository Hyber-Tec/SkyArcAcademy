import { dayHours } from "@shared/availability";
import { SESSION_STATUSES, SESSION_STATUS_LABELS } from "@shared/schedule/status";
import { type DateKey, addDays, endOfMonth, formatDateKey } from "@shared/time";
import * as Haptics from "expo-haptics";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { ChevronRight, UserRoundX } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { ListRow, ListSection } from "@/components/List";
import { MonthScroller, type MonthScrollerHandle, WeekdayHeader } from "@/components/MonthScroller";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type SessionDoc, useAcademyNow, useStudent } from "@/features/data/hooks";
import { longDay, plural, shortDay, timeRange } from "@/features/schedule/format";
import { useDayConfigsBetween, useLoadWindow, useStudentClassesBetween } from "@/features/students/calendar";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors, useStatusColors } from "@/theme";

/** The clean months' title and the space under a month (src/components/MonthScroller.tsx): the box holds one whole month. */
const MONTH_TITLE = 56;
const MONTH_GAP = 16;
/** Marks a day shows; more read "+2". */
const MARKS = 3;

/**
 * A student's classes month by month (the website's Student page → Calendar), opened from their page by the student's
 * ID, as the family's Classes tab shows its months (src/features/family/ClassMonth.tsx): the months scroll vertically
 * like the phone's Calendar (permanent rule: never a month with ‹ › arrows), each day with its number (today in the
 * academy's red, the chosen day in a filled circle, a closed day greyed) and a dot per class in its status's colour (a
 * canceled one an open ring). Under the months, the chosen day's classes; each opens the class. The office and coaches
 * alike see every class (classes are taught together). Changes are made on the website.
 */
export default function StudentCalendarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { settings } = useBranch();
  const colors = useColors();
  const status = useStatusColors();
  const { height } = useWindowDimensions();
  // Smaller weeks on a smaller phone, so the chosen day's classes keep room under the months.
  const rowHeight = height >= 800 ? 46 : height >= 700 ? 42 : 38;
  const hour12 = settings.general.timeFormat !== "24h";
  const { today } = useAcademyNow();
  // Fixed once open: a new day at midnight doesn't move the months under the person's finger.
  const [anchor] = useState(today);
  const [selected, setSelected] = useState<DateKey>(anchor);
  const scroller = useRef<MonthScrollerHandle>(null);
  const panel = useRef<ScrollView>(null);
  const student = useStudent(id ?? null);
  const { from, to, onVisibleRangeChange } = useLoadWindow(anchor);
  // The months on screen, for Today when today's isn't among them.
  const [onScreen, setOnScreen] = useState<{ from: DateKey; to: DateKey } | null>(null);
  const onVisible = useCallback(
    (a: DateKey, b: DateKey) => {
      setOnScreen({ from: a, to: b });
      onVisibleRangeChange(a, b);
    },
    [onVisibleRangeChange],
  );
  const classes = useStudentClassesBetween(id ?? null, from, to);
  const dayConfigs = useDayConfigsBetween(from, to);
  // The chosen day once the months have moved far from it.
  const away = selected < from || selected > to;
  const chosenDay = useStudentClassesBetween(away ? (id ?? null) : null, selected, selected);
  const chosenHours = useDayConfigsBetween(away ? selected : null, selected);

  const byDay = useMemo(() => {
    const map = new Map<DateKey, SessionDoc[]>();
    for (const s of classes.data) map.set(s.dateKey, [...(map.get(s.dateKey) ?? []), s]);
    return map;
  }, [classes.data]);
  const closed = useCallback((d: DateKey) => !dayHours(d, settings, dayConfigs).isOpen, [settings, dayConfigs]);
  const labelOf = useCallback(
    (d: DateKey) => {
      const list = byDay.get(d) ?? [];
      const what = list.length
        ? `${plural(list.length, "class", "classes")}: ${list.map((s) => `${timeRange(s.startMin, s.endMin, hour12)} ${SESSION_STATUS_LABELS[s.status]}`).join(", ")}`
        : "no classes";
      return `${[formatDateKey(d, "weekdayLong"), d === today ? "today" : null, closed(d) ? "the academy is closed" : null].filter(Boolean).join(", ")}: ${what}`;
    },
    [byDay, hour12, today, closed],
  );
  const choose = useCallback((d: DateKey) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setSelected(d);
  }, []);
  const go = (d: DateKey) => {
    setSelected(d);
    scroller.current?.scrollToDate(d);
  };
  // A new day's classes start at the top of the space under the months.
  useEffect(() => {
    panel.current?.scrollTo({ y: 0, animated: false });
  }, [selected]);

  const renderDay = useCallback(
    (d: DateKey, size: { width: number; height: number }) => (
      <MonthDay date={d} width={size.width} height={size.height} classes={byDay.get(d) ?? []} on={d === selected} isToday={d === today} closed={closed(d)} label={labelOf(d)} onPress={choose} />
    ),
    [byDay, selected, today, closed, labelOf, choose],
  );
  // A month is drawn again only when what its days show changes.
  const monthSignature = useCallback(
    (month: DateKey) => {
      const key = month.slice(0, 7);
      const days = Number(endOfMonth(month).slice(8));
      let sig = `${colors.foreground}|${selected.startsWith(key) ? selected : ""}|${today.startsWith(key) ? today : ""}|${hour12 ? 12 : 24}`;
      for (let i = 0; i < days; i++) {
        const d = addDays(month, i);
        sig += `;${closed(d) ? 1 : 0}`;
        for (const s of byDay.get(d) ?? []) sig += `${s.id}${s.status}${s.startMin}-${s.endMin}`;
      }
      return sig;
    },
    [colors.foreground, selected, today, hour12, closed, byDay],
  );

  const header = (
    <Stack.Screen
      options={{
        headerShown: true,
        title: "Calendar",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.grouped },
        headerTintColor: colors.foreground,
        headerBackButtonDisplayMode: "minimal",
        contentStyle: { backgroundColor: colors.grouped },
      }}
    />
  );
  if (!student.loading && !student.data) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="student-calendar">
        {header}
        <EmptyState icon={<UserRoundX size={26} color={colors.mutedForeground} />} title="This student isn’t in the academy’s list" text="They may have been removed on the website." />
      </View>
    );
  }

  const s = student.data;
  const first = s ? s.firstName || s.name.split(/\s+/)[0] : "";
  const day = away ? chosenDay.data : (byDay.get(selected) ?? []);
  const hours = dayHours(selected, settings, away ? chosenHours : dayConfigs);
  const isClosed = !hours.isOpen;
  const loading = away ? chosenDay.loading : classes.loading && !classes.data.length;
  const failed = away ? !!chosenDay.error && !chosenDay.data.length : !!classes.error && !classes.data.length;
  // The next day with a class (not canceled) among the months loaded, for a day without one.
  const next = away ? null : ([...byDay.entries()].filter(([d, list]) => d > selected && list.some((c) => c.status !== "canceled")).sort(([a], [b]) => a.localeCompare(b))[0] ?? null);
  const nextClass = next ? (next[1].find((c) => c.status !== "canceled") ?? null) : null;
  const todayAway = selected !== today || (!!onScreen && (today < onScreen.from || today > onScreen.to));

  return (
    <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="student-calendar">
      {header}
      <T variant="small" tone="muted" style={styles.caption} numberOfLines={1}>
        {s ? `${first}’s classes` : " "}
      </T>
      <View style={[styles.months, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <WeekdayHeader />
        <View style={{ height: MONTH_TITLE + 6 * rowHeight + MONTH_GAP }}>
          <MonthScroller
            ref={scroller}
            anchor={anchor}
            rowHeight={rowHeight}
            variant="clean"
            renderDay={renderDay}
            monthSignature={monthSignature}
            onVisibleRangeChange={onVisible}
            testID="student-calendar-months"
          />
        </View>
      </View>
      <ScrollView ref={panel} style={styles.fill} contentContainerStyle={styles.panel} testID="student-calendar-panel">
        <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {SESSION_STATUSES.map((k) => (
            <View key={k} style={styles.legendItem}>
              <View style={[styles.mark, k === "canceled" ? { borderWidth: 1, borderColor: status[k].bar } : { backgroundColor: status[k].bar }]} />
              <T variant="tiny" tone="muted">
                {SESSION_STATUS_LABELS[k]}
              </T>
            </View>
          ))}
        </View>
        <View style={styles.dayHead}>
          <View style={styles.grow}>
            <T variant="heading" testID="student-calendar-day-title">
              {longDay(selected)}
            </T>
            <T variant="small" tone="muted">
              {[selected === today ? "Today" : null, isClosed ? "The academy is closed" : `Open ${timeRange(hours.openMin, hours.closeMin, hour12)}`, day.length ? plural(day.length, "class", "classes") : null]
                .filter(Boolean)
                .join(" · ")}
            </T>
          </View>
          {todayAway ? (
            <Button variant="outline" size="sm" onPress={() => go(today)} testID="student-calendar-today">
              Today
            </Button>
          ) : null}
        </View>
        {loading ? (
          <SkeletonCards count={1} height={64} />
        ) : failed ? (
          <Card>
            <T variant="label">Couldn’t load the classes</T>
            <T variant="small" tone="muted">
              Check your connection, then try again.
            </T>
          </Card>
        ) : day.length ? (
          <ListSection testID="student-calendar-classes">
            {day.map((c) => (
              <ListRow
                key={c.id}
                icon={<View style={[styles.bar, { backgroundColor: status[c.status].bar }]} />}
                title={timeRange(c.startMin, c.endMin, hour12)}
                subtitle={[SESSION_STATUS_LABELS[c.status], c.note?.trim()].filter(Boolean).join(" · ")}
                onPress={c.classId ? () => router.push({ pathname: "/class/[id]", params: { id: c.classId } }) : undefined}
                testID={`student-calendar-class-${c.id}`}
              />
            ))}
          </ListSection>
        ) : (
          <Card style={styles.none} testID="student-calendar-none">
            <T tone="muted">{isClosed ? "The academy is closed on this day." : "No classes on this day."}</T>
            {next && nextClass ? (
              <Pressable
                onPress={() => go(next[0])}
                accessibilityRole="button"
                accessibilityLabel={`The next class: ${shortDay(next[0])}, ${timeRange(nextClass.startMin, nextClass.endMin, hour12)}. Shows that day.`}
                style={({ pressed }) => [styles.next, pressed && { opacity: 0.6 }]}
                testID="student-calendar-next"
              >
                <T variant="small" style={styles.nextText}>
                  {`Next class: ${shortDay(next[0])}, ${timeRange(nextClass.startMin, nextClass.endMin, hour12)}`}
                </T>
                <ChevronRight size={15} color={colors.foreground} />
              </Pressable>
            ) : null}
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

/** One day on the months: its number, and a dot per class under it in its status's colour (canceled: an open ring). */
function MonthDay({
  date,
  width,
  height,
  classes,
  on,
  isToday,
  closed,
  label,
  onPress,
}: {
  date: DateKey;
  width: number;
  height: number;
  classes: SessionDoc[];
  on: boolean;
  isToday: boolean;
  closed: boolean;
  label: string;
  onPress: (date: DateKey) => void;
}) {
  const colors = useColors();
  const status = useStatusColors();
  const circle = Math.max(24, Math.min(32, height - 14, width - 6));
  const fill = on ? (isToday ? colors.brandSolid : colors.primary) : "transparent";
  const fg = on ? (isToday ? "#ffffff" : colors.primaryForeground) : isToday ? colors.brandText : closed ? colors.mutedForeground : colors.foreground;
  const few = classes.length > MARKS ? classes.slice(0, MARKS - 1) : classes;
  return (
    <Pressable
      onPress={() => onPress(date)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      testID={`student-calendar-day-${date}`}
      style={({ pressed }) => [styles.cell, { width, height }, pressed && !on && styles.pressed]}
    >
      <View style={[styles.circle, { width: circle, height: circle, borderRadius: radius.full, backgroundColor: fill }]}>
        <Text allowFontScaling={false} style={[styles.number, { color: fg }, (on || isToday) && styles.bold, closed && !on && styles.faded]}>
          {Number(date.slice(8))}
        </Text>
      </View>
      <View style={styles.marks}>
        {few.map((c) => (
          <View key={c.id} style={[styles.mark, c.status === "canceled" ? { borderWidth: 1, borderColor: status.canceled.bar } : { backgroundColor: status[c.status].bar }]} />
        ))}
        {classes.length > MARKS ? (
          <Text allowFontScaling={false} style={[styles.more, { color: colors.mutedForeground }]}>
            {`+${classes.length - few.length}`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, gap: 2 },
  caption: { paddingHorizontal: space.lg + space.xs, paddingTop: space.sm, paddingBottom: space.sm },
  months: { marginHorizontal: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  panel: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  dayHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  none: { gap: space.sm },
  next: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  nextText: { fontWeight: "600" },
  bar: { width: 5, alignSelf: "stretch", borderRadius: 3, minHeight: 32 },
  cell: { alignItems: "center", justifyContent: "center", gap: 3 },
  pressed: { opacity: 0.6 },
  circle: { alignItems: "center", justifyContent: "center" },
  number: { fontSize: 16, fontWeight: "500", fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "700" },
  faded: { opacity: 0.55 },
  marks: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, height: 6 },
  mark: { width: 6, height: 6, borderRadius: 3 },
  more: { fontSize: 9, fontWeight: "700", lineHeight: 10 },
});
