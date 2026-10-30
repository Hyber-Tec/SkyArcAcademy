import { type DayMark, fitRangesToDay, normalizeRanges, rangesContain, rangesEqual, weeklyRepeats } from "@shared/availability";
import { UNDO_SECONDS, availabilitySummary, describeRanges } from "@shared/availabilityWrites";
import { type DateKey, WEEKDAY_LABELS, addDays, formatDateKey, formatMinutes, formatTimeRange, nowMinutes, weekdayOf } from "@shared/time";
import type { AvailabilityRange } from "@shared/types";
import { router, useNavigation } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { Ban, CalendarX, Lock, Plus, Trash2, TriangleAlert } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { ErrorBox } from "@/components/AuthParts";
import { Button } from "@/components/Button";
import { confirmAsync } from "@/components/Confirm";
import { IconButton } from "@/components/IconButton";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SheetScrollArea } from "@/components/SheetScrollArea";
import { Skeleton } from "@/components/Skeleton";
import { T } from "@/components/Text";
import { TimeWheel } from "@/components/TimeWheel";
import { ToastHost } from "@/components/ToastHost";
import { toast } from "@/lib/toast";
import { useBranch } from "@/state/BranchProvider";
import { radius, space, useColors, useStatusColors } from "@/theme";
import { type DayWrite, addTimeInLock, availabilityError, planDays, saveDays, skippedText, undoError } from "./api";
import { useAvailabilityRules, useAvailabilityWindow } from "./hooks";

type DayForm = { ranges: AvailabilityRange[]; off: boolean };

/** The Repeat weekly choices (0 = off), from the website's (1–12 weeks), kept to what fits a phone's row. */
export const REPEAT_WEEKS = [0, 2, 4, 8, 12] as const;
export const DEFAULT_REPEAT_WEEKS = 4;

/** The time choices of a wheel, as the website's TimeSelect: from `min` to `max` in steps, plus the value if it's off the step. */
function timeOptions(min: number, max: number, step: number, value: number): number[] {
  const out: number[] = [];
  for (let m = min; m <= max; m += step) out.push(m);
  if (!out.includes(value)) out.push(value);
  return out.sort((x, y) => x - y);
}

const timeLabel = (m: number) => (m === 1440 ? "Midnight" : formatMinutes(m));

/**
 * One day's availability, in a sheet over the calendar (the owner's True Education design, with the website's rules):
 * the date and its opening hours; a yellow notice when the day is locked; Available or Not available; when available,
 * the start and end time wheels (the academy's step, inside that date's hours), up to the academy's number of time
 * ranges; Repeat every weekday; then Cancel, Remove and Save. "Not available" is saved as an answer, so the day no
 * longer counts as one to set. Saving warns first when booked classes would be left outside the new times; it returns
 * at once (the server confirms in the background). Inside the lock (not a day that's over) the coach adds time, as on
 * the website (docs/DECISIONS.md §23, C2): the saved times stay as they are, new ones start where they end, and "Add
 * time" saves them with an Undo for a few seconds; removing time there is an admin's.
 */
