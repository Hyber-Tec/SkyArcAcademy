import { describe, expect, it } from 'vitest'
import { resolveSettings } from '../settings/resolve'
import { decidedNotice, familyBookedNotice, familyCanceledNotice, familyClassNotice, requestedNotice, scoreAddedNotice } from './familyNotices'
import { cancelRuleText, familyCancelCheck, isRequestable, requestCheck, requestLine, seatLabelFor } from './requests'

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
  })
})
