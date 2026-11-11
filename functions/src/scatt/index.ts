import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FieldValue } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { defineSecret } from 'firebase-functions/params'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { db } from '../app'
import { isScattKind } from '@shared/drive/files'
import { type DriveFile, driveObjectPath } from '@shared/drive/types'
import { COL, ROOT } from '@shared/paths'
import { buildSession, scattSessionId } from '@shared/scatt/session'
import { nameKey } from '@shared/scores/scopos'
import type { Branch, Student } from '@shared/types'
import { parseKeys, readScattFile } from './read'

/**
 * A SCATT file dropped in a student's Drive folder (the fourth meeting's R2): once it's uploaded, its sessions become
 * the student's (`scattSessions`, `scattTraces`), each once, for the staff and the family to watch. The file's people
 * are told apart by name when it holds several; their names are never kept. The file stays in the Drive.
 */

/** SCATT's product keys (hex, comma between keys): a server secret, never in the code. */
export const scattKeys = defineSecret('SCATT_KEYS')


export const onScattFile = onDocumentWritten(
  { document: `${ROOT.branches}/{branchId}/${COL.driveFiles}/{fileId}`, secrets: [scattKeys], timeoutSeconds: 300, cpu: 'gcf_gen1', memory: '512MiB' },
  async (event) => {
    const f = event.data?.after?.data() as (DriveFile & { scatt?: unknown }) | undefined
    if (!f || !isScattKind(f.kind) || f.status !== 'ready' || f.trashed || !f.studentId || f.scatt) return
    const { branchId, fileId } = event.params
    const ref = event.data!.after.ref
    const dir = mkdtempSync(join(tmpdir(), 'scatt-'))
    try {
      const result = await importFile(branchId, fileId, f, dir)
      await ref.update({ scatt: { ...result, at: FieldValue.serverTimestamp() } })
    } catch (e) {
      logger.warn('A SCATT file couldn’t be read', { branchId, fileId, error: (e as Error).message })
      await ref.update({ scatt: { sessions: 0, skipped: 0, note: (e as Error).message || 'The file couldn’t be read.', at: FieldValue.serverTimestamp() } })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  },
)

async function importFile(branchId: string, fileId: string, f: DriveFile, dir: string): Promise<{ sessions: number; skipped: number; note: string | null }> {
  const base = `${ROOT.branches}/${branchId}`
  const keys = parseKeys(scattKeys.value())
  if (!keys.length) throw new Error('SCATT files can’t be read yet: the app is missing SCATT’s key.')
  const [branchSnap, studentSnap, bytes] = await Promise.all([
    db.doc(base).get(),
    db.doc(`${base}/${COL.students}/${f.studentId}`).get(),
    getStorage().bucket().file(driveObjectPath(branchId, fileId)).download(),
  ])
  const student = studentSnap.data() as Student | undefined
  if (!student) throw new Error('The student whose folder holds this file isn’t in the academy any more.')
  const path = join(dir, 'session.scatt')
  writeFileSync(path, bytes[0])
  const file = readScattFile(path, keys)
  // Whose sessions: all of them when the file holds one person; else only those named like the student.
  const names = new Set([student.name, ...(student.otherNames ?? [])].map(nameKey).filter(Boolean))
  const mine = file.persons.length <= 1 ? null : new Set(file.persons.filter((p) => names.has(nameKey(p.name))).map((p) => p.id))
  if (mine && !mine.size) {
    return { sessions: 0, skipped: file.sessions.length, note: `This file holds ${file.persons.length} people’s sessions, and none is named like ${student.name}: nothing was brought in.` }
  }
  const tz = (branchSnap.data() as Branch | undefined)?.timezone || 'America/New_York'
  let added = 0
  let skipped = 0
  const notes: string[] = []
  if (mine) notes.push(`Only ${student.name}’s sessions were brought in: the file holds ${file.persons.length} people’s.`)
  for (const raw of file.sessions) {
    if (mine && !mine.has(raw.personId)) {
      skipped++
      continue
    }
    const built = buildSession(raw, { studentId: f.studentId!, studentName: student.name, fileId, timeZone: tz })
    if ('skip' in built) {
      skipped++
      if (built.skip === 'target') notes.push('A session on a target the app doesn’t know yet was left out.')
      continue
    }
    const id = scattSessionId(raw.uuid)
    const sessionRef = db.doc(`${base}/${COL.scattSessions}/${id}`)
    const created = await db.runTransaction(async (tx) => {
      if ((await tx.get(sessionRef)).exists) return false
      tx.create(sessionRef, { ...built.session, createdAt: FieldValue.serverTimestamp(), createdBy: 'system' })
      tx.set(db.doc(`${base}/${COL.scattTraces}/${id}`), built.traces)
      return true
    })
    if (created) added++
    else skipped++
  }
  if (added) {
    await db.collection(`${base}/${COL.auditLog}`).add({
      at: FieldValue.serverTimestamp(),
      actorUid: 'system',
      actorEmail: '',
      actorName: 'SCATT import',
      actorRole: 'system',
      action: 'scatt.import',
      category: 'reports',
      entityType: 'driveFile',
      entityId: fileId,
      summary: `Brought in ${added} SCATT session${added === 1 ? '' : 's'} for ${student.name}, from ${f.name}`,
      context: 'Drive',
      dateKey: null,
      studentId: f.studentId,
      studentName: student.name,
      coachId: null,
      coachName: null,
      changes: [],
      via: 'function',
    })
  }
  return { sessions: added, skipped, note: [...new Set(notes)].join(' ') || null }
}
