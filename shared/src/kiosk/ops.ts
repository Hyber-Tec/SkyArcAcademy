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
  /** Its day (the clock-in's, in the academy's time zone): the payroll counts it there. */
  dateKey: string
  clockInAt: number
  clockOutAt: number | null
  status: 'open' | 'closed'
  autoClosed: boolean
}

/** The automatic clock-out (`autoClockOutAt`, shared/src/pay/paidTime.ts) of a shift still open. */
export interface KioskAutoOut {
  at: number
  by: 'last_class' | 'set_time'
}

type Plan =
  /** A new shift from the op's time. */
  | { kind: 'create' }
  /** Close this open shift at the op's time. */
  | { kind: 'close'; shiftId: string }
  /** The shift was clocked out automatically (at midnight) after the coach's real clock-out: the real one replaces it. */
  | { kind: 'correct'; shiftId: string; autoOutAt: number }
  /** Nothing to change: the shift already says so (clocked in, or out, elsewhere or earlier). */
  | { kind: 'same'; shiftId: string; reason: string }
  | { kind: 'reject'; reason: string }

/**
 * What to do with an op. `autoClose` comes first: the coach's open shift had passed its automatic clock-out before the
 * op happened (a coach who forgot to clock out, while the tablet was offline), so it's closed then, as the server's
 * automatic clock-out would have done had it known of the shift.
 */
export type KioskPlan = Plan & { autoClose?: { shiftId: string } & KioskAutoOut }

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
    /** The coach's open shift on the server, and when it's clocked out automatically (null: never). */
    open: KioskShiftState | null
    openAutoOut: KioskAutoOut | null
    /** For a clock-out: the shift it names (by id, or the one its clock-in op made or joined). */
    target: KioskShiftState | null
    /** For a clock-in: the coach's other shifts that day, to never count the same time twice. */
    dayShifts: KioskShiftState[]
  },
): KioskPlan {
  if (op.at > ctx.now + KIOSK_LIMITS.futureMs) return { kind: 'reject', reason: 'its time is ahead of the server’s (the tablet’s clock is wrong)' }
  if (op.at < ctx.now - KIOSK_LIMITS.maxAgeDays * 86_400_000) return { kind: 'reject', reason: `it’s more than ${KIOSK_LIMITS.maxAgeDays} days old` }
  const locked = (dateKey: string) => !!ctx.lockedThrough && dateKey <= ctx.lockedThrough
  const lockedReason = 'its day is in a pay period that’s locked'

  // The open shift's automatic clock-out, when it came before this op.
  const due = ctx.open && ctx.openAutoOut && ctx.openAutoOut.at <= op.at ? { open: ctx.open, out: ctx.openAutoOut } : null
  const closedByAuto: KioskShiftState | null = due ? { ...due.open, status: 'closed', clockOutAt: due.out.at, autoClosed: true } : null
  const asNow = (s: KioskShiftState) => (closedByAuto && s.id === closedByAuto.id ? closedByAuto : s)
  const open = due ? null : ctx.open
  const plan = (p: Plan): KioskPlan => (due ? { ...p, autoClose: { shiftId: due.open.id, ...due.out } } : p)

  if (op.kind === 'in') {
    if (locked(ctx.dateKey)) return { kind: 'reject', reason: lockedReason }
    if (open) return plan({ kind: 'same', shiftId: open.id, reason: 'already clocked in' })
    const covering = ctx.dayShifts.map(asNow).find((s) => s.clockInAt <= op.at && (s.clockOutAt === null || op.at < s.clockOutAt))
    if (covering) return plan({ kind: 'same', shiftId: covering.id, reason: 'that time is in a shift already' })
    return plan({ kind: 'create' })
  }

  const shift = ctx.target ? asNow(ctx.target) : open
  if (!shift) return plan({ kind: 'reject', reason: 'not clocked in' })
  // The shift's own day: the payroll counts it there, whatever day the clock-out falls on.
  if (locked(shift.dateKey)) return { kind: 'reject', reason: lockedReason }
  if (op.at <= shift.clockInAt) return plan({ kind: 'reject', reason: 'it’s before the clock-in' })
  if (shift.status === 'open') return plan({ kind: 'close', shiftId: shift.id })
  if (shift.autoClosed && shift.clockOutAt !== null && op.at < shift.clockOutAt) return plan({ kind: 'correct', shiftId: shift.id, autoOutAt: shift.clockOutAt })
  return plan({ kind: 'same', shiftId: shift.id, reason: 'already clocked out' })
}
