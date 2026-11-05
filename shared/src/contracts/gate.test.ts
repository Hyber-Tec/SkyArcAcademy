import { describe, expect, it } from 'vitest'
import type { StudentStatus } from '../types'
import { contractGate, firstNames } from './gate'

const s = (id: string, name: string, status: StudentStatus = 'enrolled') => ({ id, name, status })

describe('contractGate', () => {
  const kids = [s('leo', 'Leo Monroe'), s('ava', 'Ava Monroe')]

  it('opens the app when the academy has no contract yet', () => {
    expect(contractGate({ role: 'parent', hasContract: false, students: kids, signed: new Set() })).toEqual({ open: true, toSign: [] })
  })

  it('asks a parent to sign for each child without a signed contract, A to Z', () => {
    expect(contractGate({ role: 'parent', hasContract: true, students: kids, signed: new Set() }).toSign.map((k) => k.id)).toEqual(['ava', 'leo'])
    expect(contractGate({ role: 'parent', hasContract: true, students: kids, signed: new Set(['ava']) })).toEqual({ open: false, toSign: [kids[0]] })
    expect(contractGate({ role: 'parent', hasContract: true, students: kids, signed: new Set(['ava', 'leo']) }).open).toBe(true)
  })

  it('makes a student wait for their own', () => {
    expect(contractGate({ role: 'student', hasContract: true, students: [kids[0]], signed: new Set() }).open).toBe(false)
  })

  it('never stops the staff, nor for students who left', () => {
    expect(contractGate({ role: 'coach', hasContract: true, students: kids, signed: new Set() }).open).toBe(true)
    expect(contractGate({ role: 'parent', hasContract: true, students: [s('old', 'Old One', 'finished')], signed: new Set() }).open).toBe(true)
  })
})

describe('firstNames', () => {
  it('names one child, two or more', () => {
    expect(firstNames(['Ava Monroe'])).toBe('Ava')
    expect(firstNames(['Ava Monroe', 'Leo Monroe'])).toBe('Ava and Leo')
    expect(firstNames(['Ava Monroe', 'Leo Monroe', 'Mia Monroe'])).toBe('Ava, Leo and Mia')
    expect(firstNames([])).toBe('')
  })
})
