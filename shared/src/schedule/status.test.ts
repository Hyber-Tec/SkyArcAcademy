import { describe, expect, it } from 'vitest'
import { isUnmarked, seatsToMark } from './status'

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
