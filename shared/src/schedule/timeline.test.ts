import { describe, expect, it } from 'vitest'
import { NO_COACH_ROW, type TimelinePerson, classPieces, classRows, classSlots, clockSpan, piecesCount, rowHeights, runsOf, stackHeight, timelineRange, timelineRows } from './timeline'

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
    for (const c of classes) expect(classPieces(rows, c)).toHaveLength(1)
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
    expect(classes.filter((c) => classPieces(rows, c).length === 2)).toHaveLength(1)
  })

  it('draws a class across everyone in at its time: the admin who’s in shares its block', () => {
    // The owner's day: two coaches teach every class and the admin is in all evening (2026-10-29).
    const people = [admin('paige', t(16, 30)), coach('daniel', t(16, 30)), coach('hannah', t(16, 30))]
    const all = ['daniel', 'hannah', 'paige']
    const classes = ['c5', 'c6', 'c7'].map((id) => ({ id, coachIds: ['daniel', 'hannah'], inIds: all }))
    const rows = timelineRows(people, classes)
    expect(rows).toEqual(['daniel', 'hannah', 'paige'])
    for (const c of classes) expect(classPieces(rows, c)).toEqual([[0, 2]])
    // Without who's in, a class spans its coaches only.
    expect(classRows({ id: 'x', coachIds: ['daniel'] })).toEqual(['daniel'])
  })

  it('keeps the coaches above the people who don’t teach unless that breaks a block', () => {
    // Elena leaves at 6:15: in natural order (coaches, then the admin) the last class would break in two around her.
    const people = [admin('paige', t(15, 55)), coach('daniel', t(16)), coach('hannah', t(15, 55)), coach('elena', t(16, 5))]
    const classes = [
      { id: 'c430', coachIds: ['daniel', 'elena', 'hannah'], inIds: ['daniel', 'elena', 'hannah', 'paige'] },
      { id: 'c6', coachIds: ['daniel', 'elena', 'hannah'], inIds: ['daniel', 'elena', 'hannah', 'paige'] },
      { id: 'c7', coachIds: ['daniel', 'hannah'], inIds: ['daniel', 'hannah', 'paige'] },
    ]
    const rows = timelineRows(people, classes)
    expect(piecesCount(rows, classes)).toBe(3)
    // Every coach above the admin; Elena, in for the fewest classes, on top.
    expect(rows).toEqual(['elena', 'hannah', 'daniel', 'paige'])
  })

  it('moves someone who doesn’t teach up between coaches when that keeps every block whole', () => {
    // The admin is in for Alex's class and for Blake's: only the admin between them keeps both whole.
    const people = [coach('alex', t(15)), coach('blake', t(16)), admin('admin', t(15))]
    const classes = [
      { id: 'early', coachIds: ['alex'], inIds: ['alex', 'admin'] },
      { id: 'late', coachIds: ['blake'], inIds: ['blake', 'admin'] },
    ]
    const rows = timelineRows(people, classes)
    expect(piecesCount(rows, classes)).toBe(2)
    expect(rows[1]).toBe('admin')
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

  it('puts the no-coach row under the classes’ rows, then the people in at no class’s time, coaches first', () => {
    const people = [admin('manager', t(15)), coach('idle', t(15)), coach('teacher', t(16)), admin('owner', t(17))]
    const classes = [
      { id: 'c1', coachIds: ['teacher'], inIds: ['teacher', 'owner'] },
      { id: 'c2', coachIds: [] },
    ]
    const rows = timelineRows(people, classes)
    expect(rows).toEqual(['teacher', 'owner', NO_COACH_ROW, 'idle', 'manager'])
    expect(classPieces(rows, classes[1])).toEqual([[2, 2]])
  })

  it('draws a class nobody teaches across who’s in at its time and the “No coach in” row', () => {
    // The manager is in for the coach's class and for the last one, which has no coach.
    const people = [admin('manager', t(16)), coach('coach', t(16))]
    const classes = [
      { id: 'taught', coachIds: ['coach'], inIds: ['coach', 'manager'] },
      { id: 'late', coachIds: [], inIds: ['manager'] },
    ]
    expect(classRows(classes[1])).toEqual(['manager', NO_COACH_ROW])
    const rows = timelineRows(people, classes)
    expect(rows).toEqual(['coach', 'manager', NO_COACH_ROW])
    expect(classPieces(rows, classes[0])).toEqual([[0, 1]])
    expect(classPieces(rows, classes[1])).toEqual([[1, 2]])
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

  it('stacks a block’s slots one under the other', () => {
    expect(stackHeight(6, 56, 6)).toBe(6 * 56 + 5 * 6)
    expect(stackHeight(1, 56, 6)).toBe(56)
    expect(stackHeight(0, 56, 6)).toBe(0)
  })
})

describe('a class block’s slots', () => {
  const students = ['ana', 'ben', 'cal', 'dee']
  const pending = (id: string) => ({ id, status: 'pending' })
  const offered = (id: string) => ({ id, status: 'offered' })

  it('puts a request in an open seat’s place: six seats, four taken, one request', () => {
    expect(classSlots(students, 2, [pending('r1')])).toEqual({ cells: students, requests: [pending('r1')], open: 1 })
  })

  it('lists requests waiting on the office first, then those suggested to a family', () => {
    const slots = classSlots(students, 2, [offered('s1'), pending('r1'), offered('s2'), pending('r2')])
    expect(slots.requests.map((r) => r.id)).toEqual(['r1', 'r2', 's1', 's2'])
    // More requests than open seats: they all show, and no open seat is left.
    expect(slots.open).toBe(0)
  })

  it('keeps every seat open when nobody asks', () => {
    expect(classSlots([], 6, [])).toEqual({ cells: [], requests: [], open: 6 })
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
