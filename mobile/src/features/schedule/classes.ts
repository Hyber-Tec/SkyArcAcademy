import type { DateKey } from "@shared/time";
import type { SessionDoc, StaffDoc } from "@/features/data/hooks";

/**
 * A class as people see it: the students one coach teaches together, at the same time on the same day. The data keeps
 * one session per student (shared/src/types.ts, Session); the website draws them as cards on the coach's row.
 */
export interface ClassGroup {
  /** `coachId~dateKey~startMin~endMin`: what the class screen (`/class/[id]`) loads. */
  id: string;
  coachId: string;
  coachName: string;
  dateKey: DateKey;
  startMin: number;
  endMin: number;
  /** One per student, by name. */
  sessions: SessionDoc[];
  /** Not canceled. */
  active: SessionDoc[];
}

export function classIdOf(s: Pick<SessionDoc, "coachId" | "dateKey" | "startMin" | "endMin">): string {
  return [s.coachId, s.dateKey, s.startMin, s.endMin].join("~");
}

/** The parts of a class id, or null for one that isn't. */
export function parseClassId(id: string): { coachId: string; dateKey: DateKey; startMin: number; endMin: number } | null {
  const [coachId, dateKey, start, end] = decodeURIComponent(id).split("~");
  const startMin = Number(start);
  const endMin = Number(end);
  if (!coachId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey ?? "") || !Number.isFinite(startMin) || !Number.isFinite(endMin)) return null;
  return { coachId, dateKey, startMin, endMin };
}

/** Sessions grouped into classes, in time order (then by coach). */
export function groupClasses(sessions: readonly SessionDoc[]): ClassGroup[] {
  const groups = new Map<string, ClassGroup>();
  for (const s of sessions) {
    const id = classIdOf(s);
    let g = groups.get(id);
    if (!g) {
      g = { id, coachId: s.coachId, coachName: s.coachName, dateKey: s.dateKey, startMin: s.startMin, endMin: s.endMin, sessions: [], active: [] };
      groups.set(id, g);
    }
    g.sessions.push(s);
    if (s.status !== "canceled") g.active.push(s);
  }
  const list = [...groups.values()];
  for (const g of list) g.sessions.sort((a, b) => a.studentName.localeCompare(b.studentName));
  return list.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.endMin - b.endMin || a.coachName.localeCompare(b.coachName));
}

/** One coach's row on a day: their classes in time order. */
export interface CoachDay {
  coachId: string;
  coachName: string;
  color: string | null;
  classes: ClassGroup[];
}

/**
 * A day's classes by coach, as the website's schedule rows: in the academy's coach order (Settings), then by name;
 * only coaches with classes that day.
 */
export function byCoach(classes: readonly ClassGroup[], staff: ReadonlyMap<string, StaffDoc>, order: readonly string[]): CoachDay[] {
  const rows = new Map<string, CoachDay>();
  for (const c of classes) {
    let row = rows.get(c.coachId);
    if (!row) {
      const person = staff.get(c.coachId);
      row = { coachId: c.coachId, coachName: person?.name || c.coachName, color: person?.color ?? null, classes: [] };
      rows.set(c.coachId, row);
    }
    row.classes.push(c);
  }
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...rows.values()].sort((a, b) => rank(a.coachId) - rank(b.coachId) || a.coachName.localeCompare(b.coachName));
}
