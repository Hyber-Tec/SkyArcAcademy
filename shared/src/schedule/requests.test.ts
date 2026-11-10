import { describe, expect, it } from 'vitest'
import { noticeKeyOf } from '../notices'
import { requestNoticeId } from '../push'
import { resolveSettings } from '../settings/resolve'
import type { TimestampLike } from '../types'
import { acceptedNotice, askedAgainNotice, decidedNotice, familyBookedNotice, familyCanceledNotice, familyClassNotice, offeredNotice, requestedNotice, scoreAddedNotice } from './familyNotices'
import {
  type ClassRequest,
  type ClassRequestStep,
  REQUEST_HISTORY_MAX,
  acceptCheck,
  anotherCheck,
  cancelRuleText,
  classChoices,
  familyCancelCheck,
  isOpenRequest,
  isRequestable,
  isStaleRequest,
  offerCheck,
  offerText,
  requestCheck,
  requestHistory,
  requestLine,
  requestStep,
  requestStepText,
  requestWaitingOn,
  seatLabelFor,
  withStep,
} from './requests'

const HOUR = 3_600_000
const now = Date.UTC(2026, 10, 2, 15) // Mon, Nov 2, 2026, 10 AM in New York
const today = '2026-11-02'
const settings = resolveSettings({})

describe('families cancel until the class is confirmed', () => {
  it('allows an upcoming class until 24 hours before it, then says why not', () => {
    expect(familyCancelCheck({ status: 'pending', isDeleted: false, startMs: now + 30 * HOUR }, now, settings)).toEqual({ ok: true })
    expect(familyCancelCheck({ status: 'confirmed', isDeleted: false, startMs: now + 25 * HOUR }, now, settings)).toEqual({ ok: true })
    const late = familyCancelCheck({ status: 'confirmed', isDeleted: false, startMs: now + 23 * HOUR }, now, settings)
    expect(late).toEqual({ ok: false, reason: 'too_late', message: 'Classes can be canceled up to 24 hours before they start.' })
    expect(familyCancelCheck({ status: 'canceled', isDeleted: false, startMs: now + 48 * HOUR }, now, settings).ok).toBe(false)
    expect(familyCancelCheck({ status: 'pending', isDeleted: false, startMs: now - HOUR }, now, settings).ok).toBe(false)
    expect(familyCancelCheck({ status: 'pending', isDeleted: true, startMs: now + 48 * HOUR }, now, settings).ok).toBe(false)
  })

  it('follows the confirmation setting', () => {
    const two = resolveSettings({ schedule: { autoConfirm: { enabled: true, hoursBefore: 48 } } })
    expect(familyCancelCheck({ status: 'pending', isDeleted: false, startMs: now + 30 * HOUR }, now, two).ok).toBe(false)
    expect(cancelRuleText(two)).toBe('Classes can be canceled up to 2 days before they start.')
    expect(cancelRuleText(resolveSettings({ schedule: { autoConfirm: { enabled: true, hoursBefore: 12 } } }))).toBe('Classes can be canceled up to 12 hours before they start.')
  })
})

