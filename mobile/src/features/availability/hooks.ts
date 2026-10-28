import { collection, query, where } from "@react-native-firebase/firestore";
import { availabilityGaps, dayHours, dayMark, effectiveLockDays, effectiveRanges, isInsideLeadTime, isLockedForCoach, lastAnswered, normalizeRanges } from "@shared/availability";
import { COL, ROOT } from "@shared/paths";
import { type DateKey, addDays } from "@shared/time";
import type { Availability, AvailabilityRange, DayConfig } from "@shared/types";
import { useCallback, useMemo, useState } from "react";
import { useAcademyNow, useDayConfigs } from "@/features/data/hooks";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

type AvailabilityMap = Map<DateKey, Availability & { id: string }>;
type DayConfigMap = Map<DateKey, DayConfig & { id: string }>;

/** The coach's own availability records between two dates (the rules let a coach read only theirs), by date. */
export function useMyAvailability(from: DateKey, to: DateKey) {
  const { branchId, staffId } = useBranch();
  const state = useQuery<Availability>(staffId ? `availability-${branchId}-${staffId}-${from}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.availability), where("staffId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const map = useMemo(() => new Map(state.data.map((a) => [a.dateKey, a])) as AvailabilityMap, [state.data]);
  return { map, loading: state.loading, error: state.error };
}

/**
 * The coach's availability and each date's opening hours between two dates, live. While a new range loads, the last
 * one stays on screen (no blank calendar while scrolling). `rangesOf` is what counts on a date (its saved times inside
 * that date's hours; none on closed days or days marked not available), and `markOf` where the date stands: times,
 * not available, unset or closed, as on the website.
 */
export function useAvailabilityWindow(from: DateKey, to: DateKey) {
  const { settings } = useBranch();
  const avail = useMyAvailability(from, to);
  const configs = useDayConfigs(from, to);
  const ready = !avail.loading && !configs.loading;
  const [kept, setKept] = useState<{ a: AvailabilityMap; c: DayConfigMap } | null>(null);
  if (ready && (kept?.a !== avail.map || kept?.c !== configs.map)) setKept({ a: avail.map, c: configs.map as DayConfigMap });
  const availability = ready ? avail.map : (kept?.a ?? avail.map);
  const dayConfigs = ready ? (configs.map as DayConfigMap) : (kept?.c ?? (configs.map as DayConfigMap));
  const hoursOf = useCallback((d: DateKey) => dayHours(d, settings, dayConfigs), [settings, dayConfigs]);
  const rangesOf = useCallback(
    (d: DateKey): AvailabilityRange[] => (availability.get(d)?.unavailable ? [] : effectiveRanges(normalizeRanges(availability.get(d)?.ranges ?? []), hoursOf(d))),
    [availability, hoursOf],
  );
  const markOf = useCallback((d: DateKey) => dayMark(availability.get(d), hoursOf(d)), [availability, hoursOf]);
  return { availability, dayConfigs, hoursOf, rangesOf, markOf, loading: !ready && !kept, error: avail.error };
}

/** The last date for which `test` holds, walking forward from `from` (the rules below are true up to a date, then false). */
function lastDayWhere(from: DateKey, maxDays: number, test: (d: DateKey) => boolean): DateKey {
  let last = addDays(from, -1);
  for (let i = 0; i <= maxDays; i++) {
    const d = addDays(from, i);
    if (!test(d)) break;
    last = d;
  }
  return last;
}

/**
 * Where the lock window and the lead time end today, from the shared rules (`@shared/availability`): on days up to
 * `lockedThrough` the coach can't remove or shorten time (past days can't be changed at all; on the others the coach can
 * add time, `addOnly`), and open days up to `leadThrough` should already be answered. Recomputed as the clock moves; the
 * dates only change when a boundary is crossed.
 */
export function useAvailabilityRules() {
  const { settings, timezone } = useBranch();
  const { today, now } = useAcademyNow();
  const a = settings.availability;
  const lockDays = effectiveLockDays(settings);
  const lockedThrough = useMemo(() => lastDayWhere(today, Math.max(lockDays, 0) + 2, (d) => isLockedForCoach(d, timezone, lockDays, new Date(now))), [today, lockDays, timezone, now]);
  const leadThrough = useMemo(() => lastDayWhere(today, a.leadTimeDays + 2, (d) => isInsideLeadTime(d, timezone, a.leadTimeDays, new Date(now))), [today, a.leadTimeDays, timezone, now]);
  return {
    today,
    now,
    lockDays,
    lockedThrough,
    leadThrough,
    locked: useCallback((d: DateKey) => d <= lockedThrough, [lockedThrough]),
    /** Locked but not over: the coach can add time there, never remove it (docs/DECISIONS.md §23, C2). */
    addOnly: useCallback((d: DateKey) => d <= lockedThrough && d >= today, [lockedThrough, today]),
    /** The website's lead-time warning: only when the academy warns, inside the lead time, and not locked. */
    leadWarning: useCallback((d: DateKey) => a.leadTimeEnforcement === "warn" && d <= leadThrough && d > lockedThrough, [a.leadTimeEnforcement, leadThrough, lockedThrough]),
  };
}

/**
 * Where the coach stands: the open days inside the lead time not answered yet (neither times nor "not available"; the
 * shared `availabilityGaps`, as the website's Availability page and Home count them), and the furthest date answered.
 */
export function useAvailabilityStanding(availability: AvailabilityMap, dayConfigs: DayConfigMap, hoursOf: (d: DateKey) => ReturnType<typeof dayHours>) {
  const { settings, timezone } = useBranch();
  const { today, now } = useAcademyNow();
  // The lock and the lead time move at a local midnight, which in every zone falls on a quarter hour: the gaps are
  // counted again then, not on every tick of the clock.
  const quarter = Math.floor(now / 900_000) * 900_000;
  const gaps = useMemo(
    () => availabilityGaps({ today, timeZone: timezone, settings, dayConfigs, dayOn: (d) => availability.get(d), now: new Date(quarter) }),
    [today, timezone, settings, dayConfigs, availability, quarter],
  );
  const setThrough = useMemo(() => {
    const ahead = [...availability.entries()].filter(([d]) => d >= today);
    return lastAnswered(ahead, hoursOf);
  }, [availability, today, hoursOf]);
  return { gaps, gapSet: useMemo(() => new Set(gaps), [gaps]), setThrough };
}
