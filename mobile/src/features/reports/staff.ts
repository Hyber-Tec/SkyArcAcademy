import { collection, doc, limit, orderBy, query, serverTimestamp, where, writeBatch } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { reportName } from "@shared/reports/compose";
import type { ProgressReportDoc } from "@shared/reports/types";
import type { Member } from "@shared/types";
import { useMemo } from "react";
import { addAudit } from "@/lib/audit";
import { db } from "@/lib/firebase";
import { useDoc, useQuery } from "@/lib/firestore";
import { type Actor, useBranch } from "@/state/BranchProvider";

/**
 * Progress reports for the staff, as the website reads and shares them (web/src/features/reports/data.ts and api.ts):
 * admins and coaches read every report and share a draft with the family; only admins stop sharing one (making,
 * changing, renaming and deleting stay on the website). Each change carries its audit entry in the same batch.
 */

export type StaffReport = ProgressReportDoc & { id: string };

const col = (branchId: string, name: string) => collection(db, ROOT.branches, branchId, name);

/** Every report, newest first, as the website's Reports page lists them. */
export function useAllReports() {
  const { branchId } = useBranch();
  return useQuery<ProgressReportDoc>(`reports-all-${branchId}`, () => query(col(branchId, COL.progressReports), orderBy("generatedAt", "desc"), limit(400)));
}

/** One report (the staff read every one). */
export function useStaffReport(id: string | null) {
  const { branchId } = useBranch();
  return useDoc<ProgressReportDoc>(id ? `${ROOT.branches}/${branchId}/${COL.progressReports}/${id}` : null);
}

/** The parent and student accounts a shared report reaches (admins only: they read the academy's members). */
export function useReportAudience(studentId: string, enabled: boolean) {
  const { branchId } = useBranch();
  const parents = useQuery<Member>(enabled ? `audience-parents-${branchId}-${studentId}` : null, () => query(col(branchId, COL.members), where("studentIds", "array-contains", studentId)));
  const own = useQuery<Member>(enabled ? `audience-student-${branchId}-${studentId}` : null, () => query(col(branchId, COL.members), where("studentId", "==", studentId)));
  const data = useMemo(
    () => [...parents.data, ...own.data].filter((m, i, all) => m.status === "active" && (m.role === "parent" || m.role === "student") && all.findIndex((x) => x.email === m.email) === i),
    [parents.data, own.data],
  );
  return { data, loading: parents.loading || own.loading };
}

const person = (actor: Actor) => ({ email: actor.email, name: actor.name, role: actor.role });

function audit(batch: ReturnType<typeof writeBatch>, branchId: string, actor: Actor, r: StaffReport, action: string, summary: string) {
  addAudit(batch, branchId, actor, { action, category: "reports", entityType: "progressReport", entityId: r.id, summary, studentId: r.studentId, studentName: r.studentName, changes: [] });
}

/**
 * Shares a draft with the family (admins and coaches). Cloud Functions tell the family (in the app, and by email with a
 * link when `emailFamily`). Kept on the phone at once; settles when the server has it.
 */
export function shareReport(branchId: string, actor: Actor, r: StaffReport, emailFamily: boolean): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, ROOT.branches, branchId, COL.progressReports, r.id), {
    status: "shared",
    sharedWithParents: true,
    sharedAt: serverTimestamp(),
    sharedBy: { ...person(actor), emailFamily },
    updatedAt: serverTimestamp(),
    updatedBy: actor.email,
  });
  audit(batch, branchId, actor, r, "report.share", `Shared ${r.studentName}'s ${reportName(r)} with the family${emailFamily ? " and asked to email them" : ""}`);
  return batch.commit();
}

/** Back to a draft: the family no longer sees it (admins). */
export function unshareReport(branchId: string, actor: Actor, r: StaffReport): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, ROOT.branches, branchId, COL.progressReports, r.id), { status: "draft", sharedWithParents: false, updatedAt: serverTimestamp(), updatedBy: actor.email });
  audit(batch, branchId, actor, r, "report.unshare", `Stopped sharing ${r.studentName}'s ${reportName(r)}`);
  return batch.commit();
}
