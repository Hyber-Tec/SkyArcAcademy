import { payLineTotals } from "@shared/pay/lines";
import { describePay } from "@shared/pay/paidTime";
import { type PayPeriod, payPeriodLabel, periodId, recentPeriods } from "@shared/pay/periods";
import { rateMissing } from "@shared/pay/rates";
import { formatMoney } from "@shared/pay/segment";
import { type DateKey, formatDateKey } from "@shared/time";
import { CalendarDays, ChevronDown, TriangleAlert, Wallet } from "lucide-react-native";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Badge } from "@/components/Badge";
import { Card } from "@/components/Card";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { EmptyState } from "@/components/EmptyState";
import { ListRow, ListSection, RowIcon } from "@/components/List";
import { Screen } from "@/components/Screen";
import { Skeleton, SkeletonCards } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { useAcademyNow } from "@/features/data/hooks";
import { type OwnPayLine, useOwnPay } from "@/features/pay/data";
import { PayLineRow } from "@/features/pay/PayLineRow";
import { PeriodDialog } from "@/features/pay/PeriodDialog";
import { shortDay, weekRange } from "@/features/schedule/format";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

/**
 * A coach's own pay (opened from More), with the same records as the website's Payroll: the current pay period at
 * first, or another recent one, or dates of their own; the total pay with its hours, at their one hourly rate (its worked
 * and extra parts when an admin added time); then each record by day, newest first. Pay comes from the kiosk only
 * (docs/DECISIONS.md §23): the note at the end says how, as the academy has it set. Read-only and live, in the academy's
 * time zone.
 */
