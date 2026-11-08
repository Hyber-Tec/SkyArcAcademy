/**
 * The kiosk tablet (`kiosk/`, docs/kiosk.md): coaches clock in and out on it with their PIN, with the internet or
 * without. The tablet records each clock-in and clock-out as an op, with its own id and the time it happened, and
 * sends them when it can; the server applies them in order with `planKioskOp`. An op sent twice is applied once (its
 * id), so the tablet can always send again.
 */

/** What a kiosk PIN's fingerprint is made of: its SHA-256, in hex, keys `kioskPins` (functions/src/pins.ts). */
export function kioskPinInput(branchId: string, pin: string): string {
  return `skyarc-kiosk:${branchId}:${pin}`
}

/** A clock-in or clock-out made on the tablet. */
export interface KioskOp {
  /** Made on the tablet; the server applies an id once. */
  id: string
  kind: 'in' | 'out'
  staffId: string
  /** When it happened (ms): the tablet's clock, corrected by how far it was from the server's at the last sync. */
  at: number
  /** A clock-out's shift, as the tablet knew it: the server's id, or the tablet's own clock-in op. */
  shiftId?: string | null
  inOpId?: string | null
}

/** A shift as `planKioskOp` reads it. */
export interface KioskShiftState {
  id: string
  clockInAt: number
  clockOutAt: number | null
  status: 'open' | 'closed'
  autoClosed: boolean
}

export type KioskPlan =
  /** A new shift from the op's time. */
  | { kind: 'create' }
  /** Close this open shift at the op's time. */
  | { kind: 'close'; shiftId: string }
  /** The shift was clocked out automatically (at midnight) after the coach's real clock-out: the real one replaces it. */
  | { kind: 'correct'; shiftId: string; autoOutAt: number }
  /** Nothing to change: the shift already says so (clocked in, or out, elsewhere or earlier). */
  | { kind: 'same'; shiftId: string; reason: string }
  | { kind: 'reject'; reason: string }

/** How far ahead of the server an op's time may be (clocks differ a little), and how old it may be. */
export const KIOSK_LIMITS = { futureMs: 5 * 60_000, maxAgeDays: 14 } as const

/** Taken as recorded without the internet: sent this long after it happened. */
export const KIOSK_LATE_MS = 2 * 60_000

export function planKioskOp(
  op: KioskOp,
  ctx: {
    now: number
    /** The op's day in the academy's time zone, and the last day of the paid pay periods ('' when none is locked). */
    dateKey: string
    lockedThrough: string
    /** The coach's open shift on the server. */
    open: KioskShiftState | null
    /** For a clock-out: the shift it names (by id, or the one its clock-in op made or joined). */
    target: KioskShiftState | null
    /** For a clock-in: the coach's other shifts that day, to never count the same time twice. */
    dayShifts: KioskShiftState[]
  },
): KioskPlan {
  if (op.at > ctx.now + KIOSK_LIMITS.futureMs) return { kind: 'reject', reason: 'its time is ahead of the server’s (the tablet’s clock is wrong)' }
  if (op.at < ctx.now - KIOSK_LIMITS.maxAgeDays * 86_400_000) return { kind: 'reject', reason: `it’s more than ${KIOSK_LIMITS.maxAgeDays} days old` }
  if (ctx.lockedThrough && ctx.dateKey <= ctx.lockedThrough) return { kind: 'reject', reason: 'its day is in a pay period that’s locked' }

  if (op.kind === 'in') {
    if (ctx.open) return { kind: 'same', shiftId: ctx.open.id, reason: 'already clocked in' }
    const covering = ctx.dayShifts.find((s) => s.clockInAt <= op.at && (s.clockOutAt === null || op.at < s.clockOutAt))
    if (covering) return { kind: 'same', shiftId: covering.id, reason: 'that time is in a shift already' }
    return { kind: 'create' }
  }

  const shift = ctx.target ?? ctx.open
  if (!shift) return { kind: 'reject', reason: 'not clocked in' }
  if (op.at <= shift.clockInAt) return { kind: 'reject', reason: 'it’s before the clock-in' }
  if (shift.status === 'open') return { kind: 'close', shiftId: shift.id }
  if (shift.autoClosed && shift.clockOutAt !== null && op.at < shift.clockOutAt) return { kind: 'correct', shiftId: shift.id, autoOutAt: shift.clockOutAt }
  return { kind: 'same', shiftId: shift.id, reason: 'already clocked out' }
}
