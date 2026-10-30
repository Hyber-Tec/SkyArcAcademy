import { describeRanges } from "@shared/availabilityWrites";
import { type DateKey, addDays, addMonths, endOfMonth, formatDateKey, nowMinutes, startOfMonth, startOfWeek } from "@shared/time";
import { router } from "expo-router";
import { Ban, CalendarClock, CalendarDays, Ellipsis } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showActions } from "@/components/ActionSheet";
import { Button } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { DatePickerDialog } from "@/components/DatePickerDialog";
import { EmptyState } from "@/components/EmptyState";
import { IconButton } from "@/components/IconButton";
import { MonthScroller, type MonthScrollerHandle, WeekdayHeader } from "@/components/MonthScroller";
import { TabHeader } from "@/components/TabHeader";
import { T } from "@/components/Text";
import { availabilityError, planDays, saveDays, skippedText } from "@/features/availability/api";
import { CalendarDay, type DayLook, LegendMark } from "@/features/availability/CalendarDay";
import { CopyWeekDialog, type WeekChoice } from "@/features/availability/CopyWeekDialog";
import { DEFAULT_REPEAT_WEEKS } from "@/features/availability/DayEditor";
import { useAvailabilityRules, useAvailabilityStanding, useAvailabilityWindow } from "@/features/availability/hooks";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors } from "@/theme";

const ROW_HEIGHT = 58;

/** 14 → "2 weeks", 10 → "10 days". */
function span(days: number): string {
  if (days % 7 === 0) return days === 7 ? "a week" : `${days / 7} weeks`;
  return `${days} days`;
}

