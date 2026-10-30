import { collection, doc, serverTimestamp, writeBatch } from "@react-native-firebase/firestore";
import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";
import { cleanFileName } from "@shared/drive/files";
import { type DriveActor, studentFolderId } from "@shared/drive/types";
import { COL, ROOT } from "@shared/paths";
import type { SheetReading } from "@shared/scores/sheet";
import { readSheetShots } from "@shared/scores/sheetRead";
import { type SheetPlaces, placedSeries, placesByPosition, sheetSeriesOf } from "@shared/scores/sheetSave";
import { type Evaluation, POSITION_LABELS, type Position, type ResultKind, SOURCE_LABELS, per10 } from "@shared/shooting/evaluation";
import { wholeScore } from "@shared/shooting/target";
import { type DateKey, formatDateKey } from "@shared/time";
import type { AuditStamp } from "@shared/types";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { callable } from "@/lib/api";
import { addAudit } from "@/lib/audit";
import { db } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import type { Actor } from "@/state/BranchProvider";
import { folderMade, folderUnknown, knowFolder } from "./save";
import { keepForUpload, uploadAfter } from "./uploads";

/**
 * A competition's results from a photo of its results sheet, as the website adds them (web/src/features/scores/
 * CompetitionDialog.tsx and saveSheetResults in web/src/features/drive/upload.ts): the photo is read on the server by
 * the same callable (`readResultsSheet`, Google's text reader), which suggests the numbers; the staff check them; then
 * one result per position is saved (source `sheet`, labelled Competition unless they choose otherwise), with the photo
 * filed in the student's Drive folder and pointing at the first result. As a scanned card's save, it returns as soon as
 * the phone has it: the server confirms in the background and the photo uploads after that (uploads.ts).
 */

const read = callable<{ branchId: string; content: string; mime: string }, { reading: SheetReading; found: boolean }>("readResultsSheet");

/** The long side a sheet's photo is read and kept at: plenty for printed text. */
const SHEET_SIDE = 2000;

export interface SheetPhoto {
  /** The photo upright, its long side at most 2000 px, a JPEG in the app's cache. */
  uri: string;
  size: number;
  base64: string;
}

/** A sheet's photo from the camera or the library, made ready to read and to file. */
export async function sheetPhoto(source: string): Promise<SheetPhoto> {
  const original = await ImageManipulator.manipulate(source).renderAsync();
  const k = Math.min(1, SHEET_SIDE / Math.max(original.width, original.height));
  const sized =
    k < 1
      ? await ImageManipulator.manipulate(original)
          .resize(original.width >= original.height ? { width: Math.round(original.width * k) } : { height: Math.round(original.height * k) })
          .renderAsync()
      : original;
  const saved = await sized.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
  if (!saved.base64) throw new Error("The photo couldn’t be prepared.");
  return { uri: saved.uri, size: new File(saved.uri).size, base64: saved.base64 };
}

/** What the server read on the sheet (`found` false: no text on it at all). */
export function readSheet(branchId: string, photo: SheetPhoto): Promise<{ reading: SheetReading; found: boolean }> {
  return read({ branchId, content: photo.base64, mime: "image/jpeg" });
}

/**
 * The shots' places on the sheet's target pictures (shared/src/scores/sheetRead.ts), found on the same photo the server
 * read (its words' places match its pixels), and how many series got theirs. Done on the phone, after the text.
 */
export async function findSheetPlaces(photo: SheetPhoto, reading: SheetReading): Promise<{ places: Partial<Record<Position, SheetPlaces>>; placed: number; of: number }> {
  const none = { places: {}, placed: 0, of: 0 };
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(photo.uri));
  if (!image) return none;
  const width = image.width();
  const height = image.height();
  const pixels = image.readPixels(0, 0, { width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!(pixels instanceof Uint8Array)) return none;
  // Lets the screen say it's looking before the phone gets busy.
  await new Promise((resolve) => setTimeout(resolve, 30));
  const found = readSheetShots({ width, height, data: pixels }, reading);
  return { places: placesByPosition(found), ...placedSeries(found) };
}

/**
 * One position's result, as checked: its shots, total, inner tens, each shot when the sheet listed them and they add
 * up, and their places on the sheet's pictures when those were found.
 */
export interface SheetRow {
  position: Position;
  shots: number;
  total: number;
  innerTens: number | null;
  values: number[] | null;
  places?: SheetPlaces | null;
}

