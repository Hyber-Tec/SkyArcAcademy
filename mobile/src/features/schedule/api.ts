import { collection, doc, serverTimestamp, writeBatch } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import type { SessionStatus } from "@shared/settings/defaults";
import { type DateKey, dayEndInstant, formatDateKey, formatTimeRange, toInstant, weekdayOf } from "@shared/time";
import type { AuditChange, Student } from "@shared/types";
import { type ClassDoc, type SessionDoc, branchDoc } from "@/features/data/hooks";
import { addAudit } from "@/lib/audit";
import { db } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import type { Actor } from "@/state/BranchProvider";

/**
 * The office's changes to a class, written as the website writes them (web/src/features/schedule/classApi.ts): a
 * student's mark (`setSeatStatus`), a student added (`addSeat`), moved to another class (`moveSeat`) or taken out
 * (`removeSeat`), with the same fields and the same audit entry in the same batch (`via: app`). The rules let only
 * owners and admins change a seat, and only until its day is over. Each returns at once: the phone shows the change
 * straight away and the server confirms it in the background; a refusal says so, and the change goes back.
 */

/** "Mon, Nov 2 · 4:30 PM – 6:00 PM": a class, as the audit log names it. */
export function classContext(c: { dateKey: DateKey; startMin: number; endMin: number }): string {
  return `${formatDateKey(c.dateKey, "weekdayMedium")} · ${formatTimeRange(c.startMin, c.endMin)}`;
}

const STATUS_VERB: Partial<Record<SessionStatus, string>> = { present: "here", no_show: "a no-show", canceled: "canceled" };

/** A seat's time, as the website writes it (web/src/features/schedule/api.ts, `timeFields`). */
function timeFields(dateKey: DateKey, startMin: number, endMin: number, tz: string) {
  return { dateKey, weekday: weekdayOf(dateKey), startMin, endMin, startAt: toInstant(dateKey, startMin, tz), endAt: toInstant(dateKey, endMin, tz), dayEndAt: dayEndInstant(dateKey, tz) };
}

const stamps = (actor: Actor) => ({ updatedAt: serverTimestamp(), updatedBy: actor.email });

/** A refused write in words: the rules refuse a day that's over, or someone without access. */
function refused(e: unknown): string {
  const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
  return /permission-denied/.test(code) ? "This class can’t be changed any more (its day is over), or you don’t have access." : "Check your connection, then try again.";
}

function auditSeat(
  batch: ReturnType<typeof writeBatch>,
  branchId: string,
  actor: Actor,
  s: Pick<SessionDoc, "studentId" | "studentName" | "dateKey" | "startMin" | "endMin">,
  input: { action: string; entityId: string; summary: string; changes?: AuditChange[] },
) {
  addAudit(batch, branchId, actor, { category: "schedule", entityType: "session", context: classContext(s), dateKey: s.dateKey, studentId: s.studentId, studentName: s.studentName, ...input });
}

/** Who goes in a seat and how it's labelled ("MU for 11/2", "Practice", "Trial 1", or '' for a regular seat). */
export interface SeatDraft {
  student: Pick<Student, "name" | "grade"> & { id: string };
  label: string;
}

/** Puts a student in a class, for the whole class, after its other students (`order`). */
export function addSeat(branchId: string, actor: Actor, timezone: string, c: ClassDoc, d: SeatDraft, order: number): void {
  const ref = doc(collection(db, ROOT.branches, branchId, COL.sessions));
  const label = d.label.trim();
  const data = {
    classId: c.id,
    coachId: "",
    coachName: "",
    studentId: d.student.id,
    studentName: d.student.name,
    studentGrade: d.student.grade ?? "",
    note: label,
    status: "confirmed" as const,
    ...timeFields(c.dateKey, c.startMin, c.endMin, timezone),
    visualOrder: order,
    confirmedAt: null,
    confirmedBy: null,
    source: "manual" as const,
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    createdAt: serverTimestamp(),
    createdBy: actor.email,
    ...stamps(actor),
  };
  const batch = writeBatch(db);
  batch.set(ref, data);
  auditSeat(batch, branchId, actor, data, {
    action: "session.create",
    entityId: ref.id,
    summary: `Added ${d.student.name} to the class${label ? ` (${label})` : ""}`,
    changes: [{ field: "status", label: "Status", from: null, to: SESSION_STATUS_LABELS[data.status] }],
  });
  batch.commit().catch((e: unknown) => toast.error(`Couldn’t add ${d.student.name}`, { description: refused(e) }));
}

