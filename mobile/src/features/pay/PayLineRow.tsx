import { PAY_LINE_LABELS } from "@shared/pay/lines";
import { formatMoney } from "@shared/pay/segment";
import { minutesOf } from "@shared/time";
import { StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { ListRow } from "@/components/List";
import { T } from "@/components/Text";
import { clock, plural, timeRange } from "@/features/schedule/format";
import { space } from "@/theme";
import type { OwnPayLine } from "./data";

/**
 * One record of pay, as the website's Payroll lists it: its type (Classes, Teaching or Admin, coloured as there), the
 * time in the academy's zone, the students of a block of classes, the hours at the rate, and what it pays. A time entry
 * still clocked in shows when it began; it's paid once it's clocked out.
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
  const { segment: s, students } = line;
  const time = timeRange(minutesOf(s.startMs, timezone), minutesOf(s.endMs, timezone), hour12);
  const detail = [students !== null ? plural(students, "student") : null, `${s.hours.toFixed(2)} h × ${formatMoney(s.rate)}`].filter(Boolean).join(" · ");
  return (
    <ListRow
      divider={divider}
      testID={testID}
      accessibilityLabel={`${PAY_LINE_LABELS[line.type]}, ${time}, ${detail.replace(" × ", " at ")}, ${formatMoney(s.pay)}`}
      title={
        <View style={styles.head}>
          <Badge tone={line.type === "admin" ? "info" : "success"} style={styles.badge}>
            {PAY_LINE_LABELS[line.type]}
          </Badge>
          <T variant="label" style={styles.nums} numberOfLines={1}>
            {time}
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
