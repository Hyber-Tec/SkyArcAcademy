import type { SessionStatus } from '../settings/defaults'

export const SESSION_STATUSES: readonly SessionStatus[] = ['pending', 'confirmed', 'present', 'no_show', 'canceled']

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  // The marks' own words on the schedule and the phone (docs/DECISIONS.md §21).
  present: 'Here',
  no_show: 'No-show',
  canceled: 'Canceled',
}

/**
 * Session card colors (fixed design tokens, from True Education): the card
 * background shows the status.
 */
export const SESSION_STATUS_STYLE: Record<SessionStatus, { bg: string; border: string; text: string }> = {
  pending: { bg: '#FFFFD7', border: '#d4d090', text: '#78610a' },
  confirmed: { bg: '#ECFFE2', border: '#84c970', text: '#166534' },
  present: { bg: '#E6F5FF', border: '#93c5fd', text: '#1e40af' },
  no_show: { bg: '#DFDFDF', border: '#b8b8b8', text: '#57534e' },
  canceled: { bg: '#FFE8E8', border: '#f9a8a8', text: '#991b1b' },
}

/** Small status dots in lists (True Education Home colors). */
export const SESSION_STATUS_DOT: Record<SessionStatus, string> = {
  pending: '#E0B400',
  confirmed: '#34A853',
  present: '#4285F4',
  no_show: '#9AA0A6',
  canceled: '#EA4335',
}

/** Calendar events in lists. */
export const EVENT_DOT = '#009EEB'

/** A seat nobody has marked yet: still coming (pending or confirmed), not here, a no-show or canceled. */
export const isUnmarked = (status: SessionStatus) => status === 'pending' || status === 'confirmed'

/**
 * Seats whose attendance can be taken but hasn't been: unmarked, in a class that has started (a day before today, or
 * today once its time has come). The office marks the rest of a class or a day here in one go (the third meeting,
 * `AT1`: the manager marks the past weeks himself).
 */
export function seatsToMark<S extends { dateKey: string; startMin: number; status: SessionStatus; isDeleted?: boolean }>(seats: readonly S[], today: string, nowMin: number): S[] {
  return seats.filter((s) => !s.isDeleted && isUnmarked(s.status) && (s.dateKey < today || (s.dateKey === today && s.startMin <= nowMin)))
}

/** A class is over on the days before today, and today once its time has ended. */
export const isOver = (c: { dateKey: string; endMin: number }, today: string, nowMin: number) => c.dateKey < today || (c.dateKey === today && c.endMin <= nowMin)

/** A class that's over with students nobody has marked yet. */
export interface ClassToMark<C, S> {
  c: C
  /** Its students nobody has marked, in the order booked. */
  seats: S[]
}

/**
 * The classes that are over with students nobody has marked yet (days before today, and today's once they've ended):
 * Home's Attendance card (docs/DECISIONS.md §47), the newest day first and each day's classes in time order. Seats whose
 * class isn't on the schedule (in the Trash, or from before classes were taught together) are left out, as the schedule
 * leaves them out.
 */
export function classesToMark<
  C extends { id: string; dateKey: string; startMin: number; endMin: number; isDeleted?: boolean },
  S extends { classId?: string; studentName: string; status: SessionStatus; isDeleted?: boolean; visualOrder?: number },
>(classes: readonly C[], seats: readonly S[], today: string, nowMin: number): ClassToMark<C, S>[] {
  const over = new Map(classes.filter((c) => !c.isDeleted && isOver(c, today, nowMin)).map((c) => [c.id, c]))
  const byClass = new Map<string, S[]>()
  for (const s of seats) {
    if (s.isDeleted || !isUnmarked(s.status) || !s.classId || !over.has(s.classId)) continue
    const list = byClass.get(s.classId)
    if (list) list.push(s)
    else byClass.set(s.classId, [s])
  }
  const out: ClassToMark<C, S>[] = []
  for (const [id, list] of byClass) {
    const c = over.get(id)
    if (c) out.push({ c, seats: list.sort((a, b) => (a.visualOrder ?? 0) - (b.visualOrder ?? 0) || a.studentName.localeCompare(b.studentName)) })
  }
  return out.sort((a, b) => b.c.dateKey.localeCompare(a.c.dateKey) || a.c.startMin - b.c.startMin || a.c.endMin - b.c.endMin)
}
