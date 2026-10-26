import { type DateKey, startOfMonth } from "@shared/time";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/Button";
import { MonthScroller, type MonthScrollerHandle, WeekdayHeader } from "@/components/MonthScroller";
import { T } from "@/components/Text";
import { ToastHost } from "@/components/ToastHost";
import { radius, space, useColors } from "@/theme";

const ROW = 42;
const YEAR_ROW = 48;

/** Whole months from `a` to `b` (both first-of-month keys). */
const monthsBetween = (a: DateKey, b: DateKey) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));

/**
 * Picks a date from months that scroll vertically (permanent rule: never a month with ‹ › arrows, date pickers
 * included), their weeks from Sunday, in a card over the dimmed app like the Dialog. Dates outside `min`–`max`, or
 * that `isDisabled` refuses, can't be picked. `yearJump`, for far dates (a birthday), as the website's picker has it: the year on screen is a
 * button that shows the years, and picking one brings its months up; they still scroll one by one.
 */
export function DatePickerDialog({
  open,
  title,
  value,
  today,
  min,
  max,
  isDisabled,
  hint,
  yearJump = false,
  onPick,
  onClose,
  testID,
}: {
  open: boolean;
  title: string;
  value: DateKey | null;
  /** The branch's today (marked). */
  today: DateKey;
  min?: DateKey | null;
  max?: DateKey | null;
  isDisabled?: (date: DateKey) => boolean;
  /** A line under the title (what to pick). */
  hint?: string;
  /** A year button for far dates (birthdays): from `min`'s year (else 100 years back) to `max`'s (else 10 ahead). */
  yearJump?: boolean;
  onPick: (date: DateKey) => void;
  onClose: () => void;
  testID?: string;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const anchor = value ?? today;
  const scroller = useRef<MonthScrollerHandle>(null);
  // The month at the top of the list, and the years shown instead of the months; both start afresh at each opening.
  const [topMonth, setTopMonth] = useState<DateKey>(startOfMonth(anchor));
  const [choosingYear, setChoosingYear] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setTopMonth(startOfMonth(anchor));
      setChoosingYear(false);
    }
  }
  const thisYear = Number(today.slice(0, 4));
  const firstYear = Math.min(min ? Number(min.slice(0, 4)) : thisYear - 100, Number(anchor.slice(0, 4)));
  const lastYear = Math.max(max ? Number(max.slice(0, 4)) : thisYear + 10, Number(anchor.slice(0, 4)));
  // How far the months reach from the one the list opens on, so a picked year is always there to jump to.
  const reachBefore = monthsBetween(`${firstYear}-01-01`, startOfMonth(anchor)) + 1;
  const reachAfter = monthsBetween(startOfMonth(anchor), `${lastYear}-12-01`) + 1;

  const renderDay = useCallback(
    (d: DateKey, size: { width: number; height: number }) => {
      const off = (!!min && d < min) || (!!max && d > max) || !!isDisabled?.(d);
      const on = d === value;
      const isToday = d === today;
      return (
        <Pressable
          testID={`pick-${d}`}
          accessibilityRole="button"
          accessibilityState={{ selected: on, disabled: off }}
          accessibilityLabel={d}
          disabled={off}
          onPress={() => onPick(d)}
          style={[styles.day, { width: size.width, height: size.height }]}
        >
          <View style={[styles.circle, on && { backgroundColor: colors.primary }]}>
            <Text style={[styles.number, { color: on ? colors.primaryForeground : off ? colors.border : isToday ? colors.now : colors.foreground }, (on || isToday) && styles.bold]}>{Number(d.slice(8))}</Text>
          </View>
        </Pressable>
      );
    },
    [min, max, isDisabled, value, today, onPick, colors],
  );
  // The days' look depends on these; a new `isDisabled` draws every month again.
  const [disabledRule, setDisabledRule] = useState({ fn: isDisabled, n: 0 });
  if (disabledRule.fn !== isDisabled) setDisabledRule({ fn: isDisabled, n: disabledRule.n + 1 });
  const signature = useCallback(
    (m: DateKey) => `${m}|${value}|${min}|${max}|${today}|${colors.foreground}|${disabledRule.n}`,
    [value, min, max, today, colors.foreground, disabledRule.n],
  );
  const year = Number(topMonth.slice(0, 4));
  const pickYear = (y: number) => {
    setChoosingYear(false);
    scroller.current?.scrollToDate(`${y}-${topMonth.slice(5, 7)}-01`, { animated: false });
  };
  return (
    <Modal visible={open} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: colors.overlay, paddingTop: Math.max(insets.top, space.xl), paddingBottom: Math.max(insets.bottom, space.xl) }]}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} testID={testID}>
          <View style={styles.title}>
            <View style={styles.grow}>
              <T variant="heading">{title}</T>
              {hint ? (
                <T variant="small" tone="muted">
                  {hint}
                </T>
              ) : null}
            </View>
            {yearJump ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={choosingYear ? "Back to the months" : `${year}, choose another year`}
                hitSlop={6}
                onPress={() => setChoosingYear((c) => !c)}
                style={({ pressed }) => [styles.yearButton, { backgroundColor: pressed ? colors.accent : colors.secondary }]}
                testID={testID ? `${testID}-year` : undefined}
              >
                <T variant="label" style={styles.number}>
                  {year}
                </T>
                {choosingYear ? <ChevronUp size={16} color={colors.foreground} /> : <ChevronDown size={16} color={colors.foreground} />}
              </Pressable>
            ) : null}
          </View>
          <View>
            <WeekdayHeader inset={space.md} />
            <View style={styles.months}>
              <MonthScroller
                ref={scroller}
                anchor={anchor}
                rowHeight={ROW}
                variant="compact"
                inset={space.md}
                renderDay={renderDay}
                monthSignature={signature}
                onVisibleRangeChange={yearJump ? (from) => setTopMonth(from) : undefined}
                {...(yearJump ? { monthsAfter: Math.min(12, reachAfter), maxMonthsBefore: reachBefore, maxMonthsAfter: reachAfter } : null)}
              />
            </View>
            {yearJump && choosingYear ? <YearGrid first={firstYear} last={lastYear} current={year} onPick={pickYear} testID={testID ? `${testID}-years` : undefined} /> : null}
          </View>
          <View style={styles.footer}>
            <Button variant="ghost" onPress={onClose}>
              Cancel
            </Button>
          </View>
        </View>
      </View>
      <ToastHost />
    </Modal>
  );
}

