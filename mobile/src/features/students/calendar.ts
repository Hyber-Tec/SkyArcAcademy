import { collection, query, where } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { type DateKey, addMonths, endOfMonth, startOfMonth } from "@shared/time";
import type { DayConfig, Session } from "@shared/types";
import { useCallback, useMemo, useState } from "react";
import type { SessionDoc } from "@/features/data/hooks";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/**
 * A student's classes month by month, for the calendar on their page (the website's StudentMonthCalendar): the months
 * a scrolling calendar shows, and the classes and opening hours in them.
 */

/**
 * The dates a scrolling month calendar loads: the months on screen and `pad` months either side. It moves only once the
 * view leaves it, so scrolling doesn't ask again for every month (web/src/lib/useLoadWindow.ts).
 */
export function useLoadWindow(around: DateKey, pad = 2) {
  const [win, setWin] = useState(() => ({ from: startOfMonth(addMonths(around, -pad)), to: endOfMonth(addMonths(around, pad + 1)) }));
  const onVisibleRangeChange = useCallback(
    (from: DateKey, to: DateKey) => setWin((w) => (from >= w.from && to <= w.to ? w : { from: startOfMonth(addMonths(from, -pad)), to: endOfMonth(addMonths(to, pad)) })),
    [pad],
  );
  return { ...win, onVisibleRangeChange };
}

/**
 * What a query last gave, kept while the next range loads, so the calendar doesn't empty for a moment as it moves.
 * `data` must keep its identity between renders (memoized) until it changes.
 */
function useKept<T>(data: T, loading: boolean): T {
  const [kept, setKept] = useState(data);
  if (!loading && kept !== data) setKept(data);
  return loading ? kept : data;
}

/**
 * The student's classes between two dates (inclusive), deleted ones (Trash) left out, by date and time: every one, for
 * the office and coaches alike (classes are taught together). The website's index on `studentId` + `dateKey`.
 */
export function useStudentClassesBetween(studentId: string | null, from: DateKey, to: DateKey) {
  const { branchId } = useBranch();
  const state = useQuery<Session>(studentId ? `student-calendar-${branchId}-${studentId}-${from}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.sessions), where("studentId", "==", studentId), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const live = useMemo(
    () => state.data.filter((s) => !s.isDeleted).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.endMin - b.endMin),
    [state.data],
  );
  const data: SessionDoc[] = useKept(live, state.loading);
  return { data, loading: state.loading, error: state.error };
}

/**
 * The academy's day-by-day opening hours (day configs) between two dates, by date; the last range's kept while it
 * moves. A null `from` pauses it.
 */
export function useDayConfigsBetween(from: DateKey | null, to: DateKey) {
  const { branchId } = useBranch();
  const state = useQuery<DayConfig>(from ? `dayconfigs-${branchId}-${from}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.dayConfigs), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const map = useMemo(() => new Map(state.data.map((d) => [d.dateKey, d])), [state.data]);
  return useKept(map, state.loading);
}
