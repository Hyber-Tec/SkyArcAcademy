import { describe, expect, it } from 'vitest'
import type { WithId } from '../types'
import { classifyFile, cleanFolderName, kindOfMime, withExtension } from './files'
import {
  DRIVE_DEFAULT_SORT,
  accessNote,
  accessRefusal,
  buildDriveIndex,
  cycleDriveSort,
  folderNameProblem,
  formatBytes,
  levelItems,
  moveAccessNote,
  moveRefusal,
  planAccess,
  planMove,
  sortDriveItems,
  trashEntries,
  trashQuestion,
  updatedText,
} from './model'
import {
  type DriveFile,
  type DriveFolder,
  OLD_CONTRACTS_FOLDER_ID,
  accessOf,
  contractsFolderId,
  contractsFolderStudent,
  isContractsFolder,
  isFixedFolder,
  studentFolderId,
} from './types'

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
      folders: [{ id: 'x', patch: { parentId: studentFolderId('mia') } }],
      files: [{ id: 'f1', patch: { studentId: 'mia' } }],
      access: null,
      summary: 'Moved “x” to “Mia Larkin”',
    })
  })

  it('stops a result being a score’s file once it leaves its student, and keeps it inside the student’s folder', () => {
    expect(planMove(idx(), [], ['r'], null)).toEqual({
      student: null,
      folderIds: [],
      folders: [],
      files: [{ id: 'r', patch: { folderId: null, studentId: null, evaluationId: null } }],
      access: null,
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

describe('who sees what: folders only owners and admins see', () => {
  const idx = (extraFolders: WithId<DriveFolder>[] = []) =>
    buildDriveIndex(
      [
        folder(studentFolderId('mia'), null, { studentId: 'mia' }),
        folder(OLD_CONTRACTS_FOLDER_ID, null, { name: 'Contracts', access: 'admins' }),
        folder('office', null, { name: 'Office' }),
        // Made theirs by an admin, inside a folder everyone on staff sees; and a folder inside it.
        folder('pay', 'office', { name: 'Payroll', access: 'admins' }),
        folder('pay-old', 'pay', { name: '2025', access: 'admins' }),
        folder('plans', null, { name: 'Plans' }),
        folder('drafts', 'plans', { name: 'Drafts' }),
        folder('gone', 'plans', { name: 'Gone', trashed: true }),
        ...extraFolders,
      ],
      [
        file('signed', OLD_CONTRACTS_FOLDER_ID, { access: 'admins' }),
        file('payslip', 'pay', { access: 'admins' }),
        file('old-payslip', 'pay-old', { access: 'admins' }),
        file('plan', 'plans'),
        file('draft', 'drafts'),
        // In a folder in the Trash: it comes back with it, so it changes with it.
        file('lost', 'gone'),
        file('result', studentFolderId('mia'), { studentId: 'mia', evaluationId: 'e1' }),
      ],
      students,
    )

  it('reads a missing access as everyone on staff’s', () => {
    expect(accessOf({})).toBe('staff')
    expect(accessOf(null)).toBe('staff')
    expect(idx().accessIn(null)).toBe('staff')
    expect(idx().accessIn(OLD_CONTRACTS_FOLDER_ID)).toBe('admins')
    expect(idx().accessIn(studentFolderId('leo'))).toBe('staff')
  })

  it('makes a file moved into their folder theirs, and everyone’s on staff again out of one', () => {
    const into = planMove(idx(), [], ['plan'], OLD_CONTRACTS_FOLDER_ID)
    expect(into.files).toEqual([{ id: 'plan', patch: { folderId: OLD_CONTRACTS_FOLDER_ID, studentId: null, access: 'admins' } }])
    expect(into.access).toBe('admins')
    expect(moveAccessNote(idx(), [], ['plan'], OLD_CONTRACTS_FOLDER_ID)).toBe('Only owners and admins will see it there.')
    const out = planMove(idx(), [], ['signed'], 'office')
    expect(out.files).toEqual([{ id: 'signed', patch: { folderId: 'office', studentId: null, access: 'staff' } }])
    expect(moveAccessNote(idx(), [], ['signed', 'payslip'], 'office')).toBe('Everyone on staff, coaches too, will see them there.')
    // Between folders everyone on staff sees, nothing changes.
    expect(planMove(idx(), [], ['plan'], 'office').access).toBeNull()
    expect(moveAccessNote(idx(), [], ['plan'], 'office')).toBeNull()
  })

  it('takes everything in a moved folder along, the Trash included', () => {
    const plan = planMove(idx(), ['plans'], [], OLD_CONTRACTS_FOLDER_ID)
    expect(plan.folders).toEqual([
      { id: 'plans', patch: { parentId: OLD_CONTRACTS_FOLDER_ID, access: 'admins' } },
      { id: 'drafts', patch: { access: 'admins' } },
      { id: 'gone', patch: { access: 'admins' } },
    ])
    expect(plan.files.map((f) => [f.id, f.patch.access])).toEqual([
      ['plan', 'admins'],
      ['draft', 'admins'],
      ['lost', 'admins'],
    ])
    expect(plan.access).toBe('admins')
  })

  it('keeps a folder admins made theirs theirs between folders everyone sees, and opens one leaving theirs', () => {
    expect(planMove(idx(), ['pay'], [], 'plans')).toMatchObject({ folders: [{ id: 'pay', patch: { parentId: 'plans' } }], files: [], access: null })
    const out = planMove(idx(), ['pay-old'], [], null)
    expect(out.folders).toEqual([{ id: 'pay-old', patch: { parentId: null, access: 'staff' } }])
    expect(out.files).toEqual([{ id: 'old-payslip', patch: { access: 'staff' } }])
    expect(out.access).toBe('staff')
  })

  it('keeps a student’s folder everyone’s on staff', () => {
    const mia = studentFolderId('mia')
    expect(moveRefusal(idx(), ['pay'], [], mia)).toBe('A student’s folder is for everyone on staff, so a folder only owners and admins see (or one holding such a folder) can’t go in it.')
    // A folder everyone sees, holding one that only owners and admins see.
    expect(moveRefusal(idx(), ['office'], [], mia)).not.toBeNull()
    expect(moveRefusal(idx(), ['plans'], [], mia)).toBeNull()
    // Out of their folder it opens, so it may go in.
    expect(moveRefusal(idx(), ['pay-old'], [], mia)).toBeNull()
    expect(planMove(idx(), [], ['signed'], mia).files).toEqual([{ id: 'signed', patch: { folderId: mia, studentId: 'mia', access: 'staff' } }])
    expect(accessRefusal(idx(), mia, 'admins')).toBe('A student’s folder is for everyone on staff, and so is everything in it.')
    expect(accessRefusal(idx([folder('mia-old', mia, { name: 'Old' })]), 'mia-old', 'admins')).toBe('A student’s folder is for everyone on staff, and so is everything in it.')
  })

  it('keeps the Contracts folder from before at the top, for owners and admins, until it’s emptied', () => {
    expect(isFixedFolder({ id: OLD_CONTRACTS_FOLDER_ID })).toBe(true)
    expect(moveRefusal(idx(), [OLD_CONTRACTS_FOLDER_ID], [], 'office')).toBe('The Contracts folder stays at the top.')
    expect(() => planMove(idx(), [OLD_CONTRACTS_FOLDER_ID], [], 'office')).toThrow()
    expect(accessRefusal(idx(), OLD_CONTRACTS_FOLDER_ID, 'staff')).toBe('The Contracts folder is for owners and admins only.')
  })

  it('makes a folder theirs with everything in it, and opens it the same way', () => {
    const closing = planAccess(idx(), 'plans', 'admins')
    expect(closing.folders.map((f) => f.id)).toEqual(['plans', 'drafts', 'gone'])
    expect(closing.files.map((f) => f.id)).toEqual(['plan', 'draft', 'lost'])
    expect(closing.summary).toBe('Made “Plans” for owners and admins only')
    // What's theirs already stays as it is.
    expect(planAccess(idx(), 'office', 'admins')).toMatchObject({ folders: [{ id: 'office', patch: { access: 'admins' } }], files: [] })
    expect(accessRefusal(idx(), 'pay-old', 'staff')).toBe('It’s inside “Payroll”, which only owners and admins see.')
    const opening = planAccess(idx(), 'pay', 'staff')
    expect(opening.folders.map((f) => [f.id, f.patch.access])).toEqual([
      ['pay', 'staff'],
      ['pay-old', 'staff'],
    ])
    expect(opening.files.map((f) => f.id)).toEqual(['payslip', 'old-payslip'])
    expect(() => planAccess(idx(), studentFolderId('mia'), 'admins')).toThrow()
  })

  it('says what the choice covers', () => {
    expect(accessNote(idx(), 'plans', 'admins')).toBe('Coaches won’t see it and the 1 folder and 2 files in it. Anything added or moved into it later is for owners and admins only too.')
    expect(accessNote(idx(), 'office', 'staff')).toBe('Everyone on staff, coaches too, will see it and the 2 folders and 2 files in it. That includes “Payroll” and “2025”, which only owners and admins see now.')
    expect(accessNote(idx(), 'drafts', 'admins')).toBe('Coaches won’t see it and the 1 file in it. Anything added or moved into it later is for owners and admins only too.')
  })

  it('says in the Trash who sees what', () => {
    const entries = trashEntries([folder('a', null, { access: 'admins', trashed: true })], [file('b', null, { trashed: true })])
    expect(entries.map((e) => [e.id, e.access])).toEqual([
      ['a', 'admins'],
      ['b', 'staff'],
    ])
  })
})

describe('each student’s Contracts folder', () => {
  const mia = studentFolderId('mia')
  const miaContracts = contractsFolderId('mia')
  const idx = (options = { contractsFolders: true }) =>
    buildDriveIndex(
      [
        folder(mia, null, { studentId: 'mia', access: 'staff' }),
        folder(miaContracts, mia, { name: 'Contracts', access: 'admins' }),
        // A folder the office made in it for paper contracts.
        folder('paper', miaContracts, { name: 'Paper', access: 'admins' }),
        folder('old', mia, { name: 'Old', access: 'staff' }),
        folder('office', null, { name: 'Office', access: 'staff' }),
        folder('pay', 'office', { name: 'Payroll', access: 'admins' }),
      ],
      [
        file('signed', miaContracts, { access: 'admins' }),
        file('result', mia, { studentId: 'mia', evaluationId: 'e1', access: 'staff' }),
        file('card', 'old', { studentId: 'mia', evaluationId: 'e2', access: 'staff' }),
        file('memo', 'office', { access: 'staff' }),
      ],
      students,
      options,
    )

  it('knows its student by its ID, and the one from before as a Contracts folder too', () => {
    expect(miaContracts).toBe('contracts-mia')
    expect(contractsFolderStudent(miaContracts)).toBe('mia')
    expect(contractsFolderStudent(OLD_CONTRACTS_FOLDER_ID)).toBeNull()
    expect(contractsFolderStudent('contracts-')).toBeNull()
    expect(contractsFolderStudent(mia)).toBeNull()
    expect(contractsFolderStudent(null)).toBeNull()
    expect(isContractsFolder(miaContracts)).toBe(true)
    expect(isContractsFolder(OLD_CONTRACTS_FOLDER_ID)).toBe(true)
    expect(isContractsFolder(mia)).toBe(false)
    expect(isContractsFolder('office')).toBe(false)
    expect(isFixedFolder({ id: miaContracts, studentId: null })).toBe(true)
  })

  it('sits in the student’s folder, owners’ and admins’ only, and what’s in it is no student’s file', () => {
    const i = idx()
    expect(i.folderOf(miaContracts)?.parentId).toBe(mia)
    expect(i.pathOf('paper').map((c) => c.name)).toEqual(['Mia Larkin', 'Contracts', 'Paper'])
    expect(i.accessIn(miaContracts)).toBe('admins')
    expect(i.studentOf(mia)).toBe('mia')
    expect(i.studentOf('old')).toBe('mia')
    // What's filed in it gets no student: a coach's list of a student's files never finds it.
    expect(i.studentOf(miaContracts)).toBeNull()
    expect(i.studentOf('paper')).toBeNull()
    expect(i.countsOf(mia)).toEqual({ folders: 3, files: 3, bytes: 3000 })
  })

  it('stays in the student’s folder, for owners and admins', () => {
    expect(idx().canMoveInto([miaContracts], 'office')).toBe(false)
    expect(moveRefusal(idx(), [miaContracts], [], null)).toBe('A student’s Contracts folder stays in their folder.')
    expect(moveRefusal(idx(), [miaContracts], [], studentFolderId('leo'))).toBe('A student’s Contracts folder stays in their folder.')
    expect(() => planMove(idx(), [miaContracts], [], 'office')).toThrow()
    expect(accessRefusal(idx(), miaContracts, 'staff')).toBe('The Contracts folder is for owners and admins only.')
    expect(accessRefusal(idx(), miaContracts, 'admins')).toBeNull()
    expect(accessRefusal(idx(), 'paper', 'staff')).toBe('It’s inside “Contracts”, which only owners and admins see.')
    // A student's folder is still everyone's on staff, with the rest of what's in it.
    expect(accessRefusal(idx(), mia, 'admins')).toBe('A student’s folder is for everyone on staff, and so is everything in it.')
    expect(accessRefusal(idx(), 'old', 'admins')).toBe('A student’s folder is for everyone on staff, and so is everything in it.')
  })

  it('makes what goes in owners’ and admins’ and no student’s, and what comes out the student’s again', () => {
    // A result moved in stops being a score's file, so neither family sees it.
    expect(planMove(idx(), [], ['result'], miaContracts)).toMatchObject({
      student: null,
      files: [{ id: 'result', patch: { folderId: miaContracts, studentId: null, evaluationId: null, access: 'admins' } }],
      access: 'admins',
    })
    expect(moveAccessNote(idx(), [], ['result'], miaContracts)).toBe('Only owners and admins will see it there.')
    // A folder only owners and admins see may go in (it's theirs there too), though not in the student's folder itself.
    expect(moveRefusal(idx(), ['pay'], [], miaContracts)).toBeNull()
    expect(moveRefusal(idx(), ['pay'], [], mia)).not.toBeNull()
    expect(moveRefusal(idx(), ['old'], [], miaContracts)).toBeNull()
    expect(planMove(idx(), ['old'], [], miaContracts)).toMatchObject({
      folders: [{ id: 'old', patch: { parentId: miaContracts, access: 'admins' } }],
      files: [{ id: 'card', patch: { studentId: null, evaluationId: null, access: 'admins' } }],
    })
    // Out into the student's folder: the student's, and everyone's on staff.
    expect(planMove(idx(), [], ['signed'], mia).files).toEqual([{ id: 'signed', patch: { folderId: mia, studentId: 'mia', access: 'staff' } }])
    expect(moveAccessNote(idx(), [], ['signed'], mia)).toBe('Everyone on staff, coaches too, will see it there.')
    expect(planMove(idx(), ['paper'], [], mia).folders).toEqual([{ id: 'paper', patch: { parentId: mia, access: 'staff' } }])
  })

  it('is in every student’s folder for owners and admins, a stand-in until something is filed in it', () => {
    const leo = contractsFolderId('leo')
    const i = idx()
    expect(i.folderOf(leo)).toMatchObject({ name: 'Contracts', parentId: studentFolderId('leo'), studentId: null, access: 'admins', virtual: true })
    expect(i.folderOf(miaContracts)?.virtual).toBeUndefined()
    expect(i.foldersIn(studentFolderId('leo')).map((f) => f.id)).toEqual([leo])
    expect(i.nameTaken(studentFolderId('leo'), ' contracts')).toBe(true)
    // Not for a finished student with nothing filed (no folder), and not in coaches' Drive (nor the phone's).
    expect(i.folderOf(contractsFolderId('old'))).toBeNull()
    expect(idx({ contractsFolders: false }).folderOf(leo)).toBeNull()
    expect(idx({ contractsFolders: false }).folderOf(miaContracts)?.name).toBe('Contracts')
  })

  it('keeps a finished student’s folder while their Contracts folder is there', () => {
    const i = buildDriveIndex([folder(contractsFolderId('old'), studentFolderId('old'), { name: 'Contracts', access: 'admins' })], [], students)
    expect(i.foldersIn(null).map((f) => f.name)).toEqual(['Ava Old', 'Leo Grant', 'Mia Larkin'])
    expect(i.pathOf(contractsFolderId('old')).map((c) => c.name)).toEqual(['Ava Old', 'Contracts'])
  })

  it('says in the Trash where a contract was', () => {
    const entries = trashEntries([folder(mia, null, { studentId: 'mia' }), folder(miaContracts, mia, { name: 'Contracts', access: 'admins' })], [file('signed', miaContracts, { access: 'admins', trashed: true })], students)
    expect(entries.map((e) => [e.id, e.from, e.access])).toEqual([['signed', 'Mia Larkin / Contracts', 'admins']])
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
