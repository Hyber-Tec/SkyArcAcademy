import { collection, query, where } from "@react-native-firebase/firestore";
import { COL, DOC, ROOT } from "@shared/paths";
import { type PayLine, payLineTotals, payLines } from "@shared/pay/lines";
import { hourlyRate } from "@shared/pay/rates";
import { effectiveRates } from "@shared/pay/shifts";
import type { DateKey } from "@shared/time";
import type { AcademyClass, Availability, ClockShift, Compensation } from "@shared/types";
import { useMemo } from "react";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

export type ShiftDoc = ClockShift & { id: string };
export type OwnPayLine = PayLine<ShiftDoc>;

/**
 * The signed-in employee's own pay dated `from` to `to`: the same records as the website's Payroll (the shared
 * `payLines`, as the website's coach Payroll reads them, web/src/features/timeclock/api.ts `usePayDays`). Pay comes from
 * the kiosk only, at their one hourly rate (docs/DECISIONS.md §23, K1–K6): their time entries (`staffId`), with the
 * classes on those dates and their own days in, since a coach's paid time starts shortly before their first class and
 * ends with their last; and their rate (`staff/{id}/private/compensation`). Each is asked for as the rules let a coach
 * read it, with the website's indexes. Only their own lines: their rate is the only one it knows.
 */
export function useOwnPay(from: DateKey, to: DateKey) {
  const { branchId, staffId, staff, settings } = useBranch();
  const shifts = useQuery<ClockShift>(staffId ? `pay-shifts-${branchId}-${staffId}-${from}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.clockShifts), where("staffId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const classes = useQuery<AcademyClass>(staffId ? `pay-classes-${branchId}-${from}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.classes), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const availability = useQuery<Availability>(staffId ? `pay-availability-${branchId}-${staffId}-${from}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.availability), where("staffId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const comp = useDoc<Compensation>(staffId ? `${ROOT.branches}/${branchId}/${COL.staff}/${staffId}/private/${DOC.compensation}` : null);

  const lines = useMemo(
    () =>
      payLines({ shifts: shifts.data, classes: classes.data, availability: availability.data, settings, ratesFor: () => effectiveRates(staff, comp.data), from, to }).filter(
        (l) => l.staffId === staffId,
      ),
    [shifts.data, classes.data, availability.data, settings, staff, comp.data, from, to, staffId],
  );
  const totals = useMemo(() => payLineTotals(lines), [lines]);
  const rates = effectiveRates(staff, comp.data).rates;
  return {
    lines,
    totals,
    /** The rates on file ($0 until one is set: a missing record means none is). */
    rates,
    /** Their one hourly rate. */
    rate: hourlyRate(rates),
    // The rate too, so pay never shows at $0 while it loads.
    loading: shifts.loading || classes.loading || availability.loading || comp.loading,
    error: shifts.error ?? classes.error ?? availability.error ?? comp.error,
  };
}
