import { describe, expect, it } from 'vitest'
import type { StudentStatus } from '../types'
import { contractGate, firstNames } from './gate'

const s = (id: string, name: string, status: StudentStatus = 'enrolled') => ({ id, name, status })

describe('contractGate', () => {
  const kids = [s('leo', 'Leo Monroe'), s('ava', 'Ava Monroe')]

  it('opens the app until the office sends a contract', () => {
    expect(contractGate({ role: 'parent', students: kids, waiting: new Set() })).toEqual({ open: true, toSign: [] })
  })

  it('asks a parent to sign each contract the office sent, A to Z', () => {
    expect(contractGate({ role: 'parent', students: kids, waiting: new Set(['leo', 'ava']) }).toSign.map((k) => k.id)).toEqual(['ava', 'leo'])
    expect(contractGate({ role: 'parent', students: kids, waiting: new Set(['leo']) })).toEqual({ open: false, toSign: [kids[0]] })
  })

  it('makes a student wait for their own', () => {
    expect(contractGate({ role: 'student', students: [kids[0]], waiting: new Set(['leo']) }).open).toBe(false)
    expect(contractGate({ role: 'student', students: [kids[0]], waiting: new Set() }).open).toBe(true)
  })

  it('never stops the staff, nor for students who left', () => {
    expect(contractGate({ role: 'coach', students: kids, waiting: new Set(['ava']) }).open).toBe(true)
    expect(contractGate({ role: 'parent', students: [s('old', 'Old One', 'finished')], waiting: new Set(['old']) }).open).toBe(true)
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
