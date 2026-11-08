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

/** Who is clocked in on the tablet: the server's view at the last sync, then the ops not sent (or not answered) yet. */
export function openNow(server: Pick<KioskServerState, 'open'> | null, pending: KioskOp[]): Record<string, KioskOpen> {
  const open: Record<string, KioskOpen> = {}
  for (const o of server?.open ?? []) open[o.staffId] = { shiftId: o.shiftId, inOpId: null, clockInAt: o.clockInAt }
  for (const op of pending) {
    if (op.kind === 'in') {
      if (!open[op.staffId]) open[op.staffId] = { shiftId: null, inOpId: op.id, clockInAt: op.at }
    } else delete open[op.staffId]
  }
  return open
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

/** Today's automatic clock-out for a coach who isn't clocked in now and has nothing waiting to send. */
export function autoOutFor(server: Pick<KioskServerState, 'autoOuts'> | null, pending: KioskOp[], staffId: string): number | null {
  if (pending.some((op) => op.staffId === staffId)) return null
  return server?.autoOuts.find((a) => a.staffId === staffId)?.at ?? null
}
