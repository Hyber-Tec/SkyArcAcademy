import { describe, expect, it } from 'vitest'
import { classesToMark, isOver, isUnmarked, seatsToMark } from './status'

describe('attendance still to take', () => {
  const seat = (dateKey: string, startMin: number, status: 'pending' | 'confirmed' | 'present' | 'no_show' | 'canceled', isDeleted = false) => ({ dateKey, startMin, status, isDeleted })

  it('counts a seat as unmarked until it is here, a no-show or canceled', () => {
    expect(['pending', 'confirmed'].every((s) => isUnmarked(s as 'pending'))).toBe(true)
    expect(['present', 'no_show', 'canceled'].some((s) => isUnmarked(s as 'present'))).toBe(false)
  })

  it('takes the unmarked seats of classes that have started: days before today, and today once the time has come', () => {
    const seats = [
      seat('2026-10-26', 960, 'confirmed'),
      seat('2026-10-26', 960, 'present'),
      seat('2026-10-26', 960, 'no_show'),
      seat('2026-10-26', 960, 'canceled'),
      seat('2026-10-27', 1020, 'pending'),
      seat('2026-10-27', 1020, 'confirmed', true),
      seat('2026-11-03', 900, 'confirmed'),
      seat('2026-11-03', 1080, 'confirmed'),
      seat('2026-11-04', 900, 'confirmed'),
    ]
    expect(seatsToMark(seats, '2026-11-03', 960).map((s) => `${s.dateKey} ${s.startMin}`)).toEqual(['2026-10-26 960', '2026-10-27 1020', '2026-11-03 900'])
  })
})

describe('classes to mark on Home', () => {
  const cls = (id: string, dateKey: string, startMin: number, endMin: number, isDeleted = false) => ({ id, dateKey, startMin, endMin, isDeleted })
  const seat = (classId: string, studentName: string, status: 'pending' | 'confirmed' | 'present' | 'no_show' | 'canceled', more: { isDeleted?: boolean; visualOrder?: number } = {}) => ({
    classId,
    studentName,
    status,
    isDeleted: false,
    visualOrder: 0,
    ...more,
  })

  it('counts a class as over on the days before, and today once its time has ended', () => {
    expect(isOver({ dateKey: '2026-11-12', endMin: 1380 }, '2026-11-13', 0)).toBe(true)
    expect(isOver({ dateKey: '2026-11-13', endMin: 1050 }, '2026-11-13', 1050)).toBe(true)
    expect(isOver({ dateKey: '2026-11-13', endMin: 1050 }, '2026-11-13', 1049)).toBe(false)
    expect(isOver({ dateKey: '2026-11-14', endMin: 600 }, '2026-11-13', 1439)).toBe(false)
  })

  it('lists the classes that are over with students nobody marked: the newest day first, each day in time order', () => {
    const classes = [
      cls('mon', '2026-11-09', 960, 1050),
      cls('thu-late', '2026-11-12', 1050, 1140),
      cls('thu-early', '2026-11-12', 960, 1050),
      cls('thu-done', '2026-11-12', 1140, 1230),
      cls('today-over', '2026-11-13', 960, 1050),
      cls('today-on', '2026-11-13', 1020, 1110),
      cls('trash', '2026-11-11', 960, 1050, true),
    ]
    const seats = [
      seat('mon', 'Ann', 'confirmed'),
      seat('mon', 'Ben', 'present'),
      seat('mon', 'Cal', 'confirmed', { isDeleted: true }),
      seat('thu-late', 'Dee', 'pending'),
      seat('thu-early', 'Eve', 'confirmed'),
      seat('thu-done', 'Fay', 'no_show'),
      seat('thu-done', 'Gus', 'canceled'),
      seat('today-over', 'Hal', 'confirmed'),
      seat('today-on', 'Ida', 'confirmed'),
      seat('trash', 'Jo', 'confirmed'),
      seat('', 'Kai', 'confirmed'),
      seat('not-loaded', 'Lu', 'confirmed'),
    ]
    expect(classesToMark(classes, seats, '2026-11-13', 1060).map((k) => `${k.c.id}: ${k.seats.map((s) => s.studentName).join(', ')}`)).toEqual([
      'today-over: Hal',
      'thu-early: Eve',
      'thu-late: Dee',
      'mon: Ann',
    ])
  })

  it('keeps each class’s students in the order booked', () => {
    const seats = [seat('a', 'Zed', 'confirmed', { visualOrder: 0 }), seat('a', 'Amy', 'confirmed', { visualOrder: 2 }), seat('a', 'Max', 'confirmed', { visualOrder: 1 })]
    expect(classesToMark([cls('a', '2026-11-12', 960, 1050)], seats, '2026-11-13', 0)[0].seats.map((s) => s.studentName)).toEqual(['Zed', 'Max', 'Amy'])
  })
})
