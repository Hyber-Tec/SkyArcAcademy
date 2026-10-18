import { describe, expect, it } from 'vitest'
import type { WithId } from '../types'
import { classifyFile, cleanFolderName, kindOfMime, withExtension } from './files'
import {
  DRIVE_DEFAULT_SORT,
  buildDriveIndex,
  cycleDriveSort,
  folderNameProblem,
  formatBytes,
  levelItems,
  moveRefusal,
  planMove,
  sortDriveItems,
  trashEntries,
  trashQuestion,
  updatedText,
} from './model'
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

describe('changing the Drive', () => {
  const idx = () =>
    buildDriveIndex(
      [folder(studentFolderId('mia'), null, { studentId: 'mia' }), folder('x', null), folder('old', studentFolderId('mia')), folder('a', null), folder('b', 'a')],
      [file('f1', 'x'), file('r', studentFolderId('mia'), { studentId: 'mia', evaluationId: 'e1' }), file('in-a', 'a'), file('in-b', 'b')],
      students,
    )

  it('says when and by whom something changed, in the academy’s time zone', () => {
    // 02:00 UTC on Oct 17 is still Oct 16 in New York.
    expect(updatedText(at(Date.UTC(2026, 9, 17, 2)), by, 'America/New_York')).toBe('Oct 16, 2026 by Paige')
    expect(updatedText(at(Date.UTC(2026, 9, 17, 2)), null, 'UTC')).toBe('Oct 17, 2026')
    expect(updatedText(null, by, 'UTC')).toBe('')
  })

  it('refuses a folder name already beside it, but not its own', () => {
    expect(folderNameProblem(idx(), null, '  X ')).toBe('There’s already a folder called “X” here.')
    expect(folderNameProblem(idx(), null, 'x', 'x')).toBeNull()
    expect(folderNameProblem(idx(), 'a', 'x')).toBeNull()
  })

  it('says why something can’t be moved there', () => {
    expect(moveRefusal(idx(), ['a'], [], 'b')).toBe('A folder can’t go inside itself.')
    expect(moveRefusal(idx(), [studentFolderId('mia')], [], 'x')).toBe('A student’s folder stays at the top.')
    expect(moveRefusal(idx(), [], ['f1'], 'x')).toBe('It’s already here.')
    expect(moveRefusal(idx(), ['b'], ['in-a'], 'a')).toBe('It’s already here.')
    expect(moveRefusal(idx(), ['b'], ['in-a'], 'x')).toBeNull()
    expect(moveRefusal(idx(), [], ['f1'], null)).toBeNull()
  })

  it('files a moved folder’s files under the student it lands with', () => {
    expect(planMove(idx(), ['x'], [], studentFolderId('mia'))).toEqual({
      student: 'mia',
      folderIds: ['x'],
      files: [{ id: 'f1', patch: { studentId: 'mia' } }],
      summary: 'Moved “x” to “Mia Larkin”',
    })
  })

  it('stops a result being a score’s file once it leaves its student, and keeps it inside the student’s folder', () => {
    expect(planMove(idx(), [], ['r'], null)).toEqual({
      student: null,
      folderIds: [],
      files: [{ id: 'r', patch: { folderId: null, studentId: null, evaluationId: null } }],
      summary: 'Moved “r.pdf” to the top of the Drive',
    })
    expect(planMove(idx(), [], ['r'], 'old').files).toEqual([{ id: 'r', patch: { folderId: 'old', studentId: 'mia' } }])
    expect(planMove(idx(), ['b'], ['f1'], null).summary).toBe('Moved 2 items to the top of the Drive')
    expect(() => planMove(idx(), ['a'], [], 'b')).toThrow()
  })

  it('asks before the Trash, saying what goes with a folder and who can bring it back', () => {
    expect(trashQuestion(idx(), ['a'], [], { isAdmin: false })).toEqual({
      title: 'Move “a” to the Trash?',
      message: '2 files inside go with it. An admin can restore it from the Trash.',
    })
    expect(trashQuestion(idx(), [], ['f1', 'in-a'], { isAdmin: true, trash: 'the Drive’s Trash on the website' })).toEqual({
      title: 'Move 2 items to the Trash?',
      message: 'You can restore them from the Drive’s Trash on the website.',
    })
    expect(trashQuestion(idx(), ['b'], [], { isAdmin: true }).message).toBe('1 file inside goes with it. You can restore it from the Trash.')
  })
})

describe('naming files the phone adds', () => {
  it('knows the extension of each type the Drive takes', () => {
    expect(kindOfMime('image/jpeg')).toBe('jpg')
    expect(kindOfMime('IMAGE/PNG')).toBe('png')
    expect(kindOfMime('image/heic')).toBe('heic')
    expect(kindOfMime('image/tiff')).toBeNull()
    expect(kindOfMime(null)).toBeNull()
  })

  it('gives a file the extension of what is stored, or a name when it has none', () => {
    expect(withExtension('IMG_0412.HEIC', 'jpg', 'Photo')).toBe('IMG_0412.jpg')
    expect(withExtension('my.card.png', 'png', 'Photo')).toBe('my.card.png')
    expect(withExtension('a/b.jpeg', 'jpg', 'Photo')).toBe('a-b.jpg')
    expect(withExtension(null, 'jpg', 'Photo 2026-10-18 14.05')).toBe('Photo 2026-10-18 14.05.jpg')
    expect(withExtension('.jpg', 'jpg', 'Photo')).toBe('Photo.jpg')
    expect(withExtension('photo.', 'jpg', 'Photo')).toBe('photo.jpg')
    const long = withExtension(`${'x'.repeat(250)}.heic`, 'jpg', 'Photo')
    expect(long.length).toBeLessThanOrEqual(200)
    expect(long.endsWith('x.jpg')).toBe(true)
  })
})
