import { dayHours } from "@shared/availability";
import { type DateKey, addDays, addMonths, endOfMonth, formatDateKey, startOfMonth } from "@shared/time";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ListSection } from "@/components/List";
import { MonthScroller, type MonthScrollerHandle, WeekdayHeader } from "@/components/MonthScroller";
import { SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { type SessionDoc, useDayConfigs } from "@/features/data/hooks";
import { groupClasses } from "@/features/schedule/classes";
import { clock, plural, shortDay, timeRange } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors, useIsDark } from "@/theme";
import { FamilyClassRow } from "./ClassCards";
import { useFamilySessions } from "./data";
import { useFamily } from "./FamilyProvider";
import { dayHeading, hasEnded } from "./format";
import { useChildColor } from "./tints";

/** The clean months' title and the space under a month (src/components/MonthScroller.tsx): the box holds one whole month. */
const MONTH_TITLE = 56;
const MONTH_GAP = 16;
/** Marks a day shows; more read "+2". */
const MARKS = 3;

/** A class on a day: whose (the child's colour), canceled (an open ring) or over (fainter). */
interface Mark {
  id: string;
  color: string;
  canceled: boolean;
  ended: boolean;
}

/**
 * The family's classes on the months, scrolling vertically like the phone's Calendar (permanent rule: never a month with
 * ‹ › arrows), as the website's month view (web/src/features/family/FamilyMonthCalendar.tsx): each day its number (today
 * in the academy's red, the chosen day in a filled circle, a closed day greyed) and a mark per class, in the child's
 * colour when a parent has several children. Under the months, the chosen day's classes as the list shows them; each
 * opens its sheet. The same classes as the list, one query per child for the months near the screen.
 */
