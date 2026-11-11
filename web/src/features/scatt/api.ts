import { collection, doc, query, where, writeBatch } from 'firebase/firestore'
import { useMemo } from 'react'
import { COL, ROOT } from '@shared/paths'
import type { ScattSession, ScattTraces } from '@shared/scatt/session'
import { formatDateKey } from '@shared/time'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { useDoc, useQuery } from '@/lib/firestore'

/**
 * A student's SCATT sessions (shared/src/scatt/session.ts): the server brings them in from a SCATT file in the
 * student's Drive folder; staff and the family watch them. One student at a time, as the rules allow a family.
 */
export function useScattSessions(branchId: string, studentId: string | null) {
  const q = useMemo(() => (studentId ? query(collection(db, ROOT.branches, branchId, COL.scattSessions), where('studentId', '==', studentId)) : null), [branchId, studentId])
  const res = useQuery<ScattSession>(q, `scatt-${branchId}-${studentId ?? 'none'}`)
  const data = useMemo(() => [...res.data].sort((a, b) => b.dateKey.localeCompare(a.dateKey) || b.timeMin - a.timeMin), [res.data])
  return { ...res, data }
}

/** A session's traces, loaded when it's opened. */
export function useScattTraces(branchId: string, sessionId: string | null) {
  const ref = useMemo(() => (sessionId ? doc(db, ROOT.branches, branchId, COL.scattTraces, sessionId) : null), [branchId, sessionId])
  return useDoc<ScattTraces>(ref)
}

/** Takes a session out of the student's (filed in the wrong student's folder): the session and its traces. */
export async function deleteScattSession(branchId: string, actor: Actor, s: { id: string } & Pick<ScattSession, 'studentId' | 'studentName' | 'dateKey' | 'matchShots'>) {
  const batch = writeBatch(db)
  batch.delete(doc(db, ROOT.branches, branchId, COL.scattSessions, s.id))
  batch.delete(doc(db, ROOT.branches, branchId, COL.scattTraces, s.id))
  addAudit(batch, branchId, actor, {
    action: 'scatt.delete',
    category: 'reports',
    entityType: 'scattSession',
    entityId: s.id,
    summary: `Deleted ${s.studentName}'s SCATT session of ${formatDateKey(s.dateKey, 'medium')} (${s.matchShots} shots)`,
    dateKey: s.dateKey,
    studentId: s.studentId,
    studentName: s.studentName,
  })
  await batch.commit()
}
