import { Timestamp, collection, query, where } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { MAKEUP_LOOKBACK_DAYS } from "@shared/schedule/classes";
import { type ClassRequest, type ClassSeats, OPEN_REQUEST_STATUSES, type RequestSeat, classChoices, isOpenRequest, requestHorizon, requestWaitsOn } from "@shared/schedule/requests";
import type { DateKey } from "@shared/time";
import { addDays } from "@shared/time";
import { useMemo, useState } from "react";
import { useAcademyNow } from "@/features/data/hooks";
import { type SessionDoc, useFamilyRequests, useFamilySessions } from "@/features/family/data";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/**
 * Families' requests for classes and the open seats, read as the website reads them (web/src/features/requests/hooks.ts):
 * every member reads `classSeats` (a class's time and how many seats are taken, no names); the office reads every
 * request, a family only its own children's (`useFamilyRequests` in src/features/family/data.ts). Only the server
 * writes either.
 */

export type RequestDoc = ClassRequest & { id: string };
export type ClassSeatsDoc = ClassSeats & { id: string };

export const millis = (t: unknown) => (t as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;

/** Answered and withdrawn requests stay listed this long (the office's "Decided", a family's Requests). */
export const RECENT_REQUESTS_MS = 14 * 86_400_000;

/** Classes between two dates with how many seats are taken, by time; none in the Trash. */
export function useClassSeats(from: DateKey, to: DateKey, enabled = true) {
  const { branchId } = useBranch();
  const res = useQuery<ClassSeats>(enabled ? `class-seats-${branchId}-${from}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.classSeats), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const data = useMemo(() => res.data.filter((c) => !c.isDeleted).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin), [res.data]);
  return { ...res, data };
}

/** One class's seats (a request shows whether its class, or the class suggested, still has room). */
export function useClassSeat(classId: string | null) {
  const { branchId } = useBranch();
  return useDoc<ClassSeats>(classId ? `${ROOT.branches}/${branchId}/${COL.classSeats}/${classId}` : null);
}

/**
 * The office's open requests: `pending`, waiting on the office (the badges count these), and `offered`, waiting on a
 * family's answer to a class suggested; each the soonest class first (the one suggested, while it waits on the family).
 */
export function useOpenRequests(enabled = true) {
  const { branchId } = useBranch();
  const res = useQuery<ClassRequest>(enabled ? `open-requests-${branchId}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.classRequests), where("status", "in", [...OPEN_REQUEST_STATUSES])),
  );
  return useMemo(() => {
    const all = [...res.data].sort((a, b) => millis(requestWaitsOn(a).startAt) - millis(requestWaitsOn(b).startAt) || millis(a.createdAt) - millis(b.createdAt));
    return { ...res, data: all, pending: all.filter((r) => r.status === "pending"), offered: all.filter((r) => r.status === "offered") };
  }, [res]);
}

/** Requests waiting for the office, soonest class first. */
export function usePendingRequests(enabled = true) {
  const open = useOpenRequests(enabled);
  return { ...open, data: open.pending };
}

/** Requests answered or withdrawn in the last two weeks, the latest first (the office's "Decided"). */
export function useRecentRequests(enabled = true) {
  const { branchId } = useBranch();
  const [since] = useState(() => Date.now() - RECENT_REQUESTS_MS);
  const res = useQuery<ClassRequest>(enabled ? `recent-requests-${branchId}-${since}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.classRequests), where("updatedAt", ">=", Timestamp.fromMillis(since))),
  );
  const data = useMemo(() => res.data.filter((r) => !isOpenRequest(r)).sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt)), [res.data]);
  return { ...res, data };
}

/** One request, by its ID (a notice or a list opens it). */
export function useClassRequest(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<ClassRequest>(id ? `${ROOT.branches}/${branchId}/${COL.classRequests}/${id}` : null);
}

const seatOf = (s: SessionDoc): RequestSeat => ({
  id: s.id,
  classId: s.classId,
  studentId: s.studentId,
  dateKey: s.dateKey,
  startMin: s.startMin,
  endMin: s.endMin,
  status: s.status,
  note: s.note,
  isDeleted: s.isDeleted,
  startMs: millis(s.startAt),
});

/**
 * The classes a student could ask for now, or the office suggest to them (`classChoices`, as the server checks them):
 * seats open, ahead within the families' horizon, none they're in or at the same time (the class being moved aside),
 * none another open request asks for (but `requestId`'s own), none in `exclude`; by day.
 */
export function useClassChoices(opts: { studentId: string | null; forSessionId: string | null; requestId?: string | null; exclude?: readonly (string | null | undefined)[] }) {
  const { settings } = useBranch();
  const { today, now } = useAcademyNow();
  const horizon = requestHorizon(today, settings);
  const since = addDays(today, -MAKEUP_LOOKBACK_DAYS);
  const ids = useMemo(() => (opts.studentId ? [opts.studentId] : []), [opts.studentId]);
  const seats = useFamilySessions(ids, since, horizon);
  const requests = useFamilyRequests(ids);
  const classes = useClassSeats(today, horizon, !!opts.studentId);
  const exclude = (opts.exclude ?? []).filter(Boolean).join("|");
  const choices = useMemo(() => {
    const pending = requests.data.filter((r) => isOpenRequest(r) && r.id !== opts.requestId);
    return classChoices(
      classes.data.map((c) => ({ ...c, startMs: millis(c.startAt) })),
      { seats: seats.data.map(seatOf), pending, forSessionId: opts.forSessionId, nowMs: now, horizon, exclude: exclude.split("|") },
    );
  }, [classes.data, seats.data, requests.data, opts.requestId, opts.forSessionId, now, horizon, exclude]);
  return { choices, horizon, loading: seats.loading || classes.loading || requests.loading };
}
