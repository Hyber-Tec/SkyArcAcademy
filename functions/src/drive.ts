import { FieldValue, type QueryDocumentSnapshot, type Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { logger } from 'firebase-functions/v2'
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { type DriveAccess, type DriveFolder, accessOf, driveObjectPath } from '@shared/drive/types'
import { COL, ROOT } from '@shared/paths'
import { resolveSettings } from '@shared/settings/resolve'
import type { Branch } from '@shared/types'
import { LIGHT, db } from './app'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * A folder or file made without saying who sees it (`access`): the phone app's, until its update writes it. It takes
 * the access of the folder it's in (everyone on staff's at the top, and in a student's folder), so coaches' lists, which
 * ask for `access == 'staff'`, show it. The rules let such an item in only where everyone on staff may see it; what was
 * there before access existed is marked once by scripts/drive-access.ts.
 */
async function stampAccess(branchId: string, snap: QueryDocumentSnapshot | undefined, parentField: 'parentId' | 'folderId') {
  if (!snap) return
  const data = snap.data()
  if (data.access === 'staff' || data.access === 'admins') return
  const parentId = typeof data[parentField] === 'string' ? (data[parentField] as string) : null
  let access: DriveAccess = 'staff'
  // A student's folder, and what's in one, is everyone's on staff.
  if (parentId && !data.studentId && !parentId.startsWith('student-')) {
    const parent = await db.doc(`${ROOT.branches}/${branchId}/${COL.driveFolders}/${parentId}`).get()
    access = accessOf(parent.data() as DriveFolder | undefined)
  }
  await snap.ref.update({ access }).catch((e: unknown) => logger.warn('Could not mark who sees a Drive item', { path: snap.ref.path, error: String(e) }))
}

export const onDriveFolderCreated = onDocumentCreated({ document: `${ROOT.branches}/{branchId}/${COL.driveFolders}/{folderId}`, ...LIGHT }, (event) =>
  stampAccess(event.params.branchId, event.data, 'parentId'),
)

export const onDriveFileCreated = onDocumentCreated({ document: `${ROOT.branches}/{branchId}/${COL.driveFiles}/{fileId}`, ...LIGHT }, (event) =>
  stampAccess(event.params.branchId, event.data, 'folderId'),
)

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
