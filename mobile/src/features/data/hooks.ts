import { collection, doc, limit, orderBy, query, where } from "@react-native-firebase/firestore";
import { dayHours } from "@shared/availability";
import type { DriveFile } from "@shared/drive/types";
import { COL, DOC, ROOT } from "@shared/paths";
import { classViews } from "@shared/schedule/classes";
import type { Evaluation } from "@shared/shooting/evaluation";
import type { DayHours } from "@shared/settings/defaults";
import { type DateKey, addDays, nowMinutes, todayKey } from "@shared/time";
import type { AcademyClass, Availability, DayConfig, Session, Staff, Student, StudentPrivateProfile } from "@shared/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/**
 * The app's live data, read as the website's hooks read it (web/src/features/data/hooks.ts): always the academy
 * (`branches/skyarc`). The office reads it all; a coach reads what the rules give them (every class, its students and
 * who's in, their own staff record, no family contacts), so their queries ask for exactly that (a query the rules
 * would refuse fails whole). Firestore de-duplicates identical listeners, so several screens can use the same hook.
 */

export type SessionDoc = Session & { id: string };
export type ClassDoc = AcademyClass & { id: string };
export type AvailabilityDoc = Availability & { id: string };
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
 * The academy's classes between two dates (inclusive), live, as the website's schedule reads them
 * (web/src/features/schedule/useClassData.ts, with the shared `classViews`): each class with its students (in the
 * order booked) and the coaches in at its time, by date, earliest first; and who's in each day (everyone's hours, their
 * availability, the manager's too). Classes are taught together by every coach in, so the office and coaches alike read
 * every class. Who teaches comes from the staff list for the office (the active coaches), and from each day's records
 * for a coach, who can't read the staff list. Null dates pause it.
 */
export function useClassesBetween(from: DateKey | null, to: DateKey | null = from) {
  const { branchId, isAdmin, settings } = useBranch();
  const range = from && to ? `${branchId}-${from}-${to}` : null;
  const classes = useQuery<AcademyClass>(range && `classes-${range}`, () => query(col(branchId, COL.classes), where("dateKey", ">=", from), where("dateKey", "<=", to)));
  const seats = useQuery<Session>(range && `seats-${range}`, () => query(col(branchId, COL.sessions), where("dateKey", ">=", from), where("dateKey", "<=", to)));
  const whosIn = useQuery<Availability>(range && `whos-in-${range}`, () => query(col(branchId, COL.availability), where("dateKey", ">=", from), where("dateKey", "<=", to)));
  const configs = useDayConfigs(from, to);
  const staff = useStaffList();
  // The office knows who teaches; until its staff list is in, nobody would count as a coach.
  const isCoach = useMemo(() => {
    if (!isAdmin) return undefined;
    const ids = new Set(staff.data.filter((s) => s.role === "coach" && s.status === "active").map((s) => s.id));
    return (id: string) => ids.has(id);
  }, [isAdmin, staff.data]);
  const hoursOf = useCallback((d: DateKey): DayHours => dayHours(d, settings, configs.map), [settings, configs.map]);
  const byDate = useMemo(() => classViews(classes.data, seats.data, whosIn.data, hoursOf, isCoach), [classes.data, seats.data, whosIn.data, hoursOf, isCoach]);
  /** Everyone with hours that day (coaches and the manager), earliest first. */
  const inOn = useCallback(
    (d: DateKey) =>
      whosIn.data
        .filter((a) => a.dateKey === d && !a.unavailable && (a.ranges ?? []).length > 0)
        .sort((a, b) => a.ranges[0].startMin - b.ranges[0].startMin || (a.staffName ?? "").localeCompare(b.staffName ?? "")),
    [whosIn.data],
  );
  return {
    byDate,
    availability: whosIn.data,
    inOn,
    hoursOf,
    loading: classes.loading || seats.loading || whosIn.loading || configs.loading || (isAdmin && staff.loading),
    error: classes.error ?? seats.error ?? whosIn.error,
  };
}

/** One class's record (its time, seats and note; its students are its sessions). */
export function useAcademyClass(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<AcademyClass>(id ? `${ROOT.branches}/${branchId}/${COL.classes}/${id}` : null);
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
 * A student's next classes (from today) and last ones (before today), a few of each, deleted ones left out: every one,
 * for the office and coaches alike (classes are taught together). Uses the website's indexes on `studentId` +
 * `dateKey`.
 */
export function useStudentClasses(studentId: string | null, today: DateKey) {
  const { branchId } = useBranch();
  const next = useQuery<Session>(studentId ? `student-next-${branchId}-${studentId}-${today}` : null, () =>
    query(col(branchId, COL.sessions), where("studentId", "==", studentId), where("dateKey", ">=", today), orderBy("dateKey", "asc"), limit(8)),
  );
  const last = useQuery<Session>(studentId ? `student-last-${branchId}-${studentId}-${today}` : null, () =>
    query(col(branchId, COL.sessions), where("studentId", "==", studentId), where("dateKey", "<", today), orderBy("dateKey", "desc"), limit(8)),
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

/** The newest scores across the academy (staff): those of the last `days` days up to `today`, newest first. */
export function useRecentEvaluations(today: DateKey, days = 14) {
  const { branchId } = useBranch();
  const from = addDays(today, -(days - 1));
  const state = useQuery<Evaluation>(`recent-evaluations-${branchId}-${from}`, () => query(col(branchId, COL.evaluations), where("dateKey", ">=", from)));
  const data = useMemo(
    () => state.data.filter((e) => e.shots > 0).sort((a, b) => b.dateKey.localeCompare(a.dateKey) || (b.timeMin ?? 0) - (a.timeMin ?? 0) || a.id.localeCompare(b.id)),
    [state.data],
  );
  return { ...state, data, days };
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

/** Per-date opening hours (day configs) between two dates, as a map by dateKey. Null dates pause it. */
export function useDayConfigs(from: DateKey | null, to: DateKey | null) {
  const { branchId } = useBranch();
  const state = useQuery<DayConfig>(from && to ? `dayconfigs-${branchId}-${from}-${to}` : null, () => query(col(branchId, COL.dayConfigs), where("dateKey", ">=", from), where("dateKey", "<=", to)));
  const map = useMemo(() => new Map(state.data.map((d) => [d.dateKey, d])), [state.data]);
  return { map, loading: state.loading };
}

/** A date's opening hours (its day config, else the academy's usual week from Settings). */
export function useHoursOf(from: DateKey, to: DateKey) {
  const { settings } = useBranch();
  const { map, loading } = useDayConfigs(from, to);
  const hoursOf = useCallback((dateKey: DateKey) => dayHours(dateKey, settings, map), [settings, map]);
  return { hoursOf, loading };
}

/** A document reference inside the academy, for writes. */
export function branchDoc(branchId: string, ...segments: string[]) {
  return doc(db, ROOT.branches, branchId, ...(segments as [string, ...string[]]));
}
