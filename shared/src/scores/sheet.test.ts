import { describe, expect, it } from 'vitest'
import { readSheetText, sheetDate } from './sheet'

// Made-up sheets, written as a text reader returns them: a cell per line, or a label and its score on one line.
const K = ['9.5', '10.3*', '8.7', '9.9', '10.4*', '7.8', '9.1', '8.2', '10.0', '9.6']
const P = ['10.5*', '10.2*', '9.8', '10.1', '9.9', '10.6*', '9.7', '10.0', '9.5', '9.9']
const S = ['8.1', '9.4', '7.7', '10.3*', '8.8', '9.0', '6.9', '8.5', '9.2', '9.6']

const threePosition = [
  'Rowan, Avery',
  'Qualification : 267 - 6',
  'Lakeside Fall 3P | Sat, 12 Sep 2026',
  'Course of Fire: 3x10 Air Rifle',
  'Status: FUTURE | Printed at 12 Sep 2026 10:53',
  '#',
  'Score',
  ...K.flatMap((v, i) => [`K${i + 1}`, v]),
  'Total',
  '89 - 2',
  ...P.map((v, i) => `P${i + 1} ${v}`),
  'Total 95 - 3',
  ...S.flatMap((v, i) => [`S${i + 1}`, v]),
  'Area: 41.02mm² Round: 2.05',
  'Total',
  '83 - 1',
].join('\n')

describe('reading a results sheet', () => {
  it('reads the shooter, the match, the date, the course and the qualification', () => {
    const r = readSheetText(threePosition)
    expect(r).toMatchObject({ name: 'Avery Rowan', match: 'Lakeside Fall 3P', dateKey: '2026-09-12', course: '3x10 Air Rifle', total: 267, innerTens: 6, decimal: false })
  })

  it('groups the shots by position, with their totals and inner tens, and checks them against the qualification', () => {
    const r = readSheetText(threePosition)
    expect(r.positions.map((p) => [p.position, p.shots.length, p.wholeTotal, p.innerTens])).toEqual([
      ['kneeling', 10, 89, 2],
      ['prone', 10, 95, 3],
      ['standing', 10, 83, 1],
    ])
    expect(r.consistent).toBe(true)
  })

  it('reads a decimal match in one position', () => {
    const shots = ['9.8', '10.1', '9.6', '10.4', '9.9', '10.2', '9.7', '9.4', '10.0', '9.6']
    const r = readSheetText(['Quill, Sam', 'Qualification : 98.7', 'Harbor Open 10 Shot | Sun, 4 Oct 2026', 'Course of Fire: 10 Shots Air Rifle', ...shots.map((v, i) => `S${i + 1} ${v}`)].join('\n'))
    expect(r).toMatchObject({ total: 98.7, innerTens: null, decimal: true, consistent: true })
    expect(r.positions).toHaveLength(1)
    expect(r.positions[0]).toMatchObject({ position: 'standing', decimalTotal: 98.7 })
  })

  it('says when the shots found don’t add up, and leaves out what isn’t there', () => {
    const missing = readSheetText(threePosition.replace('K5\n10.4*', 'K5\n'))
    expect(missing.consistent).toBe(false)
    const bare = readSheetText('A photo with nothing on it')
    expect(bare).toMatchObject({ name: '', match: '', dateKey: null, total: null, positions: [], consistent: false })
  })

  it('knows how many shots a position has from the course of fire', () => {
    expect(readSheetText(threePosition).perPosition).toBe(10)
    expect(readSheetText('Course of Fire: 60 Shots Air Rifle').perPosition).toBe(60)
    expect(readSheetText('Course of Fire: Air Rifle').perPosition).toBeNull()
  })

  it('pairs scores with their labels when two columns come out interleaved', () => {
    const r = readSheetText(['Qualification : 19 - 0', 'K1', 'K11', '9.6', '9.9', 'Total'].join('\n'))
    expect(r.positions[0]).toMatchObject({ position: 'kneeling', shots: [9.6, 9.9], wholeTotal: 18 })
  })

  it('reads dates in the usual forms', () => {
    expect(sheetDate('Sat, 22 Aug 2026')).toBe('2026-08-22')
    expect(sheetDate('Oct 18, 2026')).toBe('2026-10-18')
    expect(sheetDate('10/18/2026 4:02:27 PM')).toBe('2026-10-18')
  })
})