/** Moves a student to another class: they take its time (the whole class) and go after its students (`order`). */
export function moveSeat(branchId: string, actor: Actor, timezone: string, s: SessionDoc, to: ClassDoc, order: number): void {
  const batch = writeBatch(db);
  batch.update(branchDoc(branchId, COL.sessions, s.id), { classId: to.id, ...timeFields(to.dateKey, to.startMin, to.endMin, timezone), visualOrder: order, ...stamps(actor) });
  const changes: AuditChange[] = [];
  if (to.dateKey !== s.dateKey) changes.push({ field: "date", label: "Date", from: formatDateKey(s.dateKey, "weekdayMedium"), to: formatDateKey(to.dateKey, "weekdayMedium") });
  if (to.startMin !== s.startMin || to.endMin !== s.endMin) changes.push({ field: "time", label: "Time", from: formatTimeRange(s.startMin, s.endMin), to: formatTimeRange(to.startMin, to.endMin) });
  auditSeat(batch, branchId, actor, s, { action: "session.move", entityId: s.id, summary: `Moved ${s.studentName} to ${classContext(to)}`, changes });
  batch.commit().catch((e: unknown) => toast.error(`Couldn’t move ${s.studentName}`, { description: refused(e) }));
}

/** Takes a student out of a class (to the Trash, from where the website brings them back). */
export function removeSeat(branchId: string, actor: Actor, s: SessionDoc): void {
  const batch = writeBatch(db);
  batch.update(branchDoc(branchId, COL.sessions, s.id), { isDeleted: true, deletedAt: serverTimestamp(), deletedBy: actor.name, ...stamps(actor) });
  auditSeat(batch, branchId, actor, s, { action: "session.delete", entityId: s.id, summary: `Took ${s.studentName} out of the class` });
  batch.commit().catch((e: unknown) => toast.error(`Couldn’t take ${s.studentName} out`, { description: refused(e) }));
}

/**
 * Marks a student here, a no-show or canceled (absent), or back to coming. It returns at once: the phone shows the mark
 * straight away and the server confirms it in the background; a refusal says so, and the mark goes back.
 */
export function setSeatStatus(branchId: string, actor: Actor, s: SessionDoc, status: SessionStatus): void {
  if (s.status === status) return;
  const batch = writeBatch(db);
  batch.update(branchDoc(branchId, COL.sessions, s.id), {
    status,
    ...(status === "confirmed" ? { confirmedAt: serverTimestamp(), confirmedBy: actor.email } : {}),
    ...stamps(actor),
  });
  addAudit(batch, branchId, actor, {
    action: "session.status",
    category: "schedule",
    entityType: "session",
    entityId: s.id,
    summary: STATUS_VERB[status] ? `Marked ${s.studentName} ${STATUS_VERB[status]}` : `Changed ${s.studentName}’s status`,
    context: classContext(s),
    dateKey: s.dateKey,
    studentId: s.studentId,
    studentName: s.studentName,
    changes: [{ field: "status", label: "Status", from: SESSION_STATUS_LABELS[s.status], to: SESSION_STATUS_LABELS[status] }],
  });
  batch.commit().catch((e: unknown) => toast.error(`Couldn’t mark ${s.studentName}`, { description: refused(e) }));
}