describe('families ask for an open seat', () => {
  const target = { id: 'tue', dateKey: '2026-11-03', startMin: 990, endMin: 1080, seats: 6, taken: 4, isDeleted: false, startMs: now + 30 * HOUR }
  const seat = (id: string, extra: Record<string, unknown> = {}) => ({
    id,
    classId: `class-${id}`,
    studentId: 'avery',
    dateKey: '2026-10-26',
    startMin: 990,
    endMin: 1080,
    status: 'canceled' as const,
    note: '',
    isDeleted: false,
    startMs: now - 7 * 24 * HOUR,
    ...extra,
  })
  const check = (draft: { kind: 'makeup' | 'reschedule' | 'extra'; forSessionId: string | null }, seats = [seat('missed')], pending: { classId: string; forSessionId: string | null }[] = [], t: typeof target | null = target) =>
    requestCheck({ draft: { ...draft, classId: 'tue' }, target: t, seats, pending, nowMs: now, today, settings })

  it('books a makeup for a class still owed, a no-show included', () => {
    expect(check({ kind: 'makeup', forSessionId: 'missed' })).toMatchObject({ ok: true, forSession: { id: 'missed' } })
    expect(check({ kind: 'makeup', forSessionId: 'missed' }, [seat('missed', { status: 'no_show' })]).ok).toBe(true)
    // Already made up, or a makeup missed itself: nothing owed.
    expect(check({ kind: 'makeup', forSessionId: 'missed' }, [seat('missed'), seat('mu', { dateKey: '2026-10-29', status: 'confirmed', note: 'MU for 10/26' })])).toEqual({ ok: false, message: 'That class has no makeup owed.' })
    expect(check({ kind: 'makeup', forSessionId: 'mu' }, [seat('mu', { status: 'no_show', note: 'MU for 10/19' })]).ok).toBe(false)
  })

  it('moves an upcoming class, even inside the cancel window, to another time', () => {
    const soon = seat('soon', { dateKey: today, status: 'confirmed', startMs: now + 6 * HOUR })
    expect(check({ kind: 'reschedule', forSessionId: 'soon' }, [soon]).ok).toBe(true)
    expect(check({ kind: 'reschedule', forSessionId: 'missed' }).ok).toBe(false)
  })

  it('asks for an extra class without one to replace', () => {
    expect(check({ kind: 'extra', forSessionId: null }, [])).toEqual({ ok: true, forSession: null })
    expect(check({ kind: 'extra', forSessionId: 'missed' }).ok).toBe(false)
  })

  it('refuses a full or past class, a class already in or at the same time, and asking twice', () => {
    expect(check({ kind: 'extra', forSessionId: null }, [], [], { ...target, taken: 6 })).toEqual({ ok: false, message: 'That class is full now. Choose another time.' })
    expect(check({ kind: 'extra', forSessionId: null }, [], [], { ...target, startMs: now - HOUR }).ok).toBe(false)
    expect(check({ kind: 'extra', forSessionId: null }, [], [], { ...target, dateKey: '2026-12-01' }).ok).toBe(false)
    expect(check({ kind: 'extra', forSessionId: null }, [seat('in', { classId: 'tue', status: 'pending' })])).toEqual({ ok: false, message: 'Already in that class.' })
    expect(check({ kind: 'extra', forSessionId: null }, [seat('clash', { dateKey: '2026-11-03', startMin: 1020, endMin: 1110, status: 'pending' })])).toEqual({ ok: false, message: 'Already in another class at that time.' })
    expect(check({ kind: 'extra', forSessionId: null }, [], [{ classId: 'tue', forSessionId: null }])).toEqual({ ok: false, message: 'That class is already asked for.' })
    expect(check({ kind: 'makeup', forSessionId: 'missed' }, [seat('missed')], [{ classId: 'wed', forSessionId: 'missed' }]).ok).toBe(false)
  })

  it('shows only classes ahead with seats left, within the horizon', () => {
    expect(isRequestable(target, now, '2026-11-16')).toBe(true)
    expect(isRequestable({ ...target, taken: 6 }, now, '2026-11-16')).toBe(false)
    expect(isRequestable({ ...target, isDeleted: true }, now, '2026-11-16')).toBe(false)
    expect(isRequestable(target, now, '2026-11-02')).toBe(false)
  })

  it('labels the seat in the sheets’ words, and the request in one line', () => {
    expect(seatLabelFor('makeup', '2026-10-26')).toBe('MU for 10/26')
    expect(seatLabelFor('reschedule', '2026-11-02')).toBe('MU for 11/2')
    expect(seatLabelFor('extra', null)).toBe('Practice')
    expect(requestLine({ kind: 'makeup', dateKey: '2026-11-03', startMin: 990, endMin: 1080, forDateKey: '2026-10-26' })).toBe('Makeup for Oct 26 · Tue, Nov 3, 4:30 PM – 6:00 PM')
  })
})