/** "Oct 26, Oct 27 and Oct 29" (the first few). */
function dayList(days: DateKey[], max = 3): string {
  const shown = days.slice(0, max).map((d) => formatDateKey(d, "monthDay"));
  const more = days.length - shown.length;
  if (more > 0) return `${shown.join(", ")} and ${more} more`;
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown.at(-1)}` : (shown[0] ?? "");
}

/**
 * The coach's availability, as clean as the owner's True Education design: months stacked vertically and scrolled
 * like the phone's Calendar (permanent rule), each day only its number, in a light green circle when the coach is
 * available, in light red when they marked it not available. Tap a day to set it (the day sheet). The top
 * says the academy's rule, which days in the notice window aren't answered yet (one tap marks them all not available),
 * and what the marks mean; Today and the ⋯ menu (Copy last week, Repeat weekly) sit by the title. A day opens as a sheet
 * (`/availability-day?date=…`), which Home's to-do opens directly too.
 */
export default function AvailabilityScreen() {
  const { branchId, actor, settings, timezone, staffId, staff } = useBranch();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const a = settings.availability;
  const rules = useAvailabilityRules();
  const { today, now, locked, lockedThrough, lockDays } = rules;
  const weekStartsOn = settings.general.weekStartsOn;

  // The data window: two months back, a year ahead, and wider as the calendar scrolls past either end.
  const [win, setWin] = useState(() => ({ from: startOfMonth(addMonths(today, -2)), to: endOfMonth(addMonths(today, 12)) }));
  const onVisibleRangeChange = useCallback((from: DateKey, to: DateKey) => {
    setWin((w) => {
      const next = { ...w };
      if (from < addMonths(w.from, 1)) next.from = startOfMonth(addMonths(from, -6));
      if (to > addMonths(w.to, -1)) next.to = endOfMonth(addMonths(to, 6));
      return next.from === w.from && next.to === w.to ? w : next;
    });
  }, []);
  const { availability, dayConfigs, hoursOf, rangesOf, markOf, loading } = useAvailabilityWindow(win.from, win.to);
  const standing = useAvailabilityStanding(availability, dayConfigs, hoursOf);
  // Until the coach's days are in, nothing counts as still to set (no notice or dots that vanish a moment later).
  const gaps = useMemo(() => (loading ? [] : standing.gaps), [loading, standing.gaps]);
  const gapSet = useMemo(() => new Set(gaps), [gaps]);

  const look = useCallback(
    (d: DateKey): DayLook => ({ mark: markOf(d), isToday: d === today, isPast: d < today, needs: gapSet.has(d), times: describeRanges(rangesOf(d)) }),
    [markOf, today, gapSet, rangesOf],
  );
  // A month is drawn again only when what its days show changes.
  const monthSignature = useCallback(
    (month: DateKey) => {
      const days = Number(endOfMonth(month).slice(8));
      let sig = `${today}|${lockedThrough}`;
      for (let i = 0; i < days; i++) {
        const l = look(addDays(month, i));
        sig += `;${l.mark[0]}${l.needs ? 1 : 0}${l.times}`;
      }
      return sig;
    },
    [look, today, lockedThrough],
  );

  const scroller = useRef<MonthScrollerHandle>(null);
  const openDay = useCallback(
    (d: DateKey) => {
      if (!hoursOf(d).isOpen) return toast.info("The academy is closed on this day.");
      router.push({ pathname: "/availability-day", params: { date: d } });
    },
    [hoursOf],
  );
  const renderDay = useCallback((d: DateKey, size: { width: number; height: number }) => <CalendarDay date={d} look={look(d)} width={size.width} height={size.height} onPress={openDay} />, [look, openDay]);
  const goToday = () => scroller.current?.scrollToDate(today);

  const staffName = staff?.name ?? actor.name;
  const ctx = () => ({ branchId, actor, timezone, staffId: staffId!, staffName, currentRanges: rangesOf, hoursOf, today, nowMin: nowMinutes(timezone, now) });

  // The days in the notice window not answered yet: all marked not available at once.
  const [marking, setMarking] = useState(false);
  const markGapsNotAvailable = async () => {
    if (!staffId || !gaps.length) return;
    const one = gaps.length === 1;
    const ok = await confirmAsync({
      title: one ? `Not available on ${formatDateKey(gaps[0], "weekdayMedium")}?` : `Not available on these ${gaps.length} days?`,
      message: one ? "You can change it later, until it locks." : `${dayList(gaps, 6)}. You can change any of them later, until they lock.`,
      confirmLabel: "Mark not available",
    });
    if (!ok) return;
    const { writes } = planDays(
      gaps.map((d) => ({ date: d, ranges: [], unavailable: true })),
      { locked, hoursOf, rangesOf, markOf, availability: a },
    );
    setMarking(true);
    try {
      if (!(await saveDays(ctx(), writes, writes.length > 1 ? `Marked ${staffName} not available on ${writes.length} days` : undefined))) return;
      toast.success(writes.length === 1 ? "Marked not available" : `Not available on ${writes.length} days`);
    } catch (e) {
      toast.error(availabilityError(e, true));
    } finally {
      setMarking(false);
    }
  };

  // Copy last week: the coming weeks that still have days the coach can change.
  const [copyOpen, setCopyOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const answered = useCallback((d: DateKey) => markOf(d) === "available" || markOf(d) === "unavailable", [markOf]);
  const weeks = useMemo((): WeekChoice[] => {
    const out: WeekChoice[] = [];
    const first = startOfWeek(today, weekStartsOn);
    for (let i = 0; i < 12 && out.length < 8; i++) {
      const start = addDays(first, 7 * i);
      const days = Array.from({ length: 7 }, (_, k) => addDays(start, k));
      const open = days.filter((d) => hoursOf(d).isOpen);
      const editable = open.filter((d) => !locked(d)).length;
      if (!editable) continue;
      out.push({ start, editable, open: open.length, sourceDays: days.filter((d) => answered(addDays(d, -7))).length });
    }
    return out;
  }, [today, weekStartsOn, locked, hoursOf, answered]);

  const copyWeek = async (start: DateKey) => {
    if (!staffId) return;
    const days = Array.from({ length: 7 }, (_, k) => addDays(start, k));
    const { writes, skipped } = planDays(
      days.map((d) => {
        const from = addDays(d, -7);
        return { date: d, ranges: rangesOf(from), unavailable: markOf(from) === "unavailable" };
      }),
      { locked, hoursOf, rangesOf, markOf, availability: a },
    );
    setCopying(true);
    try {
      if (writes.length && !(await saveDays(ctx(), writes, `Copied last week’s availability for ${staffName}`))) return;
      const note = skippedText(skipped);
      if (writes.length) toast.success("Last week copied", note ? { description: note } : undefined);
      else toast.info("Nothing changed", note ? { description: note } : undefined);
      setCopyOpen(false);
      scroller.current?.scrollToDate(start);
    } catch (e) {
      toast.error(availabilityError(e, true));
    } finally {
      setCopying(false);
    }
  };

  // Repeat weekly: pick a day that's set, then its sheet opens with the repeat already on (the website's dialog).
  const [repeatOpen, setRepeatOpen] = useState(false);
  const repeatDay = (d: DateKey) => {
    setRepeatOpen(false);
    // The picker's fade finishes first: the phone presents one screen at a time.
    setTimeout(() => router.push({ pathname: "/availability-day", params: { date: d, repeat: String(DEFAULT_REPEAT_WEEKS) } }), 350);
  };

  const menu = () =>
    showActions("Availability", [
      { label: "Copy last week…", onPress: () => setCopyOpen(true) },
      { label: "Repeat weekly…", onPress: () => setRepeatOpen(true) },
    ]);

  const asksNotice = a.leadTimeEnforcement !== "off";
  const rule = [asksNotice ? `Set availability ${span(a.leadTimeDays)} ahead` : null, lockDays > 0 ? `Within ${lockDays} days you can add time, not remove it` : "Past days can’t be changed"]
    .filter(Boolean)
    .join(" · ");

  if (!staffId) {
    return (
      <View style={[styles.fill, styles.empty, { backgroundColor: colors.grouped, paddingTop: insets.top + space.xl }]} testID="availability-screen">
        <EmptyState icon={<CalendarDays size={26} color={colors.mutedForeground} />} title="Your employee record isn’t linked yet" text="Ask an admin to link it, then your availability shows here." />
      </View>
    );
  }

  return (
    <View style={[styles.fill, { backgroundColor: colors.grouped }]} testID="availability-screen">
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <TabHeader
          title="Availability"
          testID="availability-title"
          right={
            <View style={styles.headerButtons}>
              <Button variant="outline" size="sm" onPress={goToday} testID="availability-today" accessibilityLabel="Go to today">
                Today
              </Button>
              <IconButton icon={<Ellipsis size={21} color={colors.foreground} />} accessibilityLabel="More" onPress={menu} size={36} filled testID="availability-more" />
            </View>
          }
        />
        <T variant="small" tone="muted" testID="availability-rule">
          {rule}
        </T>
        {gaps.length ? (
          <View style={[styles.gaps, { backgroundColor: colors.warningTint }]} testID="availability-gaps">
            <View style={styles.gapsText}>
              <CalendarClock size={18} color={colors.warning} />
              <T variant="small" style={[styles.grow, { color: colors.foreground }]}>
                <T variant="small" style={styles.bold}>
                  {gaps.length === 1 ? "1 day" : `${gaps.length} days`} in the next {span(a.leadTimeDays)} {gaps.length === 1 ? "isn’t" : "aren’t"} set.
                </T>{" "}
                Give your times, or mark {gaps.length === 1 ? "it" : "them"} not available.
              </T>
            </View>
            <View style={styles.gapsButtons}>
              <Button
                size="sm"
                variant="outline"
                style={styles.grow}
                onPress={() => {
                  scroller.current?.scrollToDate(gaps[0]);
                  openDay(gaps[0]);
                }}
                testID="availability-gaps-set"
              >
                {gaps.length === 1 ? `Set ${formatDateKey(gaps[0], "monthDay")}` : `Start with ${formatDateKey(gaps[0], "monthDay")}`}
              </Button>
              <Button size="sm" variant="outline" style={styles.grow} icon={<Ban size={15} color={colors.foreground} />} busy={marking} onPress={() => void markGapsNotAvailable()} testID="availability-gaps-off">
                {gaps.length === 1 ? "Not available" : "All not available"}
              </Button>
            </View>
          </View>
        ) : null}
        <View style={styles.legend} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.legendItem}>
            <LegendMark mark="available" />
            <T variant="tiny" tone="muted">
              Available
            </T>
          </View>
          <View style={styles.legendItem}>
            <LegendMark mark="unavailable" />
            <T variant="tiny" tone="muted">
              Not available
            </T>
          </View>
          {asksNotice ? (
            <View style={styles.legendItem}>
              <LegendMark mark="needs" />
              <T variant="tiny" tone="muted">
                Not set yet
              </T>
            </View>
          ) : null}
        </View>
      </View>
      <WeekdayHeader />
      <MonthScroller
        ref={scroller}
        anchor={today}
        rowHeight={ROW_HEIGHT}
        variant="clean"
        monthsBefore={24}
        renderDay={renderDay}
        monthSignature={monthSignature}
        onVisibleRangeChange={onVisibleRangeChange}
        testID="availability-calendar"
      />
      <CopyWeekDialog open={copyOpen} weeks={weeks} busy={copying} onClose={() => !copying && setCopyOpen(false)} onCopy={(start) => void copyWeek(start)} />
      <DatePickerDialog
        open={repeatOpen}
        title="Repeat weekly"
        hint="Pick a day that’s set, to copy it to the same weekday in the following weeks."
        value={null}
        today={today}
        min={addDays(lockedThrough, 1)}
        isDisabled={(d) => !answered(d)}
        onPick={repeatDay}
        onClose={() => setRepeatOpen(false)}
        testID="repeat-pick"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  empty: { paddingHorizontal: space.lg },
  grow: { flex: 1 },
  bold: { fontWeight: "600" },
  top: { paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.sm },
  headerButtons: { flexDirection: "row", alignItems: "center", gap: space.sm },
  gaps: { borderRadius: radius.lg, padding: space.md, gap: space.sm },
  gapsText: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  gapsButtons: { flexDirection: "row", gap: space.sm },
  legend: { flexDirection: "row", alignItems: "center", gap: space.lg, paddingTop: 2 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
});
