import { collection, doc, serverTimestamp, type Transaction, type WriteBatch } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import type { AuditCategory, AuditChange } from "@shared/types";
import type { Actor } from "@/state/BranchProvider";
import { db } from "./firebase";

/**
 * The audit log, as the website writes it (web/src/lib/audit.ts): every change the app makes (a scanned target's
 * scores and its photo in the Drive, and whatever comes later) adds an append-only entry in the same batch (CLAUDE.md,
 * "Audit"), marked `via: app`. The rules accept an entry only from staff, signed with their own email, at the server's
 * time.
 */
export interface AuditInput {
  action: string;
  category: AuditCategory;
  entityType: string;
  entityId: string;
  summary: string;
  context?: string;
  dateKey?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  coachId?: string | null;
  coachName?: string | null;
  changes?: AuditChange[];
}

export function auditData(actor: Actor, input: AuditInput) {
  return {
    at: serverTimestamp(),
    actorUid: actor.uid,
    actorEmail: actor.email,
    actorName: actor.name,
    actorRole: actor.role,
    action: input.action,
    category: input.category,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    context: input.context ?? "",
    dateKey: input.dateKey ?? null,
    studentId: input.studentId ?? null,
    studentName: input.studentName ?? null,
    coachId: input.coachId ?? null,
    coachName: input.coachName ?? null,
    changes: input.changes ?? [],
    via: "app" as const,
  };
}

/** Adds an append-only audit entry to a batch or transaction. */
export function addAudit(writer: WriteBatch | Transaction, branchId: string, actor: Actor, input: AuditInput): void {
  const ref = doc(collection(db, ROOT.branches, branchId, COL.auditLog));
  (writer as WriteBatch).set(ref, auditData(actor, input));
}
