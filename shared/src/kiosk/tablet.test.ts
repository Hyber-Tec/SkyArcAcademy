import { describe, expect, it } from 'vitest'
import type { KioskOp } from './ops'
import { autoOutFor, clockOffset, openNow, personFor, punchOp, stillPending } from './tablet'

const server = { open: [{ staffId: 'a', shiftId: 'sh-a', clockInAt: 1000 }], autoOuts: [{ staffId: 'c', at: 500 }] }

describe('the tablet’s view', () => {
  it('starts from the server and plays the ops not sent yet on top', () => {
    const pending: KioskOp[] = [
      { id: 'o1', kind: 'out', staffId: 'a', at: 2000, shiftId: 'sh-a' },
      { id: 'o2', kind: 'in', staffId: 'b', at: 2100 },
    ]
    expect(openNow(server, pending)).toEqual({ b: { shiftId: null, inOpId: 'o2', clockInAt: 2100 } })
    expect(openNow(server, [])).toEqual({ a: { shiftId: 'sh-a', inOpId: null, clockInAt: 1000 } })
    expect(openNow(null, [])).toEqual({})
  })

  it('makes a clock-out of the open shift, else a clock-in', () => {
    const open = openNow(server, [{ id: 'o2', kind: 'in', staffId: 'b', at: 2100 }])
    expect(punchOp('a', open, 3000, 'p1')).toEqual({ id: 'p1', kind: 'out', staffId: 'a', at: 3000, shiftId: 'sh-a', inOpId: null })
    // A clock-in made offline: its clock-out names that op, as the server hasn't made the shift yet.
    expect(punchOp('b', open, 3000, 'p2')).toEqual({ id: 'p2', kind: 'out', staffId: 'b', at: 3000, shiftId: null, inOpId: 'o2' })
    expect(punchOp('c', open, 3000, 'p3')).toEqual({ id: 'p3', kind: 'in', staffId: 'c', at: 3000 })
  })

  it('a whole offline day: in, out, in again, all kept in order until sent', () => {
    let pending: KioskOp[] = []
    let open = openNow(null, pending)
    for (const [i, t] of [1, 2, 3].entries()) {
      pending = [...pending, punchOp('d', open, t * 1000, `d${i}`)]
      open = openNow(null, pending)
    }
    expect(pending.map((o) => o.kind)).toEqual(['in', 'out', 'in'])
    expect(pending[1].inOpId).toBe('d0')
    expect(open).toEqual({ d: { shiftId: null, inOpId: 'd2', clockInAt: 3000 } })
  })

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

  it('says a coach was clocked out automatically, unless the tablet has something of theirs to send', () => {
    expect(autoOutFor(server, [], 'c')).toBe(500)
    expect(autoOutFor(server, [{ id: 'q', kind: 'in', staffId: 'c', at: 9 }], 'c')).toBeNull()
    expect(autoOutFor(server, [], 'a')).toBeNull()
  })
})
