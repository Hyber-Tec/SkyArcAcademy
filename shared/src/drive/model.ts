import { formatInstant } from '../time'
import type { WithId } from '../types'
import { cleanFolderName } from './files'
import { CONTRACTS_FOLDER_ID, type DriveAccess, type DriveActor, type DriveFile, type DriveFolder, accessOf, studentFolderId } from './types'

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
  /** Other names they go by or are printed under (`Student.otherNames`). */
  otherNames?: string[]
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
  // Everything as stored, by the folder it's in, the Trash included: what a change to a folder must reach (a folder
  // in the Trash comes back with everything in it, so what's inside changes with it).
  const rawKidFolders = new Map<string, WithId<DriveFolder>[]>()
  const rawKidFiles = new Map<string, WithId<DriveFile>[]>()
  for (const f of rawFolders ?? []) {
    if (!f?.id) continue
    const student = f.studentId ? studentById.get(f.studentId) : null
    all.set(f.id, student ? { ...f, name: student.name, parentId: null } : f)
    if (!f.studentId) push(rawKidFolders, f.parentId ?? '', f)
  }
  for (const f of rawFiles ?? []) if (f?.id) push(rawKidFiles, f.folderId ?? '', f)
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

  /** May these folders go into `targetId`? Never into themselves or anything inside them; students' folders and the Contracts folder stay put. */
  const canMoveInto = (folderIds: readonly string[], targetId: string | null) =>
    folderIds.every((fid) => !folderById.get(fid)?.studentId && fid !== CONTRACTS_FOLDER_ID && (!targetId || !isInside(targetId, fid)))

  /** Who sees what's in a folder (null: the top, everyone on staff's), whether the folder is in the Trash or not. */
  const accessIn = (folderId: string | null): DriveAccess => (folderId ? accessOf(all.get(folderId)) : 'staff')

  /**
   * Every folder and file inside a folder, at any depth, as stored, the Trash included (what's in a trashed folder
   * comes back with it), folders above what they hold. Not the folder itself.
   */
  const storedInside = (id: string): { folders: WithId<DriveFolder>[]; files: WithId<DriveFile>[] } => {
    const folders: WithId<DriveFolder>[] = []
    const files: WithId<DriveFile>[] = []
    const seen = new Set([id])
    const queue = [id]
    while (queue.length) {
      const cur = queue.shift()!
      files.push(...(rawKidFiles.get(cur) ?? NO_FILES))
      for (const f of rawKidFolders.get(cur) ?? []) {
        if (seen.has(f.id)) continue
        seen.add(f.id)
        folders.push(f)
        queue.push(f.id)
      }
    }
    return { folders, files }
  }

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
    accessIn,
    storedInside,
    nameTaken,
    /** A folder as stored, trashed or not (to say where something in the Trash came from). */
    storedFolder: (id: string | null) => (id ? (all.get(id) ?? null) : null),
    /** A file as stored, trashed or not. */
    storedFile: (id: string | null) => (id ? ((rawFiles ?? []).find((f) => f?.id === id) ?? null) : null),
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
  access: DriveAccess
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
    out.push({ kind: 'folder', id: f.id, name: nameOf(f), from: pathTo(f.parentId), trashedAt: f.trashedAt ?? null, trashedBy: f.trashedBy ?? null, ...below(f.id), access: accessOf(f) })
  }
  for (const f of rawFiles) {
    if (!f.trashed || insideTrashed(f.folderId)) continue
    out.push({ kind: 'file', id: f.id, name: f.name, from: pathTo(f.folderId), trashedAt: f.trashedAt ?? null, trashedBy: f.trashedBy ?? null, files: 1, bytes: Number(f.size) || 0, access: accessOf(f) })
  }
  return out.sort((a, b) => tsMs(b.trashedAt) - tsMs(a.trashedAt) || compareNames(a.name, b.name))
}

// ------------------------------------------------------- listing a level

export type DriveColumn = 'name' | 'owner' | 'updated' | 'size'

export const DRIVE_COLUMNS: readonly DriveColumn[] = ['name', 'owner', 'updated', 'size']

export interface DriveSort {
  /** null: the opening order, no column picked (see DRIVE_DEFAULT_SORT). */
  col: DriveColumn | null
  dir: 'asc' | 'desc'
}

/**
 * How the Drive opens: folders A to Z (at the top they're the students' folders, found by name), then files newest
 * first (the latest results on top). Picking a column sorts folders and files alike by it.
 */
