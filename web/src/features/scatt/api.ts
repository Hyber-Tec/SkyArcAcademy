import { collection, doc, onSnapshot, query, where, writeBatch } from 'firebase/firestore'
import { useMemo } from 'react'
import type { DriveFile } from '@shared/drive/types'
import { COL, ROOT } from '@shared/paths'
import type { ScattSession, ScattTraces } from '@shared/scatt/session'
import { formatDateKey } from '@shared/time'
import { type Actor, addAudit } from '@/lib/audit'
import { db } from '@/lib/firebase'
import { branchDocRef, useDoc, useQuery } from '@/lib/firestore'

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

/** What the server made of a SCATT file (functions/src/scatt): the sessions it brought in, those it left out and why, and for whom. */
export interface ScattRead {
  sessions: number
  skipped: number
  note: string | null
  studentId: string
}

/**
 * Waits, up to `ms`, for the server to read SCATT files just uploaded into a student's folder: the note it leaves on
 * each file's Drive record (`scatt`, for the student whose folder holds it now). Resolves with each file's read; `null`
 * for a file that went meanwhile (its upload failed, or it left the student's folder or went to the Trash); no entry for
 * one still being read.
 */
export function waitForScattReads(branchId: string, fileIds: readonly string[], ms: number): Promise<Map<string, ScattRead | null>> {
  return new Promise((resolve) => {
    const reads = new Map<string, ScattRead | null>()
    if (!fileIds.length) return resolve(reads)
    const stops: (() => void)[] = []
    let done = false
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      for (const stop of stops) stop()
      resolve(reads)
    }
    const timer = setTimeout(finish, ms)
    const settle = (id: string, read: ScattRead | null) => {
      reads.set(id, read)
      if (reads.size === fileIds.length) finish()
    }
    for (const id of fileIds) {
      stops.push(
        onSnapshot(
          branchDocRef(branchId, COL.driveFiles, id),
          (snap) => {
            const f = snap.data() as DriveFile | undefined
            if (!f || f.status === 'error' || f.trashed || !f.studentId) return settle(id, null)
            // Read for the student whose folder it's in (a note from before names nobody).
            const m = f.scatt
            if (m && (m.studentId === undefined || m.studentId === f.studentId)) settle(id, { sessions: m.sessions, skipped: m.skipped, note: m.note, studentId: f.studentId })
          },
          () => settle(id, null),
        ),
      )
    }
  })
}