describe('what families and the office are told', () => {
  const snap = (extra: Record<string, unknown> = {}) => ({
    coachId: null,
    studentName: 'Avery Stone',
    status: 'confirmed',
    dateKey: '2026-11-03',
    startMin: 990,
    endMin: 1080,
    startMs: now + 30 * HOUR,
    isDeleted: false,
    note: '',
    ...extra,
  })

  it('tells a family when the academy cancels, moves or marks a class missed', () => {
    expect(familyClassNotice(snap(), snap({ status: 'canceled' }), now)).toMatchObject({ type: 'session_canceled', body: 'Avery’s class on Tue, Nov 3 at 4:30 PM is canceled. A makeup can be asked for in Classes.' })
    expect(familyClassNotice(snap(), snap({ dateKey: '2026-11-04' }), now)?.title).toBe('Class moved')
    expect(familyClassNotice(snap(), snap({ startMin: 1020, endMin: 1110 }), now)?.type).toBe('session_time_changed')
    expect(familyClassNotice(snap({ startMs: now - HOUR }), snap({ startMs: now - HOUR, status: 'no_show' }), now)?.title).toBe('Class missed')
    expect(familyClassNotice(snap({ note: 'MU for 10/26', startMs: now - HOUR }), snap({ note: 'MU for 10/26', startMs: now - HOUR, status: 'no_show' }), now)?.body).toContain('It counts as used.')
    // Nothing for a class already past, attendance marks or no change.
    expect(familyClassNotice(snap({ startMs: now - HOUR }), snap({ startMs: now - HOUR, status: 'canceled' }), now)).toBeNull()
    expect(familyClassNotice(snap(), snap({ status: 'present' }), now)).toBeNull()
    expect(familyClassNotice(snap(), snap(), now)).toBeNull()
  })

  it('tells a family of a makeup or extra class the office booked, not of a regular week', () => {
    expect(familyBookedNotice(snap({ note: 'MU for 10/26' }), now)?.title).toBe('Makeup booked')
    expect(familyBookedNotice(snap({ note: 'Practice' }), now)?.title).toBe('Extra class booked')
    expect(familyBookedNotice(snap(), now)).toBeNull()
  })

  it('tells the office who canceled or asked, and the family the answer', () => {
    expect(familyCanceledNotice({ studentName: 'Avery Stone', dateKey: '2026-11-03', startMin: 990 }, { name: 'Jordan Stone', role: 'parent' }).body).toBe(
      'Avery Stone’s class on Tue, Nov 3 at 4:30 PM was canceled by their parent (Jordan Stone).',
    )
    const r = { kind: 'makeup' as const, studentName: 'Avery Stone', dateKey: '2026-11-03', startMin: 990, endMin: 1080, forDateKey: '2026-10-26', requestedBy: { email: 'j@x.test', name: 'Jordan Stone', role: 'parent' as const }, decisionNote: '' }
    expect(requestedNotice(r).body).toBe('Jordan Stone (for Avery) asks for a makeup for Oct 26: Tue, Nov 3, 4:30 PM – 6:00 PM.')
    expect(decidedNotice(r, true).body).toBe('Avery’s makeup is booked: Tue, Nov 3, 4:30 PM – 6:00 PM.')
    expect(decidedNotice({ ...r, decisionNote: 'That class is for Precision.' }, false).body).toBe(
      'Avery’s request for Tue, Nov 3 at 4:30 PM wasn’t approved. “That class is for Precision.” Another time can be asked for in Classes.',
    )
  })

  it('tells a family of a new score', () => {
    expect(scoreAddedNotice({ studentName: 'Avery Stone', position: 'standing', total: 186.84, shots: 20, source: 'sius' }).body).toBe('Avery: Standing, 186.8 over 20 shots.')
    expect(scoreAddedNotice({ studentName: 'Avery Stone', position: 'prone', total: 76, wholeTotal: 76, shots: 10, source: 'paper' }).body).toBe('Avery: Prone, 76 over 10 shots.')
    const comp = scoreAddedNotice({ studentName: 'Avery Stone', position: 'standing', total: 178, wholeTotal: 178, shots: 20, source: 'sheet', innerTens: 4, kind: 'competition', match: { name: 'Lakeside Fall 3P' } })
    expect(comp).toMatchObject({ title: 'New competition result', body: 'Avery: Lakeside Fall 3P, Standing, 178-4 over 20 shots.' })
  })
})