export const DRIVE_DEFAULT_SORT: DriveSort = { col: null, dir: 'asc' }

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
    if (col === null) {
      if (a.kind === 'folder') return compareNames(itemName(a), itemName(b)) || (a.id < b.id ? -1 : 1)
      const am = itemUpdated(a, index).ms
      const bm = itemUpdated(b, index).ms
      if (!am !== !bm) return am ? -1 : 1
      return bm - am || compareNames(itemName(a), itemName(b))
    }
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

/** "Oct 16, 2026 by Paige": when something changed, in the academy's time zone, and who changed it ("" without a date). */
export function updatedText(at: unknown, by: DriveActor | null | undefined, timezone: string): string {
  const ms = tsMs(at)
  if (!ms) return ''
  const day = formatInstant(ms, timezone, { month: 'short', day: 'numeric', year: 'numeric' })
  const who = actorName(by)
  return who ? `${day} by ${who}` : day
}

/** A search lists this many hits at most (the count says how many there are). */
export const DRIVE_SEARCH_LIMIT = 200

// ------------------------------------------------------------- changes

/** “Old results”, or "3 items": what an action is about, for its message and its audit entry. */
const itemsLabel = (names: readonly string[]) => (names.length === 1 ? `“${names[0]}”` : `${names.length} items`)

/** Why a folder can't take this name beside the others (case and spacing ignored), or null when it can. */
export function folderNameProblem(index: DriveIndex, parentId: string | null, name: string, exceptId: string | null = null): string | null {
  return index.nameTaken(parentId, name, exceptId) ? `There’s already a folder called “${cleanFolderName(name)}” here.` : null
}

/**
 * Who sees a folder once it's moved into `targetId` (null: the top): inside a folder only owners and admins see, theirs;
 * out of one, everyone's on staff again (with everything in it); anywhere else, what it was (a folder admins made
 * theirs stays theirs).
 */
export function movedFolderAccess(index: DriveIndex, folder: Pick<DriveFolder, 'parentId' | 'access'>, targetId: string | null): DriveAccess {
  if (index.accessIn(targetId) === 'admins') return 'admins'
  if (index.accessIn(folder.parentId) === 'admins') return 'staff'
  return accessOf(folder)
}

/** Would this folder, moved into `targetId`, keep anything only owners and admins see (itself, or something in it)? */
function keepsAdminsOnly(index: DriveIndex, folderId: string, targetId: string | null): boolean {
  const folder = index.folderOf(folderId)
  if (!folder) return false
  const after = movedFolderAccess(index, folder, targetId)
  if (after === 'admins') return true
  // Out of a folder only owners and admins see: it opens with everything in it.
  if (after !== accessOf(folder)) return false
  const inside = index.storedInside(folderId)
  return inside.folders.some((f) => accessOf(f) === 'admins') || inside.files.some((f) => accessOf(f) === 'admins')
}

/**
 * Why these can't be moved into `targetId` (null: the top of the Drive), or null when they can: a folder never goes
 * inside itself or anything inside it, a student's folder and the Contracts folder stay at the top, a student's folder
 * is everyone's on staff (so nothing only owners and admins see goes in it), and there's no moving things to where
 * they already all are.
 */
export function moveRefusal(index: DriveIndex, folderIds: readonly string[], fileIds: readonly string[], targetId: string | null): string | null {
  if (!index.canMoveInto(folderIds, targetId)) {
    if (folderIds.some((id) => index.folderOf(id)?.studentId)) return 'A student’s folder stays at the top.'
    if (folderIds.includes(CONTRACTS_FOLDER_ID)) return 'The Contracts folder stays at the top.'
    return 'A folder can’t go inside itself.'
  }
  const homes = new Set([...folderIds.map((id) => index.folderOf(id)?.parentId ?? null), ...fileIds.map((id) => index.fileOf(id)?.folderId ?? null)])
  if (homes.size === 1 && homes.has(targetId)) return 'It’s already here.'
  if (index.studentOf(targetId) && folderIds.some((id) => keepsAdminsOnly(index, id, targetId))) {
    return 'A student’s folder is for everyone on staff, so a folder only owners and admins see (or one holding such a folder) can’t go in it.'
  }
  return null
}

/** A file's fields that change when it moves (or when the folder it's in moves, or changes who sees it). */
export interface MovedFile {
  id: string
  patch: { folderId?: string | null; studentId?: string | null; evaluationId?: null; access?: DriveAccess }
}

/** A folder's fields that change when it moves (its parent), or when who sees it changes (with what's in a folder that changes). */
export interface MovedFolder {
  id: string
  patch: { parentId?: string | null; access?: DriveAccess }
}

