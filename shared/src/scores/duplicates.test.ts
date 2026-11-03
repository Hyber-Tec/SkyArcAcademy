import { describe, expect, it } from 'vitest'
import { type ResultPrint, printOf, repeatOf, resultWords, sameResult } from './duplicates'

const card: ResultPrint = { studentId: 'a', dateKey: '2026-11-02', position: 'prone', shots: 10, total: 85, values: [9, 8, 10, 8, 9, 7, 9, 8, 9, 8] }

describe('a result already saved', () => {
  it('knows a SIUS report by its printed time and total, whatever position it was filed under', () => {
    const sius = { studentId: 'a', dateKey: '2026-11-02', position: 'prone', shots: 20, total: 187.1, printed: '11/02/2026 16:41:07' }
    expect(sameResult(sius, { ...sius, position: 'standing' })).toBe(true)
    expect(sameResult(sius, { ...sius, printed: '11/02/2026 17:02:44' })).toBe(false)
    expect(sameResult(sius, { ...sius, studentId: 'b' })).toBe(false)
  })

  it('knows a card or a sheet by the student, day, position, shots and total, and its shots when both have them', () => {
    expect(sameResult(card, { ...card })).toBe(true)
    expect(sameResult(card, { ...card, values: null })).toBe(true)
    expect(sameResult(card, { ...card, values: [8, 9, 10, 8, 9, 7, 9, 8, 9, 8] })).toBe(false)
    expect(sameResult(card, { ...card, total: 86 })).toBe(false)
    expect(sameResult(card, { ...card, dateKey: '2026-11-03' })).toBe(false)
    expect(sameResult(card, { ...card, position: 'standing' })).toBe(false)
  })

  it('finds the saved result a new one repeats, and names it', () => {
    const saved = [
      { id: 'x', ...card, total: 80 },
      { id: 'y', ...card },
    ]
    expect(repeatOf(card, saved)?.id).toBe('y')
    expect(repeatOf({ ...card, total: 90 }, saved)).toBeNull()
    expect(resultWords({ position: 'prone', source: 'paper', dateKey: '2026-11-02', total: 85 })).toBe('the prone paper card of Nov 2 (85)')
    expect(resultWords({ position: 'standing', source: 'sius', dateKey: '2026-11-02', total: 187.1 })).toBe('the standing SIUS result of Nov 2 (187.1)')
  })

  it('reads a saved result’s shots from its series', () => {
    const p = printOf({ studentId: 'a', dateKey: '2026-11-02', position: 'prone', shots: 2, total: 19, sius: null, series: [{ n: 1, total: 19, shots: [{ v: 9, a: null }, { v: 10, a: null }], mpi: null, groupMm: null }] })
    expect(p).toMatchObject({ printed: null, values: [9, 10] })
  })
})