export function FamilyClassMonth({
  selected,
  onSelect,
  today,
  nowMin,
  hour12,
}: {
  /** The chosen day (today until one is chosen). */
  selected: DateKey;
  /** A day chosen; null goes back to following today. */
  onSelect: (day: DateKey | null) => void;
  today: DateKey;
  nowMin: number;
  hour12: boolean;
}) {
  const family = useFamily();
  const { settings } = useBranch();
  const colors = useColors();
  const dark = useIsDark();
  const colorOf = useChildColor();
  const { height } = useWindowDimensions();
  // Smaller weeks on a smaller phone, so the chosen day's classes keep room under the months.
  const rowHeight = height >= 800 ? 46 : height >= 700 ? 42 : 38;
  const scroller = useRef<MonthScrollerHandle>(null);
  const panel = useRef<ScrollView>(null);
  const [anchor] = useState(selected);

  // The classes of the months on screen and two either side; the window moves once the months leave it.
  const [win, setWin] = useState(() => ({ from: startOfMonth(addMonths(anchor, -2)), to: endOfMonth(addMonths(anchor, 2)) }));
  // The months on screen, for Today when today's isn't among them.
  const [onScreen, setOnScreen] = useState<{ from: DateKey; to: DateKey } | null>(null);
  const onVisibleRangeChange = useCallback((from: DateKey, to: DateKey) => {
    setOnScreen({ from, to });
    setWin((w) => (from >= w.from && to <= w.to ? w : { from: startOfMonth(addMonths(from, -2)), to: endOfMonth(addMonths(to, 2)) }));
  }, []);
  const sessions = useFamilySessions(family.ids, win.from, win.to, true);
  // The chosen day once the months have moved far from it.
  const away = selected < win.from || selected > win.to;
  const chosenDay = useFamilySessions(away ? family.ids : [], selected, selected);
  // The academy's closed days; the last ones known stay while a new window loads.
  const configs = useDayConfigs(win.from, win.to);
  const [dayMap, setDayMap] = useState(configs.map);
  if (!configs.loading && configs.map !== dayMap) setDayMap(configs.map);

  const shown = useMemo(() => new Set(family.shown), [family.shown]);
  const byDay = useMemo(() => {
    const map = new Map<DateKey, SessionDoc[]>();
    for (const s of sessions.data) if (shown.has(s.studentId)) map.set(s.dateKey, [...(map.get(s.dateKey) ?? []), s]);
    return map;
  }, [sessions.data, shown]);
  const closed = useCallback((d: DateKey) => !dayHours(d, settings, dayMap).isOpen, [settings, dayMap]);
  const marksOf = useCallback(
    (d: DateKey): Mark[] =>
      (byDay.get(d) ?? []).map((s) => ({ id: s.id, color: colorOf(s.studentId) ?? colors.foreground, canceled: s.status === "canceled", ended: hasEnded(s, today, nowMin) })),
    [byDay, colorOf, colors.foreground, today, nowMin],
  );
  const labelOf = useCallback(
    (d: DateKey) => {
      const list = byDay.get(d) ?? [];
      const what = list.length
        ? `${plural(list.length, "class", "classes")}: ${list
            .map((s) => [family.several ? family.firstName(s.studentId, s.studentName) : null, clock(s.startMin, hour12), s.status === "canceled" ? "canceled" : null].filter(Boolean).join(" "))
            .join(", ")}`
        : "no classes";
      return `${[formatDateKey(d, "weekdayLong"), d === today ? "today" : null, closed(d) ? "the academy is closed" : null].filter(Boolean).join(", ")}: ${what}`;
    },
    [byDay, family, hour12, today, closed],
  );

  const choose = useCallback(
    (d: DateKey) => {
      void Haptics.selectionAsync().catch(() => undefined);
      onSelect(d === today ? null : d);
    },
    [onSelect, today],
  );
  const go = (d: DateKey) => {
    onSelect(d === today ? null : d);
    scroller.current?.scrollToDate(d);
  };
  // A new day's classes start at the top of the space under the months.
  useEffect(() => {
    panel.current?.scrollTo({ y: 0, animated: false });
  }, [selected]);

  const renderDay = useCallback(
    (d: DateKey, size: { width: number; height: number }) => (
      <MonthDay date={d} width={size.width} height={size.height} marks={marksOf(d)} on={d === selected} isToday={d === today} closed={closed(d)} label={labelOf(d)} onPress={choose} />
    ),
    [marksOf, selected, today, closed, labelOf, choose],
  );
  // A month is drawn again only when what its days show changes.
  const monthSignature = useCallback(
    (month: DateKey) => {
      const key = month.slice(0, 7);
      const days = Number(endOfMonth(month).slice(8));
      let sig = `${dark ? "d" : "l"}|${selected.startsWith(key) ? selected : ""}|${today.startsWith(key) ? today : ""}|${hour12 ? 12 : 24}`;
      for (let i = 0; i < days; i++) {
        const d = addDays(month, i);
        sig += `;${closed(d) ? 1 : 0}`;
        for (const m of marksOf(d)) sig += `${m.id}${m.color}${m.canceled ? 1 : 0}${m.ended ? 1 : 0}`;
      }
      return sig;
    },
    [dark, selected, today, hour12, closed, marksOf],
  );

  const daySessions = away ? chosenDay.data.filter((s) => shown.has(s.studentId)) : (byDay.get(selected) ?? []);
  const groups = groupClasses(daySessions);
  const loading = away ? chosenDay.loading : sessions.loading && !sessions.data.length;
  const failed = away ? !!chosenDay.error && !chosenDay.data.length : !!sessions.error && !sessions.data.length;
  const isClosed = closed(selected);
  // The next day with a class (not canceled), for a day without one.
  const next = useMemo(() => {
    if (away) return null;
    return [...byDay.entries()].filter(([d, list]) => d > selected && list.some((s) => s.status !== "canceled")).sort(([a], [b]) => a.localeCompare(b))[0] ?? null;
  }, [byDay, selected, away]);
  const nextClass = next ? groupClasses(next[1].filter((s) => s.status !== "canceled"))[0] : null;
  const active = groups.filter((g) => g.active.length > 0).length;
  const todayAway = selected !== today || (!!onScreen && (today < onScreen.from || today > onScreen.to));

  return (
    <View style={styles.fill}>
      <View style={[styles.months, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <WeekdayHeader />
        <View style={{ height: MONTH_TITLE + 6 * rowHeight + MONTH_GAP }}>
          <MonthScroller
            ref={scroller}
            anchor={anchor}
            rowHeight={rowHeight}
            variant="clean"
            monthsBefore={12}
            monthsAfter={6}
            maxMonthsAfter={12}
            renderDay={renderDay}
            monthSignature={monthSignature}
            onVisibleRangeChange={onVisibleRangeChange}
            testID="family-month"
          />
        </View>
      </View>
      <ScrollView ref={panel} style={styles.fill} contentContainerStyle={styles.panel} contentInsetAdjustmentBehavior="automatic" testID="family-month-panel">
        <Legend />
        <View style={styles.dayHead}>
          <View style={styles.grow}>
            <T variant="heading" testID="family-month-day-title">
              {dayHeading(selected, today)}
            </T>
            {isClosed || active ? (
              <T variant="small" tone="muted">
                {[isClosed ? "The academy is closed" : null, active ? plural(active, "class", "classes") : null].filter(Boolean).join(" · ")}
              </T>
            ) : null}
          </View>
          {todayAway ? (
            <Button variant="outline" size="sm" onPress={() => go(today)} testID="family-month-today">
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
        ) : groups.length ? (
          <ListSection testID="family-month-classes">
            {groups.map((g) => (
              <FamilyClassRow
                key={g.id}
                group={g}
                when={{ today, nowMin, hour12 }}
                onPress={() => router.push({ pathname: "/session/[id]", params: { id: g.sessions[0].id } })}
                testID={`family-month-class-${g.sessions[0].id}`}
              />
            ))}
          </ListSection>
        ) : (
          <Card style={styles.none} testID="family-month-none">
            <T tone="muted">{isClosed ? "The academy is closed on this day." : "No classes on this day."}</T>
            {next && nextClass ? (
              <Pressable
                onPress={() => go(next[0])}
                accessibilityRole="button"
                accessibilityLabel={`The next class: ${shortDay(next[0])}, ${timeRange(nextClass.startMin, nextClass.endMin, hour12)}. Shows that day.`}
                style={({ pressed }) => [styles.next, pressed && { opacity: 0.6 }]}
                testID="family-month-next"
              >
                <T variant="small" style={styles.nextText}>
                  {`Next class: ${dayHeading(next[0], today)}, ${timeRange(nextClass.startMin, nextClass.endMin, hour12)}`}
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

/** One day on the months: its number, and a mark per class under it. */
function MonthDay({
  date,
  width,
  height,
  marks,
  on,
  isToday,
  closed,
  label,
  onPress,
}: {
  date: DateKey;
  width: number;
  height: number;
  marks: Mark[];
  on: boolean;
  isToday: boolean;
  closed: boolean;
  label: string;
  onPress: (date: DateKey) => void;
}) {
  const colors = useColors();
  const circle = Math.max(24, Math.min(32, height - 14, width - 6));
  const fill = on ? (isToday ? colors.brandSolid : colors.primary) : "transparent";
  const fg = on ? (isToday ? "#ffffff" : colors.primaryForeground) : isToday ? colors.brandText : closed ? colors.mutedForeground : colors.foreground;
  const few = marks.length > MARKS ? marks.slice(0, MARKS - 1) : marks;
  return (
    <Pressable
      onPress={() => onPress(date)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      testID={`family-month-day-${date}`}
      style={({ pressed }) => [styles.cell, { width, height }, pressed && !on && styles.pressed]}
    >
      <View style={[styles.circle, { width: circle, height: circle, borderRadius: radius.full, backgroundColor: fill }]}>
        <Text allowFontScaling={false} style={[styles.number, { color: fg }, (on || isToday) && styles.bold, closed && !on && styles.faded]}>
          {Number(date.slice(8))}
        </Text>
      </View>
      <View style={styles.marks}>
        {few.map((m) => (
          <View key={m.id} style={[styles.mark, m.canceled ? { borderWidth: 1, borderColor: m.color } : { backgroundColor: m.color }, m.ended && !m.canceled && styles.ended]} />
        ))}
        {marks.length > MARKS ? (
          <Text allowFontScaling={false} style={[styles.more, { color: colors.mutedForeground }]}>
            {`+${marks.length - few.length}`}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** What the marks mean: each child's colour (a parent with several children), or a class; an open ring, canceled. */
function Legend() {
  const { several, shown, firstName } = useFamily();
  const colors = useColors();
  const colorOf = useChildColor();
  const items = several ? shown.map((id) => ({ key: id, label: firstName(id), color: colorOf(id) ?? colors.foreground })) : [{ key: "class", label: "Class", color: colors.foreground }];
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="family-month-legend">
      {items.map((i) => (
        <View key={i.key} style={styles.legendItem}>
          <View style={[styles.mark, { backgroundColor: i.color }]} />
          <T variant="tiny" tone="muted">
            {i.label}
          </T>
        </View>
      ))}
      <View style={styles.legendItem}>
        <View style={[styles.mark, { borderWidth: 1, borderColor: colors.mutedForeground }]} />
        <T variant="tiny" tone="muted">
          Canceled
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grow: { flex: 1, gap: 2 },
  months: { marginHorizontal: space.lg, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  panel: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  dayHead: { flexDirection: "row", alignItems: "center", gap: space.md },
  none: { gap: space.sm },
  next: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  nextText: { fontWeight: "600" },
  cell: { alignItems: "center", justifyContent: "center", gap: 3 },
  pressed: { opacity: 0.6 },
  circle: { alignItems: "center", justifyContent: "center" },
  number: { fontSize: 16, fontWeight: "500", fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "700" },
  faded: { opacity: 0.55 },
  marks: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, height: 6 },
  mark: { width: 6, height: 6, borderRadius: 3 },
  ended: { opacity: 0.45 },
  more: { fontSize: 9, fontWeight: "700", lineHeight: 10 },
  legend: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space.md },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
});