/** What moving folders and files into a folder changes, before it's written (moveItems on the website and the phone). */
export interface MovePlan {
  /** The student whose folder they land in, at any depth (null: none). */
  student: string | null
  /** The folders whose parent becomes the target. */
  folderIds: string[]
  /** Every folder that changes: those moved (their parent, and who sees them) and those in them that change too, each above what it holds. */
  folders: MovedFolder[]
  files: MovedFile[]
  /** Who sees what moved once it's there, when that changes for any of it (null: it doesn't). */
  access: DriveAccess | null
  /** For the audit log: "Moved “Old” to “Mia Larkin”". */
  summary: string
}

/**
 * Moving folders and files into `targetId` (null: the top). Files keep track of whose folder they're in, at any depth,
 * and a score's file that leaves its student stops being a score's file (`evaluationId` cleared), so neither family sees
 * it (storage.rules). Who sees them follows where they land (`movedFolderAccess`; a file takes its folder's), and a
 * folder's whole content follows it, the Trash included. Throws when a folder would go inside itself, or a student's
 * folder or the Contracts folder would leave the top.
 */
export function planMove(index: DriveIndex, folderIds: readonly string[], fileIds: readonly string[], targetId: string | null): MovePlan {
  if (!index.canMoveInto(folderIds, targetId)) throw new Error('A folder can’t go inside itself, and a student’s folder or the Contracts folder stays where it is.')
  const student = index.studentOf(targetId)
  const into = index.accessIn(targetId)
  const unlinked = (f: Pick<DriveFile, 'evaluationId'>) => (f.evaluationId ? { evaluationId: null } : {})
  const folderPatches = new Map<string, MovedFolder['patch']>()
  const filePatches = new Map<string, MovedFile['patch']>()
  const patchFolder = (id: string, patch: MovedFolder['patch']) => folderPatches.set(id, { ...folderPatches.get(id), ...patch })
  const patchFile = (id: string, patch: MovedFile['patch']) => filePatches.set(id, { ...filePatches.get(id), ...patch })
  let access: DriveAccess | null = null
  const folders = folderIds.filter((id) => id !== targetId)
  for (const id of folders) {
    patchFolder(id, { parentId: targetId })
    const folder = index.folderOf(id)
    const before = accessOf(folder)
    const after = folder ? movedFolderAccess(index, folder, targetId) : before
    if (after !== before) {
      patchFolder(id, { access: after })
      access = after
    }
    const inside = index.storedInside(id)
    if (after !== before) for (const f of inside.folders) if (accessOf(f) !== after) patchFolder(f.id, { access: after })
    for (const f of inside.files) {
      if ((f.studentId ?? null) !== student) patchFile(f.id, { studentId: student, ...unlinked(f) })
      if (after !== before && accessOf(f) !== after) patchFile(f.id, { access: after })
    }
  }
  for (const id of fileIds) {
    const f = index.fileOf(id)
    patchFile(id, { folderId: targetId, studentId: student, ...(f && (f.studentId ?? null) !== student ? unlinked(f) : {}) })
    if (f && accessOf(f) !== into) {
      patchFile(id, { access: into })
      access = into
    }
  }
  const names = [...folderIds.map((id) => index.folderOf(id)?.name), ...fileIds.map((id) => index.fileOf(id)?.name)].filter((n): n is string => !!n)
  const where = targetId ? `“${index.folderOf(targetId)?.name ?? 'a folder'}”` : 'the top of the Drive'
  return {
    student,
    folderIds: folders,
    folders: [...folderPatches].map(([id, patch]) => ({ id, patch })),
    files: [...filePatches].map(([id, patch]) => ({ id, patch })),
    access,
    summary: `Moved ${itemsLabel(names)} to ${where}`,
  }
}

/**
 * Why a folder can't be made `access`, or null when it can: a student's folder (and anything in it) is everyone's on
 * staff, the Contracts folder is owners' and admins' only, and a folder inside one only owners and admins see is
 * theirs too.
 */
export function accessRefusal(index: DriveIndex, folderId: string, access: DriveAccess): string | null {
  const folder = index.folderOf(folderId)
  if (!folder) return 'That folder isn’t in the Drive any more.'
  if (folderId === CONTRACTS_FOLDER_ID && access !== 'admins') return 'The Contracts folder is for owners and admins only.'
  if (access === 'admins' && (folder.studentId || index.studentOf(folderId))) return 'A student’s folder is for everyone on staff, and so is everything in it.'
  const parent = folder.parentId ? index.folderOf(folder.parentId) : null
  if (access === 'staff' && parent && accessOf(parent) === 'admins') return `It’s inside “${parent.name}”, which only owners and admins see.`
  return null
}

