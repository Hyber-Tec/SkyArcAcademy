import { collection, doc, limit, orderBy, query, where } from "@react-native-firebase/firestore";
import { dayHours } from "@shared/availability";
import type { DriveFile } from "@shared/drive/types";
import { COL, DOC, ROOT } from "@shared/paths";
import type { Evaluation } from "@shared/shooting/evaluation";
import { type DateKey, nowMinutes, todayKey } from "@shared/time";
import type { DayConfig, Session, Staff, Student, StudentPrivateProfile } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/**
 * The app's live data, read as the website's hooks read it (web/src/features/data/hooks.ts): always the academy
 * (`branches/skyarc`). The office reads it all; a coach reads what the rules give them (their own classes and staff
 * record, no family contacts), so their queries ask for exactly that (a query the rules would refuse fails whole).
 * Firestore de-duplicates identical listeners, so several screens can use the same hook.
 */

export type SessionDoc = Session & { id: string };
export type StaffDoc = Staff & { id: string };
export type StudentDoc = Student & { id: string };
export type EvaluationDoc = Evaluation & { id: string };
export type DriveFileDoc = DriveFile & { id: string };

const col = (branchId: string, name: string) => collection(db, ROOT.branches, branchId, name);

/** Today in the academy's zone and the minute of the day, kept current (every 30 s, and when the app comes back). */
export function useAcademyNow(): { today: DateKey; nowMin: number; now: number } {
  const { timezone } = useBranch();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && setNow(Date.now()));
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, []);
  return useMemo(() => ({ today: todayKey(timezone, now), nowMin: nowMinutes(timezone, now), now }), [timezone, now]);
}

/**
 * The classes between two dates (inclusive), deleted ones (Trash) left out, in time order: every coach's for the office,
 * a coach's own for a coach.
 */
export function useSessionsBetween(from: DateKey, to: DateKey) {
  const { branchId, isCoach, staffId } = useBranch();
  const state = useQuery<Session>(
    isCoach ? (staffId ? `sessions-${branchId}-${staffId}-${from}-${to}` : null) : `sessions-${branchId}-${from}-${to}`,
    () =>
      isCoach
        ? query(col(branchId, COL.sessions), where("coachId", "==", staffId), where("dateKey", ">=", from), where("dateKey", "<=", to))
        : query(col(branchId, COL.sessions), where("dateKey", ">=", from), where("dateKey", "<=", to)),
  );
  const data = useMemo(
    () =>
      state.data
        .filter((s) => !s.isDeleted)
        .sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.endMin - b.endMin || a.studentName.localeCompare(b.studentName)),
    [state.data],
  );
  return { ...state, data };
}

/** Every employee (owners, admins and coaches), by name; a coach has only their own record. */
export function useStaffList() {
  const { branchId, isCoach, staff } = useBranch();
  const all = useQuery<Staff>(isCoach ? null : `staff-${branchId}`, () => query(col(branchId, COL.staff), orderBy("nameLower")));
  const own = useMemo(() => (staff ? [staff] : []), [staff]);
  return isCoach ? { data: own, loading: false, error: null } : all;
}

/** One employee. */
export function useStaff(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<Staff>(id ? `${ROOT.branches}/${branchId}/${COL.staff}/${id}` : null);
}

/** Every student, by name. */
export function useStudentList() {
  const { branchId } = useBranch();
  return useQuery<Student>(`students-${branchId}`, () => query(col(branchId, COL.students), orderBy("nameLower")));
}

/** One student's basic record. */
export function useStudent(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<Student>(id ? `${ROOT.branches}/${branchId}/${COL.students}/${id}` : null);
}

/** One student's contacts and parents (the office's only, as on the website: a coach never asks). */
export function useStudentPrivate(id: string | null) {
  const { branchId, isAdmin } = useBranch();
  return useDoc<StudentPrivateProfile>(id && isAdmin ? `${ROOT.branches}/${branchId}/${COL.students}/${id}/private/${DOC.privateProfile}` : null);
}

/**
 * A student's next classes (from today) and last ones (before today), a few of each, deleted ones left out. Uses the
 * website's indexes on `studentId` + `dateKey`.
 */
