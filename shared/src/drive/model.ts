import type { WithId } from '../types'
import { type DriveActor, type DriveFile, type DriveFolder, studentFolderId } from './types'

/**
 * The Drive read as one index: pure derivation over its two live lists (every folder, every file) plus the students,
 * so the page, the Move dialog, the Trash and the tests all get the same answer. Ported from the drive it's modeled
 * on (docs/DECISIONS.md §7).
 *
 * What is visible is decided here and nowhere else. The Trash flags one document, the folder or the file, and leaves
 * everything under it as it was, so Restore brings a folder back with everything that was in it: a folder is visible
 * when every folder above it is, and a file when its folder is. A folder whose parent is missing sits at the top
 * instead of vanishing, and a loop of parents is cut where it's found.
 *
 * Every student has a folder at the top, even before anything is filed for them: until its document is written (with
 * the first file), it's a stand-in made from the student's record. A student's folder always shows the student's
 * current name.
 */

export type IndexFolder = WithId<DriveFolder> & { /** A student's folder with no document yet. */ virtual?: boolean }
export type IndexFile = WithId<DriveFile>

export interface DriveStudent {
  id: string
  name: string
  /** Finished students keep their folder only if something is in it. */
  finished?: boolean
}

export interface DriveCounts {
  folders: number
  files: number
  bytes: number
}

export interface DriveUpdated {
  ms: number
  at: unknown
  by: DriveActor | null
}

export type DriveItem = { kind: 'folder'; id: string; folder: IndexFolder } | { kind: 'file'; id: string; file: IndexFile }

export type DriveHit = DriveItem & { key: string; where: string }

const NO_FOLDERS: IndexFolder[] = []
const NO_FILES: IndexFile[] = []

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** Names in the order people expect: "Series 2" before "Series 10", case ignored. */
export const compareNames = (a: string, b: string) => collator.compare(a ?? '', b ?? '')

/** Milliseconds of a Firestore timestamp (0 while a server stamp is pending). */
export function tsMs(t: unknown): number {
  const v = t as { seconds?: number; toMillis?: () => number } | null
  if (!v) return 0
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  return typeof t === 'number' ? t : 0
}

const fold = (s: string) => (s ?? '').normalize('NFKC').toLowerCase()

/** A query's words: every one must appear in a name. */
export const searchTokens = (query: string) => fold(query).split(/\s+/).filter(Boolean)

/** "Paige" from an actor stamp, the short form the Updated column uses. */
export function actorName(by: DriveActor | null | undefined): string {
  if (!by) return ''
  if (by.name) return by.name.split(/\s+/)[0]
  const email = by.email ?? ''
  return email.includes('@') ? email.slice(0, email.indexOf('@')) : email
}

/** Are this file's bytes there to open? */
export const bytesThere = (f: Pick<DriveFile, 'status'>) => f.status === 'ready'

