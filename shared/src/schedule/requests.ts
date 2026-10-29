import type { Role } from '../roles'
import type { BranchSettings } from '../settings/defaults'
import { type DateKey, addDays, formatDateKey, formatTimeRange } from '../time'
import type { Session, TimestampLike } from '../types'
import { MAKEUP_LOOKBACK_DAYS, makeupLabel, makeupsOwed, takesSeat } from './classes'

/**
 * Families cancel and ask for classes (the manager's second meeting, docs/DECISIONS.md §23): parents and students cancel
 * a class until it's confirmed (Settings → Schedule, 24 hours before by default), and ask for an open seat (a makeup, a
 * class moved, or an extra class); the office approves, declines, or suggests another class, which the family accepts
 * or answers by asking for another, back and forth until it's booked. The office can still book anything itself.
 * Families never change the schedule directly: every write goes through the server (functions/src/requests.ts), which
 * checks it with the functions below.
 */

/** A makeup for a missed class, a class moved to another time, or an extra class (the sheets' "Practice"). */
export type ClassRequestKind = 'makeup' | 'reschedule' | 'extra'

/**
 * `pending`: waiting for the office. `offered`: the office suggested another class (`offer`) and waits for the family,
 * who accept it (booked, `approved`) or ask for another (`pending` again), any number of times. Then `approved` (the
 * seat is booked), `rejected` (declined, or closed when its class passed unanswered) or `withdrawn` (by the family).
 */
export type ClassRequestStatus = 'pending' | 'offered' | 'approved' | 'rejected' | 'withdrawn'

/** Requests still open: waiting for the office (`pending`) or for the family (`offered`). */
export const OPEN_REQUEST_STATUSES: readonly ClassRequestStatus[] = ['pending', 'offered']

/** The class the office suggests instead, while the request is `offered`. */
export interface ClassOffer {
  classId: string
  dateKey: DateKey
  startMin: number
  endMin: number
  startAt: TimestampLike
  /** The office's words with it ("Tuesday is full; Thursday has two seats."), if any. */
  note: string
  by: { email: string; name: string }
  at: TimestampLike
}

/** One step of a request's back and forth. */
export type ClassRequestAction = 'asked' | 'offered' | 'accepted' | 'asked_again' | 'approved' | 'rejected' | 'withdrawn'

/** Who took a step: a parent or the student, an owner or admin, or the server (`system`: a class passed unanswered). */
export interface RequestActor {
  email: string
  name: string
  role: Role | 'system'
}

export interface ClassRequestStep {
  action: ClassRequestAction
  at: TimestampLike
  by: RequestActor
  /** The class the step is about: asked for, suggested, accepted or booked (none for a decline or a withdrawal). */
  classId?: string
  dateKey?: DateKey
  startMin?: number
  endMin?: number
  /** The words with it: the family's message, the office's note. */
  note?: string
}

/** The longest history kept: the first step (the ask) and the latest ones. */
export const REQUEST_HISTORY_MAX = 40

/** `branches/{b}/classRequests/{id}`: a family's request for a seat (written by the server only). */
export interface ClassRequest {
  kind: ClassRequestKind
  studentId: string
  studentName: string
  /** The class asked for (the latest, when the family asked again; the one booked once approved), with its time. */
  classId: string
  dateKey: DateKey
  startMin: number
  endMin: number
  startAt: TimestampLike
  /** A makeup: the missed seat it makes up. A move: the seat it replaces, canceled when approved. An extra class: null. */
  forSessionId: string | null
  forDateKey: DateKey | null
  /** The family's words with the class asked for now, if any (earlier ones are in `history`). */
  message: string
  status: ClassRequestStatus
  requestedBy: { email: string; name: string; role: 'parent' | 'student' }
  createdAt: TimestampLike | null
  updatedAt: TimestampLike | null
  /** When it was answered, and by whom: the office, or the family member who accepted a suggestion (null: closed by the server). */
  decidedAt: TimestampLike | null
  decidedBy: { email: string; name: string } | null
  /** The office's words to the family when it says no, if any. */
  decisionNote: string
  /** The seat made when it was approved. */
  sessionId: string | null
  /** The class the office suggests instead, while `offered`; null otherwise (absent on older requests). */
  offer?: ClassOffer | null
  /** The back and forth, oldest first, at most `REQUEST_HISTORY_MAX` (absent on older requests: read `requestHistory`). */
  history?: ClassRequestStep[]
}

/**
 * `branches/{b}/classSeats/{classId}`: a class's time and how many of its seats are taken, without names, so families
 * can see where seats are open (they never read the class itself: its note is for the coaches). Written by the server.
 */
