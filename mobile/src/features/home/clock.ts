import { collection, query, where } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { addDays, startOfWeek } from "@shared/time";
import type { ClockShift } from "@shared/types";
import { useMemo } from "react";
import { useAcademyNow } from "@/features/data/hooks";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

export type ShiftDoc = ClockShift & { id: string };

export interface MyClock {
  /** The shift they're clocked in on, if any (it may have started yesterday). */
  open: ShiftDoc | null;
  /** Today's finished shifts, in order. */
  closed: ShiftDoc[];
  /** Minutes clocked today (the open shift counts up to now). */
  todayMinutes: number;
  /** Minutes clocked this week (the academy's week, from Settings). */
  weekMinutes: number;
  loading: boolean;
}

const ms = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;

/**
 * A coach's own time clock, as the website's coach Home reads it (web/src/features/coach/home/useCoachDay.ts): their
 * shifts (the kiosk writes them; the rules let a coach read only their own, by staff ID) from the day before this week,
 * so a shift still open from last night counts. Nothing is clocked here: the kiosk does that, with their PIN. Kept
 * current: an open shift's minutes go up as the clock moves.
 */
export function useMyClock(): MyClock {
  const { branchId, staffId, settings } = useBranch();
  const { today, now } = useAcademyNow();
  const weekStart = startOfWeek(today, settings.general.weekStartsOn);
  const from = addDays(weekStart, -1);
  const shifts = useQuery<ClockShift>(staffId ? `clock-${branchId}-${staffId}-${from}-${today}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.clockShifts), where("staffId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", today)),
  );
  return useMemo(() => {
    const minutesOf = (s: ShiftDoc) => Math.max(0, ((s.status === "open" ? now : ms(s.clockOutAt)) - ms(s.clockInAt)) / 60_000);
    const open = shifts.data.find((s) => s.status === "open") ?? null;
    const closed = shifts.data.filter((s) => s.status !== "open" && s.dateKey === today).sort((a, b) => ms(a.clockInAt) - ms(b.clockInAt));
    const todayMinutes = [...closed, ...(open ? [open] : [])].reduce((m, s) => m + minutesOf(s), 0);
    const weekMinutes = shifts.data.filter((s) => s.dateKey >= weekStart).reduce((m, s) => m + minutesOf(s), 0);
    return { open, closed, todayMinutes, weekMinutes, loading: shifts.loading };
  }, [shifts.data, shifts.loading, now, today, weekStart]);
}
