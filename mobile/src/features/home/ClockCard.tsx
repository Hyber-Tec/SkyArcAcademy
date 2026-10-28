import { type DateKey, addDays, formatDuration } from "@shared/time";
import { Clock } from "lucide-react-native";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { Card } from "@/components/Card";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import type { ClassView } from "@/features/schedule/classes";
import { clock, shortDay } from "@/features/schedule/format";
import { type Colors, space, useColors } from "@/theme";
import { type MyClock, useMyClock } from "./clock";

type Tone = "live" | "warn" | "muted";

/**
 * Where the coach stands with the time clock today, in the website's words (its ClockCard): nothing is clocked here; the
 * clock-in shows as clocked, and the time is the paid time so far (the pay rule's times are the payroll's,
 * docs/DECISIONS.md §23).
 */
function clockState(c: MyClock, todays: readonly ClassView[], today: DateKey, nowMin: number, hour12: boolean): { tone: Tone; title: string; detail: string } {
  const at = (m: number) => clock(m, hour12);
  // The classes in their hours: they're in for them whether or not every student comes (the clock pays the time).
  const current = todays.filter((v) => v.c.startMin <= nowMin && v.c.endMin > nowMin).map((v) => v.c);
  const later = todays.filter((v) => v.c.startMin > nowMin).map((v) => v.c);
  if (c.open) {
    const d = c.open.dateKey;
    const since = d === today ? at(c.open.inMin) : d === addDays(today, -1) ? `yesterday ${at(c.open.inMin)}` : `${shortDay(d)}, ${at(c.open.inMin)}`;
    // Paid time starts shortly before the first class: before that, nothing is said of it.
    const paid = c.todayMinutes >= 1 ? `${formatDuration(c.todayMinutes)} paid so far. ` : "";
    return { tone: "live", title: `Clocked in since ${since}`, detail: `${paid}Clock out at the kiosk when you leave.` };
  }
  const last = c.closed[c.closed.length - 1];
  const next = later[0];
  if (last) {
    return {
      tone: "muted",
      title: `Clocked out at ${last.outMin != null ? at(last.outMin) : "—"}`,
      detail: next ? `${formatDuration(c.todayMinutes)} paid today. Clock in again before ${at(next.startMin)}.` : `${formatDuration(c.todayMinutes)} paid today.`,
    };
  }
  if (current.length) return { tone: "warn", title: "Not clocked in", detail: `Your ${at(current[0].startMin)} class has started. Clock in at the kiosk with your PIN.` };
  if (next) return { tone: "muted", title: "Not clocked in yet", detail: `Your first class is at ${at(next.startMin)}. Clock in at the kiosk with your PIN when you arrive.` };
  return { tone: "muted", title: "Not clocked in today", detail: "Nothing on your schedule today." };
}

function toneColors(colors: Colors, tone: Tone): { bg: string; fg: string } {
  if (tone === "live") return { bg: colors.successTint, fg: colors.success };
  if (tone === "warn") return { bg: colors.warningTint, fg: colors.warning };
  return { bg: colors.secondary, fg: colors.mutedForeground };
}

/**
 * The coach's time clock on Home, as the website's coach Home shows it: clocked in since when (a live dot), clocked out,
 * or a reminder to clock in at the kiosk with their PIN (amber once a class has started), and their paid time this week.
 * `todays` are the classes in the coach's hours today (Home has them; `loading` while it waits for them).
 */
export function ClockCard({ todays, loading, today, nowMin, hour12 }: { todays: readonly ClassView[]; loading: boolean; today: DateKey; nowMin: number; hour12: boolean }) {
  const colors = useColors();
  const c = useMyClock();
  if (c.loading || loading) {
    return (
      <Card style={styles.card} testID="today-clock">
        <Skeleton width={36} height={36} rounded={18} />
        <View style={styles.grow}>
          <Skeleton width="55%" height={14} />
          <Skeleton width="80%" height={12} />
        </View>
      </Card>
    );
  }
  const s = clockState(c, todays, today, nowMin, hour12);
  const tone = toneColors(colors, s.tone);
  const week = formatDuration(c.weekMinutes);
  return (
    <Card style={styles.card} testID="today-clock">
      <View style={[styles.icon, { backgroundColor: tone.bg }]}>
        <Clock size={18} color={tone.fg} />
        {s.tone === "live" ? <LiveDot /> : null}
      </View>
      <View style={styles.grow}>
        <T variant="label" style={s.tone === "warn" ? { color: colors.warning } : undefined} testID="today-clock-title">
          {s.title}
        </T>
        <T variant="small" tone="muted">
          {s.detail}
        </T>
      </View>
      <View style={styles.week}>
        <T variant="label" style={styles.figure}>
          {week}
        </T>
        <T variant="tiny" tone="muted">
          paid this week
        </T>
      </View>
    </Card>
  );
}

/** Clocked in: a green dot that gently pulses on the clock. */
function LiveDot() {
  const colors = useColors();
  const o = useSharedValue(1);
  useEffect(() => {
    o.value = withRepeat(withTiming(0.35, { duration: 900 }), -1, true);
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.live, { backgroundColor: colors.success, borderColor: colors.card }, style]} />;
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  live: { position: "absolute", right: -1, bottom: -1, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  grow: { flex: 1, gap: 2 },
  week: { alignItems: "flex-end", gap: 1 },
  figure: { fontVariant: ["tabular-nums"] },
});
