import { collection, query, where } from "@react-native-firebase/firestore";
import { availabilityGaps, dayHours } from "@shared/availability";
import { COL, ROOT } from "@shared/paths";
import { type Conflict, coachConflictText, isAhead, sessionConflicts } from "@shared/schedule/conflicts";
import type { DayHours } from "@shared/settings/defaults";
import { type DateKey, addDays } from "@shared/time";
import type { Availability } from "@shared/types";
import { useCallback, useMemo } from "react";
import { useUnreadNews } from "@/features/announcements/staffNews";
import { type SessionDoc, useAcademyNow, useDayConfigs, useSessionsBetween, useStudentList } from "@/features/data/hooks";
import type { NewsPost } from "@/features/family/news";
import { type ClassGroup, groupClasses } from "@/features/schedule/classes";
import { db } from "@/lib/firebase";
import { useQuery } from "@/lib/firestore";
import { useBranch } from "@/state/BranchProvider";

/** How far ahead Home looks for classes in conflict (four weeks, as the website's coach Home). */
const AHEAD_DAYS = 28;

/** A class of the coach's waiting for the admin: only its students in conflict, and why, as a coach reads it. */
export interface WaitingClass {
  group: ClassGroup;
  reason: string;
}

export interface CoachToDo {
  /** Classes in conflict (something changed since they were booked), soonest first. */
  waiting: WaitingClass[];
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
 * What a coach still has to do, as the website's coach Home counts it (web/src/features/coach/home/useCoachDay.ts):
 * their classes in the next four weeks that are in conflict (the shared `sessionConflicts`, from their own classes,
 * their own availability and each date's hours: what the rules give a coach), the open days in their notice they
 * haven't answered (the shared `availabilityGaps`, as their Availability tab's amber days), and the posts they haven't
 * read. All in the academy's time zone, kept current.
 */
export function useCoachToDo(): CoachToDo {
  const { branchId, staffId, settings, rules, timezone } = useBranch();
  const { today, nowMin, now } = useAcademyNow();
  const to = addDays(today, Math.max(AHEAD_DAYS, settings.availability.leadTimeDays + 1));
  const sessions = useSessionsBetween(today, to);
  // Their own availability, as the rules let a coach read it (by their staff ID).
  const avail = useQuery<Availability>(staffId ? `todo-availability-${branchId}-${staffId}-${today}-${to}` : null, () =>
    query(collection(db, ROOT.branches, branchId, COL.availability), where("staffId", "==", staffId), where("dateKey", ">=", today), where("dateKey", "<=", to)),
  );
  const configs = useDayConfigs(today, to);
  const students = useStudentList();
  const unread = useUnreadNews();

  const hoursOf = useCallback((d: DateKey) => dayHours(d, settings, configs.map), [settings, configs.map]);
  // A failed read counts nothing rather than everything (no availability read would put every class in conflict).
  const ready = !sessions.loading && !avail.loading && !configs.loading && !students.loading;
  const usable = ready && !sessions.error && !avail.error;

  const waiting = useMemo<WaitingClass[]>(() => {
    if (!usable) return [];
    const savedOn = new Map(avail.data.map((a) => [a.dateKey, a]));
    const statusOf = new Map(students.data.map((s) => [s.id, s.status]));
    const coachDay = new Map<string, SessionDoc[]>();
    const studentDay = new Map<string, SessionDoc[]>();
    for (const s of sessions.data) {
      const c = `${s.coachId}|${s.dateKey}`;
      const st = `${s.studentId}|${s.dateKey}`;
      coachDay.set(c, [...(coachDay.get(c) ?? []), s]);
      studentDay.set(st, [...(studentDay.get(st) ?? []), s]);
    }
    const conflictsOf = new Map<string, Conflict[]>();
    for (const s of sessions.data) {
      if (!isAhead(s, today, nowMin)) continue;
      const a = savedOn.get(s.dateKey);
      const list = sessionConflicts(s, {
        hours: hoursOf(s.dateKey),
        availability: a ? { ranges: a.ranges ?? [], unavailable: a.unavailable === true } : null,
        // The coach is signed in and active; a coach can't read the office's view of themself.
        coachState: "active",
        studentStatus: statusOf.get(s.studentId) ?? null,
        coachSessions: coachDay.get(`${s.coachId}|${s.dateKey}`) ?? [],
        studentSessions: studentDay.get(`${s.studentId}|${s.dateKey}`) ?? [],
        maxPerCoach: rules.maxStudentsPerCoach,
      });
      if (list.length) conflictsOf.set(s.id, list);
    }
    // One line per class: its students in conflict, and the reason that matters most across them.
    return groupClasses(sessions.data.filter((s) => conflictsOf.has(s.id))).map((group) => ({
      group,
      reason: (coachConflictText(group.sessions.flatMap((s) => conflictsOf.get(s.id) ?? [])) ?? "").replace(/ Waiting for the admin.*$/, ""),
    }));
  }, [usable, avail.data, students.data, sessions.data, today, nowMin, hoursOf, rules.maxStudentsPerCoach]);

  const gaps = useMemo(() => {
    if (avail.loading || avail.error || configs.loading) return [];
    const savedOn = new Map(avail.data.map((a) => [a.dateKey, a]));
    return availabilityGaps({ today, timeZone: timezone, settings, dayConfigs: configs.map, dayOn: (d) => savedOn.get(d), now: new Date(now) });
  }, [avail.loading, avail.error, avail.data, configs.loading, configs.map, today, timezone, settings, now]);

  const loading = !ready || unread.loading;
  return {
    waiting,
    gaps,
    unread: unread.data,
    total: loading ? 0 : waiting.length + gaps.length + unread.data.length,
    loading,
    hoursOf,
  };
}
