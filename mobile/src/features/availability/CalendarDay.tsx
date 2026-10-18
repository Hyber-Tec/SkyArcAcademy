import type { DayMark } from "@shared/availability";
import { type DateKey, formatDateKey } from "@shared/time";
import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, useColors, useIsDark, useStatusColors } from "@/theme";

/** What a day shows on the coach's availability calendar. */
export interface DayLook {
  mark: DayMark;
  isToday: boolean;
  isPast: boolean;
  /** Open, inside the lead time, not locked, and not answered yet (an amber dot). */
  needs: boolean;
  /** Its times, for screen readers ("4:00 – 9:00 PM"). */
  times: string;
}

/** Available days' green: the schedule's confirmed green, a little stronger on black so it reads beside the grey. */
const GREEN_ON_DARK = "#22c55e40";

/** The circle's size at most, and the room under it for the "not set yet" dot. */
const CIRCLE = 42;
const DOT_ROOM = 10;

/**
 * One day of the availability calendar, as clean as the owner's True Education design: only its number, in a light
 * green circle when the coach is available, a grey one when they marked it not available, plain when nothing is set
 * (with an amber dot when it's inside the notice window and still to answer). Closed and past days are light grey (no
 * circle); today's number is the academy's red. A tap opens the day (closed days say so instead).
 */
export const CalendarDay = memo(function CalendarDay({
  date,
  look,
  width,
  height,
  onPress,
}: {
  date: DateKey;
  look: DayLook;
  width: number;
  height: number;
  onPress: (date: DateKey) => void;
}) {
  const colors = useColors();
  const status = useStatusColors();
  const green = useIsDark() ? GREEN_ON_DARK : status.confirmed.bg;
  const { mark, isToday, isPast, needs } = look;
  const size = Math.max(28, Math.min(CIRCLE, width - 6, height - DOT_ROOM - 4));
  // Not available is a grey that shows on the page's grey (the muted one is the page's own colour).
  const fill = mark === "available" ? green : mark === "unavailable" ? colors.border : "transparent";
  const faded = isPast || mark === "closed";
  const color = isToday ? colors.brandText : mark === "unavailable" ? colors.mutedForeground : colors.foreground;
  const state = mark === "closed" ? "closed" : mark === "available" ? `available ${look.times}` : mark === "unavailable" ? "not available" : needs ? "not set yet" : "not set";
  return (
    <Pressable
      onPress={() => onPress(date)}
      accessibilityRole="button"
      accessibilityLabel={`${formatDateKey(date, "weekdayLong")}${isToday ? ", today" : ""}: ${state}`}
      testID={`day-${date}`}
      style={({ pressed }) => [styles.cell, { width, height }, pressed && mark !== "closed" && styles.pressed]}
    >
      <View style={[styles.circle, { width: size, height: size, backgroundColor: fill }, faded && styles.faded]}>
        <Text style={[styles.number, { color }, isToday && styles.today]} allowFontScaling={false}>
          {Number(date.slice(8))}
        </Text>
      </View>
      <View style={styles.dotRoom}>{needs ? <View style={[styles.dot, { backgroundColor: colors.warning }]} /> : null}</View>
    </Pressable>
  );
});

/** The legend's small marks: the same circle as a day's, at a glance. */
export function LegendMark({ mark }: { mark: "available" | "unavailable" | "needs" }) {
  const colors = useColors();
  const status = useStatusColors();
  const green = useIsDark() ? GREEN_ON_DARK : status.confirmed.bg;
  if (mark === "needs") return <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />;
  return (
    <View style={[styles.legendCircle, { backgroundColor: mark === "available" ? green : colors.border }]} />
  );
}

const styles = StyleSheet.create({
  cell: { alignItems: "center", justifyContent: "center", paddingTop: DOT_ROOM / 2 },
  pressed: { opacity: 0.6 },
  // A full radius: with exactly half the size as the radius, Android drew the days' fills as squares.
  circle: { alignItems: "center", justifyContent: "center", borderRadius: radius.full },
  faded: { opacity: 0.45 },
  number: { fontSize: 17, fontWeight: "500", fontVariant: ["tabular-nums"] },
  today: { fontWeight: "700" },
  dotRoom: { height: DOT_ROOM, alignItems: "center", justifyContent: "center" },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  legendCircle: { width: 14, height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  legendDot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 4 },
});
