import { describe, expect, it } from 'vitest'
import { familyNote, familyStatusLabel } from './family'

describe('a class as families read it', () => {
  it('words the status plainly', () => {
    expect(familyStatusLabel('pending', false)).toBe('Scheduled')
    expect(familyStatusLabel('confirmed', false)).toBe('Confirmed')
    expect(familyStatusLabel('present', true)).toBe('Attended')
    expect(familyStatusLabel('no_show', true)).toBe('Missed')
    expect(familyStatusLabel('canceled', false)).toBe('Canceled')
  })

  it('says when a class that has ended has no mark yet', () => {
    expect(familyStatusLabel('pending', true)).toBe('Not marked yet')
    expect(familyStatusLabel('confirmed', true)).toBe('Not marked yet')
    expect(familyStatusLabel('canceled', true)).toBe('Canceled')
  })

  it('spells out the makeup shorthand and leaves other notes as typed', () => {
    expect(familyNote('MU for 10/12')).toBe('Makeup for 10/12')
    expect(familyNote('  MU for 9/3 ')).toBe('Makeup for 9/3')
    expect(familyNote('Makeup for Oct 12')).toBe('Makeup for Oct 12')
    expect(familyNote('MUST bring ear protection')).toBe('MUST bring ear protection')
    expect(familyNote('Trial 1')).toBe('Trial 1')
    expect(familyNote('')).toBe('')
    expect(familyNote(null)).toBe('')
  })
})