export default function PayrollScreen() {
  const { settings, staffId, staff, timezone } = useBranch();
  const colors = useColors();
  const { today } = useAcademyNow();
  const hour12 = settings.general.timeFormat !== "24h";
  const { type, anchorDate } = settings.payroll.payPeriod;
  const periods = useMemo(() => recentPeriods(today, type, anchorDate, 12), [today, type, anchorDate]);
  const current = periods[0];
  // Another pay period than the current one, or dates of one's own.
  const [picked, setPicked] = useState<PayPeriod | null>(null);
  const [custom, setCustom] = useState<{ from: DateKey; to: DateKey } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [picking, setPicking] = useState<"from" | "to" | null>(null);

  const period = custom ? null : (picked ?? current);
  const from = custom ? custom.from : (picked ?? current).start;
  const to = custom ? custom.to : (picked ?? current).end;
  const pay = useOwnPay(from, to);

  // Newest day first; each day in time order.
  const days = useMemo(() => {
    const out: { dateKey: DateKey; lines: OwnPayLine[] }[] = [];
    for (const l of [...pay.lines].sort((a, b) => b.dateKey.localeCompare(a.dateKey) || a.startMs - b.startMs)) {
      const last = out[out.length - 1];
      if (last?.dateKey === l.dateKey) last.lines.push(l);
      else out.push({ dateKey: l.dateKey, lines: [l] });
    }
    return out;
  }, [pay.lines]);

  const { total, worked, extra } = pay.totals;
  const records = pay.lines.filter((l) => !l.open).length;
  const missing = !!staff && !pay.loading && rateMissing(staff.role, pay.rates);
  const isCurrent = !!period && periodId(period) === periodId(current);
  const label = period ? payPeriodLabel(period) : from === to ? formatDateKey(from, "medium") : weekRange(from, to);
  const calendar = (
    <RowIcon>
      <CalendarDays size={17} color={colors.foreground} />
    </RowIcon>
  );

  return (
    <>
      <Screen typing={false} onRefresh={() => new Promise((r) => setTimeout(r, 600))} testID="payroll-screen">
        <T tone="muted" testID="payroll-intro">
          Your pay: the time you’re clocked in at the kiosk, and extra time an admin added, at your hourly rate.
        </T>
        {!staffId ? (
          <EmptyState
            testID="payroll-unlinked"
            icon={<Wallet size={26} color={colors.mutedForeground} />}
            title="Your employee record isn’t linked yet"
            text="Ask an admin to link it; your pay shows here then."
          />
        ) : (
          <>
            <Card
              onPress={() => setChoosing(true)}
              accessibilityLabel={`${custom ? "Custom range" : "Pay period"}: ${label}${isCurrent ? ", current" : ""}. Choose another`}
              testID="payroll-period"
              style={styles.period}
            >
              <View style={styles.grow}>
                <T variant="small" tone="muted">
                  {custom ? "Custom range" : "Pay period"}
                </T>
                <View style={styles.periodLine}>
                  <T variant="subheading" numberOfLines={1} style={styles.shrink}>
                    {label}
                  </T>
                  {isCurrent ? <Badge style={styles.badge}>Current</Badge> : null}
                </View>
              </View>
              <ChevronDown size={20} color={colors.mutedForeground} />
            </Card>

            {custom ? (
              <ListSection testID="payroll-custom">
                <ListRow icon={calendar} title="From" right={formatDateKey(custom.from, "medium")} onPress={() => setPicking("from")} testID="payroll-from" />
                <ListRow icon={calendar} title="To" right={formatDateKey(custom.to, "medium")} onPress={() => setPicking("to")} testID="payroll-to" />
              </ListSection>
            ) : null}

            {pay.loading ? (
              <View style={styles.list} testID="payroll-loading">
                <Skeleton height={164} rounded={radius.lg} />
                <SkeletonCards count={3} height={112} />
              </View>
            ) : pay.error ? (
              <Card testID="payroll-error">
                <T variant="label">Couldn’t load your pay</T>
                <T variant="small" tone="muted">
                  Check your connection, then pull down to try again.
                </T>
              </Card>
            ) : (
              <>
                <Card testID="payroll-totals" style={styles.totals}>
                  <T variant="small" tone="muted" style={styles.caps}>
                    TOTAL PAY
                  </T>
                  <T variant="display" style={styles.nums} testID="payroll-total">
                    {formatMoney(total.pay)}
                  </T>
                  {extra.hours > 0 ? (
                    <T variant="small" tone="muted" style={styles.nums} testID="payroll-parts">
                      Worked {formatMoney(worked.pay)} · Extra time {formatMoney(extra.pay)}
                    </T>
                  ) : null}
                  <View style={[styles.stats, { borderTopColor: colors.border }]}>
                    <Stat value={total.hours.toFixed(2)} label="hours" testID="payroll-hours" />
                    <View style={[styles.rule, { backgroundColor: colors.border }]} />
                    <Stat value={String(records)} label={records === 1 ? "record" : "records"} testID="payroll-records" />
                  </View>
                  <T variant="small" tone="muted" style={styles.center} testID="payroll-rates">
                    Hourly rate {formatMoney(pay.rate)}/hr
                  </T>
                </Card>

                {missing ? (
                  <View style={[styles.notice, { backgroundColor: colors.warningTint }]} testID="payroll-rate-missing">
                    <TriangleAlert size={18} color={colors.warning} />
                    <T variant="small" style={[styles.grow, { color: colors.warning }]}>
                      Your hourly rate isn’t set yet, so your pay shows $0. Ask an admin to set it.
                    </T>
                  </View>
                ) : null}

                {days.length ? (
                  days.map((d) => (
                    <ListSection key={d.dateKey} title={shortDay(d.dateKey)} detail={formatMoney(payLineTotals(d.lines).total.pay)} testID={`payroll-day-${d.dateKey}`}>
                      {d.lines.map((l) => (
                        <PayLineRow key={l.key} line={l} timezone={timezone} hour12={hour12} testID={`payroll-line-${l.key}`} />
                      ))}
                    </ListSection>
                  ))
                ) : (
                  <EmptyState
                    testID="payroll-empty"
                    icon={<Wallet size={26} color={colors.mutedForeground} />}
                    title={isCurrent ? "No pay yet this period" : "No pay on these dates"}
                    text="Your time shows here once you clock out at the kiosk."
                  />
                )}

                <T variant="small" tone="muted" style={styles.note} testID="payroll-note">
                  {`${describePay(settings)} Hours are rounded to 0.01 h. If something looks wrong, ask an admin.`}
                </T>
              </>
            )}
          </>
        )}
      </Screen>

      <PeriodDialog
        open={choosing}
        periods={periods}
        selected={period}
        custom={!!custom}
        onPeriod={(p) => {
          setCustom(null);
          // The current pay period follows the calendar (a new one starts by itself).
          setPicked(periodId(p) === periodId(current) ? null : p);
          setChoosing(false);
        }}
        onCustom={() => {
          setCustom({ from, to });
          setChoosing(false);
        }}
        onClose={() => setChoosing(false)}
      />
      <DatePickerDialog
        open={picking === "from"}
        title="From"
        hint="The first day to show"
        value={from}
        today={today}
        max={to}
        onPick={(d) => {
          setCustom({ from: d, to });
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
        testID="payroll-from-picker"
      />
      <DatePickerDialog
        open={picking === "to"}
        title="To"
        hint="The last day to show"
        value={to}
        today={today}
        min={from}
        onPick={(d) => {
          setCustom({ from, to: d });
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
        testID="payroll-to-picker"
      />
    </>
  );
}

function Stat({ value, label, testID }: { value: string; label: string; testID?: string }) {
  return (
    <View style={styles.stat} testID={testID}>
      <T variant="stat">{value}</T>
      <T variant="small" tone="muted">
        {label}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, gap: 2 },
  shrink: { flexShrink: 1 },
  period: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md },
  periodLine: { flexDirection: "row", alignItems: "center", gap: space.sm },
  badge: { alignSelf: "center" },
  list: { gap: space.md },
  totals: { alignItems: "center", gap: space.xs },
  caps: { fontWeight: "600", letterSpacing: 0.5 },
  nums: { fontVariant: ["tabular-nums"] },
  stats: { flexDirection: "row", alignItems: "center", alignSelf: "stretch", marginTop: space.sm, paddingTop: space.md, borderTopWidth: StyleSheet.hairlineWidth },
  stat: { flex: 1, alignItems: "center", gap: 2 },
  rule: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  center: { textAlign: "center", marginTop: space.xs },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: space.sm, borderRadius: radius.lg, padding: space.md },
  note: { paddingHorizontal: space.xs },
});
