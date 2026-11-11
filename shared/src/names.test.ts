import { describe, expect, it } from 'vitest'
import { familyNameOf, nameFormsOf, namesOf, otherNamesText, searchFindsName, searchFindsStudent } from './names'

// Made-up students: a given name she's printed under ("Lianhua"), and a two-word legal name.
const rowan = { name: 'Ivy Rowan', lastName: 'Rowan', otherNames: ['Lianhua'] }
const stone = { name: 'Avery Stone', otherNames: ['Seo-yeon Stone', 'Ave'] }

describe('a student’s names', () => {
  it('are their name, then each other name, a one-word one with their family name too', () => {
    expect(namesOf(rowan)).toEqual(['Ivy Rowan', 'Lianhua', 'Lianhua Rowan'])
    expect(namesOf(stone)).toEqual(['Avery Stone', 'Seo-yeon Stone', 'Ave', 'Ave Stone'])
    expect(namesOf({ name: 'Mia Larkin' })).toEqual(['Mia Larkin'])
  })

  it('take the family name from the record, else the name’s last word, and never repeat one', () => {
    expect(familyNameOf({ name: 'Mary Ann de la Cruz', lastName: 'de la Cruz' })).toBe('de la Cruz')
    expect(familyNameOf({ name: 'Mia Larkin' })).toBe('Larkin')
    expect(familyNameOf({ name: 'Mia' })).toBe('')
    expect(namesOf({ name: 'Mia', otherNames: ['Mimi'] })).toEqual(['Mia', 'Mimi'])
    expect(namesOf({ name: 'Ivy Rowan', otherNames: ['ivy rowan', ' Rowan ', 'Lianhua  Rowan', 'Lianhua'] })).toEqual(['Ivy Rowan', 'Rowan', 'Lianhua Rowan', 'Lianhua'])
  })

  it('match a printed name family name first too', () => {
    expect(nameFormsOf(rowan)).toEqual(['Ivy Rowan', 'Rowan Ivy', 'Lianhua', 'Lianhua Rowan', 'Rowan Lianhua'])
    expect(nameFormsOf({ name: 'Mary Ann de la Cruz', lastName: 'de la Cruz' })).toEqual(['Mary Ann de la Cruz', 'de la Cruz Mary Ann'])
  })
})

describe('a search', () => {
  it('finds a name by any part of it, or by the starts of its words in any order', () => {
    expect(searchFindsName('Avery Stone', 'ery st')).toBe(true)
    expect(searchFindsName('Avery Stone', 'stone avery')).toBe(true)
    expect(searchFindsName('Avery Stone', 'st av')).toBe(true)
    expect(searchFindsName('José Ortiz', 'jose')).toBe(true)
    expect(searchFindsName('Avery Stone', 'stone jordan')).toBe(false)
  })

  it('finds a student by another name, with their family name too, and says which', () => {
    expect(searchFindsStudent(rowan, '')).toEqual({ found: true, also: null })
    expect(searchFindsStudent(rowan, 'rowan')).toEqual({ found: true, also: null })
    expect(searchFindsStudent(rowan, 'lianhua')).toEqual({ found: true, also: 'Lianhua' })
    expect(searchFindsStudent(rowan, 'Lianhua Rowan')).toEqual({ found: true, also: 'Lianhua Rowan' })
    expect(searchFindsStudent(rowan, 'rowan lianhua')).toEqual({ found: true, also: 'Lianhua Rowan' })
    expect(searchFindsStudent(rowan, 'jordan')).toEqual({ found: false, also: null })
  })

  it('gives a picker the other names to search', () => {
    expect(otherNamesText(rowan)).toBe('Lianhua Lianhua Rowan')
    expect(otherNamesText({ name: 'Mia Larkin' })).toBe('')
  })
})