/** What making a folder `access` changes: the folder and everything in it, the Trash included. */
export interface AccessPlan {
  folders: MovedFolder[]
  files: MovedFile[]
  /** For the audit log: "Made “Office” for owners and admins only". */
  summary: string
}

/** Making a folder everyone's on staff, or owners' and admins' only: it and everything in it. Throws when it can't be. */
export function planAccess(index: DriveIndex, folderId: string, access: DriveAccess): AccessPlan {
  const refusal = accessRefusal(index, folderId, access)
  if (refusal) throw new Error(refusal)
  const folder = index.folderOf(folderId)!
  const inside = index.storedInside(folderId)
  const folders: MovedFolder[] = [folder, ...inside.folders].filter((f) => accessOf(f) !== access).map((f) => ({ id: f.id, patch: { access } }))
  const files: MovedFile[] = inside.files.filter((f) => accessOf(f) !== access).map((f) => ({ id: f.id, patch: { access } }))
  return { folders, files, summary: access === 'admins' ? `Made “${folder.name}” for owners and admins only` : `Made “${folder.name}” for everyone on staff` }
}

/**
 * What choosing who sees a folder means, in a sentence under the choice: owners and admins only covers everything in it
 * (and what's added later); everyone on staff opens it all, naming what only owners and admins see in it now.
 */
export function accessNote(index: DriveIndex, folderId: string, access: DriveAccess): string {
  const c = index.countsOf(folderId)
  const parts = [c.folders ? countLabel(c.folders, 'folder') : null, c.files ? countLabel(c.files, 'file') : null].filter(Boolean)
  const what = parts.length ? `it and the ${parts.join(' and ')} in it` : 'it'
  if (access === 'admins') return `Coaches won’t see ${what}. Anything added or moved into it later is for owners and admins only too.`
  const closed = index
    .subtreeFolderIds(folderId)
    .slice(1)
    .map((id) => index.folderOf(id))
    .filter((f): f is IndexFolder => !!f && accessOf(f) === 'admins')
  const names = closed.slice(0, 3).map((f) => `“${f.name}”`)
  if (closed.length > 3) names.push(countLabel(closed.length - 3, 'more folder'))
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '')
  const including = closed.length ? ` That includes ${list}, which only owners and admins see now.` : ''
  return `Everyone on staff, coaches too, will see ${what}.${including}`
}

/**
 * A line for the Move dialog when moving changes who sees something: into a folder only owners and admins see, or out
 * of one. Null when it doesn't.
 */
export function moveAccessNote(index: DriveIndex, folderIds: readonly string[], fileIds: readonly string[], targetId: string | null): string | null {
  if (moveRefusal(index, folderIds, fileIds, targetId)) return null
  const access = planMove(index, folderIds, fileIds, targetId).access
  const one = folderIds.length + fileIds.length === 1
  if (access === 'admins') return `Only owners and admins will see ${one ? 'it' : 'them'} there.`
  if (access === 'staff') return `Everyone on staff, coaches too, will see ${one ? 'it' : 'them'} there.`
  return null
}

/**
 * The question before moving folders and files to the Trash: what goes (a folder takes what's inside it), and who can
 * bring it back. `trash` names where the Trash is for whoever reads it ("the Trash", or the website's on the phone).
 */
export function trashQuestion(index: DriveIndex, folderIds: readonly string[], fileIds: readonly string[], opts: { isAdmin: boolean; trash?: string }): { title: string; message: string } {
  const folders = folderIds.map((id) => index.folderOf(id)).filter((f): f is IndexFolder => !!f)
  const files = fileIds.map((id) => index.fileOf(id)).filter((f): f is IndexFile => !!f)
  const inside = folders.reduce((n, f) => n + index.countsOf(f.id).files, 0)
  const count = folders.length + files.length
  const trash = opts.trash ?? 'the Trash'
  return {
    title: count === 1 ? `Move “${folders[0]?.name ?? files[0]?.name}” to the Trash?` : `Move ${count} items to the Trash?`,
    message: `${inside ? `${countLabel(inside, 'file')} inside go${inside === 1 ? 'es' : ''} with ${folders.length === 1 ? 'it' : 'them'}. ` : ''}${opts.isAdmin ? 'You' : 'An admin'} can restore ${count === 1 ? 'it' : 'them'} from ${trash}.`,
  }
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