export interface ClassSeats {
  dateKey: DateKey
  startMin: number
  endMin: number
  startAt: TimestampLike
  seats: number
  taken: number
  isDeleted: boolean
  updatedAt?: TimestampLike | null
}

export const REQUEST_KIND_LABELS: Record<ClassRequestKind, string> = {
  makeup: 'Makeup',
  reschedule: 'Move a class',
  extra: 'Extra class',
}

/** What families read about their request. */
export const REQUEST_STATUS_LABELS: Record<ClassRequestStatus, string> = {
  pending: 'Waiting for the academy',
  offered: 'Another time suggested',
  approved: 'Approved',
  rejected: 'Not approved',
  withdrawn: 'Withdrawn',
}

/** What the office reads about a request: who it waits on, or how it ended. */
export const REQUEST_OFFICE_STATUS_LABELS: Record<ClassRequestStatus, string> = {
  pending: 'Waiting on us',
  offered: 'Waiting on the family',
  approved: 'Approved',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}

/** Each step of the back and forth in a word or two (in a sentence: `requestStepText`). */
export const REQUEST_ACTION_LABELS: Record<ClassRequestAction, string> = {
  asked: 'Asked',
  offered: 'Another time suggested',
  accepted: 'Suggestion accepted',
  asked_again: 'Asked for another time',
  approved: 'Approved',
  rejected: 'Declined',
  withdrawn: 'Withdrawn',
}

export function isOpenRequest(r: Pick<ClassRequest, 'status'>): boolean {
  return r.status === 'pending' || r.status === 'offered'
}

/** Who a request waits on: the office (`pending`), the family (`offered`), or nobody (answered or withdrawn). */
export function requestWaitingOn(r: Pick<ClassRequest, 'status'>): 'office' | 'family' | null {
  return r.status === 'pending' ? 'office' : r.status === 'offered' ? 'family' : null
}

/** A request's back and forth, oldest first ([] for requests from before it was kept). */
export function requestHistory(r: Pick<ClassRequest, 'history'>): ClassRequestStep[] {
  return Array.isArray(r.history) ? r.history : []
}

/** The history with one more step: past the limit, the first step (the ask) and the latest ones stay. */
export function withStep(history: readonly ClassRequestStep[] | null | undefined, step: ClassRequestStep): ClassRequestStep[] {
  const all = [...(history ?? []), step]
  return all.length <= REQUEST_HISTORY_MAX ? all : [all[0], ...all.slice(all.length - REQUEST_HISTORY_MAX + 1)]
}

type ClassTime = { classId: string; dateKey: DateKey; startMin: number; endMin: number }

/** A step, with only the fields it has (Firestore takes no `undefined`). */
export function requestStep(action: ClassRequestAction, at: TimestampLike, by: RequestActor, c?: ClassTime | null, note?: string): ClassRequestStep {
  const words = (note ?? '').trim()
  return {
    action,
    at,
    by,
    ...(c ? { classId: c.classId, dateKey: c.dateKey, startMin: c.startMin, endMin: c.endMin } : {}),
    ...(words ? { note: words } : {}),
  }
}

/** The class an open request waits on: the one suggested while it's `offered`, its own otherwise. */
export function requestWaitsOn(r: Pick<ClassRequest, 'status' | 'classId' | 'dateKey' | 'startMin' | 'endMin' | 'startAt' | 'offer'>): Pick<ClassOffer, 'classId' | 'dateKey' | 'startMin' | 'endMin' | 'startAt'> {
  return r.status === 'offered' && r.offer ? r.offer : r
}

/** An open request with nothing left to answer: the class it waits on has started (the nightly job closes it). */
export function isStaleRequest(r: Pick<ClassRequest, 'status' | 'classId' | 'dateKey' | 'startMin' | 'endMin' | 'startAt' | 'offer'>, nowMs: number): boolean {
  return isOpenRequest(r) && (requestWaitsOn(r).startAt?.toMillis?.() ?? 0) <= nowMs
}

/** The seat's label once approved, in the sheets' words: "MU for 10/13" for a makeup or a move, "Practice" otherwise. */
export function seatLabelFor(kind: ClassRequestKind, forDateKey: DateKey | null): string {
  return kind !== 'extra' && forDateKey ? makeupLabel(forDateKey) : 'Practice'
}

const HOUR = 3_600_000

/** Hours before a class when it's confirmed, and families can no longer cancel it (Settings → Schedule). */
export function cancelHours(settings: Pick<BranchSettings, 'schedule'>): number {
  return settings.schedule.autoConfirm.hoursBefore
}

