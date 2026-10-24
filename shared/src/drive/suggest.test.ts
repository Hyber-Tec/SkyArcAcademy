import { describe, expect, it } from 'vitest'
import { studentNamedIn } from './suggest'

const students = [
  { id: 'a', name: 'Avery Stone' },
  { id: 'b', name: 'Blake Rivers' },
  { id: 'c', name: 'Blake Morgan' },
  { id: 'd', name: 'Casey Fields', finished: true },
]

describe('the student a text names', () => {
  it('finds a first name in a file name', () => {
    expect(studentNamedIn('Avery 20 shot prone', students)).toBe('a')
  })

  it('needs the last name too when two students share the first', () => {
    expect(studentNamedIn('Blake 20 shot standing', students)).toBeNull()
    expect(studentNamedIn('Blake Morgan - kneeling', students)).toBe('c')
  })

  it('reads a name printed on a report, whatever is around it', () => {
    expect(studentNamedIn('Name: Blake Rivers Lane 4', students)).toBe('b')
  })

  it('leaves out finished students, and finds nothing in a text without a name', () => {
    expect(studentNamedIn('Casey prone', students)).toBeNull()
    expect(studentNamedIn('', students)).toBeNull()
  })
})