const describe = (e: Pick<Evaluation, "source" | "position" | "dateKey" | "total" | "shots">) =>
  `${SOURCE_LABELS[e.source]} ${POSITION_LABELS[e.position].toLowerCase()} result of ${formatDateKey(e.dateKey, "medium")} (${e.total} over ${e.shots} shots, ${per10(e.total, e.shots) ?? 0} per 10)`;

const driveActor = (a: Actor): DriveActor => ({ uid: a.uid, email: a.email, name: a.name });

/** Saves a match's results (one per position) and files the sheet's photo, if there is one; returns the results' IDs. */
export async function saveSheetResults(c: {
  branchId: string;
  actor: Actor;
  student: { id: string; name: string };
  dateKey: DateKey;
  kind: ResultKind;
  match: string;
  course: string;
  note: string;
  rows: SheetRow[];
  photo: SheetPhoto | null;
}): Promise<string[]> {
  const col = (name: string) => collection(db, ROOT.branches, c.branchId, name);
  const ids = c.rows.map(() => doc(col(COL.evaluations)).id);
  const fileRef = c.photo ? doc(col(COL.driveFiles)) : null;
  const label = { name: c.match.trim(), course: c.course.trim() };
  const evaluations: Omit<Evaluation, keyof AuditStamp>[] = c.rows.map(({ position, shots, total, innerTens, values: given, places }) => {
    const values = given && given.length === shots ? given : null;
    const series = values ? sheetSeriesOf(values, places) : [];
    return {
      studentId: c.student.id,
      studentName: c.student.name,
      source: "sheet",
      kind: c.kind,
      position,
      dateKey: c.dateKey,
      timeMin: null,
      shots,
      total,
      wholeTotal: values ? values.reduce((n, v) => n + wholeScore(v), 0) : Math.floor(total),
      innerTens,
      mpi: null,
      groupMm: null,
      series,
      sighters: 0,
      fileId: fileRef?.id ?? null,
      note: c.note.trim(),
      problems: [],
      sius: null,
      match: label.name || label.course ? label : null,
    };
  });

  const batch = writeBatch(db);
  const by = driveActor(c.actor);
  const name = `${cleanFileName(`${c.dateKey} ${label.name || "Competition"} results`)}.jpg`;
  if (fileRef && c.photo) {
    // The student's folder is a stand-in until its first file: made now if it isn't there yet. A student's folder,
    // and everything in it, is everyone's on staff.
    const folderId = studentFolderId(c.student.id);
    const folderRef = doc(db, ROOT.branches, c.branchId, COL.driveFolders, folderId);
    if (await knowFolder(c.branchId, c.student.id)) batch.update(folderRef, { updatedAt: serverTimestamp(), updatedBy: by });
    else batch.set(folderRef, { name: c.student.name, parentId: null, studentId: c.student.id, access: "staff", createdAt: serverTimestamp(), createdBy: by, updatedAt: serverTimestamp(), updatedBy: by });
    batch.set(fileRef, {
      name,
      size: c.photo.size,
      kind: "jpg",
      mime: "image/jpeg",
      status: "uploading",
      folderId,
      studentId: c.student.id,
      access: "staff",
      evaluationId: ids[0] ?? null,
      uploadedAt: serverTimestamp(),
      uploadedBy: by,
    });
  }
  evaluations.forEach((e, i) => {
    batch.set(doc(col(COL.evaluations), ids[i]), { ...e, createdAt: serverTimestamp(), createdBy: c.actor.email, updatedAt: serverTimestamp(), updatedBy: c.actor.email });
    addAudit(batch, c.branchId, c.actor, {
      action: "evaluation.add",
      category: "reports",
      entityType: "evaluation",
      entityId: ids[i],
      summary: `Added ${c.student.name}'s ${describe(e)}, from the results sheet's photo`,
      dateKey: c.dateKey,
      studentId: c.student.id,
      studentName: c.student.name,
    });
  });

  const upload = fileRef && c.photo ? { branchId: c.branchId, fileId: fileRef.id, name, studentName: c.student.name, savedAt: Date.now(), what: "file" as const, mime: "image/jpeg", ext: "jpg" } : null;
  if (upload && c.photo) {
    keepForUpload(upload, c.photo.uri);
    folderMade(c.branchId, c.student.id);
  }
  const saved = batch.commit();
  saved.catch((e: unknown) => {
    folderUnknown(c.branchId, c.student.id);
    toast.error(`${c.student.name}’s competition results weren’t saved`, { description: e instanceof Error ? e.message : String(e) });
  });
  if (upload) uploadAfter(upload, saved);
  return ids;
}