const stamp = (ms: number): TimestampLike => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0, toDate: () => new Date(ms), toMillis: () => ms })

describe('the office suggests another class, the family answers', () => {
  const cls = (id: string, extra: Record<string, unknown> = {}) => ({ id, dateKey: '2026-11-05', startMin: 1020, endMin: 1080, seats: 6, taken: 4, isDeleted: false, startMs: now + 3 * 24 * HOUR, ...extra })
  const missed = { id: 'missed', classId: 'old', studentId: 'avery', dateKey: '2026-10-26', startMin: 990, endMin: 1080, status: 'canceled' as const, note: '', isDeleted: false, startMs: now - 7 * 24 * HOUR }
  const asked = { status: 'pending' as const, kind: 'makeup' as const, classId: 'tue', forSessionId: 'missed', offer: null }
  const offer = { classId: 'thu', dateKey: '2026-11-05', startMin: 1020, endMin: 1080, startAt: stamp(now + 3 * 24 * HOUR), note: 'Tuesday is full.', by: { email: 'paige@x.test', name: 'Paige Sutton' }, at: stamp(now) }
  const offered = { ...asked, status: 'offered' as const, offer }
  const facts = (target: ReturnType<typeof cls> | null, extra: Record<string, unknown> = {}) => ({ target, seats: [missed], pending: [], nowMs: now, today, settings, ...extra })

  it('lets the office suggest a class the family could ask for, other than the one asked for', () => {
    expect(offerCheck(asked, facts(cls('thu')))).toMatchObject({ ok: true, forSession: { id: 'missed' } })
    // Changing the suggestion while the family hasn't answered.
    expect(offerCheck(offered, facts(cls('fri'))).ok).toBe(true)
    expect(offerCheck(asked, facts(cls('tue')))).toEqual({ ok: false, message: 'That’s the class they asked for: approve it instead.' })
    expect(offerCheck(asked, facts(cls('thu', { taken: 6 })))).toEqual({ ok: false, message: 'That class is full now. Choose another one.' })
    expect(offerCheck(asked, facts(cls('thu', { startMs: now - HOUR }))).ok).toBe(false)
    expect(offerCheck(asked, facts(cls('thu', { dateKey: '2026-12-01' }))).ok).toBe(false)
    expect(offerCheck(asked, facts(cls('thu'), { seats: [missed, { ...missed, id: 'in', classId: 'thu', dateKey: '2026-11-05', status: 'pending' }] }))).toEqual({ ok: false, message: 'Already in that class.' })
    expect(offerCheck({ ...asked, status: 'withdrawn' }, facts(cls('thu')))).toEqual({ ok: false, message: 'The family withdrew this request.' })
    expect(offerCheck({ ...asked, status: 'approved' }, facts(cls('thu')))).toEqual({ ok: false, message: 'This request has already been answered.' })
  })

  it('books the class suggested only while it still has a seat, as the family saw it', () => {
    expect(acceptCheck(offered, 'thu', facts(cls('thu')))).toMatchObject({ ok: true, forSession: { id: 'missed' } })
    expect(acceptCheck(offered, null, facts(cls('thu'))).ok).toBe(true)
    // Another family took the last seat first; the office changed its suggestion; the class started.
    expect(acceptCheck(offered, 'thu', facts(cls('thu', { taken: 6 })))).toEqual({
      ok: false,
      message: 'The class suggested has filled up since. Ask for another time, or wait for the academy to suggest one.',
    })
    expect(acceptCheck(offered, 'wed', facts(cls('thu')))).toEqual({ ok: false, message: 'The academy has changed its suggestion. Check it, then answer again.' })
    expect(acceptCheck(offered, 'thu', facts(cls('thu', { startMs: now - HOUR }))).ok).toBe(false)
    expect(acceptCheck(offered, 'thu', facts(cls('thu', { isDeleted: true }))).ok).toBe(false)
    // A makeup booked for the missed class meanwhile: nothing is owed anymore.
    const madeUp = { ...missed, id: 'mu', classId: 'sat', dateKey: '2026-11-01', status: 'confirmed' as const, note: 'MU for 10/26' }
    expect(acceptCheck(offered, 'thu', facts(cls('thu'), { seats: [missed, madeUp] }))).toEqual({ ok: false, message: 'That class has no makeup owed.' })
    // Only a request waiting on the family can be answered.
    expect(acceptCheck(asked, 'thu', facts(cls('thu')))).toEqual({ ok: false, message: 'This request is waiting for the academy, not for an answer from you.' })
    expect(acceptCheck({ ...offered, status: 'withdrawn' }, 'thu', facts(cls('thu'))).ok).toBe(false)
  })

  it('lets the family ask for another class instead, back to the office', () => {
    expect(anotherCheck(offered, facts(cls('fri'))).ok).toBe(true)
    // Asking again for the class first asked for is fine, once it has room.
    expect(anotherCheck(offered, facts(cls('tue'))).ok).toBe(true)
    expect(anotherCheck(offered, facts(cls('thu')))).toEqual({ ok: false, message: 'That’s the class the academy suggested: accept it instead.' })
    expect(anotherCheck(offered, facts(cls('fri', { taken: 6 }))).ok).toBe(false)
    expect(anotherCheck(offered, facts(cls('fri'), { pending: [{ classId: 'fri', forSessionId: null }] }))).toEqual({ ok: false, message: 'That class is already asked for.' })
    expect(anotherCheck(asked, facts(cls('fri'))).ok).toBe(false)
  })

  it('lists the classes to pick from: open, ahead, within reach, not taken or asked for', () => {
    const list = [
      cls('open'),
      cls('full', { taken: 6 }),
      cls('past', { startMs: now - HOUR }),
      cls('far', { dateKey: '2026-12-01' }),
      cls('mine', { dateKey: '2026-11-04' }),
      cls('clash', { dateKey: '2026-11-04', startMin: 1050, endMin: 1110 }),
      cls('asked'),
      cls('skip'),
      cls('moving', { dateKey: '2026-11-06' }),
      cls('same-time-as-moved', { dateKey: '2026-11-06', startMin: 1030 }),
    ]
    const mine = { ...missed, id: 'm1', classId: 'mine', dateKey: '2026-11-04', startMin: 1020, endMin: 1080, status: 'pending' as const, startMs: now + 2 * 24 * HOUR }
    const move = { ...missed, id: 'mv', classId: 'moving', dateKey: '2026-11-06', startMin: 1020, endMin: 1080, status: 'pending' as const, startMs: now + 4 * 24 * HOUR }
    const opts = { seats: [missed, mine, move], pending: [{ classId: 'asked', forSessionId: null }], nowMs: now, horizon: '2026-11-16', exclude: ['skip'] }
    expect(classChoices(list, { ...opts, forSessionId: null }).map((c) => c.id)).toEqual(['open'])
    // Moving a class: its own class stays out, but its time is free.
    expect(classChoices(list, { ...opts, forSessionId: 'mv' }).map((c) => c.id)).toEqual(['open', 'same-time-as-moved'])
  })

  it('says who a request waits on, and closes it once the class it waits on has started', () => {
    expect([isOpenRequest({ status: 'pending' }), isOpenRequest({ status: 'offered' }), isOpenRequest({ status: 'approved' })]).toEqual([true, true, false])
    expect([requestWaitingOn({ status: 'pending' }), requestWaitingOn({ status: 'offered' }), requestWaitingOn({ status: 'rejected' })]).toEqual(['office', 'family', null])
    const r = { status: 'pending' as const, classId: 'tue', dateKey: '2026-11-03', startMin: 990, endMin: 1080, startAt: stamp(now - HOUR), offer: null }
    expect(isStaleRequest(r, now)).toBe(true)
    expect(isStaleRequest({ ...r, startAt: stamp(now + HOUR) }, now)).toBe(false)
    // Waiting on the family: the class suggested is what counts.
    expect(isStaleRequest({ ...r, status: 'offered', offer }, now)).toBe(false)
    expect(isStaleRequest({ ...r, status: 'offered', startAt: stamp(now + HOUR), offer: { ...offer, startAt: stamp(now - HOUR) } }, now)).toBe(true)
    expect(isStaleRequest({ ...r, status: 'approved' }, now)).toBe(false)
  })

  it('keeps the back and forth: steps without empty fields, the ask and the latest ones', () => {
    const by = { email: 'j@x.test', name: 'Jordan Stone', role: 'parent' as const }
    const at = stamp(now)
    expect(requestStep('withdrawn', at, by)).toEqual({ action: 'withdrawn', at, by })
    const step = requestStep('asked', stamp(now), by, { classId: 'tue', dateKey: '2026-11-03', startMin: 990, endMin: 1080 }, '  After school  ')
    expect(step).toMatchObject({ classId: 'tue', dateKey: '2026-11-03', startMin: 990, endMin: 1080, note: 'After school' })
    expect(Object.keys(requestStep('rejected', stamp(now), by, null, ''))).toEqual(['action', 'at', 'by'])
    expect(requestHistory({})).toEqual([])
    let h: ClassRequestStep[] = []
    for (let i = 0; i < REQUEST_HISTORY_MAX + 5; i++) h = withStep(h, requestStep(i === 0 ? 'asked' : i % 2 ? 'offered' : 'asked_again', stamp(now + i), by))
    expect(h).toHaveLength(REQUEST_HISTORY_MAX)
    expect(h[0].action).toBe('asked')
    expect(h.at(-1)!.at.toMillis()).toBe(now + REQUEST_HISTORY_MAX + 4)
    expect(h[1].at.toMillis()).toBe(now + 6)
  })

  it('tells each step in a sentence, for the family and for the office', () => {
    const parent = { email: 'j@x.test', name: 'Jordan Stone', role: 'parent' as const }
    const admin = { email: 'paige@x.test', name: 'Paige Sutton', role: 'admin' as const }
    const tue = { classId: 'tue', dateKey: '2026-11-03', startMin: 990, endMin: 1080 }
    const thu = { classId: 'thu', dateKey: '2026-11-05', startMin: 1020, endMin: 1080 }
    expect(requestStepText(requestStep('asked', stamp(now), parent, tue), 'family', 'j@x.test')).toBe('You asked for Tue, Nov 3, 4:30 PM – 6:00 PM.')
    expect(requestStepText(requestStep('asked', stamp(now), parent, tue), 'office')).toBe('Jordan Stone asked for Tue, Nov 3, 4:30 PM – 6:00 PM.')
    expect(requestStepText(requestStep('offered', stamp(now), admin, thu, 'Tuesday is full.'), 'family', 'j@x.test')).toBe('The academy suggested Thu, Nov 5, 5:00 PM – 6:00 PM.')
    expect(requestStepText(requestStep('offered', stamp(now), admin, thu), 'office', 'paige@x.test')).toBe('You suggested Thu, Nov 5, 5:00 PM – 6:00 PM.')
    expect(requestStepText(requestStep('asked_again', stamp(now), parent, tue), 'office')).toBe('Jordan Stone asked for Tue, Nov 3, 4:30 PM – 6:00 PM instead.')
    expect(requestStepText(requestStep('accepted', stamp(now), parent, thu), 'office')).toBe('Jordan Stone accepted Thu, Nov 5, 5:00 PM – 6:00 PM.')
    expect(requestStepText(requestStep('rejected', stamp(now), admin), 'family')).toBe('The academy declined it.')
    expect(requestStepText(requestStep('withdrawn', stamp(now), parent), 'office')).toBe('Jordan Stone withdrew it.')
    expect(requestStepText(requestStep('rejected', stamp(now), { email: 'system', name: '', role: 'system' }), 'office')).toBe('Closed: the class passed without an answer.')
    expect(offerText(offer, 'family')).toBe('The academy suggests Thu, Nov 5, 5:00 PM – 6:00 PM.')
    expect(offerText(offer, 'office')).toBe('Paige Sutton suggested Thu, Nov 5, 5:00 PM – 6:00 PM.')
  })

  it('tells the family of the suggestion, and the office of their answer', () => {
    const r: Pick<ClassRequest, 'kind' | 'studentName' | 'dateKey' | 'startMin' | 'endMin' | 'forDateKey'> = { kind: 'makeup', studentName: 'Avery Stone', dateKey: '2026-11-03', startMin: 990, endMin: 1080, forDateKey: '2026-10-26' }
    expect(offeredNotice(r, offer)).toEqual({
      type: 'request_offered',
      title: 'Another time suggested',
      body: 'For Avery’s makeup for Oct 26, the academy suggests Thu, Nov 5, 5:00 PM – 6:00 PM instead of Tue, Nov 3 at 4:30 PM. “Tuesday is full.” Accept it or ask for another time in Classes.',
    })
    expect(offeredNotice({ ...r, kind: 'reschedule', forDateKey: '2026-11-02' }, { ...offer, note: '' }).body).toBe(
      'For moving Avery’s class on Nov 2, the academy suggests Thu, Nov 5, 5:00 PM – 6:00 PM instead of Tue, Nov 3 at 4:30 PM. Accept it or ask for another time in Classes.',
    )
    expect(acceptedNotice(r, { name: 'Jordan Stone', role: 'parent' }, offer, 'MU for 10/26')).toEqual({
      type: 'request_accepted',
      title: 'Suggestion accepted',
      body: 'Jordan Stone (for Avery) accepted Thu, Nov 5, 5:00 PM – 6:00 PM: Avery Stone is booked (MU for 10/26).',
    })
    expect(askedAgainNotice(r, { name: 'Avery Stone', role: 'student' }, { dateKey: '2026-11-06', startMin: 1020, endMin: 1080 }, 'Friday works better.')).toEqual({
      type: 'request_asked_again',
      title: 'Asked again: Makeup',
      body: 'Avery Stone asks for Fri, Nov 6, 5:00 PM – 6:00 PM instead of the time suggested. “Friday works better.”',
    })
    // Each follows the person's switch for requests, and the office's open the request itself.
    for (const t of ['request_offered', 'request_accepted', 'request_asked_again', 'class_requested', 'request_approved'] as const) expect(noticeKeyOf(t)).toBe('requests')
    expect(requestNoticeId({ type: 'request_accepted', link: 'admin/schedule?date=2026-11-05&request=r1', refs: {} })).toBe('r1')
    expect(requestNoticeId({ type: 'request_asked_again', link: 'admin/schedule?date=2026-11-06', refs: { requestId: 'r2' } })).toBe('r2')
    expect(requestNoticeId({ type: 'request_offered', link: 'parent/classes?date=2026-11-05', refs: { requestId: 'r3' } })).toBeNull()
  })
})
