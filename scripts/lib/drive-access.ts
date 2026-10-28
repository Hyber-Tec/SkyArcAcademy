import type { DriveAccess } from '../../shared/src/drive/types'

/** A Drive document as the scripts read it (scripts/lib/firestore-rest.ts, listDocuments). */
export type StoredDoc = { path: string; id: string; data: Record<string, unknown> }

const given = (d: Record<string, unknown>): DriveAccess | null => (d.access === 'staff' || d.access === 'admins' ? d.access : null)

/**
 * What each folder and file without `access` gets (scripts/drive-access.ts): its folder's, and everyone on staff's at the
 * top and in a student's folder. Documents that say who sees them are left out: they never change.
 */
export function missingAccess(folders: readonly StoredDoc[], files: readonly StoredDoc[]): { path: string; access: DriveAccess }[] {
  const byId = new Map(folders.map((f) => [f.id, f.data]))
  const known = new Map<string, DriveAccess>()
  const folderAccess = (id: string, seen: ReadonlySet<string> = new Set()): DriveAccess => {
    const cached = known.get(id)
    if (cached) return cached
    const d = byId.get(id)
    let access: DriveAccess = 'staff'
    if (d) {
      const parent = typeof d.parentId === 'string' ? d.parentId : null
      const own = given(d)
      if (own) access = own
      else if (!d.studentId && parent && !parent.startsWith('student-') && !seen.has(parent)) access = folderAccess(parent, new Set([...seen, id]))
    }
    known.set(id, access)
    return access
  }
  const out: { path: string; access: DriveAccess }[] = []
  for (const f of folders) if (!given(f.data)) out.push({ path: f.path, access: folderAccess(f.id) })
  for (const f of files) {
    if (given(f.data)) continue
    const folder = typeof f.data.folderId === 'string' ? f.data.folderId : null
    out.push({ path: f.path, access: f.data.studentId || !folder ? 'staff' : folderAccess(folder) })
  }
  return out
}
