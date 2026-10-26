import type { DateKey } from "@shared/time";
import type { SessionDoc } from "@/features/data/hooks";

/**
 * A class as a family sees it: their own students in one class at one time (brothers and sisters in the same class
 * share it), each with their own status and label. Families read their children's sessions only, never the class's
 * record (its note is for the coaches) or who's in, so a class shows no coach here: every coach in teaches it.
 */
export interface FamilyClass {
  /** The class and the time: brothers and sisters in the same class, for the same time, share one. */
  id: string;
  dateKey: DateKey;
  startMin: number;
  endMin: number;
  /** One per student, by name. */
  sessions: SessionDoc[];
  /** Not canceled. */
  active: SessionDoc[];
}

/** Which of the family's classes a session belongs to: its class and its time (a session without a class, its own). */
export const familyClassId = (s: Pick<SessionDoc, "id" | "classId" | "startMin" | "endMin">) => (s.classId ? `${s.classId}~${s.startMin}~${s.endMin}` : s.id);

/** The family's sessions as classes, in time order. */
export function familyClasses(sessions: readonly SessionDoc[]): FamilyClass[] {
  const byId = new Map<string, FamilyClass>();
  for (const s of sessions) {
    const id = familyClassId(s);
    let c = byId.get(id);
    if (!c) {
      c = { id, dateKey: s.dateKey, startMin: s.startMin, endMin: s.endMin, sessions: [], active: [] };
      byId.set(id, c);
    }
    c.sessions.push(s);
    if (s.status !== "canceled") c.active.push(s);
  }
  const list = [...byId.values()];
  for (const c of list) c.sessions.sort((a, b) => a.studentName.localeCompare(b.studentName));
  return list.sort((a, b) => a.dateKey.localeCompare(b.dateKey) || a.startMin - b.startMin || a.endMin - b.endMin || a.id.localeCompare(b.id));
}
