import { serverTimestamp, updateDoc } from 'firebase/firestore'
import { ref as storageRef, uploadBytesResumable } from 'firebase/storage'
import { useSyncExternalStore } from 'react'
import type { DriveIndex } from '@shared/drive/model'
import { type DriveAccess, type DriveFile, driveObjectPath } from '@shared/drive/types'
import { COL } from '@shared/paths'
import type { Evaluation } from '@shared/shooting/evaluation'
import type { AuditStamp } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { storage } from '@/lib/firebase'
import { branchDocRef } from '@/lib/firestore'
import { addEvaluation, newEvaluationId } from '@/features/scores/api'
import { type DriveWrite, commitAll, driveActor, folderWrites, newFileId, readsFor } from './api'

/**
 * Uploading: each file's record is written first (status "uploading", so it shows at once and the Storage rules can
 * check the bytes against it), then the bytes go up with progress, then the record says "ready". A failed upload
 * says so on its row. Progress lives here, outside React, so it survives moving between folders.
 */

export interface Flight {
  progress: number
  failed?: string
}

const flights = new Map<string, Flight>()
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version += 1
  for (const l of [...listeners]) l()
}

/** While anything uploads, closing or reloading the page asks first: what hasn't gone up would be lost. */
const hold = (e: BeforeUnloadEvent) => e.preventDefault()

function setFlight(fileId: string, flight: Flight | null) {
  const before = flights.size
  if (flight) flights.set(fileId, flight)
  else flights.delete(fileId)
  if (!before && flights.size) window.addEventListener('beforeunload', hold)
  if (before && !flights.size) window.removeEventListener('beforeunload', hold)
  emit()
}

/** Re-renders whenever any upload moves; read a file's progress with `flightOf`. */
export function useUploadProgress() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
}

export const flightOf = (fileId: string): Flight | null => flights.get(fileId) ?? null
export const uploadsInFlight = () => flights.size

/** One file waiting to go up: its record and its bytes. */
export interface PlannedUpload {
  fileId: string
  file: File
  record: Omit<DriveFile, 'uploadedAt' | 'uploadedBy'>
}

const CONCURRENCY = 3

