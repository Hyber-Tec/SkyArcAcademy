import { collection, doc, getDoc, serverTimestamp, writeBatch } from "@react-native-firebase/firestore";
import { type DriveActor, studentFolderId } from "@shared/drive/types";
import { COL, ROOT } from "@shared/paths";
import { type Evaluation, POSITION_LABELS, type Position, SOURCE_LABELS, per10 } from "@shared/shooting/evaluation";
import { cardEvaluation } from "@shared/targets/flat";
import type { CardReview } from "@shared/targets/review";
import { type DateKey, formatDateKey } from "@shared/time";
import { addAudit } from "@/lib/audit";
import { db } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import type { Actor } from "@/state/BranchProvider";
import type { CardFile } from "./photo";
import { keepForUpload, uploadAfter } from "./uploads";

/**
 * Saving a scanned card, as the website saves a SIUS result (web/src/features/drive/upload.ts, saveResults): the
 * file's record in the student's Drive folder and the card's scores (an evaluation, with its audit entry) in one
 * batch, then the file itself, which the Storage rules accept only against that record.
 *
 * Saving doesn't keep the person waiting: the phone keeps the batch at once (the student's page shows the scores
 * straight away) while the server confirms it, and the card's copy uploads after that, in the background, kept on the
 * phone until the Drive has it (uploads.ts). Anything that fails later says so in a message.
 */

export interface SaveCard {
  branchId: string;
  actor: Actor;
  student: { id: string; name: string };
  position: Position;
  dateKey: DateKey;
  note: string;
  /** The reviewed shots; null when only a total was typed. */
  review: CardReview | null;
  total: number | null;
  file: CardFile;
}

const driveActor = (a: Actor): DriveActor => ({ uid: a.uid, email: a.email, name: a.name });

/** The card's name in the Drive: its date and position, so the website can tell the position from it. */
export function cardFileName(dateKey: DateKey, position: Position): string {
  return `${dateKey} ${POSITION_LABELS[position]} paper card.jpg`;
}

/** Whether each student's Drive folder has its document yet, asked once (as soon as the student is chosen). */
const folders = new Map<string, Promise<boolean>>();

export function knowFolder(branchId: string, studentId: string): Promise<boolean> {
  const key = `${branchId}/${studentId}`;
  let known = folders.get(key);
  if (!known) {
    known = getDoc(doc(db, ROOT.branches, branchId, COL.driveFolders, studentFolderId(studentId))).then(
      (snap) => snap.exists(),
      () => {
        folders.delete(key);
        return false;
      },
    );
    folders.set(key, known);
  }
  return known;
}

const describe = (e: Pick<Evaluation, "position" | "dateKey" | "total" | "shots">) =>
  `${SOURCE_LABELS.paper} ${POSITION_LABELS[e.position].toLowerCase()} result of ${formatDateKey(e.dateKey, "medium")} (${e.total} over ${e.shots} shots, ${per10(e.total, e.shots) ?? 0} per 10)`;

/**
 * Writes the card and returns as soon as the phone has it; the server's confirmation and the upload follow by
 * themselves, with a message if either fails.
 */
export async function saveCard(c: SaveCard): Promise<{ evaluationId: string; fileId: string }> {
  const col = (name: string) => collection(db, ROOT.branches, c.branchId, name);
  const fileRef = doc(col(COL.driveFiles));
  const evaluationRef = doc(col(COL.evaluations));
  const folderId = studentFolderId(c.student.id);
  const folderRef = doc(db, ROOT.branches, c.branchId, COL.driveFolders, folderId);
  const by = driveActor(c.actor);
  const name = cardFileName(c.dateKey, c.position);
  const data = cardEvaluation(c, fileRef.id);

  const batch = writeBatch(db);
  // The student's folder exists as a stand-in until its first file: made now if it isn't there yet. A student's folder,
  // and everything in it, is everyone's on staff (coaches' lists ask for `access == 'staff'`).
  if (await knowFolder(c.branchId, c.student.id)) batch.update(folderRef, { updatedAt: serverTimestamp(), updatedBy: by });
  else batch.set(folderRef, { name: c.student.name, parentId: null, studentId: c.student.id, access: "staff", createdAt: serverTimestamp(), createdBy: by, updatedAt: serverTimestamp(), updatedBy: by });
  batch.set(fileRef, {
    name,
    size: c.file.size,
    kind: "jpg",
    mime: "image/jpeg",
    status: "uploading",
    folderId,
    studentId: c.student.id,
    access: "staff",
    evaluationId: evaluationRef.id,
    uploadedAt: serverTimestamp(),
    uploadedBy: by,
  });
  batch.set(evaluationRef, { ...data, createdAt: serverTimestamp(), createdBy: c.actor.email, updatedAt: serverTimestamp(), updatedBy: c.actor.email });
  addAudit(batch, c.branchId, c.actor, {
    action: "evaluation.add",
    category: "reports",
    entityType: "evaluation",
    entityId: evaluationRef.id,
    summary: `Added ${c.student.name}'s ${describe(data)}, scanned with the phone`,
    dateKey: c.dateKey,
    studentId: c.student.id,
    studentName: c.student.name,
  });

  // The card's copy waits in the app's files until the Drive has it, even if the app is closed first (uploads.ts).
  const upload = { branchId: c.branchId, fileId: fileRef.id, name, studentName: c.student.name, savedAt: Date.now() };
  keepForUpload(upload, c.file.uri);
  // The folder now has its document (or will in a moment): no need to ask again.
  folders.set(`${c.branchId}/${c.student.id}`, Promise.resolve(true));
  const saved = batch.commit();
  saved.catch((e: unknown) => {
    folders.delete(`${c.branchId}/${c.student.id}`);
    toast.error(`${c.student.name}’s card wasn’t saved`, { description: e instanceof Error ? e.message : String(e) });
  });
  uploadAfter(upload, saved);
  return { evaluationId: evaluationRef.id, fileId: fileRef.id };
}
