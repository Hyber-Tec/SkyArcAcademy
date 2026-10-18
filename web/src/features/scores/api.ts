import { type WriteBatch, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore'
import { COL } from '@shared/paths'
import { type Evaluation, POSITION_LABELS, SOURCE_LABELS, per10 } from '@shared/shooting/evaluation'
import { formatDateKey } from '@shared/time'
import type { AuditStamp } from '@shared/types'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchCol, branchDocRef } from '@/lib/firestore'

/** Writes for evaluations (scored targets). Every change writes its audit entry in the same batch. */

export type NewEvaluation = Omit<Evaluation, keyof AuditStamp>

const describe = (e: Pick<Evaluation, 'source' | 'position' | 'dateKey' | 'total' | 'shots'>) =>
  `${SOURCE_LABELS[e.source]} ${POSITION_LABELS[e.position].toLowerCase()} result of ${formatDateKey(e.dateKey, 'medium')} (${e.total} over ${e.shots} shots, ${per10(e.total, e.shots) ?? 0} per 10)`

/** A new evaluation's ID, known before it's written (the Drive file points at it). */
export function newEvaluationId(branchId: string): string {
  return doc(branchCol(branchId, COL.evaluations)).id
}

/** Adds an evaluation to a batch, with its audit entry. */
export function addEvaluation(batch: WriteBatch, branchId: string, actor: Actor, id: string, data: NewEvaluation) {
  batch.set(branchDocRef(branchId, COL.evaluations, id), { ...data, createdAt: serverTimestamp(), createdBy: actor.email, updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, {
    action: 'evaluation.add',
    category: 'reports',
    entityType: 'evaluation',
    entityId: id,
    summary: `Added ${data.studentName}'s ${describe(data)}`,
    dateKey: data.dateKey,
    studentId: data.studentId,
    studentName: data.studentName,
  })
}

export async function createEvaluation(branchId: string, actor: Actor, data: NewEvaluation): Promise<string> {
  const id = newEvaluationId(branchId)
  const batch = writeBatch(db)
  addEvaluation(batch, branchId, actor, id, data)
  if (data.fileId) batch.update(branchDocRef(branchId, COL.driveFiles, data.fileId), { evaluationId: id, updatedAt: serverTimestamp() })
  await batch.commit()
  return id
}

export async function updateEvaluation(branchId: string, actor: Actor, id: string, before: Evaluation, data: NewEvaluation) {
  const batch = writeBatch(db)
  batch.set(branchDocRef(branchId, COL.evaluations, id), { ...data, createdAt: before.createdAt ?? serverTimestamp(), createdBy: before.createdBy ?? actor.email, updatedAt: serverTimestamp(), updatedBy: actor.email })
  addAudit(batch, branchId, actor, {
    action: 'evaluation.edit',
    category: 'reports',
    entityType: 'evaluation',
    entityId: id,
    summary: `Changed ${data.studentName}'s ${describe(data)}`,
    dateKey: data.dateKey,
    studentId: data.studentId,
    studentName: data.studentName,
  })
  await batch.commit()
}

/**
 * Deletes an evaluation. Its file stays in the Drive, no longer a score's file (`evaluationId` cleared), so the family
 * stops seeing it (storage.rules).
 */
export async function deleteEvaluation(branchId: string, actor: Actor, id: string, e: Evaluation) {
  const batch = writeBatch(db)
  batch.delete(branchDocRef(branchId, COL.evaluations, id))
  const file = e.fileId ? await getDoc(branchDocRef(branchId, COL.driveFiles, e.fileId)).catch(() => null) : null
  if (file?.exists() && file.data().evaluationId === id) batch.update(file.ref, { evaluationId: null, updatedAt: serverTimestamp() })
  addAudit(batch, branchId, actor, {
    action: 'evaluation.delete',
    category: 'reports',
    entityType: 'evaluation',
    entityId: id,
    summary: `Deleted ${e.studentName}'s ${describe(e)}`,
    dateKey: e.dateKey,
    studentId: e.studentId,
    studentName: e.studentName,
  })
  await batch.commit()
}
