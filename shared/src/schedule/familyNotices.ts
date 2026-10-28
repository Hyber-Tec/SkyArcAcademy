import type { NotificationType } from '../comms'
import { type DateKey, formatDateKey, formatMinutes, formatTimeRange } from '../time'
import { seatKind } from './classes'
import type { SessionSnapshot } from './notify'
import { type ClassRequest, REQUEST_KIND_LABELS } from './requests'

/**
 * What families and the office are told about classes (docs/DECISIONS.md §23): the family when the academy changes
 * their child's class or answers a request, the office when a family cancels or asks. The texts live here, the sending
 * in functions/src (requests.ts, sessionNotify.ts).
 */

export interface Notice {
  type: NotificationType
  title: string
  body: string
}

const first = (name: string) => name.trim().split(/\s+/)[0] || name
const day = (d: DateKey) => formatDateKey(d, 'weekdayMedium')
const at = (s: { dateKey: DateKey; startMin: number }) => `${day(s.dateKey)} at ${formatMinutes(s.startMin)}`
const span = (s: { dateKey: DateKey; startMin: number; endMin: number }) => `${day(s.dateKey)}, ${formatTimeRange(s.startMin, s.endMin)}`
const ASK = 'A makeup can be asked for in Classes.'

/** A seat the office changed, as its family hears of it; null when there's nothing to tell. */
export function familyClassNotice(before: SessionSnapshot & { note?: string }, after: SessionSnapshot & { note?: string }, nowMs: number): Notice | null {
  const who = first(after.studentName || before.studentName)
  const makeup = seatKind(after.note) === 'makeup'
  // A missed class is marked on the day: it's told whenever it's marked.
  if (!after.isDeleted && after.status === 'no_show' && before.status !== 'no_show') {
    return makeup
      ? { type: 'session_no_show', title: 'Makeup missed', body: `${who} missed the makeup on ${at(after)}. It counts as used.` }
      : { type: 'session_no_show', title: 'Class missed', body: `${who} missed the class on ${at(after)}. ${ASK}` }
  }
  // Everything else only for classes still ahead.
  if (Math.max(before.startMs, after.startMs) <= nowMs) return null
  const live = (s: SessionSnapshot) => !s.isDeleted && s.status !== 'canceled'
  if (live(before) && !live(after)) {
    return after.isDeleted
      ? { type: 'session_deleted', title: 'Class removed', body: `${who}’s class on ${at(before)} was taken off the schedule.` }
      : { type: 'session_canceled', title: 'Class canceled', body: `${who}’s class on ${at(after)} is canceled.${makeup ? '' : ` ${ASK}`}` }
  }
  if (!live(before) && live(after)) return { type: 'session_restored', title: 'Class back on', body: `${who}’s class on ${at(after)} is back on.` }
  if (!live(after)) return null
  if (before.dateKey !== after.dateKey) {
    return { type: 'session_date_changed', title: 'Class moved', body: `${who}’s class moved from ${day(before.dateKey)} to ${span(after)}.` }
  }
  if (before.startMin !== after.startMin || before.endMin !== after.endMin) {
    return { type: 'session_time_changed', title: 'Class time changed', body: `${who}’s class on ${day(after.dateKey)} is now ${formatTimeRange(after.startMin, after.endMin)}.` }
  }
  return null
}

/** A makeup or extra class the office booked itself, for a class still ahead: the family hears of it. */
export function familyBookedNotice(s: SessionSnapshot & { note?: string }, nowMs: number): Notice | null {
  if (s.isDeleted || s.status === 'canceled' || s.startMs <= nowMs) return null
  const kind = seatKind(s.note)
  const who = first(s.studentName)
  if (kind === 'makeup') return { type: 'session_created', title: 'Makeup booked', body: `${who}’s makeup is booked: ${span(s)}.` }
  if (kind === 'practice') return { type: 'session_created', title: 'Extra class booked', body: `${who}’s extra class is booked: ${span(s)}.` }
  return null
}

/** The office hears that a family canceled. */
export function familyCanceledNotice(s: { studentName: string; dateKey: DateKey; startMin: number }, by: { name: string; role: 'parent' | 'student' }): Notice {
  const whom = by.role === 'student' ? 'themself' : `their parent${by.name ? ` (${by.name})` : ''}`
  return { type: 'class_canceled_by_family', title: 'Canceled by the family', body: `${s.studentName}’s class on ${at(s)} was canceled by ${whom}.` }
}

/** The office hears of a request to approve. */
export function requestedNotice(r: Pick<ClassRequest, 'kind' | 'studentName' | 'dateKey' | 'startMin' | 'endMin' | 'forDateKey' | 'requestedBy'>): Notice {
  const what =
    r.kind === 'makeup' && r.forDateKey
      ? `a makeup for ${formatDateKey(r.forDateKey, 'monthDay')}`
      : r.kind === 'reschedule' && r.forDateKey
        ? `to move ${formatDateKey(r.forDateKey, 'monthDay')}’s class`
        : 'an extra class'
  const asker = r.requestedBy.role === 'student' ? r.studentName : `${r.requestedBy.name || 'A parent'} (for ${first(r.studentName)})`
  return { type: 'class_requested', title: `Request: ${REQUEST_KIND_LABELS[r.kind]}`, body: `${asker} asks for ${what}: ${span(r)}.` }
}

/** The family hears the answer. */
export function decidedNotice(r: Pick<ClassRequest, 'kind' | 'studentName' | 'dateKey' | 'startMin' | 'endMin' | 'forDateKey' | 'decisionNote'>, approved: boolean): Notice {
  const who = first(r.studentName)
  if (approved) {
    const what = r.kind === 'extra' ? 'extra class' : r.kind === 'reschedule' ? 'class' : 'makeup'
    const moved = r.kind === 'reschedule' && r.forDateKey ? ` (moved from ${formatDateKey(r.forDateKey, 'monthDay')})` : ''
    return { type: 'request_approved', title: 'Request approved', body: `${who}’s ${what} is booked: ${span(r)}${moved}.` }
  }
  const note = r.decisionNote.trim()
  return {
    type: 'request_rejected',
    title: 'Request not approved',
    body: `${who}’s request for ${at(r)} wasn’t approved.${note ? ` “${note}”` : ''} Another time can be asked for in Classes.`,
  }
}

/** A new score, as its family hears of it: "Standing, 186.8 over 20 shots", a competition with its match and inner tens. */
export function scoreAddedNotice(e: {
  studentName: string
  position: string
  total: number
  wholeTotal?: number
  shots: number
  source: string
  innerTens?: number | null
  kind?: string
  match?: { name: string } | null
}): Notice {
  const pos = e.position ? `${e.position[0].toUpperCase()}${e.position.slice(1)}, ` : ''
  const whole = e.source === 'paper' || (e.source === 'sheet' && Number.isInteger(e.total))
  const total = whole ? String(e.wholeTotal ?? Math.round(e.total)) : Number(e.total).toFixed(1)
  const tens = e.kind === 'competition' && e.innerTens != null ? `-${e.innerTens}` : ''
  const match = e.kind === 'competition' ? `${e.match?.name || 'A competition'}, ` : ''
  return {
    type: 'score_added',
    title: e.kind === 'competition' ? 'New competition result' : 'New score',
    body: `${first(e.studentName)}: ${match}${pos}${total}${tens} over ${e.shots} shot${e.shots === 1 ? '' : 's'}.`,
  }
}