export function useStudentClasses(studentId: string | null, today: DateKey) {
  const { branchId, isCoach, staffId } = useBranch();
  // A coach sees their own classes with the student (the rules give them no one else's).
  const mine = isCoach ? [where("coachId", "==", staffId)] : [];
  const who = isCoach ? `${staffId}-` : "";
  const ok = !!studentId && (!isCoach || !!staffId);
  const next = useQuery<Session>(ok ? `student-next-${branchId}-${who}${studentId}-${today}` : null, () =>
    query(col(branchId, COL.sessions), where("studentId", "==", studentId), ...mine, where("dateKey", ">=", today), orderBy("dateKey", "asc"), limit(8)),
  );
  const last = useQuery<Session>(ok ? `student-last-${branchId}-${who}${studentId}-${today}` : null, () =>
    query(col(branchId, COL.sessions), where("studentId", "==", studentId), ...mine, where("dateKey", "<", today), orderBy("dateKey", "desc"), limit(8)),
  );
  return useMemo(() => {
    const live = (list: SessionDoc[]) => list.filter((s) => !s.isDeleted);
    const byTime = (a: SessionDoc, b: SessionDoc) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin;
    return {
      next: live(next.data).sort(byTime),
      last: live(last.data).sort((a, b) => byTime(b, a)),
      loading: next.loading || last.loading,
    };
  }, [next.data, last.data, next.loading, last.loading]);
}

/** A student's scored targets (SIUS results and paper cards), newest first. */
export function useStudentEvaluations(studentId: string | null) {
  const { branchId } = useBranch();
  const state = useQuery<Evaluation>(studentId ? `evaluations-${branchId}-${studentId}` : null, () => query(col(branchId, COL.evaluations), where("studentId", "==", studentId)));
  const data = useMemo(() => state.data.slice().sort((a, b) => b.dateKey.localeCompare(a.dateKey) || (b.timeMin ?? 0) - (a.timeMin ?? 0) || a.id.localeCompare(b.id)), [state.data]);
  return { ...state, data };
}

/** One scored target (a SIUS result or a paper card). */
export function useEvaluation(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<Evaluation>(id ? `${ROOT.branches}/${branchId}/${COL.evaluations}/${id}` : null);
}

const millis = (t: { toMillis?: () => number } | null | undefined) => t?.toMillis?.() ?? 0;

/** The files in a student's Drive folder (at any depth), Trash left out, newest first. */
export function useStudentFiles(studentId: string | null) {
  const { branchId } = useBranch();
  const state = useQuery<DriveFile>(studentId ? `drive-files-${branchId}-${studentId}` : null, () => query(col(branchId, COL.driveFiles), where("studentId", "==", studentId)));
  const data = useMemo(() => state.data.filter((f) => !f.trashed).sort((a, b) => millis(b.uploadedAt) - millis(a.uploadedAt) || a.name.localeCompare(b.name)), [state.data]);
  return { ...state, data };
}

/** One Drive file's record. */
export function useDriveFile(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<DriveFile>(id ? `${ROOT.branches}/${branchId}/${COL.driveFiles}/${id}` : null);
}

/** Per-date opening hours (day configs) between two dates, as a map by dateKey. */
export function useDayConfigs(from: DateKey, to: DateKey) {
  const { branchId } = useBranch();
  const state = useQuery<DayConfig>(`dayconfigs-${branchId}-${from}-${to}`, () => query(col(branchId, COL.dayConfigs), where("dateKey", ">=", from), where("dateKey", "<=", to)));
  const map = useMemo(() => new Map(state.data.map((d) => [d.dateKey, d])), [state.data]);
  return { map, loading: state.loading };
}

/** A date's opening hours (its day config, else the academy's usual week from Settings). */
export function useHoursOf(from: DateKey, to: DateKey) {
  const { settings } = useBranch();
  const { map, loading } = useDayConfigs(from, to);
  return { hoursOf: (dateKey: DateKey) => dayHours(dateKey, settings, map), loading };
}

/** A document reference inside the academy, for writes. */
export function branchDoc(branchId: string, ...segments: string[]) {
  return doc(db, ROOT.branches, branchId, ...(segments as [string, ...string[]]));
}
