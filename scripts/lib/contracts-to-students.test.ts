import { describe, expect, it } from 'vitest'
import { planContractsMove } from './contracts-to-students'

const folder = (id: string, data: Record<string, unknown>) => ({ path: `branches/a/driveFolders/${id}`, id, data: { name: id, parentId: null, studentId: null, ...data } })
const file = (id: string, data: Record<string, unknown>) => ({ path: `branches/a/driveFiles/${id}`, id, data: { name: `${id}.pdf`, folderId: null, studentId: null, ...data } })
const link = (id: string, data: Record<string, unknown>) => ({ path: `branches/a/contractLinks/${id}`, id, data: { status: 'signed', ...data } })
const student = (id: string, name: string) => ({ path: `branches/a/students/${id}`, id, data: { name } })
const by = { uid: 'contracts-to-students', email: '', name: 'Contract signing' }
const at = new Date(Date.UTC(2026, 9, 29, 12))

describe('moving the signed contracts into each student’s Contracts folder', () => {
  const plan = () =>
    planContractsMove({
      folders: [
        folder('contracts', { name: 'Contracts', access: 'admins' }),
        folder('student-s1', { studentId: 's1', access: 'staff' }),
        folder('student-s2', { studentId: 's2', access: 'staff' }),
        folder('contracts-s2', { name: 'Contracts', parentId: 'student-s2', access: 'admins' }),
      ],
      files: [
        file('f1', { name: 'Mia Larkin enrollment contract 2026-10-20.pdf', folderId: 'contracts', access: 'admins' }),
        file('f2', { name: 'Mia Larkin enrollment contract 2026-10-27.pdf', folderId: 'contracts', access: 'admins', trashed: true }),
        file('f3', { name: 'Leo Grant enrollment contract 2026-10-21.pdf', folderId: 'contracts', access: 'admins' }),
        file('f4', { name: 'Ava Stone enrollment contract 2026-10-22.pdf', folderId: 'contracts', access: 'admins' }),
        // Already in a student's folder: not the old folder's.
        file('f5', { folderId: 'contracts-s2', access: 'admins' }),
        file('result', { folderId: 'student-s1', studentId: 's1', access: 'staff' }),
      ],
      links: [
        link('l1', { studentId: 's1', studentName: 'Mia Larkin', fileId: 'f1' }),
        link('l2', { studentId: 's1', studentName: 'Mia Larkin', fileId: 'f2' }),
        link('l3', { studentId: 's2', studentName: 'Leo Grant', fileId: 'f3' }),
        // A student no longer in the list: the name on the link.
        link('l4', { studentId: 's3', studentName: 'Ava Stone', fileId: 'f4' }),
        link('l5', { studentId: 's1', studentName: 'Mia Larkin', status: 'sent', fileId: null }),
      ],
      students: [student('s1', 'Mia Larkin-Cho'), student('s2', 'Leo Grant')],
      by,
      at,
    })

  it('finds each file’s student by its signing link, the Trash included', () => {
    const p = plan()
    expect(p.oldFolder).toBe(true)
    expect(p.students.map((s) => [s.studentId, s.studentName, s.files.map((f) => f.id)])).toEqual([
      ['s3', 'Ava Stone', ['f4']],
      ['s2', 'Leo Grant', ['f3']],
      ['s1', 'Mia Larkin-Cho', ['f1', 'f2']],
    ])
    expect(p.unmatched).toEqual([])
    expect(p.emptied).toBe(true)
  })

  it('makes the folders that aren’t there yet: the student’s, and their Contracts folder', () => {
    const made = Object.fromEntries(plan().students.map((s) => [s.studentId, s.folders.map((f) => f.id)]))
    expect(made).toEqual({ s1: ['contracts-s1'], s2: [], s3: ['student-s3', 'contracts-s3'] })
    const s3 = plan().students.find((s) => s.studentId === 's3')!
    expect(s3.folders.map((f) => f.data)).toEqual([
      { name: 'Ava Stone', parentId: null, studentId: 's3', access: 'staff', createdAt: at, createdBy: by, updatedAt: at, updatedBy: by },
      { name: 'Contracts', parentId: 'student-s3', studentId: null, access: 'admins', createdAt: at, createdBy: by, updatedAt: at, updatedBy: by },
    ])
  })

  it('leaves what no link names, and folders made in it, and then keeps the old folder', () => {
    const p = planContractsMove({
      folders: [folder('contracts', { access: 'admins' }), folder('paper', { name: 'Paper ones', parentId: 'contracts', access: 'admins' })],
      files: [file('scan', { name: 'Scanned contract.pdf', folderId: 'contracts', access: 'admins' }), file('f1', { folderId: 'contracts', access: 'admins' })],
      links: [link('l1', { studentId: 's1', studentName: 'Mia Larkin', fileId: 'f1' })],
      students: [],
      by,
      at,
    })
    expect(p.students.map((s) => s.files.map((f) => f.id))).toEqual([['f1']])
    expect(p.unmatched).toEqual([{ id: 'scan', name: 'Scanned contract.pdf' }])
    expect(p.folders).toEqual([{ id: 'paper', name: 'Paper ones' }])
    expect(p.emptied).toBe(false)
  })

  it('has nothing to do once the old folder is gone', () => {
    const p = planContractsMove({ folders: [folder('student-s1', { studentId: 's1' })], files: [file('result', { folderId: 'student-s1', studentId: 's1' })], links: [], students: [], by, at })
    expect(p).toEqual({ oldFolder: false, students: [], unmatched: [], folders: [], emptied: true })
  })
})
