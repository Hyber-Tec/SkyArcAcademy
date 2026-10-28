import { describe, expect, it } from 'vitest'
import { missingAccess } from './drive-access'

const folder = (id: string, data: Record<string, unknown>) => ({ path: `branches/a/driveFolders/${id}`, id, data: { name: id, parentId: null, studentId: null, ...data } })
const file = (id: string, data: Record<string, unknown>) => ({ path: `branches/a/driveFiles/${id}`, id, data: { name: id, folderId: null, studentId: null, ...data } })

describe('marking who sees what was in the Drive before', () => {
  it('gives what has no access its folder’s, and leaves what says it alone', () => {
    const marks = missingAccess(
      [
        folder('student-s1', { studentId: 's1' }),
        folder('old', { parentId: 'student-s1' }),
        folder('plans', {}),
        folder('office', { access: 'admins' }),
        // Made inside a folder of the admins' by the phone app, before it wrote access.
        folder('inner', { parentId: 'office' }),
        folder('marked', { access: 'staff' }),
        // A loop of parents doesn't hang it.
        folder('p', { parentId: 'q' }),
        folder('q', { parentId: 'p' }),
      ],
      [
        file('result', { folderId: 'student-s1', studentId: 's1' }),
        file('top', {}),
        file('memo', { folderId: 'plans' }),
        file('secret', { folderId: 'inner' }),
        file('gone', { folderId: 'missing' }),
        file('done', { folderId: 'office', access: 'admins' }),
      ],
    )
    expect(Object.fromEntries(marks.map((m) => [m.path.split('/').pop(), m.access]))).toEqual({
      'student-s1': 'staff',
      old: 'staff',
      plans: 'staff',
      inner: 'admins',
      p: 'staff',
      q: 'staff',
      result: 'staff',
      top: 'staff',
      memo: 'staff',
      secret: 'admins',
      gone: 'staff',
    })
  })

  it('has nothing to do the second time', () => {
    expect(missingAccess([folder('a', { access: 'staff' })], [file('b', { access: 'admins' })])).toEqual([])
  })
})
