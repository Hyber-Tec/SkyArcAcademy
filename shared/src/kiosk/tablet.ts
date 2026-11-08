import { addDays, dateKeyOf, minutesOf, parseHHMM, toInstant } from '../time'
import type { KioskOp } from './ops'

/** A coach the tablet knows: their PIN only as its fingerprint (`kioskPinInput`). */
export interface KioskPerson {
  staffId: string
  name: string
  pinHash: string
}

/** What the server sends the tablet at each sync. */
export interface KioskServerState {
  academyName: string
  timeZone: string
  pinLength: number
  successReturnSeconds: number
  /** The academy's automatic clock-out at a set time (Settings → Pay & time clock): midnight by default. */
  autoClockOut: { enabled: boolean; localTime: string }
  people: KioskPerson[]
  /** Who is clocked in now, by the server. */
  open: { staffId: string; shiftId: string; clockInAt: number }[]
  /** Today's automatic clock-outs (someone who forgot), the latest per coach. */
  autoOuts: { staffId: string; at: number }[]
  /** The server's clock when it answered (ms). */
  serverTime: number
}

/** What happened to each op the tablet sent. */
export interface KioskOpResult {
  opId: string
  status: 'applied' | 'same' | 'rejected'
  shiftId?: string
  reason?: string
}

/** A coach clocked in, as the tablet sees it: the server's shift, or the tablet's clock-in not sent yet. */
export interface KioskOpen {
  shiftId: string | null
  inOpId: string | null
  clockInAt: number
}

/** The tablet's view: who's clocked in, and who was clocked out automatically (when). */
export interface KioskView {
  open: Record<string, KioskOpen>
  autoOut: Record<string, number>
}

/**
 * When a shift clocked in at `clockInAt` is clocked out automatically at the set time: the first `localTime` after the
 * clock-in, as `autoClockOutAt` (shared/src/pay/paidTime.ts) decides it for a day without classes. Null when off.
 */
export function setTimeAutoOut(clockInAt: number, auto: KioskServerState['autoClockOut'] | undefined, timeZone: string): number | null {
  if (!auto?.enabled) return null
  const cutoff = parseHHMM(auto.localTime)
  if (Number.isNaN(cutoff)) return null
  const dateKey = dateKeyOf(clockInAt, timeZone)
  const day = cutoff > minutesOf(clockInAt, timeZone) ? dateKey : addDays(dateKey, 1)
  return toInstant(day, cutoff, timeZone).getTime()
}

/**
 * Who's clocked in on the tablet: the server's view at the last sync, then the ops not sent (or not answered) yet, in
 * order. A shift past its automatic clock-out counts as clocked out from then on, as the server will count it: a coach
 * who forgot to clock out, while the tablet was offline at midnight, clocks in the next day, not out.
 */
export function tabletView(server: Pick<KioskServerState, 'open' | 'autoOuts' | 'autoClockOut' | 'timeZone'> | null, pending: KioskOp[], nowMs: number): KioskView {
  const open: Record<string, KioskOpen> = {}
  const autoOut: Record<string, number> = {}
  for (const a of server?.autoOuts ?? []) autoOut[a.staffId] = a.at
  for (const o of server?.open ?? []) open[o.staffId] = { shiftId: o.shiftId, inOpId: null, clockInAt: o.clockInAt }
  const expire = (staffId: string, at: number) => {
    const o = open[staffId]
    const out = o && server ? setTimeAutoOut(o.clockInAt, server.autoClockOut, server.timeZone) : null
    if (out !== null && out <= at) {
      delete open[staffId]
      autoOut[staffId] = out
    }
  }
  for (const op of pending) {
    expire(op.staffId, op.at)
    delete autoOut[op.staffId]
    if (op.kind === 'in') open[op.staffId] ??= { shiftId: null, inOpId: op.id, clockInAt: op.at }
    else delete open[op.staffId]
  }
  for (const staffId of Object.keys(open)) expire(staffId, nowMs)
  return { open, autoOut }
}

/** The op a punch makes: a clock-out of the coach's open shift, or a clock-in. */
export function punchOp(staffId: string, open: Record<string, KioskOpen>, at: number, id: string): KioskOp {
  const shift = open[staffId]
  if (shift) return { id, kind: 'out', staffId, at, shiftId: shift.shiftId, inOpId: shift.inOpId }
  return { id, kind: 'in', staffId, at }
}

/** The ops still to send once the server answered for some: every answered op is done, whatever the answer. */
export function stillPending(pending: KioskOp[], results: KioskOpResult[]): KioskOp[] {
  const answered = new Set(results.map((r) => r.opId))
  return pending.filter((op) => !answered.has(op.id))
}

/** How far the tablet's clock is behind the server's (ms), from a sync: add it to the tablet's clock. */
export function clockOffset(serverTime: number, sentAt: number, receivedAt: number): number {
  // The server answered about halfway through the round trip.
  return Math.round(serverTime - (sentAt + receivedAt) / 2)
}

/** The coach a PIN's fingerprint belongs to. */
export function personFor(people: KioskPerson[], pinHash: string): KioskPerson | null {
  return people.find((p) => p.pinHash === pinHash) ?? null
}
