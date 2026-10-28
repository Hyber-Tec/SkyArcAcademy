import { collection, query, where } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { extraMinutes } from "@shared/pay/lines";
import { payRule, shiftPaidTime } from "@shared/pay/paidTime";
import { addDays, startOfWeek } from "@shared/time";
import type { AcademyClass, Availability, ClockShift } from "@shared/types";
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
  /** Minutes paid today (the open shift counts up to now). */
  todayMinutes: number;
  /** Minutes paid this week (the academy's week, from Settings). */
  weekMinutes: number;
  loading: boolean;
}

const ms = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;

/**
 * A coach's own time clock, as the website's coach Home reads it (web/src/features/coach/home/useCoachDay.ts): their
 * shifts (the kiosk writes them; the rules let a coach read only their own, by staff ID) from the day before this week,
 * so a shift still open from last night counts. Nothing is clocked here: the kiosk does that, with their PIN. The minutes
 * are the paid ones (docs/DECISIONS.md §23): from shortly before their first class to the end of their last (the shared
 * `shiftPaidTime`, from those days' classes and their own days in), and extra time an admin added. Kept current: an
 * open shift's minutes go up as the clock moves.
 */
export function useMyClock(): MyClock {
  const { branchId, staffId, staff, settings } = useBranch();
  const { today, now } = useAcademyNow();
  const weekStart = startOfWeek(today, settings.general.weekStartsOn);
  const from = addDays(weekStart, -1);
  const range = staffId ? `${branchId}-${staffId}-${from}-${today}` : null;
  const shifts = useQuery<ClockShift>(range && `clock-${range}`, () =>
    query(collection(db, ROOT.branches, branchId, COL.clockShifts), where("staffId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", today)),
  );
  const classes = useQuery<AcademyClass>(range && `clock-classes-${branchId}-${from}-${today}`, () =>
    query(collection(db, ROOT.branches, branchId, COL.classes), where("dateKey", ">=", from), where("dateKey", "<=", today)),
  );
  const availability = useQuery<Availability>(range && `clock-availability-${range}`, () =>
    query(collection(db, ROOT.branches, branchId, COL.availability), where("staffId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", today)),
  );
  const role = staff?.role;
  return useMemo(() => {
    const rule = payRule(settings);
    const paidOf = (s: ShiftDoc) => shiftPaidTime(s, { role, classes: classes.data, availability: availability.data, rule, nowMs: now });
    const minutesOf = (s: ShiftDoc) => {
      const p = paidOf(s);
      return Math.max(0, (p.endMs - p.startMs) / 60_000) + (s.status === "open" ? 0 : extraMinutes(s));
    };
    const open = shifts.data.find((s) => s.status === "open") ?? null;
    const closed = shifts.data.filter((s) => s.status !== "open" && s.dateKey === today).sort((a, b) => ms(a.clockInAt) - ms(b.clockInAt));
    const todayMinutes = [...closed, ...(open ? [open] : [])].reduce((m, s) => m + minutesOf(s), 0);
    const weekMinutes = shifts.data.filter((s) => s.dateKey >= weekStart).reduce((m, s) => m + minutesOf(s), 0);
    return { open, closed, todayMinutes, weekMinutes, loading: shifts.loading || classes.loading || availability.loading };
  }, [shifts.data, shifts.loading, classes.data, classes.loading, availability.data, availability.loading, role, settings, now, today, weekStart]);
}
