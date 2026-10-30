import { dayHours } from "@shared/availability";
import { type DateKey, addDays, addMonths, endOfMonth, formatDateKey, startOfMonth } from "@shared/time";
import * as Haptics from "expo-haptics";
import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Button } from "@/components/Button";
import { MonthScroller, type MonthScrollerHandle, WeekdayHeader } from "@/components/MonthScroller";
import { T } from "@/components/Text";
import { type SessionDoc, useDayConfigs } from "@/features/data/hooks";
import { clock, plural } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors, useIsDark } from "@/theme";
import { useFamilySessions } from "./data";
import { useFamily } from "./FamilyProvider";
import { hasEnded } from "./format";
import { useMarkColor } from "./tints";

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
 * The family's classes on the months, the whole page scrolling vertically as one, like the phone's Calendar (the owner,
 * 2026-10-29; permanent rule: never a month with ‹ › arrows), as the website's month view
 * (web/src/features/family/FamilyMonthCalendar.tsx): each day its number (today in the academy's red, closed days
 * greyed) and a mark per class under it, in the child's colour when a parent has several children (one child's in the
 * first colour), a canceled class an open ring, a class that's over fainter. A tap on a day opens its sheet
 * (`onOpenDay`: the day's classes, or "No classes", and asking for one), the day filled while it's open. Above the
 * months, what the marks mean, and Today once the months have left today's.
 */
export function FamilyClassMonth({
  today,
  nowMin,
  hour12,
  selected,
  onOpenDay,
}: {
  today: DateKey;
  nowMin: number;
  hour12: boolean;
  /** The day whose sheet is open, filled on the months. */
  selected: DateKey | null;
  onOpenDay: (day: DateKey) => void;
}) {
  const family = useFamily();
  const { settings } = useBranch();
  const dark = useIsDark();
  const markColor = useMarkColor();
  const { height } = useWindowDimensions();
  // Roomy weeks now that the months have the page (an iPhone 15's are 56 points tall).
  const rowHeight = height >= 900 ? 60 : height >= 800 ? 56 : height >= 700 ? 52 : 46;
  const scroller = useRef<MonthScrollerHandle>(null);
  const [anchor] = useState(today);

  // The classes of the months on screen and two either side; the window moves once the months leave it.
  const [win, setWin] = useState(() => ({ from: startOfMonth(addMonths(anchor, -2)), to: endOfMonth(addMonths(anchor, 2)) }));
  // The months on screen, for Today when today's isn't among them.
  const [onScreen, setOnScreen] = useState<{ from: DateKey; to: DateKey } | null>(null);
  const onVisibleRangeChange = useCallback((from: DateKey, to: DateKey) => {
    setOnScreen({ from, to });
    setWin((w) => (from >= w.from && to <= w.to ? w : { from: startOfMonth(addMonths(from, -2)), to: endOfMonth(addMonths(to, 2)) }));
  }, []);
  const sessions = useFamilySessions(family.ids, win.from, win.to, true);
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
    (d: DateKey): Mark[] => (byDay.get(d) ?? []).map((s) => ({ id: s.id, color: markColor(s.studentId), canceled: s.status === "canceled", ended: hasEnded(s, today, nowMin) })),
    [byDay, markColor, today, nowMin],
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

  const open = useCallback(
    (d: DateKey) => {
      void Haptics.selectionAsync().catch(() => undefined);
      onOpenDay(d);
    },
    [onOpenDay],
  );

  const renderDay = useCallback(
    (d: DateKey, size: { width: number; height: number }) => (
      <MonthDay date={d} width={size.width} height={size.height} marks={marksOf(d)} on={d === selected} isToday={d === today} closed={closed(d)} label={labelOf(d)} onPress={open} />
    ),
    [marksOf, selected, today, closed, labelOf, open],
  );
  // A month is drawn again only when what its days show changes.
  const monthSignature = useCallback(
    (month: DateKey) => {
      const key = month.slice(0, 7);
      const days = Number(endOfMonth(month).slice(8));
      let sig = `${dark ? "d" : "l"}|${selected?.startsWith(key) ? selected : ""}|${today.startsWith(key) ? today : ""}|${hour12 ? 12 : 24}`;
      for (let i = 0; i < days; i++) {
        const d = addDays(month, i);
        sig += `;${closed(d) ? 1 : 0}`;
        for (const m of marksOf(d)) sig += `${m.id}${m.color}${m.canceled ? 1 : 0}${m.ended ? 1 : 0}`;
      }
      return sig;
    },
    [dark, selected, today, hour12, closed, marksOf],
  );

  const todayAway = !!onScreen && (today < onScreen.from || today > onScreen.to);

  return (
    <>
      <View style={styles.bar}>
        <Legend />
        {todayAway ? (
          <Button variant="outline" size="sm" onPress={() => scroller.current?.scrollToDate(today)} testID="family-month-today">
            Today
          </Button>
        ) : null}
      </View>
      <WeekdayHeader />
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
    </>
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
  const circle = Math.max(26, Math.min(34, height - 18, width - 8));
  const fill = on ? (isToday ? colors.brandSolid : colors.primary) : "transparent";
  const fg = on ? (isToday ? "#ffffff" : colors.primaryForeground) : isToday ? colors.brandText : closed ? colors.mutedForeground : colors.foreground;
  const few = marks.length > MARKS ? marks.slice(0, MARKS - 1) : marks;
  return (
    <Pressable
      onPress={() => onPress(date)}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      accessibilityHint="Shows the day’s classes"
      testID={`family-month-day-${date}`}
      style={({ pressed }) => [styles.cell, { width, height }, pressed && !on && styles.pressed]}
    >
      {/* Made again when the day is chosen: on Android a fill that comes after a circle is first drawn is drawn square. */}
      <View key={fill} style={[styles.circle, { width: circle, height: circle, borderRadius: radius.full, backgroundColor: fill }]}>
        <Text allowFontScaling={false} style={[styles.number, { color: fg }, (on || isToday) && styles.bold, closed && !on && styles.faded]}>
          {Number(date.slice(8))}
        </Text>
      </View>
      <View style={styles.marks}>
        {few.map((m) => (
          <View key={m.id} style={[styles.mark, m.canceled ? { borderWidth: 1.5, borderColor: m.color } : { backgroundColor: m.color }, m.ended && !m.canceled && styles.ended]} />
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
  const markColor = useMarkColor();
  const items = several ? shown.map((id) => ({ key: id, label: firstName(id), color: markColor(id) })) : [{ key: "class", label: "Class", color: markColor("") }];
  return (
    <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="family-month-legend">
      {items.map((i) => (
        <View key={i.key} style={styles.legendItem}>
          <View style={[styles.mark, { backgroundColor: i.color }]} />
          <T variant="small" tone="muted">
            {i.label}
          </T>
        </View>
      ))}
      <View style={styles.legendItem}>
        <View style={[styles.mark, { borderWidth: 1.5, borderColor: colors.mutedForeground }]} />
        <T variant="small" tone="muted">
          Canceled
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // As tall as Today, so the months don't move when it comes and goes.
  bar: { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 36, paddingHorizontal: space.lg, paddingBottom: space.xs },
  cell: { alignItems: "center", justifyContent: "center", gap: 4 },
  pressed: { opacity: 0.6 },
  circle: { alignItems: "center", justifyContent: "center" },
  number: { fontSize: 17, fontWeight: "500", fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "700" },
  faded: { opacity: 0.5 },
  marks: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, height: 8 },
  mark: { width: 7, height: 7, borderRadius: radius.full },
  ended: { opacity: 0.4 },
  more: { fontSize: 9, fontWeight: "700", lineHeight: 10 },
  legend: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space.md, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
});
