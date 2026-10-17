import type { DateKey } from "@shared/time";
import type { SessionDoc } from "@/features/data/hooks";

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