/** The moment families can no longer cancel a class: when it's confirmed. */
export function cancelDeadlineMs(startMs: number, settings: Pick<BranchSettings, 'schedule'>): number {
  return startMs - cancelHours(settings) * HOUR
}

/** "Classes can be canceled up to 24 hours before they start." */
export function cancelRuleText(settings: Pick<BranchSettings, 'schedule'>): string {
  const h = cancelHours(settings)
  const span = h % 24 === 0 && h >= 48 ? `${h / 24} days` : h === 1 ? '1 hour' : `${h} hours`
  return `Classes can be canceled up to ${span} before they start.`
}

export type FamilyCancel = { ok: true } | { ok: false; reason: 'gone' | 'not_upcoming' | 'too_late'; message: string }

/** Whether a family may cancel a seat now: an upcoming class, still coming, before the deadline. */
export function familyCancelCheck(
  s: Pick<Session, 'status' | 'isDeleted'> & { startMs: number },
  nowMs: number,
  settings: Pick<BranchSettings, 'schedule'>,
): FamilyCancel {
  if (s.isDeleted) return { ok: false, reason: 'gone', message: 'This class is no longer on the schedule.' }
  if (s.startMs <= nowMs || (s.status !== 'pending' && s.status !== 'confirmed')) {
    return { ok: false, reason: 'not_upcoming', message: 'Only upcoming classes can be canceled.' }
  }
  if (nowMs >= cancelDeadlineMs(s.startMs, settings)) return { ok: false, reason: 'too_late', message: cancelRuleText(settings) }
  return { ok: true }
}

/** How far ahead families can ask for a seat (Settings → Schedule). */
export function requestHorizon(today: DateKey, settings: Pick<BranchSettings, 'schedule'>): DateKey {
  return addDays(today, settings.schedule.requests.daysAhead)
}

/** A class with seats left that families can ask for: upcoming, within the horizon, not in the Trash. */
export function isRequestable(c: Pick<ClassSeats, 'dateKey' | 'seats' | 'taken' | 'isDeleted'> & { startMs: number }, nowMs: number, horizon: DateKey): boolean {
  return !c.isDeleted && c.startMs > nowMs && c.dateKey <= horizon && c.taken < c.seats
}

/** One of the student's seats, as the checks read it. */
export type RequestSeat = Pick<Session, 'classId' | 'studentId' | 'dateKey' | 'startMin' | 'endMin' | 'status' | 'note' | 'isDeleted'> & { id: string; startMs: number }
/** A class as the checks read it: its time, and its seats with how many are taken now. */
export type RequestClass = Pick<ClassSeats, 'dateKey' | 'startMin' | 'endMin' | 'seats' | 'taken' | 'isDeleted'> & { id: string; startMs: number }
/** Another of the student's open requests: the class it asks for, and the class it's for. */
export type OpenRequest = Pick<ClassRequest, 'classId' | 'forSessionId'>

export interface RequestDraft {
  kind: ClassRequestKind
  classId: string
  forSessionId: string | null
}

export type RequestCheck = { ok: true; forSession: RequestSeat | null } | { ok: false; message: string }

const FULL = 'That class is full now. Choose another time.'

/**
 * Whether a student may ask for a seat: the class is requestable and has room; the student isn't already in it or in
 * another class at that time; nothing else open asks for the same class or the same missed class; a makeup makes up a
 * class still owed (canceled or missed, in the last six weeks); a move replaces one of the student's upcoming classes.
 * `seats` are the student's own seats around those dates; `pending` their other open requests (waiting for the office
 * or for them).
 */