async function sendBytes(branchId: string, up: PlannedUpload) {
  setFlight(up.fileId, { progress: 0 })
  try {
    const task = uploadBytesResumable(storageRef(storage, driveObjectPath(branchId, up.fileId)), up.file, {
      contentType: up.record.mime,
      contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(up.record.name)}`,
    })
    await new Promise<void>((resolve, reject) => {
      task.on('state_changed', (s) => setFlight(up.fileId, { progress: s.totalBytes ? s.bytesTransferred / s.totalBytes : 0 }), reject, () => resolve())
    })
    await updateDoc(branchDocRef(branchId, COL.driveFiles, up.fileId), { status: 'ready' })
    setFlight(up.fileId, null)
  } catch (e) {
    const code = (e as { code?: string })?.code ?? ''
    const reason = code === 'storage/unauthorized' ? 'The Drive didn’t accept this file.' : code === 'storage/canceled' ? 'The upload was stopped.' : (e as Error)?.message || 'The upload failed.'
    setFlight(up.fileId, null)
    await updateDoc(branchDocRef(branchId, COL.driveFiles, up.fileId), { status: 'error', error: reason.slice(0, 300) }).catch(() => undefined)
    throw new Error(`${up.record.name}: ${reason}`)
  }
}

/** An upload that didn't go up, and why. */
export interface FailedUpload {
  up: PlannedUpload
  message: string
}

/** Sends the bytes of uploads whose records are written, three at a time; resolves with the ones that failed. */
async function sendEach(branchId: string, ups: PlannedUpload[]): Promise<FailedUpload[]> {
  const failures: FailedUpload[] = []
  let next = 0
  const worker = async () => {
    while (next < ups.length) {
      const up = ups[next++]
      await sendBytes(branchId, up).catch((e: Error) => failures.push({ up, message: e.message }))
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ups.length) }, worker))
  return failures
}

/** Sends the bytes of uploads whose records are written, three at a time; resolves with the failures. */
export async function sendAll(branchId: string, ups: PlannedUpload[]): Promise<string[]> {
  return (await sendEach(branchId, ups)).map((f) => f.message)
}

/** Sends again what didn't go up (its record back to "uploading", as the Storage rules want it); resolves with what failed again. */
export async function resend(branchId: string, ups: PlannedUpload[]): Promise<FailedUpload[]> {
  await Promise.all(ups.map((up) => updateDoc(branchDocRef(branchId, COL.driveFiles, up.fileId), { status: 'uploading', error: null })))
  return sendEach(branchId, ups)
}

/** The record of a file about to be uploaded. */
export function plannedFile(branchId: string, file: File, plan: { name: string; kind: string; mime: string }, folderId: string | null, studentId: string | null, extra: Partial<DriveFile> = {}): PlannedUpload {
  return {
    fileId: newFileId(branchId),
    file,
    record: { name: plan.name, size: file.size, kind: plan.kind, mime: plan.mime, status: 'uploading', folderId, studentId, ...extra },
  }
}

/**
 * A record's write: it takes the access of the folder it lands in (unless it already says, e.g. in a folder made for a
 * dropped one), so the rules and coaches' lists see it right.
 */
function recordWrite(branchId: string, index: DriveIndex, up: PlannedUpload, data: Record<string, unknown>): DriveWrite {
  const access: DriveAccess = up.record.access ?? index.accessIn(up.record.folderId)
  return { write: (b) => b.set(branchDocRef(branchId, COL.driveFiles, up.fileId), { ...up.record, access, ...data }), reads: readsFor(up.record.folderId, access) }
}

/** Writes the records of plain files (the folders they go in included) and the audit entry. */
export async function writeRecords(branchId: string, actor: Actor, index: DriveIndex, ups: PlannedUpload[], folderIds: (string | null)[]) {
  const by = driveActor(actor)
  const writes: DriveWrite[] = []
  for (const id of new Set(folderIds)) writes.push(...folderWrites(branchId, index, id, actor))
  for (const up of ups) writes.push(recordWrite(branchId, index, up, { uploadedAt: serverTimestamp(), uploadedBy: by }))
  if (ups.length) {
    const where = folderIds[0] ? index.pathOf(folderIds[0]).map((c) => c.name).join(' / ') : 'the top of the Drive'
    writes.push((b) =>
      addAudit(b, branchId, actor, {
        action: 'drive.upload',
        category: 'drive',
        entityType: 'driveFile',
        entityId: ups[0].fileId,
        summary: `Uploaded ${ups.length === 1 ? `“${ups[0].record.name}”` : `${ups.length} files`} to ${where || 'the Drive'}`,
        studentId: ups[0].record.studentId,
      }),
    )
  }
  await commitAll(writes)
}

/** A SIUS result ready to save: its file, its folder and its evaluation (null for sighters only: the file alone). */
export interface ResultUpload {
  up: PlannedUpload
  evaluation: Omit<Evaluation, keyof AuditStamp> | null
}

/** Writes each result's file record and evaluation together, then sends the files. */
export async function saveResults(branchId: string, actor: Actor, index: DriveIndex, results: ResultUpload[]): Promise<string[]> {
  const by = driveActor(actor)
  const writes: DriveWrite[] = []
  for (const id of new Set(results.map((r) => r.up.record.folderId))) writes.push(...folderWrites(branchId, index, id, actor))
  for (const r of results) {
    const evaluationId = r.evaluation ? newEvaluationId(branchId) : null
    writes.push(recordWrite(branchId, index, r.up, { evaluationId, uploadedAt: serverTimestamp(), uploadedBy: by }))
    if (r.evaluation && evaluationId) {
      const evaluation = { ...r.evaluation, fileId: r.up.fileId }
      writes.push((b) => addEvaluation(b, branchId, actor, evaluationId, evaluation))
    } else {
      // Sighters only: the file is kept, with no scores.
      const where = index.folderOf(r.up.record.folderId)?.name ?? 'the Drive'
      writes.push((b) =>
        addAudit(b, branchId, actor, {
          action: 'drive.upload',
          category: 'drive',
          entityType: 'driveFile',
          entityId: r.up.fileId,
          summary: `Filed “${r.up.record.name}” in “${where}” (sighters only, no scores)`,
          studentId: r.up.record.studentId,
        }),
      )
    }
  }
  await commitAll(writes)
  return sendAll(branchId, results.map((r) => r.up))
}

/**
 * A match's results sheet (its photo or PDF, if one was chosen) and its results, one per position, written together:
 * the file is filed in the student's folder and points at the first result; then its bytes are sent.
 */
export async function saveSheetResults(branchId: string, actor: Actor, index: DriveIndex, up: PlannedUpload | null, evaluations: Omit<Evaluation, keyof AuditStamp>[]): Promise<string[]> {
  const by = driveActor(actor)
  const ids = evaluations.map(() => newEvaluationId(branchId))
  const writes: DriveWrite[] = []
  if (up) {
    writes.push(...folderWrites(branchId, index, up.record.folderId, actor))
    writes.push(recordWrite(branchId, index, up, { evaluationId: ids[0] ?? null, uploadedAt: serverTimestamp(), uploadedBy: by }))
  }
  evaluations.forEach((e, i) => writes.push((b) => addEvaluation(b, branchId, actor, ids[i], { ...e, fileId: up?.fileId ?? null })))
  await commitAll(writes)
  return up ? sendAll(branchId, [up]) : []
}

/** A paper card read from its photo on the website (scores/photos/AddPaperScores.tsx), ready to save. */
export interface CardSave {
  evaluation: Omit<Evaluation, keyof AuditStamp>
  /** Its picture, filed in the student's folder: the card flattened like a scan, or the photo when no card was found… */
  up: PlannedUpload | null
  /** …or the photo already in the Drive, which keeps its file and becomes the score's. */
  driveFileId: string | null
}

/**
 * Paper cards read from their photos, saved as the phone app saves a scanned card (mobile/src/features/scan/save.ts):
 * each card's scores and its picture's record in the student's folder, pointing at each other, in one write with the
 * audit entries; then the pictures go up. It returns at once with the new scores' IDs: the page shows them while the
 * server confirms (`saved`), and the uploads follow (`uploaded`, with what failed).
 */
export function saveCards(branchId: string, actor: Actor, index: DriveIndex, cards: CardSave[]): { ids: string[]; saved: Promise<void>; uploaded: Promise<FailedUpload[]> } {
  const by = driveActor(actor)
  const ids = cards.map(() => newEvaluationId(branchId))
  const ups = cards.flatMap((c) => (c.up ? [c.up] : []))
  const writes: DriveWrite[] = []
  for (const id of new Set(ups.map((up) => up.record.folderId))) writes.push(...folderWrites(branchId, index, id, actor))
  cards.forEach((c, i) => {
    const fileId = c.up?.fileId ?? c.driveFileId
    if (c.up) writes.push(recordWrite(branchId, index, c.up, { evaluationId: ids[i], uploadedAt: serverTimestamp(), uploadedBy: by }))
    else if (c.driveFileId) {
      const ref = branchDocRef(branchId, COL.driveFiles, c.driveFileId)
      writes.push((b) => b.update(ref, { evaluationId: ids[i], updatedAt: serverTimestamp(), updatedBy: by }))
    }
    writes.push((b) => addEvaluation(b, branchId, actor, ids[i], { ...c.evaluation, fileId }, 'read from its photo on the website'))
  })
  const saved = commitAll(writes)
  return { ids, saved, uploaded: saved.then(() => sendEach(branchId, ups)) }
}
