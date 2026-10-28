import { describe, expect, it } from 'vitest'
import { NO_COACH_ROW, type TimelinePerson, classPieces, clockSpan, gridColumns, gridHeight, piecesCount, rowHeights, runsOf, timelineRange, timelineRows } from './timeline'

const t = (h: number, m = 0) => h * 60 + m
const coach = (id: string, firstMin = t(16), name = id): TimelinePerson => ({ id, teaches: true, firstMin, name })
const admin = (id: string, firstMin = t(16)): TimelinePerson => ({ id, teaches: false, firstMin, name: id })

describe('the timeline’s rows', () => {
  it('keeps who’s in first on top when every class’s coaches already sit together', () => {
    const people = [coach('hana', t(18)), coach('avery', t(15, 30)), coach('blake', t(15, 30))]
    const classes = [
      { id: 'c1', coachIds: ['avery', 'blake'] },
      { id: 'c2', coachIds: ['avery', 'blake', 'hana'] },
    ]
    expect(timelineRows(people, classes)).toEqual(['avery', 'blake', 'hana'])
  })

  it('moves rows so each class’s coaches are next to each other', () => {
    // In natural order (a, b, c, d) the class b + d would break in two.
    const people = [coach('a', t(15)), coach('b', t(15, 30)), coach('c', t(16)), coach('d', t(16, 30))]
    const classes = [
      { id: 'x', coachIds: ['a', 'c'] },
      { id: 'y', coachIds: ['b', 'd'] },
    ]
    const rows = timelineRows(people, classes)
    expect(piecesCount(rows, classes)).toBe(2)
    for (const c of classes) expect(classPieces(rows, c.coachIds)).toHaveLength(1)
  })

  it('breaks a class into pieces when no order can keep every class together', () => {
    const people = [coach('a'), coach('b'), coach('c')]
    const classes = [
      { id: 'ab', coachIds: ['a', 'b'] },
      { id: 'bc', coachIds: ['b', 'c'] },
      { id: 'ac', coachIds: ['a', 'c'] },
    ]
    const rows = timelineRows(people, classes)
    expect(piecesCount(rows, classes)).toBe(4)
    expect(classes.filter((c) => classPieces(rows, c.coachIds).length === 2)).toHaveLength(1)
  })

  it('works for any number of coaches, many included', () => {
    for (const n of [1, 2, 3, 4, 6, 9]) {
      const people = Array.from({ length: n }, (_, i) => coach(`k${i}`, t(15) + i * 10))
      const classes = [{ id: 'all', coachIds: people.map((p) => p.id) }, { id: 'first', coachIds: [people[0].id] }]
      const rows = timelineRows(people, classes)
      expect(rows).toHaveLength(n)
      expect(piecesCount(rows, classes)).toBe(2)
    }
    // Nine coaches, pairs that chain: the slower search still keeps every pair together.
    const people = Array.from({ length: 9 }, (_, i) => coach(`p${i}`, t(15) + i))
    const shuffled = [8, 3, 6, 1, 4, 7, 0, 5, 2].map((i) => `p${i}`)
    const classes = shuffled.slice(1).map((id, i) => ({ id: `c${i}`, coachIds: [shuffled[i], id] }))
    expect(piecesCount(timelineRows(people, classes), classes)).toBe(classes.length)
  })

  it('puts coaches without a class next, then the no-coach row, then people who don’t teach', () => {
    const people = [admin('manager', t(15)), coach('idle', t(15)), coach('teacher', t(16))]
    const classes = [
      { id: 'c1', coachIds: ['teacher'] },
      { id: 'c2', coachIds: [] },
    ]
    expect(timelineRows(people, classes)).toEqual(['teacher', 'idle', NO_COACH_ROW, 'manager'])
    expect(classPieces(timelineRows(people, classes), [])).toEqual([[2, 2]])
  })

  it('finds runs of adjacent rows', () => {
    expect(runsOf([3, 0, 1, 5, 4])).toEqual([
      [0, 1],
      [3, 5],
    ])
    expect(runsOf([])).toEqual([])
  })
})

describe('the rows’ heights', () => {
  it('grows the rows a block spans, in equal parts, until its students fit', () => {
    // A block over rows 0–1 needs 300 px; with 6 px above and below it has 2 × 60 − 12 = 108.
    expect(rowHeights([60, 60, 60], [{ rows: [0, 1], need: 300 }], 6)).toEqual([156, 156, 60])
  })

  it('leaves rows alone when everything fits, and takes the larger need where blocks share a row', () => {
    expect(rowHeights([80, 80], [{ rows: [0, 1], need: 100 }], 6)).toEqual([80, 80])
    const h = rowHeights([60, 60, 60], [{ rows: [0, 2], need: 400 }, { rows: [1, 1], need: 300 }], 6)
    expect(h[1]).toBeGreaterThanOrEqual(312)
    expect(h[0] + h[1] + h[2] - 12).toBeGreaterThanOrEqual(400)
  })

  it('lays student cards out across a block’s width', () => {
    expect(gridColumns(200, 188, 6)).toBe(1)
    expect(gridColumns(390, 188, 6)).toBe(2)
    expect(gridColumns(40, 188, 6)).toBe(1)
    expect(gridHeight([54, 54, 40, 40], 2, 6)).toBe(54 + 6 + 40)
    expect(gridHeight([54, 40, 54], 1, 6)).toBe(54 + 40 + 54 + 12)
    expect(gridHeight([], 2, 6)).toBe(0)
  })
})

describe('the time a day shows', () => {
  it('runs from a little before the first thing that day to a little after the last, on the half hour', () => {
    expect(timelineRange([{ startMin: t(15, 21), endMin: t(17, 10) }, { startMin: t(15, 30), endMin: t(20) }], { startMin: t(14), endMin: t(21) })).toEqual({ startMin: t(15), endMin: t(20, 30) })
    expect(timelineRange([{ startMin: t(16), endMin: t(20, 4) }], { startMin: t(14), endMin: t(21) })).toEqual({ startMin: t(15, 30), endMin: t(20, 30) })
  })

  it('shows the opening hours on a day with nothing in it', () => {
    expect(timelineRange([], { startMin: t(14), endMin: t(21) })).toEqual({ startMin: t(14), endMin: t(21) })
  })
})

describe('a clocked-in stretch', () => {
  const day = '2026-11-03'
  const shift = { dateKey: day, inMin: t(15, 21), outMin: null, outDateKey: null, status: 'open' as const }

  it('runs to now while still in today, as clocked', () => {
    expect(clockSpan(shift, day, day, t(17, 10))).toEqual({ startMin: t(15, 21), endMin: t(17, 10), open: true })
  })

  it('shows a closed shift as clocked, with no rule applied', () => {
    expect(clockSpan({ ...shift, status: 'closed', outMin: t(20, 4), outDateKey: day }, day, '2026-11-04', 0)).toEqual({ startMin: t(15, 21), endMin: t(20, 4), open: false })
  })

  it('ends a shift past midnight at midnight, and leaves out other days’ shifts', () => {
    expect(clockSpan({ ...shift, status: 'closed', outMin: t(0, 30), outDateKey: '2026-11-04' }, day, day, 0)?.endMin).toBe(24 * 60)
    expect(clockSpan(shift, '2026-11-04', day, 0)).toBeNull()
    expect(clockSpan(shift, day, '2026-11-05', 0)).toEqual({ startMin: t(15, 21), endMin: 24 * 60, open: true })
  })
})
