import { describe, expect, it } from 'vitest'
import type { DayHours } from '../settings/defaults'
import type { AcademyClass, Session, WithId } from '../types'
import { cellsOf, classViews, coachesIn, makeupLabel, makeupsLost, makeupsOwed, openSeats, seatKind, uncovered } from './classes'
import { type ConflictSeat, seatConflicts } from './conflicts'

const open: DayHours = { isOpen: true, openMin: 16 * 60, closeMin: 21 * 60 }
const t = (h: number, m = 0) => h * 60 + m
const cls = { dateKey: '2026-11-02', startMin: t(16, 30), endMin: t(18), seats: 6 }

describe('classes taught together', () => {
  it('reads a seat’s kind from its label, in the sheets’ words', () => {
    expect(seatKind('MU for 10/13')).toBe('makeup')
    expect(seatKind('Makeup for 10/13')).toBe('makeup')
    expect(seatKind('Practice')).toBe('practice')
    expect(seatKind('Trial 1')).toBe('trial')
    expect(seatKind('Evaluation')).toBe('evaluation')
    expect(seatKind('Every other week')).toBe('regular')
    expect(seatKind(undefined)).toBe('regular')
    expect(makeupLabel('2026-11-02')).toBe('MU for 11/2')
  })

  it('counts open seats: a canceled or deleted student frees theirs', () => {
    const seats = [
      { status: 'confirmed' as const, isDeleted: false },
      { status: 'present' as const, isDeleted: false },
      { status: 'canceled' as const, isDeleted: false },
      { status: 'confirmed' as const, isDeleted: true },
    ]
    expect(openSeats(cls, seats)).toBe(4)
    expect(openSeats({ seats: 1 }, seats)).toBe(0)
  })

  it('finds the coaches in at a class’s time, and who is in for only part of it', () => {
    const day = [
      { staffId: 'pat', staffName: 'Pat Rivera', dateKey: '2026-11-02', ranges: [{ startMin: t(16), endMin: t(20) }], unavailable: false },
      { staffId: 'sam', staffName: 'Sam Okafor', dateKey: '2026-11-02', ranges: [{ startMin: t(16), endMin: t(17) }], unavailable: false },
      { staffId: 'lee', staffName: 'Lee Park', dateKey: '2026-11-02', ranges: [], unavailable: true },
      { staffId: 'max', staffName: 'Max Hale', dateKey: '2026-11-02', ranges: [{ startMin: t(18), endMin: t(21) }], unavailable: false },
      { staffId: 'office', staffName: 'Ana Ruiz', dateKey: '2026-11-02', ranges: [{ startMin: t(16), endMin: t(21) }], unavailable: false },
    ]
    const coaches = coachesIn(cls, day, open, (id) => id !== 'office')
    expect(coaches.map((c) => [c.staffId, c.partial])).toEqual([
      ['pat', false],
      ['sam', true],
    ])
    expect(coachesIn(cls, day, { isOpen: false, openMin: 0, closeMin: 0 })).toEqual([])
    expect(uncovered(cls, [{ startMin: t(16), endMin: t(17) }])).toEqual([{ startMin: t(17), endMin: t(18) }])
    expect(uncovered(cls, [{ startMin: t(17), endMin: t(17, 30) }])).toEqual([
      { startMin: t(16, 30), endMin: t(17) },
      { startMin: t(17, 30), endMin: t(18) },
    ])
  })

  it('puts each class’s students in it, in the order booked, with the coaches in', () => {
    const at = (ms: number) => ({ toMillis: () => ms })
    const c = (id: string, startMin: number, endMin: number, p: Partial<AcademyClass> = {}) => ({ id, dateKey: cls.dateKey, startMin, endMin, seats: 6, isDeleted: false, ...p }) as WithId<AcademyClass>
    const s = (id: string, classId: string, p: Partial<Session> = {}) => ({ id, classId, status: 'confirmed', isDeleted: false, visualOrder: 0, ...p }) as WithId<Session>
    const views = classViews(
      [c('late', t(18), t(19)), c('early', t(16, 30), t(18)), c('trash', t(19), t(20), { isDeleted: true })],
      [
        s('b', 'early', { visualOrder: 1 }),
        s('a', 'early', { visualOrder: 0 }),
        s('c', 'early', { visualOrder: 1, status: 'canceled', createdAt: at(2) as never }),
        s('gone', 'early', { isDeleted: true }),
        s('old', ''),
        s('x', 'trash'),
      ],
      [{ staffId: 'pat', staffName: 'Pat Rivera', dateKey: cls.dateKey, ranges: [{ startMin: t(16), endMin: t(18) }], unavailable: false }],
      () => open,
    )
    const day = views.get(cls.dateKey) ?? []
    expect(day.map((v) => v.c.id)).toEqual(['early', 'late'])
    expect(day[0].seats.map((x) => x.id)).toEqual(['a', 'b', 'c'])
    expect(day[0].taken).toBe(2)
    expect(day[0].coaches.map((k) => k.name)).toEqual(['Pat Rivera'])
    expect(day[1]).toMatchObject({ seats: [], taken: 0, coaches: [] })
  })

  it('keeps each seat in its place, a canceled one too, until the class is refilled past it', () => {
    const seat = (id: string, status: 'confirmed' | 'canceled' = 'confirmed') => ({ id, status })
    const four = [seat('a'), seat('b', 'canceled'), seat('c'), seat('d')]
    expect(cellsOf(four, 6)).toEqual({ cells: four, open: 2, overflow: [] })
    // Refilled: six coming and two canceled in six seats, so both canceled ones go below the grid.
    const full = [seat('a'), seat('x', 'canceled'), seat('b'), seat('c'), seat('y', 'canceled'), seat('d'), seat('e'), seat('f')]
    const { cells, open, overflow } = cellsOf(full, 6)
    expect(overflow.map((s) => s.id)).toEqual(['x', 'y'])
    expect(cells.map((s) => s.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(open).toBe(0)
    expect(cellsOf([seat('a'), seat('x', 'canceled'), seat('b')], 2).overflow.map((s) => s.id)).toEqual(['x'])
  })

  it('lists make-ups still owed: a canceled seat without a later "MU for" its date', () => {
    const seats = [
      { studentId: 'avery', dateKey: '2026-11-02', status: 'canceled' as const, note: '', isDeleted: false },
      { studentId: 'avery', dateKey: '2026-11-05', status: 'confirmed' as const, note: 'MU for 11/2', isDeleted: false },
      { studentId: 'blake', dateKey: '2026-11-03', status: 'canceled' as const, note: '', isDeleted: false },
      { studentId: 'casey', dateKey: '2026-11-04', status: 'canceled' as const, note: 'Trial 1', isDeleted: false },
      { studentId: 'drew', dateKey: '2026-10-01', status: 'canceled' as const, note: '', isDeleted: false },
    ]
    expect(makeupsOwed(seats, '2026-10-15').map((s) => s.studentId)).toEqual(['blake'])
  })

  it('owes a makeup for a no-show too, but missing the makeup loses it', () => {
    const seats = [
      // A no-show still gets a makeup.
      { studentId: 'avery', dateKey: '2026-11-02', status: 'no_show' as const, note: '', isDeleted: false },
      // Blake missed the makeup for 11/3: no new makeup, and 11/3 isn't owed anymore.
      { studentId: 'blake', dateKey: '2026-11-03', status: 'canceled' as const, note: '', isDeleted: false },
      { studentId: 'blake', dateKey: '2026-11-06', status: 'no_show' as const, note: 'MU for 11/3', isDeleted: false },
      // Casey canceled the makeup itself: 11/4 is owed again, the canceled makeup isn't.
      { studentId: 'casey', dateKey: '2026-11-04', status: 'canceled' as const, note: '', isDeleted: false },
      { studentId: 'casey', dateKey: '2026-11-09', status: 'canceled' as const, note: 'MU for 11/4', isDeleted: false },
      // Extra practice missed earns nothing.
      { studentId: 'drew', dateKey: '2026-11-05', status: 'no_show' as const, note: 'Practice', isDeleted: false },
    ]
    expect(makeupsOwed(seats, '2026-10-15').map((s) => `${s.studentId} ${s.dateKey}`)).toEqual(['avery 2026-11-02', 'casey 2026-11-04'])
    expect(makeupsLost(seats, '2026-10-15').map((s) => `${s.studentId} ${s.note}`)).toEqual(['blake MU for 11/3'])
  })

  it('warns about a seat: no coach in, more students than seats, the student elsewhere at the same time', () => {
    const seat = (id: string, studentId = id, startMin = cls.startMin, endMin = cls.endMin): ConflictSeat => ({
      id,
      studentId,
      studentName: `Student ${id}`,
      dateKey: cls.dateKey,
      startMin,
      endMin,
      status: 'confirmed',
      isDeleted: false,
    })
    const coach = (from: number, to: number) => ({ staffId: 'pat', name: 'Pat Rivera', ranges: [{ startMin: from, endMin: to }], partial: false })
    const ctx = { hours: open, class: cls, coaches: [coach(t(16), t(20))], classSeats: [seat('a')], studentStatus: 'enrolled' as const, studentSeats: [seat('a')] }
    expect(seatConflicts(seat('a'), ctx)).toEqual([])
    expect(seatConflicts(seat('a'), { ...ctx, coaches: [] }).map((c) => c.message)).toEqual(['No coach is in for this class.'])
    expect(seatConflicts(seat('a'), { ...ctx, coaches: [coach(t(16), t(17))] }).map((c) => c.message)).toEqual(['No coach is in 5:00 PM to 6:00 PM.'])
    const seven = Array.from({ length: 7 }, (_, i) => seat(`s${i}`))
    expect(seatConflicts(seat('a'), { ...ctx, classSeats: seven }).map((c) => c.kind)).toEqual(['over_capacity'])
    expect(seatConflicts(seat('a'), { ...ctx, studentSeats: [seat('a'), seat('b', 'a', t(17), t(18))] }).map((c) => c.kind)).toEqual(['student_double_booked'])
    expect(seatConflicts({ ...seat('a'), status: 'present' }, { ...ctx, coaches: [] })).toEqual([])
  })
})
