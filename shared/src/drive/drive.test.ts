import { describe, expect, it } from 'vitest'
import type { WithId } from '../types'
import { classifyFile, cleanFolderName } from './files'
import { DRIVE_DEFAULT_SORT, buildDriveIndex, cycleDriveSort, formatBytes, levelItems, sortDriveItems, trashEntries } from './model'
import { type DriveFile, type DriveFolder, studentFolderId } from './types'

const at = (ms: number) => ({ seconds: ms / 1000, nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms })
const by = { uid: 'u', email: 'paige@example.test', name: 'Paige Sutton' }

function folder(id: string, parentId: string | null, extra: Partial<DriveFolder> = {}): WithId<DriveFolder> {
  return { id, name: id, parentId, studentId: null, createdAt: at(1000), createdBy: by, ...extra }
}

function file(id: string, folderId: string | null, extra: Partial<DriveFile> = {}): WithId<DriveFile> {
  return { id, name: `${id}.pdf`, size: 1000, kind: 'pdf', mime: 'application/pdf', status: 'ready', folderId, studentId: null, uploadedAt: at(2000), uploadedBy: by, ...extra }
}

const students = [
  { id: 'mia', name: 'Mia Larkin' },
  { id: 'leo', name: 'Leo Grant' },
  { id: 'old', name: 'Ava Old', finished: true },
]

describe('the Drive index', () => {
  it('gives every current student a folder at the top, with the student’s name', () => {
    const idx = buildDriveIndex([folder(studentFolderId('mia'), null, { studentId: 'mia', name: 'Mia (old name)' })], [], students)
    expect(idx.foldersIn(null).map((f) => [f.name, !!f.virtual])).toEqual([
      ['Leo Grant', true],
      ['Mia Larkin', false],
    ])
    expect(idx.studentOf(studentFolderId('leo'))).toBe('leo')
  })

  it('keeps a finished student’s folder only while something is in it', () => {
    expect(buildDriveIndex([], [], students).folderOf(studentFolderId('old'))).toBeNull()
    expect(buildDriveIndex([], [file('r', null, { studentId: 'old' })], students).folderOf(studentFolderId('old'))?.name).toBe('Ava Old')
  })

  it('hides what is inside a trashed folder, and brings it back on restore', () => {
    const folders = [folder('a', null), folder('b', 'a', { trashed: true }), folder('c', 'b')]
    const files = [file('f1', 'c'), file('f2', 'a')]
    const idx = buildDriveIndex(folders, files)
    expect(idx.folders.map((f) => f.id)).toEqual(['a'])
    expect(idx.files.map((f) => f.id)).toEqual(['f2'])
    const restored = buildDriveIndex([folder('a', null), folder('b', 'a'), folder('c', 'b')], files)
    expect(restored.files.map((f) => f.id).sort()).toEqual(['f1', 'f2'])
    expect(restored.pathOf('c').map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('puts a folder whose parent is missing at the top and cuts loops', () => {
    const idx = buildDriveIndex([folder('x', 'gone'), folder('p', 'q'), folder('q', 'p')], [])
    expect(idx.folderOf('x')?.parentId).toBeNull()
    expect(idx.foldersIn(null).map((f) => f.id).sort()).toEqual(['p', 'x'])
  })

  it('counts and dates folders from everything inside them', () => {
    const idx = buildDriveIndex([folder('a', null), folder('b', 'a')], [file('f1', 'b', { size: 300, uploadedAt: at(9000) }), file('f2', 'a', { size: 200 })])
    expect(idx.countsOf('a')).toEqual({ folders: 1, files: 2, bytes: 500 })
    expect(idx.updatedOf('a').ms).toBe(9000)
    expect(idx.countsOf(null).bytes).toBe(500)
  })

  it('never moves a folder into itself, nor a student’s folder anywhere', () => {
    const idx = buildDriveIndex([folder('a', null), folder('b', 'a')], [], students)
    expect(idx.canMoveInto(['a'], 'b')).toBe(false)
    expect(idx.canMoveInto(['b'], null)).toBe(true)
    expect(idx.canMoveInto([studentFolderId('mia')], 'a')).toBe(false)
  })

  it('searches the whole Drive and says where each hit is', () => {
    const idx = buildDriveIndex([folder('Plans', null), folder('Old', 'Plans')], [file('prone result', 'Old')])
    const hits = idx.search('prone res')
    expect(hits.map((h) => [h.id, h.where])).toEqual([['prone result', 'Plans / Old']])
    expect(idx.nameTaken(null, ' plans ')).toBe(true)
  })

  it('opens with folders A to Z above the newest files, and a picked column sorts both', () => {
    const idx = buildDriveIndex([folder('b', null, { createdAt: at(5000) }), folder('a', null)], [file('old', null, { uploadedAt: at(3000) }), file('new', null, { uploadedAt: at(8000) })])
    expect(sortDriveItems(levelItems(idx, null), DRIVE_DEFAULT_SORT, idx).map((i) => i.id)).toEqual(['a', 'b', 'new', 'old'])
    const byUpdated = cycleDriveSort(DRIVE_DEFAULT_SORT, 'updated')
    expect(byUpdated).toEqual({ col: 'updated', dir: 'desc' })
    expect(sortDriveItems(levelItems(idx, null), byUpdated, idx).map((i) => i.id)).toEqual(['b', 'a', 'new', 'old'])
    expect(cycleDriveSort(DRIVE_DEFAULT_SORT, 'name')).toEqual({ col: 'name', dir: 'asc' })
    expect(cycleDriveSort({ col: 'name', dir: 'asc' }, 'name')).toEqual({ col: 'name', dir: 'desc' })
  })

  it('lists the Trash by what was moved there, not what was inside it', () => {
    const folders = [folder('a', null, { trashed: true, trashedAt: at(5000) }), folder('b', 'a', { trashed: true })]
    const files = [file('in-b', 'b', { size: 10 }), file('loose', null, { trashed: true, trashedAt: at(7000), size: 5 })]
    expect(trashEntries(folders, files).map((e) => [e.kind, e.id, e.files])).toEqual([
      ['file', 'loose', 1],
      ['folder', 'a', 1],
    ])
  })
})

describe('what the Drive takes', () => {
  it('accepts ordinary files and refuses the rest with a reason', () => {
    expect(classifyFile({ name: 'result.PDF', size: 10 })).toEqual({ ok: true, name: 'result.PDF', kind: 'pdf', mime: 'application/pdf' })
    expect(classifyFile({ name: 'IMG_0001.HEIC', size: 10 })).toMatchObject({ ok: true, mime: 'image/heic' })
    expect(classifyFile({ name: 'run.exe', size: 10 })).toMatchObject({ ok: false, reason: '.exe files can’t be stored in the Drive.' })
    expect(classifyFile({ name: 'page.html', size: 10 }).ok).toBe(false)
    expect(classifyFile({ name: 'big.mp4', size: 200 * 1024 * 1024 })).toMatchObject({ ok: false, reason: 'It’s over 100 MB.' })
    expect(classifyFile({ name: '.DS_Store', size: 10 }).ok).toBe(false)
    expect(cleanFolderName('  a/b  ')).toBe('a-b')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(23_500_000)).toBe('22.4 MB')
  })
})
