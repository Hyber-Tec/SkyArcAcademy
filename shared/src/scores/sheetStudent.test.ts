import { describe, expect, it } from 'vitest'
import type { DriveStudent } from '../drive/model'
import { nameIn, sheetStudent } from './sheetStudent'

// Made-up students: one goes by an English name, her legal name among her other names.
const students: DriveStudent[] = [
  { id: 'avery', name: 'Avery Rowan' },
  { id: 'chloe', name: 'Chloe Park', otherNames: ['Seo-yeon Park'] },
  { id: 'jun', name: 'Jun Park' },
  { id: 'sam', name: 'Sam Quill' },
  { id: 'sam2', name: 'Sam Ortiz' },
  { id: 'old', name: 'Mina Lee', finished: true },
  { id: 'ivy', name: 'Ivy Rowan', otherNames: ['Lianhua'] },
]

describe('whose a results sheet is', () => {
  it('finds the student by the printed name, in any order', () => {
    expect(sheetStudent({ name: 'Avery Rowan' }, students)).toEqual({ id: 'avery', candidates: [] })
    expect(sheetStudent({ name: 'ROWAN AVERY' }, students).id).toBe('avery')
  })

  it('finds a student by another name of theirs, written together or apart', () => {
    expect(sheetStudent({ name: 'Seoyeon Park' }, students).id).toBe('chloe')
    expect(sheetStudent({ name: 'Seo-Yeon Park' }, students).id).toBe('chloe')
    expect(sheetStudent({ name: 'Chloe Park' }, students).id).toBe('chloe')
    // A one-word other name is a given name: with the family name, it's hers.
    expect(sheetStudent({ name: 'Lianhua Rowan' }, students).id).toBe('ivy')
    expect(sheetStudent({ name: 'ROWAN, LIANHUA' }, students).id).toBe('ivy')
  })

  it('never picks on a first name alone, and offers whoever shares a word of it', () => {
    const r = sheetStudent({ name: 'Sam Lee' }, students)
    expect(r.id).toBeNull()
    expect(r.candidates.sort()).toEqual(['sam', 'sam2'])
    expect(sheetStudent({ name: 'Min Park' }, students)).toEqual({ id: null, candidates: ['chloe', 'jun'] })
  })

  it('looks in the heading when no name was read', () => {
    expect(sheetStudent({ name: '', header: 'SAM QUILL\nHarbor Club\nLakeside Fall 3P' }, students).id).toBe('sam')
    expect(sheetStudent({ name: '', header: 'Harbor Club' }, students)).toEqual({ id: null, candidates: [] })
  })

  it('leaves finished students out', () => {
    expect(sheetStudent({ name: 'Mina Lee' }, students).id).toBeNull()
  })

  it('matches a name word for word, joined words counting as one', () => {
    expect(nameIn(['seo', 'yeon', 'park'], new Set(['park', 'seoyeon']))).toBe(true)
    expect(nameIn(['seo', 'yeon', 'park'], new Set(['park', 'seo']))).toBe(false)
  })
})
