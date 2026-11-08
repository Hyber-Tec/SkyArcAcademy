import { describe, expect, it } from 'vitest'
import { type KioskOp, type KioskShiftState, KIOSK_LIMITS, kioskPinInput, planKioskOp } from './ops'

const H = 3_600_000
const now = Date.UTC(2026, 10, 9, 23, 0) // Mon 6:00 PM in New York
const at = (hoursAgo: number) => now - hoursAgo * H
const shift = (s: Partial<KioskShiftState> & { id: string }): KioskShiftState => ({ clockInAt: at(3), clockOutAt: null, status: 'open', autoClosed: false, ...s })
const ctx = (over: Partial<Parameters<typeof planKioskOp>[1]> = {}) => ({ now, dateKey: '2026-11-09', lockedThrough: '', open: null, target: null, dayShifts: [], ...over })
const inOp = (time = at(1)): KioskOp => ({ id: 'op-in', kind: 'in', staffId: 's1', at: time })
const outOp = (time = at(1), refs: Partial<KioskOp> = {}): KioskOp => ({ id: 'op-out', kind: 'out', staffId: 's1', at: time, ...refs })

describe('kioskPinInput', () => {
  it('is what the server hashes for a PIN (functions/src/pins.ts)', () => {
    expect(kioskPinInput('skyarc', '1234')).toBe('skyarc-kiosk:skyarc:1234')
  })
})

describe('planKioskOp: clocking in', () => {
  it('starts a shift when the coach is out', () => {
    expect(planKioskOp(inOp(), ctx())).toEqual({ kind: 'create' })
  })

  it('keeps the shift already open (clocked in on the website, or the same tap twice)', () => {
    const plan = planKioskOp(inOp(), ctx({ open: shift({ id: 'sh1' }) }))
    expect(plan).toMatchObject({ kind: 'same', shiftId: 'sh1' })
  })

  it('never counts time twice: a clock-in inside a shift already closed joins it', () => {
    const closed = shift({ id: 'sh2', clockInAt: at(3), clockOutAt: at(0.5), status: 'closed' })
    expect(planKioskOp(inOp(at(2)), ctx({ dayShifts: [closed] }))).toMatchObject({ kind: 'same', shiftId: 'sh2' })
    // After that shift ended, a new one starts.
    expect(planKioskOp(inOp(at(0.25)), ctx({ dayShifts: [closed] }))).toEqual({ kind: 'create' })
  })

  it('takes a clock-in made offline hours ago', () => {
    expect(planKioskOp(inOp(at(26)), ctx({ dateKey: '2026-11-08' }))).toEqual({ kind: 'create' })
  })
})

describe('planKioskOp: clocking out', () => {
  it('closes the open shift', () => {
    expect(planKioskOp(outOp(), ctx({ open: shift({ id: 'sh1' }) }))).toEqual({ kind: 'close', shiftId: 'sh1' })
  })

  it('closes the shift it names, when the server has it', () => {
    expect(planKioskOp(outOp(at(1), { shiftId: 'sh3' }), ctx({ target: shift({ id: 'sh3' }) }))).toEqual({ kind: 'close', shiftId: 'sh3' })
  })

  it('replaces a midnight automatic clock-out with the real, earlier one made offline', () => {
    const auto = shift({ id: 'sh4', clockInAt: at(30), clockOutAt: at(24), status: 'closed', autoClosed: true })
    expect(planKioskOp(outOp(at(26)), ctx({ target: auto, dateKey: '2026-11-08' }))).toEqual({ kind: 'correct', shiftId: 'sh4', autoOutAt: at(24) })
  })

  it('leaves a shift someone else closed', () => {
    const closed = shift({ id: 'sh5', clockOutAt: at(2), status: 'closed' })
    expect(planKioskOp(outOp(), ctx({ target: closed }))).toMatchObject({ kind: 'same', shiftId: 'sh5' })
  })

  it('refuses a clock-out without a clock-in, or before it', () => {
    expect(planKioskOp(outOp(), ctx())).toMatchObject({ kind: 'reject' })
    expect(planKioskOp(outOp(at(4)), ctx({ open: shift({ id: 'sh1', clockInAt: at(3) }) }))).toMatchObject({ kind: 'reject' })
  })
})

describe('planKioskOp: times it can’t trust', () => {
  it('refuses a time ahead of the server’s', () => {
    expect(planKioskOp(inOp(now + KIOSK_LIMITS.futureMs + 1000), ctx())).toMatchObject({ kind: 'reject' })
    expect(planKioskOp(inOp(now + 60_000), ctx())).toEqual({ kind: 'create' })
  })

  it('refuses one too old, or in a locked pay period', () => {
    expect(planKioskOp(inOp(now - (KIOSK_LIMITS.maxAgeDays + 1) * 24 * H), ctx())).toMatchObject({ kind: 'reject' })
    expect(planKioskOp(inOp(), ctx({ lockedThrough: '2026-11-09' }))).toMatchObject({ kind: 'reject' })
    expect(planKioskOp(inOp(), ctx({ lockedThrough: '2026-11-08' }))).toEqual({ kind: 'create' })
  })
})
