import { serverTimestamp, writeBatch } from "@react-native-firebase/firestore";
import { COL } from "@shared/paths";
import { SESSION_STATUS_LABELS } from "@shared/schedule/status";
import type { SessionStatus } from "@shared/settings/defaults";
import { type DateKey, formatDateKey, formatTimeRange } from "@shared/time";
import { type SessionDoc, branchDoc } from "@/features/data/hooks";
import { addAudit } from "@/lib/audit";
import { db } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import type { Actor } from "@/state/BranchProvider";

/**
 * The office's marks on a class, written as the website writes them (web/src/features/schedule/classApi.ts,
 * `setSeatStatus`): the same fields, and the same audit entry in the same batch (`via: app`). The rules let only owners
 * and admins change a seat, and only until its day is over.
 */

/** "Mon, Nov 2 · 4:30 PM – 6:00 PM": a class, as the audit log names it. */
export function classContext(c: { dateKey: DateKey; startMin: number; endMin: number }): string {
  return `${formatDateKey(c.dateKey, "weekdayMedium")} · ${formatTimeRange(c.startMin, c.endMin)}`;
}

const STATUS_VERB: Partial<Record<SessionStatus, string>> = { present: "here", no_show: "a no-show", canceled: "canceled" };

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
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
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
  batch.commit().catch((e: unknown) => {
    const code = e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
    toast.error(`Couldn’t mark ${s.studentName}`, {
      description: /permission-denied/.test(code) ? "This class can’t be changed any more (its day is over), or you don’t have access." : "Check your connection, then try again.",
    });
  });
}
