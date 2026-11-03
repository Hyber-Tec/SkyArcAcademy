import { describe, expect, it } from 'vitest'
import { requestedStudents, typedNames } from './requests'

describe('typedNames', () => {
  it('reads one name or several, however they are separated', () => {
    expect(typedNames('Ava Monroe')).toEqual(['Ava Monroe'])
    expect(typedNames('Ava Monroe, Leo Monroe')).toEqual(['Ava Monroe', 'Leo Monroe'])
    expect(typedNames('Ava Monroe\nLeo Monroe')).toEqual(['Ava Monroe', 'Leo Monroe'])
    expect(typedNames('Ava & Leo Monroe')).toEqual(['Ava Monroe', 'Leo Monroe'])
  })

  it('gives a first name alone the family name the others have', () => {
    expect(typedNames('Ava and Leo Monroe')).toEqual(['Ava Monroe', 'Leo Monroe'])
    expect(typedNames('Andrew')).toEqual(['Andrew'])
    expect(typedNames(' , ')).toEqual([])
  })
})

describe('requestedStudents', () => {
  const students = [
    { id: 'ava', name: 'Ava Monroe' },
    { id: 'leo', name: 'Leo Monroe' },
    { id: 'jiwoo', name: 'Jiwoo Han', otherNames: ['Jay Han'] },
    { id: 'ava2', name: 'Ava Stone' },
    { id: 'gone', name: 'Leo Gone', finished: true },
  ]

  it('finds each child typed, by their name or another name', () => {
    expect(requestedStudents('Ava and Leo Monroe', students)).toEqual(['ava', 'leo'])
    expect(requestedStudents('Jay Han', students)).toEqual(['jiwoo'])
  })

  it('offers the students a name could mean when it names nobody alone', () => {
    expect(requestedStudents('Ava', students).sort()).toEqual(['ava', 'ava2'])
  })

  it('never offers students who left', () => {
    expect(requestedStudents('Leo Gone', students)).not.toContain('gone')
  })
})