export function requestCheck(opts: {
  draft: RequestDraft
  target: RequestClass | null
  seats: readonly RequestSeat[]
  pending: readonly OpenRequest[]
  nowMs: number
  today: DateKey
  settings: Pick<BranchSettings, 'schedule'>
}): RequestCheck {
  const { draft, target, seats, pending, nowMs, today, settings } = opts
  if (!target || !isRequestable(target, nowMs, requestHorizon(today, settings))) {
    return { ok: false, message: target && target.taken >= target.seats && !target.isDeleted ? FULL : 'That class can’t be asked for anymore. Choose another time.' }
  }
  const live = seats.filter(takesSeat)
  if (live.some((s) => s.classId === target.id)) return { ok: false, message: 'Already in that class.' }
  if (live.some((s) => s.dateKey === target.dateKey && s.startMin < target.endMin && s.endMin > target.startMin && s.id !== draft.forSessionId)) {
    return { ok: false, message: 'Already in another class at that time.' }
  }
  if (pending.some((p) => p.classId === target.id)) return { ok: false, message: 'That class is already asked for.' }
  if (draft.kind === 'extra') return draft.forSessionId ? { ok: false, message: 'An extra class doesn’t replace a class.' } : { ok: true, forSession: null }

  const forSession = seats.find((s) => s.id === draft.forSessionId) ?? null
  if (!forSession) return { ok: false, message: 'Choose the class it’s for.' }
  if (pending.some((p) => p.forSessionId === forSession.id)) return { ok: false, message: 'Something is already asked for that class.' }
  if (draft.kind === 'makeup') {
    const owed = makeupsOwed(seats, addDays(today, -MAKEUP_LOOKBACK_DAYS))
    if (!owed.some((s) => s.id === forSession.id)) return { ok: false, message: 'That class has no makeup owed.' }
    return { ok: true, forSession }
  }
  // A move: one of the student's own upcoming classes, still coming, to another class.
  if (forSession.isDeleted || forSession.startMs <= nowMs || (forSession.status !== 'pending' && forSession.status !== 'confirmed')) {
    return { ok: false, message: 'Only an upcoming class can be moved.' }
  }
  if (forSession.classId === target.id) return { ok: false, message: 'Choose another time.' }
  return { ok: true, forSession }
}

/**
 * The classes a student could ask for, or the office suggest: requestable (seats open, ahead, within the horizon), not
 * one they're in or at the same time as one of theirs (the class being moved aside), nor one another open request asks
 * for, nor `exclude`. What the pickers list; the server checks the one picked again.
 */
export function classChoices<C extends RequestClass>(
  classes: readonly C[],
  opts: { seats: readonly RequestSeat[]; pending: readonly OpenRequest[]; forSessionId: string | null; nowMs: number; horizon: DateKey; exclude?: readonly (string | null | undefined)[] },
): C[] {
  const live = opts.seats.filter(takesSeat)
  const moving = live.find((s) => s.id === opts.forSessionId) ?? null
  const asked = new Set(opts.pending.map((p) => p.classId))
  const exclude = new Set(opts.exclude ?? [])
  return classes.filter(
    (c) =>
      isRequestable(c, opts.nowMs, opts.horizon) &&
      !exclude.has(c.id) &&
      !asked.has(c.id) &&
      c.id !== moving?.classId &&
      !live.some((s) => s.id !== moving?.id && (s.classId === c.id || (s.dateKey === c.dateKey && s.startMin < c.endMin && s.endMin > c.startMin))),
  )
}

/** Why a request can't take a step: it isn't open anymore, or isn't waiting on whoever tried. */
export function closedMessage(status: ClassRequestStatus, who: 'family' | 'office'): string {
  if (status === 'withdrawn') return who === 'office' ? 'The family withdrew this request.' : 'This request was withdrawn.'
  if (status === 'approved' || status === 'rejected') return who === 'office' ? 'This request has already been answered.' : 'The academy has already answered this request.'
  if (status === 'pending' && who === 'family') return 'This request is waiting for the academy, not for an answer from you.'
  return 'This request can’t be changed now.'
}

type OpenRequestDoc = Pick<ClassRequest, 'status' | 'kind' | 'classId' | 'forSessionId' | 'offer'>
type CheckData = { target: RequestClass | null; seats: readonly RequestSeat[]; pending: readonly OpenRequest[]; nowMs: number; today: DateKey; settings: Pick<BranchSettings, 'schedule'> }

/**
 * Whether the office may suggest `target` instead (the request is open, waiting on either side): a class the family
 * could ask for themselves (`requestCheck`), other than the one asked for. `pending` are the student's other open
 * requests.
 */
export function offerCheck(r: OpenRequestDoc, data: CheckData): RequestCheck {
  if (!isOpenRequest(r)) return { ok: false, message: closedMessage(r.status, 'office') }
  if (data.target?.id === r.classId) return { ok: false, message: 'That’s the class they asked for: approve it instead.' }
  const check = requestCheck({ ...data, draft: { kind: r.kind, classId: data.target?.id ?? '', forSessionId: r.forSessionId } })
  return check.ok ? check : { ok: false, message: check.message === FULL ? 'That class is full now. Choose another one.' : check.message }
}

/**
 * Whether the family may ask for `target` instead of the class suggested: the request waits on them, `target` isn't the
 * suggestion (that's accepting it), and they could ask for it anyway (`requestCheck`).
 */
export function anotherCheck(r: OpenRequestDoc, data: CheckData): RequestCheck {
  if (r.status !== 'offered') return { ok: false, message: closedMessage(r.status, 'family') }
  if (data.target && data.target.id === r.offer?.classId) return { ok: false, message: 'That’s the class the academy suggested: accept it instead.' }
  return requestCheck({ ...data, draft: { kind: r.kind, classId: data.target?.id ?? '', forSessionId: r.forSessionId } })
}

