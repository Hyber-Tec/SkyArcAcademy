import { doc, serverTimestamp, writeBatch } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { type Evaluation, POSITION_LABELS, SOURCE_LABELS, per10 } from "@shared/shooting/evaluation";
import { formatDateKey } from "@shared/time";
import type { AuditStamp } from "@shared/types";
import { addAudit } from "@/lib/audit";
import { db } from "@/lib/firebase";
import type { Actor } from "@/state/BranchProvider";

/** Changing and deleting a score from the phone, as the website does (web/src/features/scores/api.ts), with audit entries. */

export type NewEvaluation = Omit<Evaluation, keyof AuditStamp>;

const describe = (e: Pick<Evaluation, "source" | "position" | "dateKey" | "total" | "shots">) =>
  `${SOURCE_LABELS[e.source]} ${POSITION_LABELS[e.position].toLowerCase()} result of ${formatDateKey(e.dateKey, "medium")} (${e.total} over ${e.shots} shots, ${per10(e.total, e.shots) ?? 0} per 10)`;

const ref = (branchId: string, id: string) => doc(db, ROOT.branches, branchId, COL.evaluations, id);

export async function updateEvaluation(branchId: string, actor: Actor, id: string, before: Evaluation, data: NewEvaluation): Promise<void> {
  const batch = writeBatch(db);
  batch.set(ref(branchId, id), { ...data, createdAt: before.createdAt ?? serverTimestamp(), createdBy: before.createdBy ?? actor.email, updatedAt: serverTimestamp(), updatedBy: actor.email });
  addAudit(batch, branchId, actor, {
    action: "evaluation.edit",
    category: "reports",
    entityType: "evaluation",
    entityId: id,
    summary: `Changed ${data.studentName}'s ${describe(data)}`,
    dateKey: data.dateKey,
    studentId: data.studentId,
    studentName: data.studentName,
  });
  await batch.commit();
}

/** Deletes a score; its file stays in the Drive (its `evaluationId` then points nowhere, read as no scores). */
export async function deleteEvaluation(branchId: string, actor: Actor, id: string, e: Evaluation): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(ref(branchId, id));
  addAudit(batch, branchId, actor, {
    action: "evaluation.delete",
    category: "reports",
    entityType: "evaluation",
    entityId: id,
    summary: `Deleted ${e.studentName}'s ${describe(e)}`,
    dateKey: e.dateKey,
    studentId: e.studentId,
    studentName: e.studentName,
  });
  await batch.commit();
}
