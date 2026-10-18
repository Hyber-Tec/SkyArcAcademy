import { doc, serverTimestamp, writeBatch } from "@react-native-firebase/firestore";
import { COL, ROOT } from "@shared/paths";
import { type MyDetails, cleanDetails, detailChanges, detailsOf, detailsSummary, notificationAudit } from "@shared/profile";
import type { NotificationPrefs, Staff } from "@shared/types";
import { addAudit } from "@/lib/audit";
import { db } from "@/lib/firebase";
import type { Actor } from "@/state/BranchProvider";

/**
 * What a coach changes about themself from More, as the website's Profile does (web/src/features/coach/api.ts, with the
 * rules in @shared/profile): their phone, birth date and address, and their notification switches. Each write carries
 * its audit entry in the same batch. The phone has the change at once (the screens show it); the promise settles when
 * the server answers, which is how a refusal reaches the person.
 */

type StaffRecord = Staff & { id: string };

const staffRef = (branchId: string, id: string) => doc(db, ROOT.branches, branchId, COL.staff, id);

/** Saves the coach's own phone, birth date and address. */
export function saveMyDetails(branchId: string, actor: Actor, staff: StaffRecord, details: MyDetails): Promise<void> {
  const patch = cleanDetails(details);
  const batch = writeBatch(db);
  batch.update(staffRef(branchId, staff.id), { ...patch, updatedAt: serverTimestamp(), updatedBy: actor.email });
  addAudit(batch, branchId, actor, {
    action: "staff.update",
    category: "people",
    entityType: "staff",
    entityId: staff.id,
    summary: detailsSummary(staff.name),
    coachId: staff.id,
    coachName: staff.name,
    changes: detailChanges(detailsOf(staff), patch),
  });
  return batch.commit();
}

/** Turns one of the coach's notification switches on or off. */
export function setMyNotificationPref(branchId: string, actor: Actor, staff: StaffRecord, key: keyof NotificationPrefs, on: boolean): Promise<void> {
  const { summary, change } = notificationAudit(key, on, staff.name);
  const batch = writeBatch(db);
  batch.update(staffRef(branchId, staff.id), { [`notificationPrefs.${key}`]: on, updatedAt: serverTimestamp(), updatedBy: actor.email });
  addAudit(batch, branchId, actor, {
    action: "staff.notifications",
    category: "people",
    entityType: "staff",
    entityId: staff.id,
    summary,
    coachId: staff.id,
    coachName: staff.name,
    changes: [change],
  });
  return batch.commit();
}
