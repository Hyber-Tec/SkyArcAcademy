import { collection, doc, getDoc, serverTimestamp, updateDoc, writeBatch } from "@react-native-firebase/firestore";
import { putFile, ref } from "@react-native-firebase/storage";
import { type DriveActor, driveObjectPath, studentFolderId } from "@shared/drive/types";
import { COL, ROOT } from "@shared/paths";
import { POSITION_LABELS, type Position, SOURCE_LABELS, paperEvaluation, per10 } from "@shared/shooting/evaluation";
import { type CardReview, reviewShots } from "@shared/targets/review";
import { type DateKey, formatDateKey } from "@shared/time";
import { addAudit } from "@/lib/audit";
import { db, storage } from "@/lib/firebase";
import type { Actor } from "@/state/BranchProvider";
import type { CardFile } from "./photo";

/**
 * Saving a scanned card, as the website saves a SIUS result (web/src/features/drive/upload.ts, saveResults): the
 * file's record in the student's Drive folder and the card's scores (an evaluation, with its audit entry) in one
 * batch, then the file itself, which the Storage rules accept only against that record.
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
const pathOf = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ""));

/** The card's name in the Drive: its date and position, so the website can tell the position from it. */
export function cardFileName(dateKey: DateKey, position: Position): string {
  return `${dateKey} ${POSITION_LABELS[position]} paper card.jpg`;
}

/**
 * Writes the card. Resolves once the scores are saved; `uploaded` says whether the copy reached the Drive too (when it
 * didn't, the file's row says so and the scores stay).
 */
export async function saveCard(c: SaveCard): Promise<{ evaluationId: string; fileId: string; uploaded: boolean; error: string | null }> {
  const col = (name: string) => collection(db, ROOT.branches, c.branchId, name);
  const fileRef = doc(col(COL.driveFiles));
  const evaluationRef = doc(col(COL.evaluations));
  const folderId = studentFolderId(c.student.id);
  const folderRef = doc(db, ROOT.branches, c.branchId, COL.driveFolders, folderId);
  const by = driveActor(c.actor);
  const name = cardFileName(c.dateKey, c.position);

  const data = paperEvaluation({
    studentId: c.student.id,
    studentName: c.student.name,
    position: c.position,
    dateKey: c.dateKey,
    shots: c.review ? reviewShots(c.review) : null,
    total: c.review ? null : c.total,
    shotCount: c.review ? undefined : 10,
    fileId: fileRef.id,
    note: c.note.trim(),
  });

  const batch = writeBatch(db);
  // The student's folder exists as a stand-in until its first file: made now if it isn't there yet.
  const folder = await getDoc(folderRef);
  if (folder.exists()) batch.update(folderRef, { updatedAt: serverTimestamp(), updatedBy: by });
  else
    batch.set(folderRef, {
      name: c.student.name,
      parentId: null,
      studentId: c.student.id,
      createdAt: serverTimestamp(),
      createdBy: by,
      updatedAt: serverTimestamp(),
      updatedBy: by,
    });
  batch.set(fileRef, {
    name,
    size: c.file.size,
    kind: "jpg",
    mime: "image/jpeg",
    status: "uploading",
    folderId,
    studentId: c.student.id,
    evaluationId: evaluationRef.id,
    uploadedAt: serverTimestamp(),
    uploadedBy: by,
  });
  batch.set(evaluationRef, { ...data, createdAt: serverTimestamp(), createdBy: c.actor.email, updatedAt: serverTimestamp(), updatedBy: c.actor.email });
  const p10 = per10(data.total, data.shots) ?? 0;
  addAudit(batch, c.branchId, c.actor, {
    action: "evaluation.add",
    category: "reports",
    entityType: "evaluation",
    entityId: evaluationRef.id,
    summary: `Added ${c.student.name}'s ${SOURCE_LABELS.paper} ${POSITION_LABELS[c.position].toLowerCase()} result of ${formatDateKey(c.dateKey, "medium")} (${data.total} over ${data.shots} shots, ${p10} per 10), scanned with the phone`,
    dateKey: c.dateKey,
    studentId: c.student.id,
    studentName: c.student.name,
  });
  await batch.commit();

  try {
    await putFile(ref(storage, driveObjectPath(c.branchId, fileRef.id)), pathOf(c.file.uri), {
      contentType: "image/jpeg",
      contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
    });
    await updateDoc(fileRef, { status: "ready" });
    return { evaluationId: evaluationRef.id, fileId: fileRef.id, uploaded: true, error: null };
  } catch (e) {
    const code = (e as { code?: string })?.code ?? "";
    const reason = /unauthorized/.test(code) ? "The Drive didn’t accept this file." : (e as Error)?.message || "The upload failed.";
    await updateDoc(fileRef, { status: "error", error: reason.slice(0, 300) }).catch(() => undefined);
    return { evaluationId: evaluationRef.id, fileId: fileRef.id, uploaded: false, error: reason };
  }
}
