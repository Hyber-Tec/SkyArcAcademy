import { describe, expect, it } from 'vitest'
import { studentNamedIn, studentsNamedIn } from './suggest'

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

  it('knows a student by their other names: a nickname, or a full name they’re printed under', () => {
    const more = [...students, { id: 'e', name: 'Jiwoo Han', otherNames: ['Jay', 'Ji Woo Han'] }, { id: 'f', name: 'Jay Brooks' }]
    expect(studentNamedIn('Jiwoo 20 shot', more)).toBe('e')
    // "Jay" is two students' first name: the last name settles it.
    expect(studentNamedIn('Jay 20 shot', more)).toBeNull()
    expect(studentNamedIn('Jay Han standing', more)).toBe('e')
    expect(studentNamedIn('Jay Brooks standing', more)).toBe('f')
    expect(studentNamedIn('Name: Ji Woo Han', more)).toBe('e')
  })

  it('leaves out finished students, and finds nothing in a text without a name', () => {
    expect(studentNamedIn('Casey prone', students)).toBeNull()
    expect(studentNamedIn('', students)).toBeNull()
  })
})

describe('whose a text could mean', () => {
  const more = [...students, { id: 'h1', name: 'Jiwoo Hwang' }, { id: 'h2', name: 'Minjun Hwang' }, { id: 'h3', name: 'Dana Hwang', finished: true }]

  it('names the student when the text settles it', () => {
    expect(studentsNamedIn('Avery 20 shot prone', more)).toEqual({ id: 'a', candidates: [] })
  })

  it('offers the students it could mean when it doesn’t, best first', () => {
    expect(studentsNamedIn('Hwang', more)).toEqual({ id: null, candidates: ['h1', 'h2'] })
    expect(studentsNamedIn('Blake 20 shot standing', more)).toEqual({ id: null, candidates: ['c', 'b'] })
  })

  it('offers no one for a text without a name in it', () => {
    expect(studentsNamedIn('IMG_4821', more)).toEqual({ id: null, candidates: [] })
    expect(studentsNamedIn('', more)).toEqual({ id: null, candidates: [] })
  })

  it('takes a file’s name by its first names only: its other words are rarely names', () => {
    const lane = [...more, { id: 'l', name: 'Henry Lane' }]
    expect(studentsNamedIn('SIUS lane 4', lane, { printed: false })).toEqual({ id: null, candidates: [] })
    expect(studentsNamedIn('Blake 20 shot standing', lane, { printed: false })).toEqual({ id: null, candidates: ['c', 'b'] })
    // Printed on a report, a last name alone is a name.
    expect(studentsNamedIn('Lane', lane)).toEqual({ id: null, candidates: ['l'] })
  })
})
