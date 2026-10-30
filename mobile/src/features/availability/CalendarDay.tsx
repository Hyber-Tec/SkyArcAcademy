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

/** Available days' green: the schedule's confirmed green, a little stronger on black so it reads beside the red. */
const GREEN_ON_DARK = "#22c55e40";
/**
 * Not available days' red (the owner, 2026-10-29: a grey day couldn't be told from a day not set yet): the schedule's
 * canceled red, its fill and its number, a little stronger on black.
 */
const RED = { fill: "#fee2e2", text: "#b91c1c" };
const RED_ON_DARK = { fill: "#ef444447", text: "#fecaca" };

/** The circle's size at most, and the room under it for the "not set yet" dot. */
const CIRCLE = 42;
const DOT_ROOM = 10;

/**
 * One day of the availability calendar, as clean as the owner's True Education design: only its number, in a light
 * green circle when the coach is available, a light red one when they marked it not available, plain when nothing is set
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
  const dark = useIsDark();
  const green = dark ? GREEN_ON_DARK : status.confirmed.bg;
  const red = dark ? RED_ON_DARK : RED;
  const { mark, isToday, isPast, needs } = look;
  const size = Math.max(28, Math.min(CIRCLE, width - 6, height - DOT_ROOM - 4));
  const fill = mark === "available" ? green : mark === "unavailable" ? red.fill : "transparent";
  const faded = isPast || mark === "closed";
  const color = isToday ? colors.brandText : mark === "unavailable" ? red.text : colors.foreground;
  const state = mark === "closed" ? "closed" : mark === "available" ? `available ${look.times}` : mark === "unavailable" ? "not available" : needs ? "not set yet" : "not set";
  return (
    <Pressable
      onPress={() => onPress(date)}
      accessibilityRole="button"
      accessibilityLabel={`${formatDateKey(date, "weekdayLong")}${isToday ? ", today" : ""}: ${state}`}
      testID={`day-${date}`}
      style={({ pressed }) => [styles.cell, { width, height }, pressed && mark !== "closed" && styles.pressed]}
    >
      {/* Made again when its fill changes (a day's times load after it's drawn): on Android a fill that comes after a
          circle is first drawn is drawn square. */}
      <View key={fill} style={[styles.circle, { width: size, height: size, backgroundColor: fill }, faded && styles.faded]}>
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
  const dark = useIsDark();
  const green = dark ? GREEN_ON_DARK : status.confirmed.bg;
  if (mark === "needs") return <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />;
  return <View style={[styles.legendCircle, { backgroundColor: mark === "available" ? green : (dark ? RED_ON_DARK : RED).fill }]} />;
}

const styles = StyleSheet.create({
  cell: { alignItems: "center", justifyContent: "center", paddingTop: DOT_ROOM / 2 },
  pressed: { opacity: 0.6 },
  circle: { alignItems: "center", justifyContent: "center", borderRadius: radius.full },
  faded: { opacity: 0.45 },
  number: { fontSize: 17, fontWeight: "500", fontVariant: ["tabular-nums"] },
  today: { fontWeight: "700" },
  dotRoom: { height: DOT_ROOM, alignItems: "center", justifyContent: "center" },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  legendCircle: { width: 14, height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  legendDot: { width: 6, height: 6, borderRadius: 3, marginHorizontal: 4 },
});