const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}
const byName = (a: { id: string; name: string }, b: { id: string; name: string }) => compareNames(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

export type DriveIndex = ReturnType<typeof buildDriveIndex>

/** The index over the raw lists (null while loading reads as empty). */
export function buildDriveIndex(rawFolders: readonly WithId<DriveFolder>[] | null, rawFiles: readonly WithId<DriveFile>[] | null, students: readonly DriveStudent[] = []) {
  const studentById = new Map(students.map((s) => [s.id, s]))
  const all = new Map<string, IndexFolder>()
  for (const f of rawFolders ?? []) {
    if (!f?.id) continue
    const student = f.studentId ? studentById.get(f.studentId) : null
    all.set(f.id, student ? { ...f, name: student.name, parentId: null } : f)
  }
  const filesByStudent = new Set((rawFiles ?? []).filter((f) => f.studentId && !f.trashed).map((f) => f.studentId as string))
  for (const s of students) {
    const id = studentFolderId(s.id)
    if (all.has(id) || (s.finished && !filesByStudent.has(s.id))) continue
    all.set(id, { id, name: s.name, parentId: null, studentId: s.id, createdAt: null, createdBy: null, virtual: true })
  }

  // Effective parents: an unknown or self parent is the top; a loop is cut where a walk finds it.
  const parent = new Map<string, string | null>()
  for (const [id, f] of all) parent.set(id, f.parentId && f.parentId !== id && all.has(f.parentId) && !f.studentId ? f.parentId : null)
  for (const id of [...all.keys()].sort()) {
    const seen = new Set([id])
    let p = parent.get(id) ?? null
    while (p) {
      if (seen.has(p)) {
        parent.set(id, null)
        break
      }
      seen.add(p)
      p = parent.get(p) ?? null
    }
  }
  const visible = new Map<string, boolean>()
  const isVisible = (id: string): boolean => {
    if (visible.has(id)) return visible.get(id)!
    const f = all.get(id)
    let v = !!f && f.trashed !== true
    const p = parent.get(id)
    if (v && p) v = isVisible(p)
    visible.set(id, v)
    return v
  }

  const folders: IndexFolder[] = []
  const folderById = new Map<string, IndexFolder>()
  const kidFolders = new Map<string, IndexFolder[]>()
  for (const [id, f] of all) {
    if (!isVisible(id)) continue
    const pid = parent.get(id) ?? null
    const folder = pid === (f.parentId ?? null) ? f : { ...f, parentId: pid }
    folders.push(folder)
    folderById.set(id, folder)
    push(kidFolders, pid ?? '', folder)
  }

  const files: IndexFile[] = []
  const fileById = new Map<string, IndexFile>()
  const kidFiles = new Map<string, IndexFile[]>()
  for (const raw of rawFiles ?? []) {
    if (!raw?.id || raw.trashed === true) continue
    const want = raw.folderId || null
    let home: string | null = null
    if (want) {
      if (folderById.has(want)) home = want
      else if (all.has(want)) continue // its folder is in the Trash, or inside one
    }
    const file = home === (raw.folderId ?? null) ? raw : { ...raw, folderId: home }
    files.push(file)
    fileById.set(file.id, file)
    push(kidFiles, home ?? '', file)
  }
  for (const list of kidFolders.values()) list.sort(byName)
  for (const list of kidFiles.values()) list.sort(byName)
  folders.sort(byName)
  files.sort(byName)

  /** Top → folder, as [{ id, name }]: the breadcrumb trail. */
  const pathOf = (id: string | null): { id: string; name: string }[] => {
    const out: { id: string; name: string }[] = []
    const seen = new Set<string>()
    let cur = id
    while (cur && folderById.has(cur) && !seen.has(cur)) {
      seen.add(cur)
      const f = folderById.get(cur)!
      out.unshift({ id: cur, name: f.name })
      cur = f.parentId
    }
    return out
  }

  /** The student whose folder holds this folder, at any depth. */
  const studentOf = (folderId: string | null): string | null => {
    const top = pathOf(folderId)[0]
    return top ? (folderById.get(top.id)?.studentId ?? null) : null
  }

  const subtreeFolderIds = (id: string | null): string[] => {
    const out: string[] = []
    const walk = (key: string) => {
      for (const f of kidFolders.get(key) ?? NO_FOLDERS) {
        out.push(f.id)
        walk(f.id)
      }
    }
    if (id) {
      if (!folderById.has(id)) return out
      out.push(id)
      walk(id)
    } else walk('')
    return out
  }

  const subtreeFiles = (id: string | null): IndexFile[] => {
    if (!id) return files
    return subtreeFolderIds(id).flatMap((fid) => kidFiles.get(fid) ?? NO_FILES)
  }

  const counts = new Map<string, DriveCounts>()
  /** What a folder holds at every depth (null: the whole Drive). */
  const countsOf = (id: string | null): DriveCounts => {
    const key = id ?? ''
    if (counts.has(key)) return counts.get(key)!
    const own = kidFiles.get(key) ?? NO_FILES
    let c: DriveCounts = { folders: 0, files: own.length, bytes: own.reduce((n, f) => n + (Number(f.size) || 0), 0) }
    for (const sub of kidFolders.get(key) ?? NO_FOLDERS) {
      const s = countsOf(sub.id)
      c = { folders: c.folders + 1 + s.folders, files: c.files + s.files, bytes: c.bytes + s.bytes }
    }
    counts.set(key, c)
    return c
  }

  const newest = new Map<string, DriveUpdated>()
  /**
   * When a folder last changed, at any depth: the newest of its own stamp and everything inside it. Lists sort and
   * show folders by this, so a student's folder rises when a result lands in it.
   */
  const updatedOf = (id: string | null): DriveUpdated => {
    const key = id ?? ''
    if (newest.has(key)) return newest.get(key)!
    let best: DriveUpdated = { ms: 0, at: null, by: null }
    const offer = (at: unknown, by: DriveActor | null | undefined) => {
      const ms = tsMs(at)
      if (ms > best.ms) best = { ms, at, by: by ?? null }
    }
    const own = id ? folderById.get(id) : null
    if (own) offer(own.updatedAt ?? own.createdAt, own.updatedAt ? (own.updatedBy ?? own.createdBy) : own.createdBy)
    for (const f of kidFiles.get(key) ?? NO_FILES) offer(f.updatedAt ?? f.uploadedAt, f.updatedBy ?? f.uploadedBy)
    for (const sub of kidFolders.get(key) ?? NO_FOLDERS) {
      const s = updatedOf(sub.id)
      if (s.ms > best.ms) best = s
    }
    newest.set(key, best)
    return best
  }

  /** Is `id` the folder `ancestorId`, or anywhere inside it? */
  const isInside = (id: string | null, ancestorId: string | null): boolean => {
    if (!ancestorId) return true
    const seen = new Set<string>()
    let cur = id
    while (cur && !seen.has(cur)) {
      if (cur === ancestorId) return true
      seen.add(cur)
      cur = folderById.get(cur)?.parentId ?? null
    }
    return false
  }

  /** May these folders go into `targetId`? Never into themselves or anything inside them; students' folders stay put. */
  const canMoveInto = (folderIds: readonly string[], targetId: string | null) =>
    folderIds.every((fid) => !folderById.get(fid)?.studentId && (!targetId || !isInside(targetId, fid)))

  /** Another folder beside it already has this name (case and spacing ignored)? */
  const nameTaken = (parentId: string | null, name: string, exceptId: string | null = null) => {
    const want = fold(name).trim().replace(/\s+/g, ' ')
    return (kidFolders.get(parentId ?? '') ?? NO_FOLDERS).some((f) => f.id !== exceptId && fold(f.name).trim().replace(/\s+/g, ' ') === want)
  }

  let rows: { own: string; hit: DriveHit }[] | null = null
  const searchRows = () => {
    if (rows) return rows
    const whereOf = (folderId: string | null) => pathOf(folderId).map((c) => c.name).join(' / ')
    rows = [
      ...folders.map((f) => ({ own: fold(f.name), hit: { kind: 'folder' as const, key: `d:${f.id}`, id: f.id, folder: f, where: whereOf(f.parentId) } })),
      ...files.map((f) => ({ own: fold(f.name), hit: { kind: 'file' as const, key: `f:${f.id}`, id: f.id, file: f, where: whereOf(f.folderId) } })),
    ]
    return rows
  }

  return {
    folders,
    files,
    folderOf: (id: string | null) => (id ? (folderById.get(id) ?? null) : null),
    fileOf: (id: string | null) => (id ? (fileById.get(id) ?? null) : null),
    /** Folders directly inside `id` (null: the top), A–Z. */
    foldersIn: (id: string | null) => kidFolders.get(id ?? '') ?? NO_FOLDERS,
    /** Files directly inside `id` (null: the top), A–Z. */
    filesIn: (id: string | null) => kidFiles.get(id ?? '') ?? NO_FILES,
    pathOf,
    studentOf,
    subtreeFolderIds,
    subtreeFiles,
    countsOf,
    updatedOf,
    isInside,
    canMoveInto,
    nameTaken,
    /** A folder as stored, trashed or not (to say where something in the Trash came from). */
    storedFolder: (id: string | null) => (id ? (all.get(id) ?? null) : null),
    /** Search the whole Drive by name: folders then files, each A–Z. Every word must appear in the name. */
    search: (query: string): DriveHit[] => {
      const tokens = searchTokens(query)
      if (!tokens.length) return []
      return searchRows()
        .filter((r) => tokens.every((t) => r.own.includes(t)))
        .map((r) => r.hit)
    },
  }
}

// ------------------------------------------------------------- the Trash

export interface TrashEntry {
  kind: 'folder' | 'file'
  id: string
  name: string
  /** Where it was, as a path ("Mia Larkin / Old"); "" at the top. */
  from: string
  trashedAt: unknown
  trashedBy: DriveActor | null
  /** For a folder: the files it holds, at every depth. */
  files: number
  bytes: number
}

/**
 * What the Trash shows: each item someone moved there, not what was inside a trashed folder (that comes back with
 * it). Newest first.
 */
export function trashEntries(rawFolders: readonly WithId<DriveFolder>[], rawFiles: readonly WithId<DriveFile>[], students: readonly DriveStudent[] = []): TrashEntry[] {
  const byId = new Map(rawFolders.map((f) => [f.id, f]))
  const studentName = new Map(students.map((s) => [s.id, s.name]))
  const nameOf = (f: WithId<DriveFolder>) => (f.studentId && studentName.get(f.studentId)) || f.name
  const pathTo = (id: string | null) => {
    const out: string[] = []
    const seen = new Set<string>()
    let cur = id
    while (cur && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur)
      out.unshift(nameOf(byId.get(cur)!))
      cur = byId.get(cur)!.parentId
    }
    return out.join(' / ')
  }
  /** Is anything above `id` in the Trash? Then `id` comes back with it and isn't listed on its own. */
  const insideTrashed = (id: string | null) => {
    const seen = new Set<string>()
    let cur = id
    while (cur && byId.has(cur) && !seen.has(cur)) {
      seen.add(cur)
      if (byId.get(cur)!.trashed) return true
      cur = byId.get(cur)!.parentId
    }
    return false
  }
  const below = (id: string) => {
    const ids = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const f of rawFolders) if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id)
        grew = true
      }
    }
    const held = rawFiles.filter((f) => f.folderId && ids.has(f.folderId))
    return { files: held.length, bytes: held.reduce((n, f) => n + (Number(f.size) || 0), 0) }
  }
  const out: TrashEntry[] = []
  for (const f of rawFolders) {
    if (!f.trashed || insideTrashed(f.parentId)) continue
    out.push({ kind: 'folder', id: f.id, name: nameOf(f), from: pathTo(f.parentId), trashedAt: f.trashedAt ?? null, trashedBy: f.trashedBy ?? null, ...below(f.id) })
  }
  for (const f of rawFiles) {
    if (!f.trashed || insideTrashed(f.folderId)) continue
    out.push({ kind: 'file', id: f.id, name: f.name, from: pathTo(f.folderId), trashedAt: f.trashedAt ?? null, trashedBy: f.trashedBy ?? null, files: 1, bytes: Number(f.size) || 0 })
  }
  return out.sort((a, b) => tsMs(b.trashedAt) - tsMs(a.trashedAt) || compareNames(a.name, b.name))
}

