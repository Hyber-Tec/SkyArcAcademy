import { describe, expect, it } from 'vitest'
import type { StudentStatus } from '../types'
import { type StudentOnFile, isHiddenEmail, onFile } from './onFile'

const parent = (name: string, email: string) => ({ name, email, phone: '', relation: 'Mother' })
const student = (id: string, name: string, parents: { name: string; email: string; phone: string; relation: string }[], email = '', status: StudentStatus = 'enrolled'): StudentOnFile => ({
  id,
  name,
  status,
  profile: { email, parents },
})

describe('onFile', () => {
  const students = [
    student('leo', 'Leo Monroe', [parent('Eunji Monroe', 'Eunji@Example.com'), parent('Sam Monroe', 'sam@example.com')]),
    student('ava', 'Ava Monroe', [parent('', 'eunji@example.com')]),
    student('kai', 'Kai Park', [parent('Mina Park', 'mina@example.com')], 'kai@example.com'),
    student('old', 'Old Student', [parent('Gone Parent', 'gone@example.com')], '', 'finished'),
  ]

  it('links a parent to every child whose record lists the email, whatever its case', () => {
    expect(onFile(' EUNJI@example.com ', students)).toEqual({ role: 'parent', studentIds: ['ava', 'leo'], name: 'Eunji Monroe' })
    expect(onFile('sam@example.com', students)).toEqual({ role: 'parent', studentIds: ['leo'], name: 'Sam Monroe' })
  })

  it('links a student by their own email', () => {
    expect(onFile('kai@example.com', students)).toEqual({ role: 'student', studentIds: ['kai'], name: 'Kai Park' })
  })

  it('makes a parent of an address given as a parent’s and as a child’s own', () => {
    const shared = [student('a', 'Ann Lee', [parent('June Lee', 'lee@example.com')]), student('b', 'Bo Lee', [], 'lee@example.com')]
    expect(onFile('lee@example.com', shared)).toEqual({ role: 'parent', studentIds: ['a', 'b'], name: 'June Lee' })
  })

  it('makes a parent of an address several students give as their own', () => {
    const siblings = [student('a', 'Ann Lee', [], 'lee@example.com'), student('b', 'Bo Lee', [], 'lee@example.com')]
    expect(onFile('lee@example.com', siblings)).toEqual({ role: 'parent', studentIds: ['a', 'b'], name: '' })
  })

  it('leaves out students who left, and finds nobody for an address no record has', () => {
    expect(onFile('gone@example.com', students)).toBeNull()
    expect(onFile('someone@example.com', students)).toBeNull()
    expect(onFile('not an email', students)).toBeNull()
    expect(onFile('', [student('x', 'X Y', [parent('', '')])])).toBeNull()
  })

  it('keeps paused and new students', () => {
    const list = [student('p', 'Pia Paused', [parent('P', 'p@example.com')], '', 'paused'), student('n', 'Nat New', [parent('P', 'p@example.com')], '', 'signed_up')]
    expect(onFile('p@example.com', list)?.studentIds).toEqual(['n', 'p'])
  })
})

describe('isHiddenEmail', () => {
  it('knows Apple’s relay addresses', () => {
    expect(isHiddenEmail('abc123@privaterelay.appleid.com')).toBe(true)
    expect(isHiddenEmail('someone@icloud.com')).toBe(false)
    expect(isHiddenEmail(null)).toBe(false)
  })
})
