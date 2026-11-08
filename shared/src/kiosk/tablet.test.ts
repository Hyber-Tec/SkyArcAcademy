import { describe, expect, it } from 'vitest'
import { autoClockOutAt } from '../pay/paidTime'
import { dateKeyOf, minutesOf } from '../time'
import type { KioskOp } from './ops'
import { clockOffset, personFor, punchOp, setTimeAutoOut, stillPending, tabletView } from './tablet'

const NY = 'America/New_York'
const auto = { enabled: true, localTime: '00:00' }
const base = { timeZone: NY, autoClockOut: auto, autoOuts: [] as { staffId: string; at: number }[] }
// Monday 2026-11-09 in New York (UTC-5): 3 PM is 20:00 UTC.
const nyTime = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour + 5, minute)

describe('the tablet’s view', () => {
  const server = { ...base, open: [{ staffId: 'a', shiftId: 'sh-a', clockInAt: nyTime(9, 15) }], autoOuts: [{ staffId: 'c', at: nyTime(9, 0) }] }
  const now = nyTime(9, 18)

  it('starts from the server and plays the ops not sent yet on top', () => {
    const pending: KioskOp[] = [
      { id: 'o1', kind: 'out', staffId: 'a', at: nyTime(9, 17), shiftId: 'sh-a' },
      { id: 'o2', kind: 'in', staffId: 'b', at: nyTime(9, 17, 30) },
    ]
    expect(tabletView(server, pending, now).open).toEqual({ b: { shiftId: null, inOpId: 'o2', clockInAt: nyTime(9, 17, 30) } })
    expect(tabletView(server, [], now).open).toEqual({ a: { shiftId: 'sh-a', inOpId: null, clockInAt: nyTime(9, 15) } })
    expect(tabletView(null, [], now)).toEqual({ open: {}, autoOut: {} })
  })

  it('makes a clock-out of the open shift, else a clock-in', () => {
    const { open } = tabletView(server, [{ id: 'o2', kind: 'in', staffId: 'b', at: nyTime(9, 17) }], now)
    expect(punchOp('a', open, now, 'p1')).toEqual({ id: 'p1', kind: 'out', staffId: 'a', at: now, shiftId: 'sh-a', inOpId: null })
    // A clock-in made offline: its clock-out names that op, as the server hasn't made the shift yet.
    expect(punchOp('b', open, now, 'p2')).toEqual({ id: 'p2', kind: 'out', staffId: 'b', at: now, shiftId: null, inOpId: 'o2' })
    expect(punchOp('c', open, now, 'p3')).toEqual({ id: 'p3', kind: 'in', staffId: 'c', at: now })
  })

  it('a whole offline day: in, out, in again, all kept in order until sent', () => {
    let pending: KioskOp[] = []
    for (const [i, hour] of [15, 18, 19].entries()) pending = [...pending, punchOp('d', tabletView(null, pending, now).open, nyTime(9, hour), `d${i}`)]
    expect(pending.map((o) => o.kind)).toEqual(['in', 'out', 'in'])
    expect(pending[1].inOpId).toBe('d0')
  })

  it('says who was clocked out automatically today, unless the tablet has something of theirs to send', () => {
    expect(tabletView(server, [], now).autoOut).toEqual({ c: nyTime(9, 0) })
    expect(tabletView(server, [{ id: 'q', kind: 'in', staffId: 'c', at: nyTime(9, 17) }], now).autoOut).toEqual({})
  })
})

describe('a coach who forgot to clock out, while the tablet was offline at midnight', () => {
  // In at 3 PM on Sunday the 8th, never out; it's Monday 3 PM, and the tablet hasn't heard from the server since Sunday.
  const sunday = { ...base, open: [{ staffId: 'e', shiftId: 'sh-e', clockInAt: nyTime(8, 15) }] }
  const monday = nyTime(9, 15)

  it('counts them clocked out at midnight, so the tablet offers to clock in, not out', () => {
    const view = tabletView(sunday, [], monday)
    expect(view.open).toEqual({})
    expect(view.autoOut).toEqual({ e: nyTime(9, 0) })
    expect(punchOp('e', view.open, monday, 'm1').kind).toBe('in')
  })

  it('the same with Sunday’s clock-in still on the tablet, not sent yet: Monday’s starts a new shift', () => {
    const sundayIn: KioskOp = { id: 's1', kind: 'in', staffId: 'f', at: nyTime(8, 15) }
    const mondayIn = punchOp('f', tabletView({ ...base, open: [] }, [sundayIn], monday).open, monday, 'm2')
    expect(mondayIn.kind).toBe('in')
    expect(tabletView({ ...base, open: [] }, [sundayIn, mondayIn], monday).open).toEqual({ f: { shiftId: null, inOpId: 'm2', clockInAt: monday } })
  })

  it('before midnight they’re still in', () => {
    expect(tabletView(sunday, [], nyTime(8, 23, 59)).open).toHaveProperty('e')
  })
})

describe('setTimeAutoOut', () => {
  it('is the server’s automatic clock-out at the set time, to the minute, across the change of the clocks', () => {
    const cases: [number, string][] = [
      [nyTime(9, 15), '00:00'],
      [nyTime(9, 23, 30), '00:00'],
      [nyTime(9, 0, 10), '00:00'],
      // The night the clocks went back (2026-11-01): Saturday 8 PM EDT.
      [Date.UTC(2026, 10, 1, 0, 0), '00:00'],
      [nyTime(9, 15), '21:30'],
      [nyTime(9, 22), '21:30'],
    ]
    for (const [clockInMs, localTime] of cases) {
      const server = autoClockOutAt({
        shift: { staffId: 'x', dateKey: dateKeyOf(clockInMs, NY), inMin: minutesOf(clockInMs, NY), clockInMs },
        classes: [],
        availability: [],
        settings: { timeClock: { autoClockOut: { enabled: true, atLastClass: false, localTime } } } as never,
        timeZone: NY,
      })
      expect(setTimeAutoOut(clockInMs, { enabled: true, localTime }, NY)).toBe(server?.atMs)
    }
  })

  it('is nothing when the academy turned the automatic clock-out off', () => {
    expect(setTimeAutoOut(nyTime(9, 15), { enabled: false, localTime: '00:00' }, NY)).toBeNull()
  })
})

describe('syncing', () => {
  it('drops every op the server answered, whatever the answer, and keeps the rest', () => {
    const pending: KioskOp[] = [
      { id: 'x', kind: 'in', staffId: 'a', at: 1 },
      { id: 'y', kind: 'out', staffId: 'a', at: 2 },
      { id: 'z', kind: 'in', staffId: 'b', at: 3 },
    ]
    expect(stillPending(pending, [{ opId: 'x', status: 'applied' }, { opId: 'y', status: 'rejected', reason: 'r' }]).map((o) => o.id)).toEqual(['z'])
  })

  it('measures how far the tablet’s clock is off', () => {
    expect(clockOffset(10_000, 4_000, 6_000)).toBe(5_000)
  })

  it('finds a coach by their PIN’s fingerprint', () => {
    const people = [{ staffId: 'a', name: 'Ann Lee', pinHash: 'h1' }]
    expect(personFor(people, 'h1')?.name).toBe('Ann Lee')
    expect(personFor(people, 'h2')).toBeNull()
  })
})
