import { collection, query, where } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import type { ClassRequest, ClassSeats } from "@shared/schedule/requests";
import type { DateKey } from "@shared/time";
import { useMemo } from "react";
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

/** Classes between two dates with how many seats are taken, by time; none in the Trash. */
export function useClassSeats(from: DateKey, to: DateKey, enabled = true) {
  const { branchId } = useBranch();
  const res = useQuery<ClassSeats>(enabled ? `class-seats-${branchId}-${from}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.classSeats), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const data = useMemo(() => res.data.filter((c) => !c.isDeleted).sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin), [res.data]);
  return { ...res, data };
}

/** One class's seats (the office's request shows whether the class has room). */
export function useClassSeat(classId: string | null) {
  const { branchId } = useBranch();
  return useDoc<ClassSeats>(classId ? `${ROOT.branches}/${branchId}/${COL.classSeats}/${classId}` : null);
}

/** Requests still waiting for the office, soonest class first. */
export function usePendingRequests(enabled = true) {
  const { branchId } = useBranch();
  const res = useQuery<ClassRequest>(enabled ? `pending-requests-${branchId}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.classRequests), where("status", "==", "pending")),
  );
  const data = useMemo(() => [...res.data].sort((a, b) => millis(a.startAt) - millis(b.startAt) || millis(a.createdAt) - millis(b.createdAt)), [res.data]);
  return { ...res, data };
}

/** One request, by its ID (a notice or a list opens it). */
export function useClassRequest(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<ClassRequest>(id ? `${ROOT.branches}/${branchId}/${COL.classRequests}/${id}` : null);
}
