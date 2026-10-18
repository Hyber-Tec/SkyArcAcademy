import { collection, query, where } from "@react-native-firebase/firestore";
import { COL, DOC, ROOT } from "@shared/paths";
import { type PayLine, payLineTotals, payLines } from "@shared/pay/lines";
import { effectiveRates } from "@shared/pay/shifts";
import { type DateKey, addDays } from "@shared/time";
import type { ClockShift, Compensation, Session } from "@shared/types";
import { useMemo } from "react";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

export type ShiftDoc = ClockShift & { id: string };
export type OwnPayLine = PayLine<ShiftDoc>;

/**
 * The signed-in employee's own pay dated `from` to `to`: the same records as the website's Payroll (the shared
 * `payLines`), from their time entries (`staffId`), their classes (`coachId`, a day wider for teaching that crosses
 * midnight) and their rates (`staff/{id}/private/compensation`), each asked for exactly as the rules let a coach read
 * it, with the website's indexes.
 */
export function useOwnPay(from: DateKey, to: DateKey) {
  const { branchId, staffId, staff, settings, rules } = useBranch();
  const wideFrom = addDays(from, -1);
  const wideTo = addDays(to, 1);
  const shifts = useQuery<ClockShift>(staffId ? `pay-shifts-${branchId}-${staffId}-${from}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.clockShifts), where("staffId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const sessions = useQuery<Session>(staffId ? `pay-sessions-${branchId}-${staffId}-${wideFrom}-${wideTo}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.sessions), where("coachId", "==", staffId), where("dateKey", ">=", wideFrom), where("dateKey", "<=", wideTo)),
  );
  const comp = useDoc<Compensation>(staffId ? `${ROOT.branches}/${branchId}/${COL.staff}/${staffId}/private/${DOC.compensation}` : null);

  const lines = useMemo(
    () => payLines({ shifts: shifts.data, sessions: sessions.data, settings, rules, ratesFor: () => effectiveRates(staff, comp.data), from, to }),
    [shifts.data, sessions.data, settings, rules, staff, comp.data, from, to],
  );
  const totals = useMemo(() => payLineTotals(lines), [lines]);
  return {
    lines,
    totals,
    /** The rates the pay uses ($0 until they're set: a missing record means none are). */
    rates: effectiveRates(staff, comp.data).rates,
    // The rates too, so pay never shows at $0 while they load.
    loading: shifts.loading || sessions.loading || comp.loading,
    error: shifts.error ?? sessions.error ?? comp.error,
  };
}
