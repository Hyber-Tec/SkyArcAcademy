import { FieldValue, type Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { driveObjectPath } from '@shared/drive/types'
import { COL, ROOT } from '@shared/paths'
import { resolveSettings } from '@shared/settings/resolve'
import type { Branch } from '@shared/types'
import { LIGHT, db } from './app'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Daily: empties the Drive's Trash of what has been there longer than the academy's retention (Settings → Trash): a
 * folder with everything inside it, files with their bytes. Evaluations made from the files stay.
 */
export const purgeDriveTrash = onSchedule({ schedule: '45 8 * * *', timeZone: 'UTC', timeoutSeconds: 540, ...LIGHT }, async () => {
  const bucket = getStorage().bucket()
  const branches = await db.collection(ROOT.branches).get()
  for (const b of branches.docs) {
    const settings = resolveSettings((b.data() as Branch).settings)
    const cutoff = Date.now() - settings.trash.retentionDays * DAY_MS
    const base = `${ROOT.branches}/${b.id}`
    const [folders, files] = await Promise.all([db.collection(`${base}/${COL.driveFolders}`).get(), db.collection(`${base}/${COL.driveFiles}`).get()])
    const expired = (t: unknown) => {
      const ms = (t as Timestamp | null)?.toMillis?.() ?? 0
      return ms > 0 && ms < cutoff
    }
    const folderIds = new Set(folders.docs.filter((d) => d.get('trashed') === true && expired(d.get('trashedAt'))).map((d) => d.id))
    let grew = true
    while (grew) {
      grew = false
      for (const d of folders.docs) {
        const parent = d.get('parentId') as string | null
        if (parent && folderIds.has(parent) && !folderIds.has(d.id)) {
          folderIds.add(d.id)
          grew = true
        }
      }
    }
    const fileDocs = files.docs.filter((d) => (d.get('trashed') === true && expired(d.get('trashedAt'))) || folderIds.has(d.get('folderId') as string))
    if (!folderIds.size && !fileDocs.length) continue
    for (const d of fileDocs) await bucket.file(driveObjectPath(b.id, d.id)).delete({ ignoreNotFound: true })
    const writer = db.bulkWriter()
    for (const d of fileDocs) void writer.delete(d.ref)
    for (const id of folderIds) void writer.delete(db.doc(`${base}/${COL.driveFolders}/${id}`))
    void writer.create(db.collection(`${base}/${COL.auditLog}`).doc(), {
      at: FieldValue.serverTimestamp(),
      actorUid: 'system',
      actorEmail: 'system',
      actorName: 'System',
      actorRole: 'system',
      action: 'drive.purge',
      category: 'drive',
      entityType: 'drive',
      entityId: 'trash',
      summary: `Emptied the Drive’s Trash of what was there over ${settings.trash.retentionDays} days (${fileDocs.length} ${fileDocs.length === 1 ? 'file' : 'files'}, ${folderIds.size} ${folderIds.size === 1 ? 'folder' : 'folders'})`,
      context: '',
      dateKey: null,
      studentId: null,
      studentName: null,
      coachId: null,
      coachName: null,
      changes: [],
      via: 'function',
    })
    await writer.close()
    logger.info('Drive trash purged', { branchId: b.id, files: fileDocs.length, folders: folderIds.size })
  }
})