export function DayEditor({ date, repeatWeeks = 0 }: { date: DateKey; /** Repeat weekly preset (from the ⋯ menu's Repeat weekly). */ repeatWeeks?: number }) {
  const { branchId, actor, settings, timezone, staffId, staff } = useBranch();
  const colors = useColors();
  const a = settings.availability;
  const step = a.stepMinutes;
  const rules = useAvailabilityRules();
  const { today, now } = rules;
  const lastRepeat = addDays(date, 7 * REPEAT_WEEKS[REPEAT_WEEKS.length - 1]);
  const { availability, hoursOf, rangesOf, markOf, loading } = useAvailabilityWindow(date, lastRepeat);

  const hours = hoursOf(date);
  const saved = rangesOf(date);
  const savedMark = markOf(date);
  const locked = rules.locked(date);
  const addOnly = rules.addOnly(date);
  const past = date < today;
  const leadWarning = rules.leadWarning(date);

  // The form starts from what is saved once it has loaded (a new day: that date's opening hours).
  const [form, setForm] = useState<DayForm | null>(null);
  const [opened, setOpened] = useState<DayForm | null>(null);
  const [active, setActive] = useState(0);
  const [weeks, setWeeks] = useState(repeatWeeks);
  // Every other week: a rotation (Sundays that alternate between coaches).
  const [everyOther, setEveryOther] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!form && !loading) {
    const fresh = [{ startMin: hours.openMin, endMin: hours.closeMin }];
    // Inside the lock the form holds only the times to add: one starting where the saved ones end, when there's room.
    const first = addOnly
      ? { ranges: saved.length ? nextRange(saved, hours.closeMin, a.minBlockMinutes) : fresh, off: false }
      : { ranges: saved.length ? saved : fresh, off: savedMark === "unavailable" };
    setForm(first);
    setOpened(first);
  }

  const staffName = staff?.name ?? actor.name;
  const weekday = WEEKDAY_LABELS[weekdayOf(date)];
  // Leaving with changes asks first: Cancel, a swipe down (iPhone) and the back button (Android) all come here. After a
  // save the sheet closes without asking, and only once.
  const navigation = useNavigation();
  const leaving = useRef(false);
  const goBack = () => (navigation.canGoBack() ? navigation.goBack() : router.replace("/availability"));
  const close = () => {
    if (leaving.current) return;
    leaving.current = true;
    goBack();
  };

  // Changed since the sheet opened (a new day's prefilled hours aren't a change to throw away).
  const edited = !!form && !!opened && (form.off !== opened.off || (!form.off && !rangesEqual(form.ranges, opened.ranges)));
  const dirty = edited || weeks !== repeatWeeks || everyOther;

  usePreventRemove(dirty && (!locked || addOnly), ({ data }) => {
    if (leaving.current) return navigation.dispatch(data.action);
    if (busy) return;
    void confirmAsync({ title: "Discard changes?", message: "Your changes to this day aren’t saved.", confirmLabel: "Discard", cancelLabel: "Keep editing", destructive: true }).then((ok) => {
      if (!ok) return;
      leaving.current = true;
      navigation.dispatch(data.action);
    });
  });

  const setRange = (i: number, patch: Partial<AvailabilityRange>) => {
    if (!form) return;
    setError(null);
    setForm({
      ...form,
      ranges: form.ranges.map((r, idx) => {
        if (idx !== i) return r;
        const next = { ...r, ...patch };
        // A start moved past the end takes the end along (one step later, inside the hours).
        if (patch.startMin !== undefined && next.endMin <= next.startMin) next.endMin = Math.min(hours.closeMin, next.startMin + Math.max(step, a.minBlockMinutes));
        return next;
      }),
    });
  };

  // Another range fits after the last one (the saved ones too, inside the lock) before closing.
  const all = form ? (addOnly ? [...saved, ...form.ranges] : form.ranges) : [];
  const canAdd = !!form && !form.off && all.length < a.maxRangesPerDay && roomAfter(all, hours.closeMin, a.minBlockMinutes);
  const addRange = () => {
    if (!form) return;
    const last = normalizeRanges(all).pop();
    const start = last ? Math.min(last.endMin + (addOnly ? 0 : step), hours.closeMin - a.minBlockMinutes) : hours.openMin;
    setForm({ ...form, ranges: [...form.ranges, { startMin: start, endMin: Math.min(start + 120, hours.closeMin) }] });
    setActive(form.ranges.length);
    setError(null);
  };
  const removeRange = (i: number) => {
    if (!form) return;
    setForm({ ...form, ranges: form.ranges.filter((_, idx) => idx !== i) });
    setActive((x) => Math.max(0, x >= i ? x - 1 : x));
    setError(null);
  };

  const ctx = () => ({ branchId, actor, timezone, staffId: staffId!, staffName, currentRanges: rangesOf, hoursOf, today, nowMin: nowMinutes(timezone, now) });

  /** The times typed, fitted to this date's opening hours (the website's checks, in its words); null when they don't fit. */
  const fitted = (ranges: AvailabilityRange[]): AvailabilityRange[] | null => {
    const wrong = ranges.some((r) => r.endMin <= r.startMin)
      ? "End time must be after start time."
      : ranges.some((r) => r.endMin - r.startMin < a.minBlockMinutes)
        ? `Each range must be at least ${a.minBlockMinutes} minutes.`
        : null;
    if (wrong) {
      setError(wrong);
      return null;
    }
    // Availability follows this date's opening hours (owner rule).
    const fit = fitRangesToDay(ranges, hours, a);
    if (fit.ok) return fit.ranges;
    setError(
      fit.reason === "closed"
        ? "The academy is closed on this day."
        : fit.reason === "too_many"
          ? `Use at most ${a.maxRangesPerDay} time ranges per day.`
          : `Choose a time within opening hours (${formatTimeRange(hours.openMin, hours.closeMin)}).`,
    );
    return null;
  };

  /** Saves the day (times, or not available) and its weekly repeat. */
  const save = async () => {
    if (!form || !staffId || locked) return;
    setError(null);
    let day: DayWrite;
    if (form.off) day = { dateKey: date, ranges: [], unavailable: true };
    else {
      const fit = fitted(form.ranges);
      if (!fit) return;
      day = { dateKey: date, ranges: fit };
    }
    const dayChanged = day.unavailable ? savedMark !== "unavailable" : savedMark === "unavailable" || !rangesEqual(day.ranges, saved);
    const days: DayWrite[] = dayChanged ? [day] : [];
    let skipped = {};
    if (weeks > 0) {
      const plan = planDays(
        weeklyRepeats(date, weeks, everyOther ? 2 : 1).map((d) => ({ date: d, ranges: day.ranges, unavailable: day.unavailable })),
        { locked: rules.locked, hoursOf, rangesOf, markOf, availability: a },
      );
      days.push(...plan.writes);
      skipped = plan.skipped;
    }
    const note = skippedText(skipped);
    const repeated = weeks > 0 ? `Repeated ${everyOther ? "every other week" : "weekly"} for ${weeks} weeks` : null;
    if (days.length === 0) {
      if (repeated) toast.info("Nothing changed", note ? { description: note } : undefined);
      close();
      return;
    }
    const summary = weeks > 0 ? `${availabilitySummary(staffName, [day])}, repeated ${everyOther ? "every other week" : "weekly"} for ${weeks} weeks` : undefined;
    setBusy(true);
    try {
      if (!(await saveDays(ctx(), days, summary))) return;
      const what = day.unavailable ? "Marked not available" : "Availability saved";
      const details = [dayChanged && repeated ? `${repeated}.` : null, note].filter(Boolean);
      toast.success(dayChanged ? what : (repeated ?? what), details.length ? { description: details.join(" ") } : undefined);
      close();
    } catch (e) {
      setError(availabilityError(e, days.length > 1));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Inside the lock: adds the new times to what's saved, then offers Undo for a few seconds (the rules allow it a little
   * longer by the server's clock), which puts the day back exactly as it was.
   */
  const add = () => {
    if (!form || !staffId || !addOnly) return;
    setError(null);
    if (!form.ranges.length) return setError("Add a time range first.");
    const fit = fitted(form.ranges);
    if (!fit) return;
    if (fit.every((r) => rangesContain(saved, r.startMin, r.endMin))) return setError("Those times are already in your availability.");
    if (normalizeRanges([...saved, ...fit]).length > a.maxRangesPerDay) return setError(`Use at most ${a.maxRangesPerDay} time ranges per day.`);
    const record = availability.get(date);
    const day = formatDateKey(date, "weekdayMedium");
    try {
      const undo = addTimeInLock(ctx(), date, record ? { ranges: record.ranges ?? [], unavailable: !!record.unavailable } : null, fit);
      toast.success(`Added to ${day}`, {
        description: describeRanges(normalizeRanges(fit)),
        duration: UNDO_SECONDS * 1000,
        action: {
          label: "Undo",
          onPress: () =>
            void undo().then(
              () => toast.success("Undone", { description: `${day} is back as it was.` }),
              (e: unknown) => toast.error("Couldn’t undo", { description: undoError(e) }),
            ),
        },
      });
      close();
    } catch (e) {
      setError(availabilityError(e, false, true));
    }
  };

  /** Clears the day: neither times nor "not available" (it's a day to set again). */
  const remove = async () => {
    if (!staffId || locked || (savedMark !== "available" && savedMark !== "unavailable")) return;
    setError(null);
    setBusy(true);
    try {
      if (!(await saveDays(ctx(), [{ dateKey: date, ranges: [] }]))) return;
      toast.success("Day cleared");
      close();
    } catch (e) {
      setError(availabilityError(e, false));
    } finally {
      setBusy(false);
    }
  };

  const range = form && !form.off ? (form.ranges[Math.min(active, form.ranges.length - 1)] ?? null) : null;
  const activeIndex = form ? Math.min(active, form.ranges.length - 1) : 0;
  const showRepeat = !!form && !locked && hours.isOpen;
  const lastRepeatDate = weeks > 0 ? addDays(date, 7 * weeks) : null;
  const canRemove = !locked && (savedMark === "available" || savedMark === "unavailable");

  // The times being set (inside the lock: the ones to add): a list when there's more than one, the wheels for the one
  // chosen, and another time when one fits.
  const timesEditor = form ? (
    <>
      {form.ranges.length > 1 ? (
        <View style={[styles.group, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {form.ranges.map((r, i) => {
            const on = i === activeIndex;
            return (
              <View key={i} style={[styles.rangeLine, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, on && { backgroundColor: colors.accent }]}>
                <Pressable
                  testID={`range-${i}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Time range ${i + 1}: ${formatTimeRange(r.startMin, r.endMin)}`}
                  accessibilityHint="Changes this range with the wheels below"
                  accessibilityState={{ selected: on }}
                  onPress={() => setActive(i)}
                  style={styles.rangeMain}
                >
                  <View style={[styles.dot, { backgroundColor: on ? colors.success : colors.border }]} />
                  <T variant="label" style={[styles.grow, r.endMin <= r.startMin && { color: colors.destructive }]}>
                    {formatTimeRange(r.startMin, r.endMin)}
                  </T>
                </Pressable>
                <IconButton icon={<Trash2 size={17} color={colors.mutedForeground} />} size={36} accessibilityLabel={`Remove ${formatTimeRange(r.startMin, r.endMin)}`} onPress={() => removeRange(i)} testID={`range-${i}-remove`} />
              </View>
            );
          })}
        </View>
      ) : null}
      {range ? (
        <SheetScrollArea style={styles.wheels}>
          <View style={styles.wheel}>
            <T variant="tiny" tone="muted" style={styles.caps}>
              START TIME
            </T>
            <TimeWheel
              key={`start-${activeIndex}`}
              values={timeOptions(hours.openMin, hours.closeMin - step, step, range.startMin)}
              value={range.startMin}
              onChange={(m) => setRange(activeIndex, { startMin: m })}
              format={timeLabel}
              label="Start time"
              testID="start"
            />
          </View>
          <View style={styles.wheel}>
            <T variant="tiny" tone="muted" style={styles.caps}>
              END TIME
            </T>
            <TimeWheel
              key={`end-${activeIndex}`}
              values={timeOptions(hours.openMin + step, hours.closeMin, step, range.endMin)}
              value={range.endMin}
              onChange={(m) => setRange(activeIndex, { endMin: m })}
              format={timeLabel}
              label="End time"
              testID="end"
            />
          </View>
        </SheetScrollArea>
      ) : (
        <T tone="muted">{addOnly && !canAdd ? "Your times already reach closing time: there’s nothing to add." : "No times yet."}</T>
      )}
      {/* Only when another time fits after the last one (a whole day has no room: nothing to offer). */}
      {canAdd ? (
        <Pressable testID="range-add" accessibilityRole="button" onPress={addRange} style={({ pressed }) => [styles.add, pressed && { opacity: 0.6 }]}>
          <Plus size={16} color={colors.foreground} />
          <T variant="small" style={styles.addText}>
            Add another time
          </T>
        </Pressable>
      ) : null}
    </>
  ) : null;

  return (
    <View style={styles.sheet} testID="availability-day">
      <View>
        <T variant="heading" testID="availability-day-title">
          {addOnly ? "Add availability" : locked ? "Availability" : "Edit availability"}
        </T>
        <T tone="muted">{formatDateKey(date, "weekdayLong")}</T>
        {hours.isOpen && !loading ? (
          <T variant="small" tone="muted">
            Open {formatTimeRange(hours.openMin, hours.closeMin)} this day
          </T>
        ) : null}
      </View>

      {loading || !form ? (
        <View style={styles.loading}>
          <Skeleton height={36} />
          <Skeleton height={52} />
          <Skeleton height={160} />
        </View>
      ) : !hours.isOpen ? (
        <Notice icon={<CalendarX size={16} color={colors.mutedForeground} />} text="The academy is closed on this day." />
      ) : (
        <>
          {locked ? (
            <Notice
              tone="locked"
              icon={<Lock size={16} color={colors.warning} />}
              text={past ? "This day is over, so its availability can’t be changed." : "Locked: you can add time, not remove it. Ask an admin to remove time."}
              testID="availability-locked"
            />
          ) : leadWarning ? (
            <Notice tone="locked" icon={<TriangleAlert size={16} color={colors.warning} />} text={`Please set availability at least ${a.leadTimeDays} days in advance.`} testID="availability-lead-warning" />
          ) : null}

          {addOnly ? (
            <>
              <SavedTimes mark={savedMark} ranges={saved} />
              <T variant="tiny" tone="muted" style={styles.caps}>
                ADD
              </T>
              {timesEditor}
            </>
          ) : locked ? (
            <SavedDay mark={savedMark} ranges={saved} />
          ) : (
            <>
              <SegmentedControl
                testID="availability-mode"
                value={form.off ? "off" : "on"}
                options={[
                  { value: "on", label: "Available" },
                  { value: "off", label: "Not available" },
                ]}
                onChange={(v) => {
                  setError(null);
                  setForm({ ranges: form.ranges.length ? form.ranges : [{ startMin: hours.openMin, endMin: hours.closeMin }], off: v === "off" });
                }}
              />
              {form.off ? (
                <View style={[styles.offBox, { borderColor: colors.border }]} testID="availability-off-note">
                  <Ban size={18} color={colors.mutedForeground} />
                  <T variant="small" tone="muted" style={styles.grow}>
                    The schedule shows this day as not available, and it no longer counts as a day to set.
                  </T>
                </View>
              ) : (
                timesEditor
              )}
            </>
          )}

          {showRepeat ? (
            <View style={styles.repeat}>
              <T variant="tiny" tone="muted" style={styles.caps}>
                REPEAT EVERY {weekday.toUpperCase()}
              </T>
              <SegmentedControl
                testID="availability-repeat-weeks"
                value={String(weeks)}
                options={REPEAT_WEEKS.map((w) => ({ value: String(w), label: w === 0 ? "Off" : `${w} wks` }))}
                onChange={(v) => setWeeks(Number(v))}
              />
              {lastRepeatDate ? (
                <>
                  <Pressable
                    testID="availability-every-other"
                    accessibilityRole="switch"
                    accessibilityState={{ checked: everyOther }}
                    onPress={() => setEveryOther((x) => !x)}
                    style={styles.everyOther}
                  >
                    <T variant="small" style={styles.grow}>
                      Every other week (a rotation)
                    </T>
                    <Switch value={everyOther} onValueChange={setEveryOther} accessibilityLabel="Every other week" />
                  </Pressable>
                  <T variant="small" tone="muted">
                    {`${everyOther ? "Every other week" : "Every week"} for ${weeks} weeks, through ${formatDateKey(lastRepeatDate, "monthDay")}. Closed and locked days are skipped${form.off ? "" : ", and times follow each day’s opening hours"}.`}
                  </T>
                </>
              ) : null}
            </View>
          ) : null}

          {error ? <ErrorBox>{error}</ErrorBox> : null}
        </>
      )}

      <View style={styles.buttons}>
        <Button variant="secondary" style={styles.grow} onPress={goBack} testID="availability-cancel">
          {locked && !addOnly ? "Close" : "Cancel"}
        </Button>
        {addOnly ? null : (
          <Button variant="destructive" style={styles.grow} disabled={!canRemove || busy} onPress={() => void remove()} testID="availability-remove">
            Remove
          </Button>
        )}
        <Button style={styles.grow} disabled={(locked && !addOnly) || loading || !hours.isOpen} busy={busy} onPress={() => (addOnly ? add() : void save())} testID="availability-save">
          {addOnly ? "Add time" : locked ? "Locked" : "Save"}
        </Button>
      </View>
      <ToastHost />
    </View>
  );
}

/** A locked day as it is saved: its times, not available, or nothing. */
function SavedDay({ mark, ranges }: { mark: DayMark; ranges: AvailabilityRange[] }) {
  const colors = useColors();
  const status = useStatusColors();
  const available = mark === "available" && ranges.length > 0;
  const off = mark === "unavailable";
  return (
    <View style={[styles.savedDay, { borderColor: colors.border, backgroundColor: available ? status.confirmed.bg : off ? status.canceled.bg : colors.card }]} testID="availability-saved">
      {off ? <Ban size={17} color={status.canceled.text} /> : null}
      <T variant="label" tone={available ? "default" : "muted"} style={off ? { color: status.canceled.text } : undefined}>
        {available ? describeRanges(ranges) : mark === "unavailable" ? "Not available" : "Nothing set on this day"}
      </T>
    </View>
  );
}

/** Inside the lock: the times saved, which stay as they are (adding is all a coach can do there). */
function SavedTimes({ mark, ranges }: { mark: DayMark; ranges: AvailabilityRange[] }) {
  const status = useStatusColors();
  return (
    <View style={styles.savedTimes} testID="availability-saved-times">
      <T variant="tiny" tone="muted" style={styles.caps}>
        YOUR TIMES
      </T>
      {ranges.length ? (
        <View style={styles.chips}>
          {ranges.map((r) => (
            <View key={`${r.startMin}-${r.endMin}`} style={[styles.chip, { backgroundColor: status.confirmed.bg, borderColor: status.confirmed.border }]}>
              <Lock size={12} color={status.confirmed.text} />
              <T variant="small" style={{ color: status.confirmed.text, fontWeight: "600" }}>
                {formatTimeRange(r.startMin, r.endMin)}
              </T>
            </View>
          ))}
        </View>
      ) : (
        <T variant="small" tone="muted">
          {mark === "unavailable" ? "Marked not available. Times you add make you available." : "None yet."}
        </T>
      )}
    </View>
  );
}

/** The time to add after the saved ones, inside the lock: from where they end, when another one fits before closing. */
function nextRange(saved: AvailabilityRange[], closeMin: number, minBlock: number): AvailabilityRange[] {
  const last = normalizeRanges(saved).pop();
  if (!last || last.endMin + minBlock > closeMin) return [];
  return [{ startMin: last.endMin, endMin: Math.min(last.endMin + 120, closeMin) }];
}

/** Whether another range still fits after the last one before closing. */
function roomAfter(ranges: AvailabilityRange[], closeMin: number, minBlock: number): boolean {
  const last = normalizeRanges(ranges).pop();
  return !last || last.endMin + minBlock <= closeMin;
}

function Notice({ icon, text, tone = "muted", testID }: { icon: ReactNode; text: string; tone?: "muted" | "locked"; testID?: string }) {
  const colors = useColors();
  const locked = tone === "locked";
  return (
    <View
      style={[styles.notice, { backgroundColor: locked ? colors.warningTint : colors.secondary, borderColor: locked ? colors.warning : "transparent" }]}
      testID={testID}
      accessibilityRole="text"
    >
      {icon}
      <T variant="small" style={[styles.grow, { color: locked ? colors.warning : colors.foreground }]}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: space.xl, paddingTop: space.xl, paddingBottom: space.xl, gap: space.lg },
  grow: { flex: 1 },
  loading: { gap: space.md },
  notice: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.md, paddingVertical: space.md },
  offBox: { flexDirection: "row", alignItems: "center", gap: space.md, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", padding: space.md },
  group: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: "hidden" },
  rangeMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 46 },
  rangeLine: { flexDirection: "row", alignItems: "center", paddingRight: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  wheels: { flexDirection: "row", gap: space.md },
  wheel: { flex: 1, gap: space.xs },
  caps: { fontWeight: "600", letterSpacing: 0.6, paddingHorizontal: space.xs },
  add: { flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start", paddingVertical: space.xs },
  addText: { fontWeight: "500" },
  repeat: { gap: space.sm },
  everyOther: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.xs },
  savedDay: { flexDirection: "row", alignItems: "center", gap: space.sm, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: space.lg, minHeight: 50 },
  savedTimes: { gap: space.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 4 },
  buttons: { flexDirection: "row", gap: space.sm },
});
