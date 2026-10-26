import { collection, query, where } from "@react-native-firebase/firestore";
import { availabilityGaps, dayHours } from "@shared/availability";
import { COL, ROOT } from "@shared/paths";
import type { DayHours } from "@shared/settings/defaults";
import { type DateKey, addDays } from "@shared/time";
import type { Availability } from "@shared/types";
import { useCallback, useMemo } from "react";
import { useUnreadNews } from "@/features/announcements/staffNews";
import { useAcademyNow, useDayConfigs } from "@/features/data/hooks";
import type { NewsPost } from "@/features/family/news";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/** How far ahead Home looks for days to set (two weeks, as the website's coach Home, or the notice when it's longer). */
const AHEAD_DAYS = 14;

export interface CoachToDo {
  /** Open days inside the notice not answered yet (neither times nor "not available"), soonest first. */
  gaps: DateKey[];
  /** Posts the coach hasn't opened, pinned first, then the newest. */
  unread: NewsPost[];
  total: number;
  /** Still checking (nothing is counted until everything is in, so nothing comes and goes). */
  loading: boolean;
  /** A date's opening hours (that date's own, else the academy's usual week). */
  hoursOf: (dateKey: DateKey) => DayHours;
}

/**
 * What a coach still has to do, as the website's coach Home counts it (web/src/features/coach/home/useCoachDay.ts): the
 * open days in their notice they haven't answered (the shared `availabilityGaps`, as their Availability tab's amber
 * days), and the posts they haven't read. Classes are taught together by every coach in, so a class with no coach in is
 * the office's to sort out, not a coach's. All in the academy's time zone, kept current.
 */
export function useCoachToDo(): CoachToDo {
  const { branchId, staffId, settings, timezone } = useBranch();
  const { today, now } = useAcademyNow();
  const to = addDays(today, Math.max(AHEAD_DAYS, settings.availability.leadTimeDays + 1));
  // Their own days (by their staff ID).
  const avail = useQuery<Availability>(staffId ? `todo-availability-${branchId}-${staffId}-${today}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.availability), where("staffId", "==", staffId), where("dateKey", ">=", today), where("dateKey", "<=", to)),
  );
  const configs = useDayConfigs(today, to);
  const unread = useUnreadNews();

  const hoursOf = useCallback((d: DateKey) => dayHours(d, settings, configs.map), [settings, configs.map]);
  const gaps = useMemo(() => {
    if (avail.loading || avail.error || configs.loading) return [];
    const savedOn = new Map(avail.data.map((a) => [a.dateKey, a]));
    return availabilityGaps({ today, timeZone: timezone, settings, dayConfigs: configs.map, dayOn: (d) => savedOn.get(d), now: new Date(now) });
  }, [avail.loading, avail.error, avail.data, configs.loading, configs.map, today, timezone, settings, now]);

  const loading = avail.loading || configs.loading || unread.loading;
  return {
    gaps,
    unread: unread.data,
    total: loading ? 0 : gaps.length + unread.data.length,
    loading,
    hoursOf,
  };
}
