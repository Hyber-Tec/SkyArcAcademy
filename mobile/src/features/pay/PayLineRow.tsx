import { PAY_LINE_LABELS } from "@shared/pay/lines";
import { formatMoney } from "@shared/pay/segment";
import { minutesOf } from "@shared/time";
import { StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { ListRow } from "@/components/List";
import { T } from "@/components/Text";
import { clock, timeRange } from "@/features/schedule/format";
import { space } from "@/theme";
import type { OwnPayLine } from "./data";

/**
 * One record of pay, as the website's Payroll lists it: Worked (the paid part of a time entry, its times in the
 * academy's zone, and the clock's own times when they differ: an early clock-in, a clock-out after the last class) or
 * Extra time an admin added (no time of day: why it was added), then the hours at the rate and what it pays. A time
 * entry still clocked in shows when it began; it's paid once it's clocked out.
 */
export function PayLineRow({ line, timezone, hour12, divider = false, testID }: { line: OwnPayLine; timezone: string; hour12: boolean; divider?: boolean; testID?: string }) {
  if (line.open) {
    const since = clock(minutesOf(line.startMs, timezone), hour12);
    return (
      <ListRow
        divider={divider}
        testID={testID}
        accessibilityLabel={`Clocked in since ${since}, paid once you clock out`}
        title={
          <View style={styles.head}>
            <Badge tone="warning" style={styles.badge}>
              Clocked in
            </Badge>
            <T variant="label" style={styles.nums}>
              Since {since}
            </T>
          </View>
        }
        subtitle="Paid once you clock out"
      />
    );
  }
  const { segment: s } = line;
  const extra = line.type === "extra";
  const range = (a: number, b: number) => timeRange(minutesOf(a, timezone), minutesOf(b, timezone), hour12);
  // Extra time has no time of day: its line says why it was added.
  const what = extra ? line.note || "Added by an admin" : range(s.startMs, s.endMs);
  const detail = [line.clocked ? `Clocked ${range(line.clocked.inMs, line.clocked.outMs)}` : null, `${s.hours.toFixed(2)} h × ${formatMoney(s.rate)}`].filter(Boolean).join(" · ");
  return (
    <ListRow
      divider={divider}
      testID={testID}
      accessibilityLabel={`${PAY_LINE_LABELS[line.type]}, ${what}, ${detail.replace(" × ", " at ")}, ${formatMoney(s.pay)}`}
      title={
        <View style={styles.head}>
          <Badge tone={extra ? "info" : "success"} style={styles.badge}>
            {PAY_LINE_LABELS[line.type]}
          </Badge>
          <T variant="label" style={styles.nums} numberOfLines={1}>
            {what}
          </T>
        </View>
      }
      subtitle={detail}
      right={
        <T variant="label" style={styles.nums}>
          {formatMoney(s.pay)}
        </T>
      }
    />
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space.sm, flexShrink: 1 },
  badge: { alignSelf: "center" },
  nums: { fontVariant: ["tabular-nums"], flexShrink: 1 },
});