/** The years to jump to, four to a row, opened at the one on screen. */
function YearGrid({ first, last, current, onPick, testID }: { first: number; last: number; current: number; onPick: (year: number) => void; testID?: string }) {
  const colors = useColors();
  const scroll = useRef<ScrollView>(null);
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const rows = Array.from({ length: Math.ceil(years.length / 4) }, (_, r) => years.slice(r * 4, r * 4 + 4));
  const at = Math.floor((current - first) / 4);
  // Opens with the current year in the middle, once both the frame and the content are measured (in either order).
  const sizes = useRef<{ frame: number; content: number; landed: boolean }>({ frame: 0, content: 0, landed: false });
  const land = () => {
    const s = sizes.current;
    if (s.landed || !s.frame || !s.content) return;
    s.landed = true;
    const y = Math.min(Math.max(0, at * YEAR_ROW - s.frame / 2 + YEAR_ROW / 2), Math.max(0, s.content - s.frame));
    scroll.current?.scrollTo({ y, animated: false });
  };
  return (
    <ScrollView
      ref={scroll}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.card }]}
      contentContainerStyle={styles.years}
      onLayout={(e) => {
        sizes.current.frame = e.nativeEvent.layout.height;
        land();
      }}
      onContentSizeChange={(_, h) => {
        sizes.current.content = h;
        land();
      }}
      testID={testID}
    >
      {rows.map((row) => (
        <View key={row[0]} style={styles.yearRow}>
          {row.map((y) => {
            const on = y === current;
            return (
              <Pressable
                key={y}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onPick(y)}
                style={({ pressed }) => [styles.year, { backgroundColor: on ? colors.primary : pressed ? colors.accent : "transparent" }]}
                testID={testID ? `${testID}-${y}` : undefined}
              >
                <Text style={[styles.number, { color: on ? colors.primaryForeground : colors.foreground }, on && styles.bold]}>{y}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", paddingHorizontal: space.xl },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, maxWidth: 440, width: "100%", alignSelf: "center", overflow: "hidden", paddingTop: space.xl },
  title: { flexDirection: "row", alignItems: "flex-start", gap: space.md, paddingHorizontal: space.xl, paddingBottom: space.md },
  grow: { flex: 1, gap: 2 },
  yearButton: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: radius.full, paddingHorizontal: space.md, paddingVertical: 6 },
  months: { height: 360 },
  footer: { padding: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "transparent" },
  day: { alignItems: "center", justifyContent: "center" },
  circle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  number: { fontSize: 15, fontVariant: ["tabular-nums"] },
  bold: { fontWeight: "700" },
  years: { paddingHorizontal: space.md, paddingVertical: space.sm },
  yearRow: { flexDirection: "row", height: YEAR_ROW, alignItems: "center" },
  year: { flex: 1, height: 40, marginHorizontal: 4, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
});
