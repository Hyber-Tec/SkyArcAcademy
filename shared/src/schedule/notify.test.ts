import { describe, expect, it } from 'vitest'
import { type SessionSnapshot, sessionChangeNotices, sessionCreatedNotices } from './notify'

const NOW = Date.parse('2026-09-30T16:00:00Z') // noon in New York
const ctx = { now: NOW, today: '2026-09-30', windowHours: 24 }
const s = (extra: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  coachId: 'maya',
  studentName: 'Ava Patel',
  status: 'confirmed',
  dateKey: '2026-09-30',
  startMin: 960,
  endMin: 1070,
  startMs: Date.parse('2026-09-30T20:00:00Z'),
  isDeleted: false,
  ...extra,
})
// 10:00 AM tomorrow is 22 hours away (inside the 24-hour window).
const tomorrow = { dateKey: '2026-10-01', startMin: 600, endMin: 710, startMs: Date.parse('2026-10-01T14:00:00Z') }
const nextWeek = { dateKey: '2026-10-07', startMs: Date.parse('2026-10-07T20:00:00Z') }
// A seat in a class taught together: no coach of its own; the coaches in at its time teach it.
const seat = (extra: Partial<SessionSnapshot> = {}) => s({ coachId: '', coachIds: ['pat', 'sam'], ...extra })
const to = (out: { staffId: string; type: string }[]) => out.map((n) => [n.staffId, n.type])

describe('class notifications', () => {
  it('confirms new classes inside the window only', () => {
    expect(sessionCreatedNotices(s({ status: 'pending' }), ctx)[0]).toMatchObject({
      type: 'session_created',
      body: 'Ava Patel on today at 4:00 PM – 5:50 PM has been confirmed.',
    })
    expect(sessionCreatedNotices(s(tomorrow), ctx)[0].body).toBe('Ava Patel on Thu, 10/1 at 10:00 AM – 11:50 AM has been confirmed.')
    expect(sessionCreatedNotices(s(nextWeek), ctx)).toEqual([])
    expect(sessionCreatedNotices(s({ status: 'canceled' }), ctx)).toEqual([])
  })

  it('alerts cancellations of confirmed classes and their corrections', () => {
    expect(sessionChangeNotices(s(), s({ status: 'canceled' }), ctx)[0]).toMatchObject({ type: 'session_canceled', body: 'Ava Patel’s 4:00 PM class today is canceled.' })
    expect(sessionChangeNotices(s({ status: 'pending' }), s({ status: 'canceled' }), ctx)).toEqual([])
    expect(sessionChangeNotices(s({ status: 'canceled', ...tomorrow }), s({ status: 'confirmed', ...tomorrow }), ctx)[0].body).toBe(
      'Correction: Ava Patel on Thu, 10/1 is NOT canceled. Status: Confirmed.',
    )
  })

  it('notifies both coaches on reassignment and nothing else', () => {
    const out = sessionChangeNotices(s(), s({ coachId: 'daniel', startMin: 1000 }), ctx)
    expect(out.map((n) => [n.staffId, n.type])).toEqual([
      ['maya', 'session_reassigned_out'],
      ['daniel', 'session_reassigned_in'],
    ])
  })

  it('picks one change in order: no-show, date, time', () => {
    expect(sessionChangeNotices(s(), s({ status: 'no_show', ...tomorrow }), ctx)[0].type).toBe('session_no_show')
    expect(sessionChangeNotices(s(), s(tomorrow), ctx)[0].body).toBe(
      "Ava Patel's class moved from Wed, 9/30 to Thu, 10/1 at 10:00 AM – 11:50 AM.",
    )
    expect(sessionChangeNotices(s(), s({ startMin: 990, endMin: 1100 }), ctx)[0].body).toBe(
      "Ava Patel's class on Wed, 9/30: 4:00 PM – 5:50 PM → 4:30 PM – 6:20 PM.",
    )
  })

  it('stays quiet for tentative, silent or far-away changes', () => {
    expect(sessionChangeNotices(s({ status: 'pending' }), s({ status: 'pending', startMin: 1000 }), ctx)).toEqual([])
    expect(sessionChangeNotices(s({ status: 'pending' }), s(), ctx)).toEqual([])
    expect(sessionChangeNotices(s(), s({ status: 'present' }), ctx)).toEqual([])
    expect(sessionChangeNotices(s(nextWeek), s({ ...nextWeek, startMin: 1000 }), ctx)).toEqual([])
  })

  it('tells the coach when a confirmed class is trashed or restored', () => {
    expect(sessionChangeNotices(s(), s({ isDeleted: true }), ctx)[0].type).toBe('session_deleted')
    expect(sessionChangeNotices(s({ isDeleted: true }), s(), ctx)[0]).toMatchObject({
      type: 'session_restored',
      body: 'Ava Patel on today at 4:00 PM – 5:50 PM is back on the schedule.',
    })
    expect(sessionChangeNotices(s({ status: 'pending' }), s({ status: 'pending', isDeleted: true }), ctx)).toEqual([])
  })
})

describe('notifications about a seat in a class taught together', () => {
  it('confirms a new seat to every coach in at its time, and to nobody when no one is in', () => {
    expect(to(sessionCreatedNotices(seat({ status: 'pending' }), ctx))).toEqual([
      ['pat', 'session_created'],
      ['sam', 'session_created'],
    ])
    expect(sessionCreatedNotices(seat({ coachIds: [] }), ctx)).toEqual([])
    expect(sessionCreatedNotices(seat({ coachIds: undefined }), ctx)).toEqual([])
    expect(sessionCreatedNotices(seat(nextWeek), ctx)).toEqual([])
  })

  it('tells every coach in when a student cancels, doesn’t show or is taken out', () => {
    expect(to(sessionChangeNotices(seat(), seat({ status: 'canceled' }), ctx))).toEqual([
      ['pat', 'session_canceled'],
      ['sam', 'session_canceled'],
    ])
    expect(to(sessionChangeNotices(seat(), seat({ status: 'no_show' }), ctx))).toEqual([
      ['pat', 'session_no_show'],
      ['sam', 'session_no_show'],
    ])
    expect(to(sessionChangeNotices(seat(), seat({ isDeleted: true }), ctx))).toEqual([
      ['pat', 'session_deleted'],
      ['sam', 'session_deleted'],
    ])
  })

  it('tells the coaches at both times of a move, once each, when their time is inside the window', () => {
    const out = sessionChangeNotices(seat(), seat({ ...tomorrow, coachIds: ['sam', 'lee'] }), ctx)
    expect(to(out)).toEqual([
      ['pat', 'session_date_changed'],
      ['sam', 'session_date_changed'],
      ['lee', 'session_date_changed'],
    ])
    expect(out[0].body).toBe("Ava Patel's class moved from Wed, 9/30 to Thu, 10/1 at 10:00 AM – 11:50 AM.")
    // Next week is outside the window: only today's coaches hear of it.
    expect(sessionChangeNotices(seat(), seat({ ...nextWeek, coachIds: ['lee'] }), ctx).map((n) => n.staffId)).toEqual(['pat', 'sam'])
  })

  it('has nobody to reassign: a seat joining a class or other coaches coming in notifies no one', () => {
    expect(sessionChangeNotices(seat(), seat({ coachIds: ['lee'] }), ctx)).toEqual([])
    expect(sessionChangeNotices(s(), seat(), ctx)).toEqual([])
  })
})