// ------------------------------------------------------- listing a level

export type DriveColumn = 'name' | 'owner' | 'updated' | 'size'

export const DRIVE_COLUMNS: readonly DriveColumn[] = ['name', 'owner', 'updated', 'size']

export interface DriveSort {
  col: DriveColumn
  dir: 'asc' | 'desc'
}

/** What changed last at the top, the way a shared drive opens. */
export const DRIVE_DEFAULT_SORT: DriveSort = { col: 'updated', dir: 'desc' }

/** First click: names and owners A→Z, dates newest first, sizes largest first; a second click reverses. */
export function cycleDriveSort(sort: DriveSort, col: DriveColumn): DriveSort {
  if (sort.col !== col) return { col, dir: col === 'name' || col === 'owner' ? 'asc' : 'desc' }
  return { col, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
}

/** A level's rows: its folders, then its files. */
export function levelItems(index: DriveIndex, folderId: string | null): DriveItem[] {
  return [
    ...index.foldersIn(folderId).map((folder) => ({ kind: 'folder' as const, id: folder.id, folder })),
    ...index.filesIn(folderId).map((file) => ({ kind: 'file' as const, id: file.id, file })),
  ]
}

/** When an item last changed: a file's own stamp, a folder's newest change at any depth. */
export function itemUpdated(it: DriveItem, index: DriveIndex | null = null): DriveUpdated {
  if (it.kind === 'folder') {
    if (index) {
      const u = index.updatedOf(it.folder.id)
      if (u.ms) return u
    }
    const f = it.folder
    const at = f.updatedAt ?? f.createdAt ?? null
    return { ms: tsMs(at), at, by: (f.updatedAt ? (f.updatedBy ?? f.createdBy) : f.createdBy) ?? null }
  }
  const f = it.file
  const at = f.updatedAt ?? f.uploadedAt ?? null
  return { ms: tsMs(at), at, by: f.updatedBy ?? f.uploadedBy ?? null }
}

/** Who made it: a folder's creator, a file's uploader. */
export const itemOwner = (it: DriveItem): DriveActor | null => (it.kind === 'folder' ? it.folder.createdBy : it.file.uploadedBy) ?? null

export const itemName = (it: DriveItem) => (it.kind === 'folder' ? it.folder.name : it.file.name) ?? ''

/**
 * Rows in display order. Folders stay above files; within each the column decides, missing values (a pending stamp,
 * nobody named) sink whichever way the column runs, and ties fall back to the name, so renders never shuffle.
 */
export function sortDriveItems<T extends DriveItem>(items: readonly T[], sort: DriveSort, index: DriveIndex | null): T[] {
  const { col, dir } = sort
  const mul = dir === 'desc' ? -1 : 1
  const valueOf = (it: DriveItem): number | string =>
    col === 'updated'
      ? itemUpdated(it, index).ms
      : col === 'owner'
        ? fold(actorName(itemOwner(it)))
        : col === 'size'
          ? it.kind === 'folder'
            ? (index?.countsOf(it.id).bytes ?? 0)
            : Number(it.file.size) || 0
          : ''
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    if (col !== 'name') {
      const av = valueOf(a)
      const bv = valueOf(b)
      const canBeMissing = col === 'updated' || col === 'owner'
      const am = canBeMissing && !av
      const bm = canBeMissing && !bv
      if (am !== bm) return am ? 1 : -1
      if (!am && av !== bv) return (av < bv ? -1 : 1) * mul
      return compareNames(itemName(a), itemName(b))
    }
    return compareNames(itemName(a), itemName(b)) * mul || (a.id < b.id ? -1 : 1)
  })
}

/** "2 folders · 14 files · 18.3 MB": what a folder holds. */
export function countLabel(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** 1.4 MB, 820 KB, 0 B. */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`
}