/**
 * Whether the family may accept the class suggested, now (the server runs it in the transaction that books the seat):
 * the request still waits on them with the suggestion they saw (`seen`, the class they answered; the office may have
 * changed it since), and the class is still one they could ask for, with a seat open.
 */
export function acceptCheck(r: OpenRequestDoc, seen: string | null, data: CheckData): RequestCheck {
  if (r.status !== 'offered' || !r.offer) return { ok: false, message: closedMessage(r.status, 'family') }
  if (seen && seen !== r.offer.classId) return { ok: false, message: 'The academy has changed its suggestion. Check it, then answer again.' }
  const t = data.target
  if (!t || t.id !== r.offer.classId || t.isDeleted || t.startMs <= data.nowMs) {
    return { ok: false, message: 'The class suggested has started or is no longer on the schedule. Ask for another time.' }
  }
  if (t.taken >= t.seats) return { ok: false, message: 'The class suggested has filled up since. Ask for another time, or wait for the academy to suggest one.' }
  return requestCheck({ ...data, draft: { kind: r.kind, classId: t.id, forSessionId: r.forSessionId } })
}

/** "Thu, Nov 5, 5:00 PM – 6:00 PM": a class's day and time. */
export function classWhen(c: Pick<ClassRequest, 'dateKey' | 'startMin' | 'endMin'>): string {
  return `${formatDateKey(c.dateKey, 'weekdayMedium')}, ${formatTimeRange(c.startMin, c.endMin)}`
}

/** "Makeup for Oct 13 · Tue, Nov 3, 4:30–6:00 PM", "Extra class · …": a request in one line. */
export function requestLine(r: Pick<ClassRequest, 'kind' | 'dateKey' | 'startMin' | 'endMin' | 'forDateKey'>): string {
  const what =
    r.kind === 'makeup' && r.forDateKey
      ? `Makeup for ${formatDateKey(r.forDateKey, 'monthDay')}`
      : r.kind === 'reschedule' && r.forDateKey
        ? `Moved from ${formatDateKey(r.forDateKey, 'monthDay')}`
        : REQUEST_KIND_LABELS[r.kind]
  return `${what} · ${classWhen(r)}`
}

/** The suggestion in a sentence: "The academy suggests Thu, Nov 5, 5:00 PM – 6:00 PM." (the office: who suggested it). */
export function offerText(offer: Pick<ClassOffer, 'dateKey' | 'startMin' | 'endMin' | 'by'>, viewer: 'family' | 'office', me?: string | null): string {
  if (viewer === 'family') return `The academy suggests ${classWhen(offer)}.`
  return `${me && offer.by.email === me ? 'You' : offer.by.name || 'The office'} suggested ${classWhen(offer)}.`
}

/**
 * One step of the back and forth in a sentence, for the family (the academy's people are "The academy"; `me`, the
 * reader's email, is "You") or the office (everyone by name): "You asked for Tue, Nov 3, 5:00 PM – 6:00 PM.", "The
 * academy suggested Thu, Nov 5, …", "Jiyeon Hwang accepted Thu, Nov 5, …", "Paige Sutton declined it." Its note is
 * shown apart, in quotes.
 */
export function requestStepText(step: ClassRequestStep, viewer: 'family' | 'office', me?: string | null): string {
  if (step.by.role === 'system') return step.action === 'rejected' ? 'Closed: the class passed without an answer.' : `${REQUEST_ACTION_LABELS[step.action]}.`
  const office = step.by.role === 'owner' || step.by.role === 'admin'
  const who = me && step.by.email === me ? 'You' : viewer === 'family' && office ? 'The academy' : step.by.name || step.by.email || (office ? 'The office' : 'The family')
  const when = step.dateKey && step.startMin !== undefined && step.endMin !== undefined ? classWhen({ dateKey: step.dateKey, startMin: step.startMin, endMin: step.endMin }) : null
  switch (step.action) {
    case 'asked':
      return when ? `${who} asked for ${when}.` : `${who} asked.`
    case 'offered':
      return when ? `${who} suggested ${when}.` : `${who} suggested another time.`
    case 'accepted':
      return when ? `${who} accepted ${when}.` : `${who} accepted the suggestion.`
    case 'asked_again':
      return when ? `${who} asked for ${when} instead.` : `${who} asked for another time.`
    case 'approved':
      return when ? `${who} approved ${when}.` : `${who} approved it.`
    case 'rejected':
      return `${who} declined it.`
    case 'withdrawn':
      return `${who} withdrew it.`
  }
}
