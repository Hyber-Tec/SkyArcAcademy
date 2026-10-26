import type { ClassCoach, ClassView } from "@shared/schedule/classes";
import { formatMinutes, type DateKey } from "@shared/time";

export type { ClassView } from "@shared/schedule/classes";

/**
 * A class as people see it (docs/DECISIONS.md §21): its own record (`classes/{id}`), one time on one day with its
 * seats, taught together by every coach in at its time; each student in it is a session with its `classId`. The
 * shared `classViews` puts each class's students in it with the coaches in (`useClassesBetween`); `/class/[id]` opens
 * a class by its ID.
 */

/** The class is on now, in the academy's zone. */
export const isOnNow = (v: ClassView, today: DateKey, nowMin: number) => v.c.dateKey === today && v.c.startMin <= nowMin && nowMin < v.c.endMin;

/** The class is over. */
export const isOver = (v: ClassView, today: DateKey, nowMin: number) => v.c.dateKey < today || (v.c.dateKey === today && v.c.endMin <= nowMin);

/** One of a coach's classes: they're in for all or part of it. */
export const teaches = (v: ClassView, staffId: string | null | undefined) => !!staffId && v.coaches.some((k) => k.staffId === staffId);

/** Every class of the days in a map, in time order. */
export function allClasses(byDate: ReadonlyMap<DateKey, readonly ClassView[]>): ClassView[] {
  return [...byDate.keys()].sort().flatMap((d) => byDate.get(d) ?? []);
}

/** The first name, for a coach's badge and lines: "Daniel". */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/** "until 6:00 PM" or "from 5:00 PM": the part of a class a coach is in for, when it isn't all of it. */
export function partOf(k: ClassCoach, v: ClassView, hour12 = true): string | null {
  if (!k.partial) return null;
  const r = k.ranges;
  return r[r.length - 1].endMin < v.c.endMin ? `until ${formatMinutes(r[r.length - 1].endMin, hour12)}` : `from ${formatMinutes(r[0].startMin, hour12)}`;
}

/** The class's levels, most common first (canceled students left out). */
export function levelsOf(v: ClassView, levelOf: (studentId: string) => string | null | undefined): string[] {
  const count = new Map<string, number>();
  for (const s of v.seats) {
    if (s.status === "canceled") continue;
    const l = levelOf(s.studentId);
    if (l) count.set(l, (count.get(l) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([l]) => l);
}

/** A seat that covers only part of its class (a half-hour trial): its own time. */
export const ownTime = (s: { startMin: number; endMin: number }, v: ClassView) => s.startMin !== v.c.startMin || s.endMin !== v.c.endMin;
